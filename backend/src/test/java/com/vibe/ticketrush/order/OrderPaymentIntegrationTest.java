package com.vibe.ticketrush.order;

import com.fasterxml.jackson.databind.*;
import com.vibe.ticketrush.reservation.service.*;
import com.vibe.ticketrush.order.service.OrderService;
import com.vibe.ticketrush.payment.service.*;
import com.vibe.ticketrush.payment.domain.PaymentScenario;
import com.vibe.ticketrush.payment.dto.PaymentEvent;
import com.vibe.ticketrush.payment.dto.PaymentEvent.Type;
import com.vibe.ticketrush.common.service.IdempotencyService;
import com.vibe.ticketrush.inventory.service.InventoryReconciliationService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.*;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.*;
import java.net.URI;
import java.net.http.*;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.*;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
    "ticketrush.reservation.expiry-enabled=false","spring.datasource.hikari.maximum-pool-size=32",
    "ticketrush.payment.webhook-url=http://127.0.0.1:0/api/v1/payments/webhook",
    "ticketrush.payment.delay=24h","ticketrush.payment.test-scenarios-enabled=true",
    "ticketrush.payment.dispatch-interval=24h"})
@ActiveProfiles("test")
@Import(OrderPaymentIntegrationTest.TimeConfiguration.class)
@Testcontainers
@org.springframework.test.annotation.DirtiesContext(classMode=org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
class OrderPaymentIntegrationTest {
    @Container static final PostgreSQLContainer<?> POSTGRES=new PostgreSQLContainer<>("postgres:17-alpine");
    static final String SECRET=randomSecret();
    static final String TEST_TOKEN=randomSecret();
    static String randomSecret() { byte[] value=new byte[32];new java.security.SecureRandom().nextBytes(value);return Base64.getEncoder().encodeToString(value); }
    @DynamicPropertySource static void configure(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url",POSTGRES::getJdbcUrl);r.add("spring.datasource.username",POSTGRES::getUsername);r.add("spring.datasource.password",POSTGRES::getPassword);
        r.add("app.auth.jwt-secret",() -> SECRET);r.add("ticketrush.payment.webhook-secret",() -> SECRET);
        r.add("ticketrush.payment.test-token",() -> TEST_TOKEN);
        r.add("spring.data.redis.password",() -> "unused");r.add("spring.rabbitmq.password",() -> "unused");
    }
    static class MutableClock extends Clock {
        final AtomicReference<Instant> value=new AtomicReference<>(Instant.parse("2030-01-01T00:00:00Z"));
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return value.get(); }
        void advance(long seconds) { value.updateAndGet(t -> t.plusSeconds(seconds)); }
    }
    @TestConfiguration static class TimeConfiguration { @Bean @Primary MutableClock testClock() { return new MutableClock(); } }
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    @Autowired JwtEncoder encoder;
    @Autowired ReservationService reservations;
    @Autowired ReservationTransactions expiry;
    @Autowired OrderService orders;
    @Autowired WebhookSignature signatures;
    @Autowired IdempotencyService idempotency;
    @Autowired PaymentService payments;
    @Autowired org.springframework.core.env.ConfigurableEnvironment environment;
    @Autowired InventoryReconciliationService reconciliation;
    @Autowired MutableClock clock;
    @LocalServerPort int port;
    final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    UUID user,event,tier;
    @BeforeEach void setup() {
        jdbc.execute("TRUNCATE users,events,ticket_tiers CASCADE");
        clock.value.set(Instant.parse("2030-01-01T00:00:00Z"));
        user=addUser();event=UUID.randomUUID();tier=UUID.randomUUID();
        jdbc.update("""
            INSERT INTO events(id,title,venue_name,venue_address,start_time,end_time,sale_start_time,sale_end_time,status,created_by)
            VALUES (?,'Concert','Hall','City',?,?,?,?,'PUBLISHED',?)
            """,event,ts(864000),ts(900000),ts(-3600),ts(720000),user);
        jdbc.update("INSERT INTO ticket_tiers(id,event_id,name,price,currency,total_quantity,available_quantity,max_per_order) VALUES (?,?,'VIP',123,'USD',200,200,4)",tier,event);
    }
    Timestamp ts(long offset) { return Timestamp.from(clock.instant().plusSeconds(offset)); }
    UUID addUser() { UUID id=UUID.randomUUID();jdbc.update("INSERT INTO users(id,email,password_hash) VALUES (?,?,?)",id,id+"@test.example","unused");return id; }
    String token(UUID who,String role) {
        Instant now=Instant.now();
        var claims=JwtClaimsSet.builder().issuer("ticketrush").audience(List.of("ticketrush-api")).subject(who.toString())
            .issuedAt(now).expiresAt(now.plusSeconds(3600)).claim("roles",List.of(role)).build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(org.springframework.security.oauth2.jose.jws.MacAlgorithm.HS256).build(),claims)).getTokenValue();
    }
    HttpResponse<String> request(String method,String path,String body,String token,Map<String,String> headers) {
        try {
            var b=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+path)).timeout(Duration.ofSeconds(40));
            if (token!=null) b.header("Authorization","Bearer "+token);
            headers.forEach(b::header);
            if (body!=null) b.header("Content-Type","application/json");
            return client.send(b.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(body)).build(),HttpResponse.BodyHandlers.ofString());
        } catch (Exception e) { throw new IllegalStateException(e); }
    }
    HttpResponse<String> create(UUID who,UUID hold,UUID key) {
        return request("POST","/api/v1/orders","{\"reservationId\":\""+hold+"\",\"totalAmount\":1}",token(who,"USER"),key==null?Map.of():Map.of("Idempotency-Key",key.toString()));
    }
    UUID order(UUID who,int quantity) throws Exception {
        var response=create(who,reservations.create(who,tier,quantity).id(),UUID.randomUUID());
        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        return UUID.fromString(json.readTree(response.body()).path("id").asText());
    }
    PaymentEvent event(UUID order,Type type,String eventId) {
        long amount=jdbc.queryForObject("SELECT total_amount FROM orders WHERE id=?",Long.class,order);
        return new PaymentEvent(eventId,"mock_"+order,type,amount,"USD");
    }
    HttpResponse<String> webhook(PaymentEvent event) {
        try { return signed(json.writeValueAsString(event),Long.toString(clock.instant().getEpochSecond()),false); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }
    HttpResponse<String> signed(String body,String timestamp,boolean invalid) {
        String signature=invalid?"00".repeat(32):signatures.sign(timestamp,body.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        return request("POST","/api/v1/payments/webhook",body,null,Map.of("X-Payment-Timestamp",timestamp,"X-Payment-Signature",signature));
    }
    long count(String table) {
        String sql=switch(table) {
            case "orders" -> "SELECT count(*) FROM orders";
            case "payments" -> "SELECT count(*) FROM payments";
            case "tickets" -> "SELECT count(*) FROM tickets";
            case "payment_events" -> "SELECT count(*) FROM payment_events";
            case "idempotency_keys" -> "SELECT count(*) FROM idempotency_keys";
            default -> throw new IllegalArgumentException("Unknown table");
        };
        return jdbc.queryForObject(sql,Long.class);
    }
    String status(UUID order) { return jdbc.queryForObject("SELECT status FROM orders WHERE id=?",String.class,order); }
    void invariant() { assertThat(reconciliation.reconcile(event)).isEmpty(); }
    <T> List<T> parallel(int size,IntFunction<T> action) throws Exception {
        var barrier=new CyclicBarrier(size);var pool=Executors.newFixedThreadPool(size);
        try {
            List<Future<T>> futures=new ArrayList<>();
            for(int i=0;i<size;i++) { final int index=i;futures.add(pool.submit(() -> {barrier.await(15,TimeUnit.SECONDS);return action.apply(index);})); }
            List<T> values=new ArrayList<>();for(var future:futures) values.add(future.get(60,TimeUnit.SECONDS));return values;
        } finally {pool.shutdownNow();assertThat(pool.awaitTermination(10,TimeUnit.SECONDS)).isTrue();}
    }
    @Test @Tag("concurrency") void twentyRequestsSameKey() throws Exception {
        UUID hold=reservations.create(user,tier,3).id(),key=UUID.randomUUID();
        var responses=parallel(20,i -> create(user,hold,key));
        assertThat(responses).allMatch(r -> r.statusCode()==201 || r.statusCode()==409);
        assertThat(responses.stream().filter(r -> r.statusCode()==201 && r.headers().firstValue("Idempotency-Replayed").isEmpty()).count()).isEqualTo(1);
        var created=responses.stream().filter(r -> r.statusCode()==201).toList();
        assertThat(created.stream().map(HttpResponse::body).distinct().count()).isEqualTo(1);
        assertThat(count("orders")).isEqualTo(1);assertThat(count("payments")).isEqualTo(1);
        assertThat(create(user,hold,key).headers().firstValue("Idempotency-Replayed")).contains("true");invariant();
    }
    @Test void keyValidationAndUserIsolation() throws Exception {
        UUID hold=reservations.create(user,tier,2).id(),key=UUID.randomUUID();
        assertThat(create(user,hold,null).statusCode()).isEqualTo(400);
        assertThat(create(user,hold,key).statusCode()).isEqualTo(201);
        assertThat(create(user,UUID.randomUUID(),key).statusCode()).isEqualTo(422);
        UUID other=addUser();assertThat(create(other,reservations.create(other,tier,1).id(),key).statusCode()).isEqualTo(201);
        assertThat(count("orders")).isEqualTo(2);invariant();
    }
    @Test void crashRollsBackBusinessAndLeaseRecovers() {
        UUID key=UUID.randomUUID(),orphan=UUID.randomUUID(),hold=reservations.create(user,tier,1).id();
        assertThatThrownBy(() -> idempotency.execute(user,"crash",key,"payload",() -> {
            jdbc.update("INSERT INTO orders(id,user_id,reservation_id,status,total_amount,currency,payment_deadline,created_at,updated_at) VALUES (?,?,?,'PENDING_PAYMENT',123,'USD',?,?,?)",orphan,user,hold,ts(600),ts(0),ts(0));
            payments.initiate(orphan,123,"USD",PaymentScenario.SUCCESS);
            throw new IllegalStateException("Simulated crash after order insertion");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(count("orders")).isZero();assertThat(count("payments")).isZero();assertThat(count("idempotency_keys")).isZero();
        // Simulate a process death: claim committed, business transaction rolled back by PostgreSQL.
        String hash=java.util.HexFormat.of().formatHex(digest("payload"));
        jdbc.update("INSERT INTO idempotency_keys(id,user_id,endpoint,key,request_hash,status,created_at,expires_at,lease_until) VALUES (?,?,'crash',?,?,'IN_PROGRESS',?,?,?)",UUID.randomUUID(),user,key,hash,ts(0),ts(86400),ts(60));
        assertThatThrownBy(() -> idempotency.execute(user,"crash",key,"payload",() -> new IdempotencyService.StoredResponse(201,"{}",false)))
            .isInstanceOf(com.vibe.ticketrush.common.service.ApiException.class);
        clock.advance(61);
        assertThat(idempotency.execute(user,"crash",key,"payload",() -> new IdempotencyService.StoredResponse(201,"{}",false)).status()).isEqualTo(201);
        clock.advance(86401);idempotency.cleanup();assertThat(count("idempotency_keys")).isZero();invariant();
    }
    static byte[] digest(String value) { try {return java.security.MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));}catch(Exception e){throw new IllegalStateException(e);} }
    @Test @Tag("concurrency") void twentyDuplicateWebhooks() throws Exception {
        UUID order=order(user,4);var event=event(order,Type.SUCCEEDED,"duplicate");
        assertThat(parallel(20,i -> webhook(event).statusCode())).containsOnly(200);
        assertThat(status(order)).isEqualTo("PAID");assertThat(count("tickets")).isEqualTo(4);assertThat(count("payment_events")).isEqualTo(1);invariant();
    }
    @Test void signatureReplayAndMismatch() throws Exception {
        UUID order=order(user,2);String body=json.writeValueAsString(event(order,Type.SUCCEEDED,"secure"));
        String now=Long.toString(clock.instant().getEpochSecond());
        assertThat(signed(body,now,true).statusCode()).isEqualTo(401);
        assertThat(request("POST","/api/v1/payments/webhook",body+" ",null,Map.of("X-Payment-Timestamp",now,
            "X-Payment-Signature",signatures.sign(now,body.getBytes(java.nio.charset.StandardCharsets.UTF_8)))).statusCode()).isEqualTo(401);
        assertThat(signed(body,Long.toString(clock.instant().minusSeconds(301).getEpochSecond()),false).statusCode()).isEqualTo(401);
        assertThat(signed(body,Long.toString(clock.instant().plusSeconds(301).getEpochSecond()),false).statusCode()).isEqualTo(401);
        assertThat(signed(body+" ",now,false).statusCode()).isEqualTo(200);
        assertThat(status(order)).isEqualTo("PAID");
        UUID other=addUser(),mismatch=order(other,1);
        assertThat(webhook(new PaymentEvent("mismatch","mock_"+mismatch,Type.SUCCEEDED,1,"USD")).statusCode()).isEqualTo(200);
        assertThat(status(mismatch)).isEqualTo("PAYMENT_FAILED");
        assertThat(jdbc.queryForObject("SELECT manual_review FROM orders WHERE id=?",Boolean.class,mismatch)).isTrue();invariant();
    }
    @Test @Tag("concurrency") void failureDuplicatesAndOutOfOrder() throws Exception {
        UUID order=order(user,2);
        assertThat(webhook(event(order,Type.SUCCEEDED,"success")).statusCode()).isEqualTo(200);
        assertThat(webhook(event(order,Type.FAILED,"late-failure")).statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT status FROM payments WHERE order_id=?",String.class,order)).isEqualTo("SUCCEEDED");
        assertThat(status(order)).isEqualTo("PAID");invariant();
        UUID other=addUser(),failed=order(other,3);
        assertThat(parallel(20,i -> webhook(event(failed,Type.FAILED,"failure")).statusCode())).containsOnly(200);
        assertThat(status(failed)).isEqualTo("PAYMENT_FAILED");assertThat(count("tickets")).isEqualTo(2);invariant();
    }
    @Test @Tag("concurrency") void paymentRacesExpiryOneHundredTimes() throws Exception {
        for(int iteration=0;iteration<100;iteration++) {
            UUID who=addUser(),order=order(who,1);clock.advance(601);
            var payment=event(order,Type.SUCCEEDED,"race-"+iteration);
            var result=parallel(2,i -> i==0?webhook(payment).statusCode():expiry.expireBatch());
            assertThat(result.getFirst()).isEqualTo(200);assertThat(status(order)).isEqualTo("PAID");invariant();
        }
    }
    @Test @Tag("concurrency") void paymentRacesCancel() throws Exception {
        UUID order=order(user,2);
        var result=parallel(2,i -> i==0?webhook(event(order,Type.SUCCEEDED,"cancel-race")).statusCode():
            request("POST","/api/v1/orders/"+order+"/cancel",null,token(user,"USER"),Map.of()).statusCode());
        assertThat(result.getFirst()).isEqualTo(200);assertThat(result.get(1)).isIn(200,409);
        assertThat(status(order)).isEqualTo("PAID");assertThat(count("tickets")).isEqualTo(2);invariant();
    }
    @Test void latePaymentAvailableSoldOutAndOutsideGrace() throws Exception {
        UUID paid=order(user,1);clock.advance(601);expiry.expireBatch();
        assertThat(status(paid)).isEqualTo("EXPIRED");assertThat(webhook(event(paid,Type.SUCCEEDED,"late-ok")).statusCode()).isEqualTo(200);
        assertThat(status(paid)).isEqualTo("PAID");invariant();
        UUID who=addUser(),late=order(who,1);clock.advance(601);expiry.expireBatch();
        jdbc.update("UPDATE ticket_tiers SET total_quantity=1,available_quantity=0 WHERE id=?",tier);
        assertThat(webhook(event(late,Type.SUCCEEDED,"late-gone")).statusCode()).isEqualTo(200);
        assertThat(status(late)).isEqualTo("REFUND_PENDING");invariant();
        assertThat(webhook(event(late,Type.REFUNDED,"refund-gone")).statusCode()).isEqualTo(200);
        assertThat(status(late)).isEqualTo("REFUNDED");invariant();
        jdbc.update("UPDATE ticket_tiers SET total_quantity=200,available_quantity=199 WHERE id=?",tier);
        UUID beyond=order(addUser(),1);clock.advance(901);
        assertThat(webhook(event(beyond,Type.SUCCEEDED,"beyond-grace")).statusCode()).isEqualTo(200);
        assertThat(status(beyond)).isEqualTo("REFUND_PENDING");invariant();
    }
    @Test void rulesSnapshotsAndAuthorization() throws Exception {
        UUID hold=reservations.create(user,tier,2).id(),other=addUser();
        assertThat(create(other,hold,UUID.randomUUID()).statusCode()).isEqualTo(403);
        var response=create(user,hold,UUID.randomUUID());assertThat(response.statusCode()).isEqualTo(201);
        UUID order=UUID.fromString(json.readTree(response.body()).path("id").asText());
        assertThat(json.readTree(response.body()).path("totalAmount").asLong()).isEqualTo(246);
        assertThat(create(user,hold,UUID.randomUUID()).statusCode()).isEqualTo(409);
        jdbc.update("UPDATE ticket_tiers SET price=999 WHERE id=?",tier);
        assertThat(orders.get(user,order).items().getFirst().unitPrice()).isEqualTo(123);
        String root="/api/v1/orders/"+order;
        for(String path:List.of(root,root+"/tickets","/api/v1/orders/me")) assertThat(request("GET",path,null,null,Map.of()).statusCode()).isEqualTo(401);
        for(String suffix:List.of("","/tickets")) assertThat(request("GET",root+suffix,null,token(other,"USER"),Map.of()).statusCode()).isEqualTo(403);
        assertThat(request("POST",root+"/cancel",null,token(other,"USER"),Map.of()).statusCode()).isEqualTo(403);
        assertThat(request("GET","/api/v1/orders/"+UUID.randomUUID(),null,token(user,"USER"),Map.of()).statusCode()).isEqualTo(404);
        assertThat(request("GET",root+"/tickets",null,token(user,"USER"),Map.of()).statusCode()).isEqualTo(409);
        assertThat(request("GET","/api/v1/admin/orders",null,token(user,"USER"),Map.of()).statusCode()).isEqualTo(403);
        assertThat(request("GET","/api/v1/admin/orders?status=PENDING_PAYMENT",null,token(user,"ADMIN"),Map.of()).statusCode()).isEqualTo(200);
        assertThat(request("GET","/api/v1/orders/me",null,token(user,"ADMIN"),Map.of()).statusCode()).isEqualTo(403);
        assertThat(webhook(event(order,Type.SUCCEEDED,"snapshot")).statusCode()).isEqualTo(200);
        assertThat(request("GET",root+"/tickets",null,token(user,"USER"),Map.of()).statusCode()).isEqualTo(200);
        assertThat(request("POST",root+"/cancel",null,token(user,"USER"),Map.of()).statusCode()).isEqualTo(409);
        assertThat(request("POST","/api/v1/admin/orders/"+order+"/refund",null,token(user,"ADMIN"),Map.of()).statusCode()).isEqualTo(200);
        assertThat(webhook(event(order,Type.REFUNDED,"admin-refund")).statusCode()).isEqualTo(200);
        assertThat(status(order)).isEqualTo("REFUNDED");invariant();
        UUID expired=reservations.create(other,tier,1).id();clock.advance(601);
        assertThat(create(other,expired,UUID.randomUUID()).statusCode()).isEqualTo(409);
        assertThat(jdbc.queryForObject("SELECT status FROM reservations WHERE id=?",String.class,expired)).isEqualTo("EXPIRED");invariant();
    }
    @Test void unknownEventsAndScenarioToken() throws Exception {
        String now=Long.toString(clock.instant().getEpochSecond());
        assertThat(signed("{}",now,false).statusCode()).isEqualTo(400);
        assertThat(signed("{\"type\":\"UNKNOWN\"}",now,false).statusCode()).isEqualTo(400);
        assertThat(webhook(new PaymentEvent("unknown","unknown",Type.SUCCEEDED,1,"USD")).statusCode()).isEqualTo(404);
        UUID hold=reservations.create(user,tier,1).id();String body="{\"reservationId\":\""+hold+"\"}";
        assertThat(request("POST","/api/v1/orders",body,token(user,"USER"),Map.of("Idempotency-Key",UUID.randomUUID().toString(),"X-Mock-Scenario","FAILURE")).statusCode()).isEqualTo(403);
        assertThat(request("POST","/api/v1/orders",body,token(user,"USER"),Map.of("Idempotency-Key",UUID.randomUUID().toString(),"X-Mock-Scenario","FAILURE","X-Mock-Test-Token",TEST_TOKEN)).statusCode()).isEqualTo(201);
        String[] profiles=environment.getActiveProfiles();
        try {
            environment.setActiveProfiles("prod");
            assertThatThrownBy(() -> payments.scenario("SUCCESS",TEST_TOKEN)).isInstanceOf(com.vibe.ticketrush.common.service.ApiException.class);
        } finally { environment.setActiveProfiles(profiles); }
    }
    @Test void reconcileDetectsMissingTickets() throws Exception {
        UUID order=order(user,2);assertThat(webhook(event(order,Type.SUCCEEDED,"audit")).statusCode()).isEqualTo(200);invariant();
        jdbc.update("DELETE FROM tickets WHERE order_id=?",order);assertThat(reconciliation.reconcile(event)).hasSize(1);
    }
    @Test void transientFailureRollsBackEventAndRetries() throws Exception {
        UUID order=order(user,2);var payment=event(order,Type.SUCCEEDED,"retryable");
        jdbc.execute("ALTER TABLE tickets ADD CONSTRAINT test_issue_failure CHECK(ticket_index<0)");
        try {
            assertThat(webhook(payment).statusCode()).isEqualTo(500);
            assertThat(count("payment_events")).isZero();assertThat(count("tickets")).isZero();
            assertThat(status(order)).isEqualTo("PENDING_PAYMENT");
            assertThat(jdbc.queryForObject("SELECT status FROM payments WHERE order_id=?",String.class,order)).isEqualTo("INITIATED");invariant();
        } finally { jdbc.execute("ALTER TABLE tickets DROP CONSTRAINT test_issue_failure"); }
        assertThat(webhook(payment).statusCode()).isEqualTo(200);
        assertThat(count("payment_events")).isEqualTo(1);assertThat(count("tickets")).isEqualTo(2);invariant();
    }
    @Test void authorizationMatrixAndPagination() throws Exception {
        UUID order=order(user,1);String root="/api/v1/orders/"+order;
        String regular=token(user,"USER"),admin=token(user,"ADMIN");
        UUID other=addUser();String wrong=token(other,"USER");
        for(String path:List.of("/api/v1/orders/me",root,root+"/tickets")) {
            assertThat(request("GET",path,null,null,Map.of()).statusCode()).isEqualTo(401);
            assertThat(request("GET",path,null,admin,Map.of()).statusCode()).isEqualTo(403);
        }
        for(String auth:List.of(admin,wrong)) assertThat(request("POST",root+"/cancel",null,auth,Map.of()).statusCode()).isEqualTo(403);
        assertThat(request("POST",root+"/cancel",null,null,Map.of()).statusCode()).isEqualTo(401);
        String body="{\"reservationId\":\""+UUID.randomUUID()+"\"}";
        assertThat(request("POST","/api/v1/orders",body,null,Map.of("Idempotency-Key",UUID.randomUUID().toString())).statusCode()).isEqualTo(401);
        assertThat(request("POST","/api/v1/orders",body,admin,Map.of("Idempotency-Key",UUID.randomUUID().toString())).statusCode()).isEqualTo(403);
        assertThat(request("POST","/api/v1/orders",body,regular,Map.of("Idempotency-Key","not-a-uuid")).statusCode()).isEqualTo(400);
        for(String path:List.of("/api/v1/admin/orders","/api/v1/admin/orders/"+order+"/refund")) {
            String method=path.endsWith("refund")?"POST":"GET";
            assertThat(request(method,path,null,null,Map.of()).statusCode()).isEqualTo(401);
            assertThat(request(method,path,null,regular,Map.of()).statusCode()).isEqualTo(403);
        }
        var listing=request("GET","/api/v1/orders/me?status=PENDING_PAYMENT&page=0&size=1",null,regular,Map.of());
        assertThat(listing.statusCode()).isEqualTo(200);assertThat(json.readTree(listing.body()).path("totalElements").asLong()).isEqualTo(1);
        assertThat(json.readTree(request("GET","/api/v1/orders/me",null,wrong,Map.of()).body()).path("totalElements").asLong()).isZero();
        assertThat(request("GET","/api/v1/orders/me?size=101",null,regular,Map.of()).statusCode()).isEqualTo(400);
        assertThat(request("GET","/api/v1/orders/me?page=-1",null,regular,Map.of()).statusCode()).isEqualTo(400);invariant();
    }
    @Test @Tag("concurrency") void activeLeaseCannotBeStolenAfterTimeout() throws Exception {
        var pool=Executors.newSingleThreadExecutor();var started=new CountDownLatch(1);var finish=new CountDownLatch(1);
        UUID key=UUID.randomUUID();
        try {
            var worker=pool.submit(() -> idempotency.execute(user,"lease-race",key,"payload",() -> {
                started.countDown();
                try { if(!finish.await(15,TimeUnit.SECONDS)) throw new IllegalStateException("Test finish timed out"); }
                catch(InterruptedException e) {Thread.currentThread().interrupt();throw new IllegalStateException(e);}
                return new IdempotencyService.StoredResponse(201,"{}",false);
            }));
            assertThat(started.await(15,TimeUnit.SECONDS)).isTrue();clock.advance(61);
            assertThatThrownBy(() -> idempotency.execute(user,"lease-race",key,"payload",() -> {
                throw new AssertionError("An active locked claim must not be stolen");
            })).isInstanceOf(com.vibe.ticketrush.common.service.ApiException.class)
                .satisfies(e -> assertThat(((com.vibe.ticketrush.common.service.ApiException)e).getStatus().value()).isEqualTo(409));
            finish.countDown();assertThat(worker.get(15,TimeUnit.SECONDS).status()).isEqualTo(201);
            assertThat(idempotency.execute(user,"lease-race",key,"payload",() -> {throw new AssertionError("Must replay");}).replayed()).isTrue();
        } finally {finish.countDown();pool.shutdownNow();assertThat(pool.awaitTermination(10,TimeUnit.SECONDS)).isTrue();}
    }
}
