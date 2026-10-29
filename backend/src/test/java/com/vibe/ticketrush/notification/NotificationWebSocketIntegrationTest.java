package com.vibe.ticketrush.notification;

import com.vibe.ticketrush.common.events.EventPayloads;
import com.vibe.ticketrush.outbox.service.OutboxPublisher;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.*;
import java.net.URI;
import java.net.http.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Testcontainers
@org.springframework.test.annotation.DirtiesContext
class NotificationWebSocketIntegrationTest {
    @Container static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17-alpine");
    @Container static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7.4-alpine").withExposedPorts(6379);
    static final String SECRET = secret();
    static String secret() {
        byte[] bytes = new byte[32]; new java.security.SecureRandom().nextBytes(bytes);
        return Base64.getEncoder().encodeToString(bytes);
    }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        r.add("spring.datasource.username", POSTGRES::getUsername);
        r.add("spring.datasource.password", POSTGRES::getPassword);
        r.add("spring.data.redis.host", REDIS::getHost);
        r.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
        r.add("spring.data.redis.password", () -> "");
        r.add("spring.rabbitmq.password", () -> SECRET);
        r.add("app.auth.jwt-secret", () -> SECRET);
        r.add("ticketrush.payment.webhook-secret", () -> SECRET);
    }
    @Autowired JwtEncoder encoder;
    @Autowired OutboxPublisher outbox;
    @Autowired PlatformTransactionManager transactions;
    @Autowired JdbcTemplate jdbc;
    @Autowired com.vibe.ticketrush.reservation.service.ReservationTransactions reservations;
    @LocalServerPort int port;

    String token(UUID user, String role, Instant expires) {
        var claims = JwtClaimsSet.builder().issuer("ticketrush").audience(List.of("ticketrush-api"))
                .subject(user.toString()).issuedAt(Instant.now().minusSeconds(10)).expiresAt(expires)
                .claim("roles", List.of(role)).build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }
    static final class Client implements WebSocket.Listener, AutoCloseable {
        final BlockingQueue<String> messages = new LinkedBlockingQueue<>();
        final CompletableFuture<Integer> closed = new CompletableFuture<>();
        final StringBuilder fragment = new StringBuilder();
        WebSocket socket;
        @Override public void onOpen(WebSocket webSocket) { webSocket.request(1); }
        @Override public CompletionStage<?> onText(WebSocket ws, CharSequence text, boolean last) {
            fragment.append(text);
            if (last) { messages.add(fragment.toString()); fragment.setLength(0); }
            ws.request(1); return null;
        }
        @Override public CompletionStage<?> onClose(WebSocket ws, int status, String reason) {
            closed.complete(status); return null;
        }
        void authenticate(String token) { socket.sendText("{\"type\":\"authenticate\",\"token\":\"" + token + "\"}", true).join(); }
        String next() throws Exception { return messages.poll(5, TimeUnit.SECONDS); }
        @Override public void close() { if (socket != null) socket.abort(); }
    }
    Client connect(String origin) {
        Client client = new Client();
        client.socket = HttpClient.newHttpClient().newWebSocketBuilder().header("Origin", origin)
                .connectTimeout(Duration.ofSeconds(5))
                .buildAsync(URI.create("ws://localhost:" + port + "/api/v1/notifications/ws"), client).join();
        return client;
    }
    Client authenticated(UUID user) throws Exception {
        Client client = connect("http://localhost:3000");
        client.authenticate(token(user, "USER", Instant.now().plusSeconds(60)));
        assertThat(client.next()).isEqualTo("{\"type\":\"ready\"}");
        return client;
    }
    void publish(UUID user) {
        UUID id = UUID.randomUUID();
        outbox.publish("order.paid", "order", id, new EventPayloads.Order(id, user));
    }

    @Test void committedChangesReachOnlyOwnerAcrossConcurrentTransactions() throws Exception {
        UUID owner = UUID.randomUUID();
        try (Client own = authenticated(owner); Client other = authenticated(UUID.randomUUID());
                var workers = Executors.newFixedThreadPool(8)) {
            CountDownLatch start = new CountDownLatch(1);
            List<Future<?>> jobs = new ArrayList<>();
            for (int i = 0; i < 8; i++) jobs.add(workers.submit(() -> {
                start.await();
                new TransactionTemplate(transactions).executeWithoutResult(status -> publish(owner));
                return null;
            }));
            start.countDown();
            for (var job : jobs) job.get(10, TimeUnit.SECONDS);
            assertThat(own.next()).isEqualTo("{\"type\":\"orders.changed\"}");
            assertThat(other.messages.poll(1500, TimeUnit.MILLISECONDS)).isNull();
        }
    }

    @Test void rollbackAndUncommittedChangesNeverNotify() throws Exception {
        UUID owner = UUID.randomUUID();
        try (Client own = authenticated(owner)) {
            new TransactionTemplate(transactions).executeWithoutResult(status -> {
                publish(owner);
                UUID reservation = UUID.randomUUID();
                outbox.publish("reservation.expired", "reservation", reservation,
                        new EventPayloads.Reservation(reservation, owner));
                try { assertThat(own.messages.poll(1500, TimeUnit.MILLISECONDS)).isNull(); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException(e); }
                status.setRollbackOnly();
            });
            assertThat(own.messages.poll(1500, TimeUnit.MILLISECONDS)).isNull();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events WHERE payload->>'userId'=?", Long.class, owner.toString())).isZero();
        }
    }

    @Test void expiredHoldWithoutOrderNotifiesOwnerAndRestoresInventoryExactlyOnce() throws Exception {
        UUID owner = UUID.randomUUID(), event = UUID.randomUUID(), tier = UUID.randomUUID();
        jdbc.update("INSERT INTO users(id,email,password_hash) VALUES (?,?,?)", owner, owner + "@test.example", "unused");
        Instant now = Instant.now();
        jdbc.update("""
            INSERT INTO events(id,title,venue_name,venue_address,start_time,end_time,sale_start_time,sale_end_time,status,created_by)
            VALUES (?,'Concert','Hall','City',?,?,?,?,'PUBLISHED',?)
            """, event, java.sql.Timestamp.from(now.plusSeconds(86400)), java.sql.Timestamp.from(now.plusSeconds(90000)),
                java.sql.Timestamp.from(now.minusSeconds(3600)), java.sql.Timestamp.from(now.plusSeconds(7200)), owner);
        jdbc.update("INSERT INTO ticket_tiers(id,event_id,name,price,currency,total_quantity,available_quantity,max_per_order) VALUES (?,?,'VIP',100,'USD',10,10,4)", tier, event);
        try (Client own = authenticated(owner); Client other = authenticated(UUID.randomUUID());
                var workers = Executors.newFixedThreadPool(8)) {
            var hold = reservations.create(owner, tier, 2);
            assertThat(own.messages.poll(1200, TimeUnit.MILLISECONDS)).isNull();
            jdbc.update("UPDATE reservations SET expires_at=? WHERE id=?", java.sql.Timestamp.from(now.minusSeconds(5)), hold.id());
            CountDownLatch start = new CountDownLatch(1);
            List<Future<?>> jobs = new ArrayList<>();
            for (int i = 0; i < 8; i++) jobs.add(workers.submit(() -> {
                start.await();
                assertThat(reservations.get(owner, hold.id()).status())
                        .isEqualTo(com.vibe.ticketrush.reservation.domain.ReservationStatus.EXPIRED);
                return null;
            }));
            start.countDown();
            for (var job : jobs) job.get(10, TimeUnit.SECONDS);
            assertThat(own.next()).isEqualTo("{\"type\":\"reservations.changed\"}");
            assertThat(other.messages.poll(1200, TimeUnit.MILLISECONDS)).isNull();
            assertThat(own.messages.poll(1200, TimeUnit.MILLISECONDS)).isNull();
            assertThat(jdbc.queryForObject("SELECT available_quantity FROM ticket_tiers WHERE id=?", Integer.class, tier)).isEqualTo(10);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM orders WHERE reservation_id=?", Long.class, hold.id())).isZero();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events WHERE aggregate_id=? AND event_type='reservation.expired'", Long.class, hold.id())).isEqualTo(1);
            // Reconnect recovery uses the same authoritative snapshot as the UI.
            assertThat(reservations.mine(owner, null, 0, 50).content()).anySatisfy(item -> {
                assertThat(item.id()).isEqualTo(hold.id());
                assertThat(item.status()).isEqualTo(com.vibe.ticketrush.reservation.domain.ReservationStatus.EXPIRED);
            });
        }
    }

    @Test void rejectsInvalidTokensRolesOriginsAndUnexpectedFrames() throws Exception {
        assertThatThrownBy(() -> connect("https://untrusted.example")).hasCauseInstanceOf(WebSocketHandshakeException.class);
        for (String invalid : List.of("invalid", token(UUID.randomUUID(), "ADMIN", Instant.now().plusSeconds(60)),
                token(UUID.randomUUID(), "USER", Instant.now().minusSeconds(1)))) {
            try (Client client = connect("http://localhost:3000")) {
                client.authenticate(invalid);
                assertThat(client.closed.get(5, TimeUnit.SECONDS)).isEqualTo(1008);
                assertThat(client.messages).isEmpty();
            }
        }
        try (Client client = authenticated(UUID.randomUUID())) {
            client.socket.sendText("{\"type\":\"subscribe\",\"userId\":\"someone-else\"}", true).join();
            assertThat(client.closed.get(5, TimeUnit.SECONDS)).isEqualTo(1008);
        }
    }

    @Test void unauthenticatedAndExpiredConnectionsAreClosed() throws Exception {
        try (Client client = connect("http://localhost:3000")) {
            assertThat(client.closed.get(8, TimeUnit.SECONDS)).isEqualTo(1008);
            assertThat(client.messages).isEmpty();
        }
        try (Client client = connect("http://localhost:3000")) {
            client.authenticate(token(UUID.randomUUID(), "USER", Instant.now().plusSeconds(2)));
            assertThat(client.next()).isEqualTo("{\"type\":\"ready\"}");
            assertThat(client.closed.get(5, TimeUnit.SECONDS)).isEqualTo(1008);
        }
    }
}
