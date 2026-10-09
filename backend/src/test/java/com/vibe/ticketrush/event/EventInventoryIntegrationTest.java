package com.vibe.ticketrush.event;

import com.fasterxml.jackson.databind.*;
import com.vibe.ticketrush.event.domain.EventStatus;
import com.vibe.ticketrush.event.service.*;
import com.vibe.ticketrush.inventory.service.*;
import com.vibe.ticketrush.common.service.DevDataSeeder;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.ApplicationContext;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.*;
import org.springframework.test.annotation.DirtiesContext;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.stream.IntStream;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class EventInventoryIntegrationTest {
    @Container static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17-alpine");
    @DynamicPropertySource
    static void configure(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        r.add("spring.datasource.username", POSTGRES::getUsername);
        r.add("spring.datasource.password", POSTGRES::getPassword);
        byte[] secret = new byte[32]; new java.security.SecureRandom().nextBytes(secret);
        r.add("app.auth.jwt-secret", () -> Base64.getEncoder().encodeToString(secret));
        r.add("spring.data.redis.password", () -> UUID.randomUUID().toString());
        r.add("spring.rabbitmq.password", () -> UUID.randomUUID().toString());
    }
    @Autowired TestRestTemplate http;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired JwtEncoder encoder;
    @Autowired EventService events;
    @Autowired ApplicationContext context;
    String admin;
    String user;
    Instant now;
    UUID creator;
    @BeforeEach void setup() {
        jdbc.execute("TRUNCATE events, ticket_tiers, users CASCADE");
        now = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.SECONDS);
        creator = UUID.randomUUID();
        jdbc.update("INSERT INTO users(id, email, password_hash) VALUES (?, ?, ?)", creator, "admin@example.com", "unused-test-hash");
        admin = token("ADMIN"); user = token("USER");
    }
    String token(String role) {
        var claims = JwtClaimsSet.builder().issuer("ticketrush").subject(creator.toString())
                .audience(List.of("ticketrush-api")).issuedAt(now).expiresAt(now.plusSeconds(3600))
                .claim("roles", List.of(role)).build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }
    Map<String, Object> event(String title, int days) {
        Instant start = now.plusSeconds(days * 86400L);
        return new HashMap<>(Map.of("title", title, "venueName", "Hall", "venueAddress", "City",
                "startTime", start.toString(), "endTime", start.plusSeconds(3600).toString(),
                "saleStartTime", now.minusSeconds(3600).toString(), "saleEndTime", start.toString()));
    }
    Map<String, Object> tier(int total) {
        return new HashMap<>(Map.of("name", "Standard", "price", 1250, "currency", "USD", "totalQuantity", total, "maxPerOrder", 5));
    }
    ResponseEntity<String> call(HttpMethod method, String path, Object body, String token) {
        HttpHeaders h = new HttpHeaders(); h.setContentType(MediaType.APPLICATION_JSON);
        if (token != null) h.setBearerAuth(token);
        return http.exchange("/api/v1" + path, method, new HttpEntity<>(body, h), String.class);
    }
    JsonNode json(ResponseEntity<String> r) throws Exception { return mapper.readTree(r.getBody()); }
    UUID createEvent(String title, int days) throws Exception {
        var r = call(HttpMethod.POST, "/admin/events", event(title, days), admin);
        assertThat(r.getStatusCode().value()).isEqualTo(201);
        return UUID.fromString(json(r).path("id").asText());
    }
    UUID createTier(UUID event, int total) throws Exception {
        var r = call(HttpMethod.POST, "/admin/events/" + event + "/tiers", tier(total), admin);
        assertThat(r.getStatusCode().value()).isEqualTo(201);
        assertThat(json(r).path("availableQuantity").asInt()).isEqualTo(total);
        return UUID.fromString(json(r).path("id").asText());
    }
    void publish(UUID id) { assertThat(call(HttpMethod.POST, "/admin/events/" + id + "/publish", null, admin).getStatusCode().value()).isEqualTo(200); }
    void error(ResponseEntity<String> r, int status) throws Exception {
        assertThat(r.getStatusCode().value()).as(r.getBody()).isEqualTo(status);
        assertThat(json(r).path("status").asInt()).isEqualTo(status);
        for (String f : List.of("timestamp", "code", "message", "path", "fieldErrors")) assertThat(json(r).has(f)).isTrue();
    }
    @Test void lifecycleAndInvalidTransitions() throws Exception {
        UUID id = createEvent("Launch", 2);
        error(call(HttpMethod.POST, "/admin/events/" + id + "/cancel", null, admin), 409);
        publish(id);
        error(call(HttpMethod.POST, "/admin/events/" + id + "/publish", null, admin), 409);
        assertThat(call(HttpMethod.POST, "/admin/events/" + id + "/cancel", null, admin).getStatusCode().value()).isEqualTo(200);
        error(call(HttpMethod.POST, "/admin/events/" + id + "/publish", null, admin), 409);
        error(call(HttpMethod.POST, "/admin/events/" + id + "/cancel", null, admin), 409);
        UUID ended = createEvent("Ended", 3); publish(ended);
        assertThat(events.transition(ended, EventStatus.ENDED).status()).isEqualTo(EventStatus.ENDED);
        assertThatThrownBy(() -> events.transition(ended, EventStatus.PUBLISHED)).hasMessageContaining("Cannot transition");
        UUID draft = createEvent("Draft", 4);
        assertThatThrownBy(() -> events.transition(draft, EventStatus.ENDED)).hasMessageContaining("Cannot transition");
        error(call(HttpMethod.GET, "/events/" + ended, null, null), 404);
        assertThat(jdbc.queryForObject("SELECT created_by FROM events WHERE id = ?", UUID.class, id)).isEqualTo(creator);
    }
    @Test void authorizationOnEveryEndpointAndOpenApi() throws Exception {
        UUID id = createEvent("Auth", 2); UUID tierId = createTier(id, 100);
        record Route(HttpMethod method, String path, Object body) {}
        var routes = List.of(new Route(HttpMethod.POST, "/admin/events", event("New", 3)),
                new Route(HttpMethod.PUT, "/admin/events/" + id, event("Updated", 3)),
                new Route(HttpMethod.POST, "/admin/events/" + id + "/publish", null),
                new Route(HttpMethod.POST, "/admin/events/" + id + "/cancel", null),
                new Route(HttpMethod.POST, "/admin/events/" + id + "/tiers", tier(50)),
                new Route(HttpMethod.PUT, "/admin/tiers/" + tierId, tier(150)),
                new Route(HttpMethod.GET, "/admin/events/" + id + "/inventory", null));
        for (var r : routes) {
            error(call(r.method(), r.path(), r.body(), null), 401);
            error(call(r.method(), r.path(), r.body(), user), 403);
        }
        assertThat(call(HttpMethod.PUT, "/admin/events/" + id, event("Updated", 3), admin).getStatusCode().value()).isEqualTo(200);
        assertThat(call(HttpMethod.PUT, "/admin/tiers/" + tierId, tier(150), admin).getStatusCode().value()).isEqualTo(200);
        assertThat(call(HttpMethod.GET, "/admin/events/" + id + "/inventory", null, admin).getStatusCode().value()).isEqualTo(200);
        publish(id);
        assertThat(call(HttpMethod.GET, "/events", null, null).getStatusCode().value()).isEqualTo(200);
        assertThat(call(HttpMethod.GET, "/events/" + id, null, null).getStatusCode().value()).isEqualTo(200);
        var document = mapper.readTree(http.getForObject("/v3/api-docs", String.class));
        var spec = document.path("paths");
        assertThat(document.path("components").path("schemas").has("EventPage")).isTrue();
        assertThat(document.path("components").path("schemas").has("Detail")).isTrue();
        assertThat(document.path("components").path("schemas").has("PublicTier")).isTrue();
        assertThat(spec.path("/api/v1/events").path("get").path("responses").has("200")).isTrue();
        assertThat(spec.path("/api/v1/events/{id}").path("get").path("responses").has("200")).isTrue();
        assertThat(spec.path("/api/v1/admin/tiers/{id}").path("put").path("responses").has("200")).isTrue();
        for (String path : List.of("/events", "/events/{id}", "/admin/events", "/admin/events/{id}",
                "/admin/events/{id}/publish", "/admin/events/{id}/cancel", "/admin/events/{id}/tiers",
                "/admin/tiers/{id}", "/admin/events/{id}/inventory")) assertThat(spec.has("/api/v1" + path)).isTrue();
    }
    @Test void publicInventoryIsCoarseAndDraftsAreHidden() throws Exception {
        UUID draft = createEvent("Secret", 2);
        UUID id = createEvent("Public", 3); UUID t = createTier(id, 100); publish(id);
        error(call(HttpMethod.GET, "/events/" + draft, null, null), 404);
        assertThat(call(HttpMethod.GET, "/events", null, null).getBody()).doesNotContain("Secret");
        for (int available : List.of(100, 10, 9, 1, 0)) {
            jdbc.update("UPDATE ticket_tiers SET available_quantity = ? WHERE id = ?", available, t);
            var r = call(HttpMethod.GET, "/events/" + id, null, null);
            assertThat(r.getBody()).doesNotContain("availableQuantity", "totalQuantity", "available_quantity", "version");
            assertThat(json(r).path("tiers").get(0).path("availability").asText())
                    .isEqualTo(available == 0 ? "SOLD_OUT" : available < 10 ? "LOW" : "AVAILABLE");
        }
        UUID zero = createEvent("Zero", 4); createTier(zero, 0); publish(zero);
        assertThat(json(call(HttpMethod.GET, "/events/" + zero, null, null)).path("tiers").get(0).path("availability").asText()).isEqualTo("SOLD_OUT");
    }
    @Test void dateAndTierValidationAndNotFound() throws Exception {
        for (String field : List.of("title", "startTime", "endTime", "saleStartTime", "saleEndTime")) {
            var r = event("Valid", 2); r.put(field, field.equals("title") ? " " : null);
            error(call(HttpMethod.POST, "/admin/events", r, admin), 400);
        }
        var r = event("Dates", 2); r.put("endTime", r.get("startTime"));
        error(call(HttpMethod.POST, "/admin/events", r, admin), 400);
        r = event("Dates", 2); r.put("saleEndTime", now.plusSeconds(3 * 86400).toString());
        error(call(HttpMethod.POST, "/admin/events", r, admin), 400);
        r = event("Dates", 2); r.put("saleStartTime", r.get("saleEndTime"));
        error(call(HttpMethod.POST, "/admin/events", r, admin), 400);
        UUID id = createEvent("Validation", 2);
        for (var entry : Map.<String, Object>of("name", " ", "price", -1, "totalQuantity", -1,
                "maxPerOrder", 0, "currency", "ZZZ").entrySet()) {
            var body = tier(100); body.put(entry.getKey(), entry.getValue());
            error(call(HttpMethod.POST, "/admin/events/" + id + "/tiers", body, admin), 400);
        }
        for (String field : List.of("price", "totalQuantity", "maxPerOrder", "currency")) {
            var body = tier(100); body.put(field, null);
            error(call(HttpMethod.POST, "/admin/events/" + id + "/tiers", body, admin), 400);
        }
        var fractional = tier(100); fractional.put("price", 12.5);
        error(call(HttpMethod.POST, "/admin/events/" + id + "/tiers", fractional, admin), 400);
        UUID t = createTier(id, 100);
        error(call(HttpMethod.POST, "/admin/events/" + id + "/tiers", tier(50), admin), 409);
        var invalid = tier(-1); error(call(HttpMethod.PUT, "/admin/tiers/" + t, invalid, admin), 400);
        error(call(HttpMethod.GET, "/events/" + UUID.randomUUID(), null, null), 404);
        error(call(HttpMethod.GET, "/admin/events/" + UUID.randomUUID() + "/inventory", null, admin), 404);
        error(call(HttpMethod.PUT, "/admin/tiers/" + UUID.randomUUID(), tier(10), admin), 404);
        error(call(HttpMethod.GET, "/events/not-a-uuid", null, null), 400);
        assertThatThrownBy(() -> jdbc.update("UPDATE ticket_tiers SET available_quantity = 101 WHERE id = ?", t))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        for (String sql : List.of("UPDATE ticket_tiers SET price = -1 WHERE id = ?",
                "UPDATE ticket_tiers SET max_per_order = 0 WHERE id = ?",
                "UPDATE ticket_tiers SET available_quantity = -1 WHERE id = ?",
                "UPDATE ticket_tiers SET total_quantity = -1 WHERE id = ?")) {
            assertThatThrownBy(() -> jdbc.update(sql, t))
                    .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        }
    }
    @Test void saleStartLocksPriceAndCurrencyButAllowsCapacity() throws Exception {
        UUID id = createEvent("Sale", 2); UUID t = createTier(id, 100);
        var changed = tier(100); changed.put("price", 2000);
        assertThat(call(HttpMethod.PUT, "/admin/tiers/" + t, changed, admin).getStatusCode().value()).isEqualTo(200);
        publish(id);
        error(call(HttpMethod.POST, "/admin/events/" + id + "/tiers", tier(100), admin), 409);
        error(call(HttpMethod.PUT, "/admin/tiers/" + t, tier(100), admin), 409);
        var currency = new HashMap<>(changed); currency.put("currency", "EUR");
        error(call(HttpMethod.PUT, "/admin/tiers/" + t, currency, admin), 409);
        changed.put("totalQuantity", 200);
        assertThat(call(HttpMethod.PUT, "/admin/tiers/" + t, changed, admin).getStatusCode().value()).isEqualTo(200);
        var moved = event("Sale", 2); moved.put("saleStartTime", now.plusSeconds(100).toString());
        error(call(HttpMethod.PUT, "/admin/events/" + id, moved, admin), 409);
        UUID future = createEvent("Future sale", 5);
        var scheduled = event("Future sale", 5); scheduled.put("saleStartTime", now.plusSeconds(3600).toString());
        call(HttpMethod.PUT, "/admin/events/" + future, scheduled, admin); publish(future);
        UUID futureTier = createTier(future, 100);
        assertThat(call(HttpMethod.PUT, "/admin/tiers/" + futureTier, changed, admin).getStatusCode().value()).isEqualTo(200);
    }
    @Test void capacityDeltaPreservesCommittedAndRejectsBelowIt() throws Exception {
        UUID id = createEvent("Capacity", 2); UUID t = createTier(id, 100);
        jdbc.update("UPDATE ticket_tiers SET available_quantity = 40 WHERE id = ?", t);
        var grow = call(HttpMethod.PUT, "/admin/tiers/" + t, tier(150), admin);
        assertThat(json(grow).path("availableQuantity").asInt()).isEqualTo(90);
        error(call(HttpMethod.PUT, "/admin/tiers/" + t, tier(59), admin), 409);
        var shrink = call(HttpMethod.PUT, "/admin/tiers/" + t, tier(60), admin);
        assertThat(json(shrink).path("availableQuantity").asInt()).isZero();
        assertThat(json(shrink).path("version").asLong()).isEqualTo(2);
    }
    @Test void fiftyConcurrentWritersPreserveInventoryAndAppliedVersionOrder() throws Exception {
        UUID id = createEvent("Concurrent", 2); UUID t = createTier(id, 100);
        jdbc.update("UPDATE ticket_tiers SET available_quantity = 40 WHERE id = ?", t);
        var ready = new CountDownLatch(50); var start = new CountDownLatch(1);
        List<JsonNode> applied = new ArrayList<>();
        try (var pool = Executors.newFixedThreadPool(50)) {
            var futures = IntStream.range(0, 50).mapToObj(i -> pool.submit(() -> {
                ready.countDown();
                if (!start.await(15, TimeUnit.SECONDS)) throw new IllegalStateException("Barrier timeout");
                int total = i % 2 == 0 ? 150 + i : 60 + i;
                var response = call(HttpMethod.PUT, "/admin/tiers/" + t, tier(total), admin);
                assertThat(response.getStatusCode().value()).as(response.getBody()).isEqualTo(200);
                JsonNode body = json(response);
                assertThat(body.path("totalQuantity").asInt()).isEqualTo(total);
                assertThat(body.path("availableQuantity").asInt()).isEqualTo(total - 60);
                return body;
            })).toList();
            assertThat(ready.await(15, TimeUnit.SECONDS)).isTrue(); start.countDown();
            for (var f : futures) applied.add(f.get(60, TimeUnit.SECONDS));
        }
        applied.sort(Comparator.comparingLong(a -> a.path("version").asLong()));
        long deltaSum = 0; int previous = 100;
        for (int i = 0; i < 50; i++) {
            JsonNode a = applied.get(i); assertThat(a.path("version").asLong()).isEqualTo(i + 1);
            deltaSum += a.path("totalQuantity").asInt() - previous; previous = a.path("totalQuantity").asInt();
        }
        var stored = jdbc.queryForMap("SELECT * FROM ticket_tiers WHERE id = ?", t);
        assertThat(((Number) stored.get("version")).longValue()).isEqualTo(50);
        assertThat(((Number) stored.get("total_quantity")).intValue()).isEqualTo(previous);
        assertThat(((Number) stored.get("available_quantity")).longValue()).isEqualTo(40 + deltaSum).isBetween(0L, (long) previous);
    }
    @Test void paginationKeywordsDatesAndSaleWindow() throws Exception {
        UUID later = createEvent("Rock Later", 4); publish(later);
        UUID early = createEvent("Rock Early", 2); publish(early);
        UUID future = createEvent("Jazz", 3);
        var scheduled = event("Jazz", 3); scheduled.put("saleStartTime", now.plusSeconds(3600).toString());
        call(HttpMethod.PUT, "/admin/events/" + future, scheduled, admin); publish(future);
        createEvent("Rock Secret", 1);
        var first = json(call(HttpMethod.GET, "/events?size=1", null, null));
        assertThat(first.path("totalElements").asInt()).isEqualTo(3);
        assertThat(first.path("totalPages").asInt()).isEqualTo(3);
        assertThat(first.path("content").get(0).path("id").asText()).isEqualTo(early.toString());
        assertThat(json(call(HttpMethod.GET, "/events?size=1&page=1", null, null)).path("content").get(0).path("id").asText()).isEqualTo(future.toString());
        assertThat(json(call(HttpMethod.GET, "/events?keyword=rOcK&onSale=true", null, null)).path("totalElements").asInt()).isEqualTo(2);
        String date = now.plusSeconds(3 * 86400).toString();
        assertThat(json(call(HttpMethod.GET, "/events?from=" + date + "&to=" + date, null, null)).path("totalElements").asInt()).isEqualTo(1);
        assertThat(json(call(HttpMethod.GET, "/events?keyword=%25", null, null)).path("totalElements").asInt()).isZero();
        assertThat(json(call(HttpMethod.GET, "/events?page=99", null, null)).path("content").isEmpty()).isTrue();
        for (String query : List.of("size=51", "size=0", "page=-1", "page=x", "onSale=x", "from=bad", "from=" + date + "&to=" + now))
            error(call(HttpMethod.GET, "/events?" + query, null, null), 400);
    }
    @Test void seederIsBatchedIdempotentAndNotRegisteredInTest() {
        assertThat(context.getBeansOfType(DevDataSeeder.class)).isEmpty();
        assertThat(context.getBeansOfType(EventSeed.class)).isEmpty();
        assertThat(context.getBeansOfType(InventorySeed.class)).isEmpty();
        var seeder = new DevDataSeeder(new DevEventSeed(jdbc, java.time.Clock.systemUTC()), new DevInventorySeed(jdbc), 170, 3);
        seeder.run(new DefaultApplicationArguments());
        jdbc.update("UPDATE ticket_tiers SET available_quantity = 50");
        seeder.run(new DefaultApplicationArguments());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM events", Integer.class)).isEqualTo(170);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM ticket_tiers", Integer.class)).isEqualTo(510);
        assertThat(jdbc.queryForObject("SELECT max(available_quantity) FROM ticket_tiers", Integer.class)).isEqualTo(50);
    }
}
