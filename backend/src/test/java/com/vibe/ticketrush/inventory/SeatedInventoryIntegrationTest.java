package com.vibe.ticketrush.inventory;
import com.vibe.ticketrush.inventory.service.*;
import com.vibe.ticketrush.event.service.EventService;
import com.vibe.ticketrush.event.domain.EventStatus;
import com.vibe.ticketrush.reservation.dto.ReservationDtos.Create;
import com.vibe.ticketrush.common.service.ApiException;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;

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
    "ticketrush.payment.dispatch-interval=24h","ticketrush.rate-limit.enabled=true"})
@ActiveProfiles({"test","loadtest"})
@Import(SeatedInventoryIntegrationTest.TimeConfiguration.class)
@Testcontainers
@org.springframework.test.annotation.DirtiesContext(classMode=org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
class SeatedInventoryIntegrationTest {
    @Container static final PostgreSQLContainer<?> POSTGRES=new PostgreSQLContainer<>("postgres:17-alpine");
    @Container static final org.testcontainers.containers.GenericContainer<?> REDIS=new org.testcontainers.containers.GenericContainer<>("redis:7.4-alpine").withExposedPorts(6379);
    static final String SECRET=randomSecret();
    static final String TEST_TOKEN=randomSecret();
    static String randomSecret() { byte[] value=new byte[32];new java.security.SecureRandom().nextBytes(value);return Base64.getEncoder().encodeToString(value); }
    @DynamicPropertySource static void configure(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url",POSTGRES::getJdbcUrl);r.add("spring.datasource.username",POSTGRES::getUsername);r.add("spring.datasource.password",POSTGRES::getPassword);
        r.add("app.auth.jwt-secret",() -> SECRET);r.add("ticketrush.payment.webhook-secret",() -> SECRET);
        r.add("ticketrush.payment.test-token",() -> TEST_TOKEN);
        r.add("spring.data.redis.host",REDIS::getHost);r.add("spring.data.redis.port",()->REDIS.getMappedPort(6379));r.add("spring.data.redis.password",()->"");r.add("spring.rabbitmq.password",() -> "unused");
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
    @Autowired org.springframework.data.redis.core.StringRedisTemplate redis;
    @Autowired SeatedInventory seats;
    @Autowired SeatingAdministration administration;
    @Autowired SeatingVerifier verifier;
    @Autowired EventService eventService;
    @Autowired PlatformTransactionManager manager;
    @Autowired VenueTemplateLoader loader;
    @Autowired com.vibe.ticketrush.queue.service.WaitingRoomService queue;
    @Autowired com.vibe.ticketrush.event.service.WaitingRoomEvents roomEvents;
    @Autowired com.vibe.ticketrush.event.service.PublicEventCache publicCache;
    @Autowired SeatReadService reads;
    @Autowired SeatReadCache readCache;
    @Autowired io.micrometer.core.instrument.MeterRegistry metrics;
    @Autowired org.springframework.context.ApplicationContext context;
    @Autowired com.vibe.ticketrush.common.redis.RedisProperties redisKeys;
    UUID user,event,tier,venue,section,otherTier,otherSection;
    List<UUID> seatIds;
    @BeforeEach void setup() {
        jdbc.execute("TRUNCATE users,events,ticket_tiers CASCADE");
        clock.value.set(Instant.parse("2030-01-01T00:00:00Z"));
        user=addUser();event=UUID.randomUUID();tier=UUID.randomUUID();
        venue=UUID.randomUUID();section=UUID.randomUUID();otherSection=UUID.randomUUID();otherTier=UUID.randomUUID();
        jdbc.update("INSERT INTO venues VALUES (?, ?,1,'Test stadium','{}')",venue,venue.toString());
        jdbc.update("INSERT INTO sections VALUES (?,?,'A','Stand A','SEATED','{}'),(?,?,'B','Stand B','SEATED','{}')",section,venue,otherSection,venue);
        for (int i=1;i<=30;i++) {
            jdbc.update("INSERT INTO seats(id,section_id,row_label,row_rank,number,adjacency_segment,x,y) VALUES (?,?,'R1',0,?,0,?,1)",UUID.randomUUID(),section,i,i);
            jdbc.update("INSERT INTO seats(id,section_id,row_label,row_rank,number,adjacency_segment,x,y) VALUES (?,?,'R1',0,?,0,?,1)",UUID.randomUUID(),otherSection,i,i);
        }
        jdbc.update("""
            INSERT INTO events(id,title,start_time,end_time,sale_start_time,sale_end_time,status,created_by,venue_id)
            VALUES (?,'Seated concert',?,?,?,?,'DRAFT',?,?)
            """,event,ts(864000),ts(900000),ts(-3600),ts(720000),user,venue);
        jdbc.update("INSERT INTO ticket_tiers(id,event_id,name,price,total_quantity,available_quantity,max_per_order,inventory_mode) VALUES (?,?,'A',123,0,0,6,'SEATED'),(?,?,'B',456,0,0,6,'SEATED')",tier,event,otherTier,event);
        administration.map(event,new SeatingAdministration.SectionMapping(List.of(new SeatingAdministration.Mapping(section,tier),new SeatingAdministration.Mapping(otherSection,otherTier))));
        eventService.transition(event,EventStatus.PUBLISHED);
        seatIds=jdbc.queryForList("SELECT id FROM event_seats WHERE tier_id=? ORDER BY id",UUID.class,tier);
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
        var response=create(who,hold(who,seatIds.subList(0,quantity)).id(),UUID.randomUUID());
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
    com.vibe.ticketrush.reservation.dto.ReservationDtos.View hold(UUID who,List<UUID> ids) {
        return reservations.create(who,new Create(null,null,ids),null);
    }
    void tx(Runnable work) { new TransactionTemplate(manager).executeWithoutResult(s->work.run()); }
    void assertCode(Runnable work,String code) {
        assertThatThrownBy(work::run).isInstanceOfSatisfying(ApiException.class,e->assertThat(e.getCode()).isEqualTo(code));
    }
    @Test @Timeout(90) void twoHundredOverlappingHoldsAreAtomicAndNeverDuplicate() throws Exception {
        List<UUID> users=new ArrayList<>();for(int i=0;i<200;i++) users.add(addUser());
        long started=System.nanoTime();
        var outcomes=parallel(200,i->{
            int size=2+i%5,start=i%25;
            try { return hold(users.get(i),seatIds.subList(start,start+size)); }
            catch (ApiException ex) { assertThat(ex.getCode()).isEqualTo("SEATS_UNAVAILABLE");return null; }
        });
        var accepted=outcomes.stream().filter(Objects::nonNull).toList();
        assertThat(accepted).isNotEmpty();
        int held=accepted.stream().mapToInt(r->r.quantity()).sum();
        assertThat(seats.counts(tier).held()).isEqualTo(held).isLessThanOrEqualTo(30);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM reservations",Integer.class)).isEqualTo(accepted.size());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM reservation_seats",Integer.class)).isEqualTo(held);
        invariant();assertThat(verifier.verify(event)).isEmpty();
        List<UUID> paidOrders=new ArrayList<>();
        for (var reservation:accepted) {
            var created=create(reservation.userId(),reservation.id(),UUID.randomUUID());
            assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
            paidOrders.add(UUID.fromString(json.readTree(created.body()).path("id").asText()));
        }
        parallel(paidOrders.size(),i->{
            UUID order=paidOrders.get(i);
            assertThat(webhook(event(order,Type.SUCCEEDED,"concurrent-seat-sale-"+order)).statusCode()).isEqualTo(200);
            return true;
        });
        assertThat(seats.counts(tier).held()).isZero();assertThat(seats.counts(tier).sold()).isEqualTo(held);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM tickets WHERE status='VALID'",Integer.class)).isEqualTo(held);
        invariant();
        System.out.println("SEATING_CONCURRENCY_EVIDENCE " + json.writeValueAsString(Map.of(
            "threads",200,"seatBlockSize",30,"requestMin",2,"requestMax",6,
            "accepted",accepted.size(),"seatsUnavailable409",200-accepted.size(),
            "finalTargetTier",seats.counts(tier),"elapsedMillis",TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-started),
            "timeoutsSeconds",Map.of("test",90,"barrier",15,"future",60,"poolTermination",10))));
    }
    @Test @Timeout(15) void lockedSeatIsSkippedImmediatelyWithConflict() throws Exception {
        var locked=new CountDownLatch(1);var release=new CountDownLatch(1);
        var pool=Executors.newSingleThreadExecutor();
        var owner=pool.submit(()->tx(()->{
            jdbc.queryForObject("SELECT id FROM event_seats WHERE id=? FOR UPDATE",UUID.class,seatIds.getFirst());
            locked.countDown();
            try { assertThat(release.await(10,TimeUnit.SECONDS)).isTrue(); }
            catch (InterruptedException ex) { Thread.currentThread().interrupt();throw new IllegalStateException(ex); }
        }));
        try {
            assertThat(locked.await(5,TimeUnit.SECONDS)).isTrue();
            assertCode(()->hold(user,List.of(seatIds.getFirst())),"SEATS_UNAVAILABLE");
        } finally {release.countDown();owner.get(5,TimeUnit.SECONDS);pool.shutdownNow();}
        assertThat(seats.counts(tier).held()).isZero();
    }
    @Test void seatedPublicBucketsNeverExposeExactStock() throws Exception {
        for (String expected:List.of("AVAILABLE","LOW","SOLD_OUT")) {
            if (expected.equals("LOW")) {
                for (int offset=0;offset<24;offset+=6) hold(addUser(),seatIds.subList(offset,offset+6));
                hold(addUser(),seatIds.subList(24,28));
            }
            if (expected.equals("SOLD_OUT")) hold(addUser(),seatIds.subList(28,30));
            publicCache.invalidate();
            var response=request("GET","/api/v1/events/"+event,null,null,Map.of());
            assertThat(response.statusCode()).isEqualTo(200);
            var tiers=json.readTree(response.body()).path("tiers");
            var match=java.util.stream.StreamSupport.stream(tiers.spliterator(),false).filter(t->t.path("id").asText().equals(tier.toString())).findFirst().orElseThrow();
            assertThat(match.path("availability").asText()).isEqualTo(expected);
            assertThat(response.body()).doesNotContain("availableQuantity","totalQuantity","heldQuantity","soldQuantity","reservationId","userId");
        }
    }
    @Test void seatedSoldOutStopsAdmissionAndLoadtestFeed() throws Exception {
        roomEvents.configure(event,true,20,"fifo");
        jdbc.update("UPDATE events SET sale_start_time=? WHERE id=?",ts(60),event);
        queue.refresh(event);
        UUID waiting=addUser();
        String base="/internal/loadtest/events/"+event+"/waiting-room/";
        var seeded=request("POST",base+"seed","{\"users\":[\""+waiting+"\"]}",token(user,"ADMIN"),Map.of());
        assertThat(seeded.statusCode()).as(seeded.body()).isEqualTo(200);
        jdbc.update("UPDATE event_seats SET status='BLOCKED' WHERE event_id=?",event);
        clock.advance(61);queue.refresh(event);
        assertThat(queue.admit(event)).isZero();
        assertThat(queue.status(event,waiting,false).soldOut()).isTrue();
        assertThat(request("GET",base+"admissions",null,token(user,"ADMIN"),Map.of()).body()).isEqualTo("[]");
        jdbc.update("UPDATE event_seats SET status='AVAILABLE' WHERE id=?",seatIds.getFirst());
        queue.refresh(event);
        assertThat(queue.admit(event)).isEqualTo(1);
        var feed=request("GET",base+"admissions",null,token(user,"ADMIN"),Map.of());
        assertThat(feed.statusCode()).isEqualTo(200);
        var entry=json.readTree(feed.body()).get(0);
        assertThat(entry.path("user").asText()).isEqualTo(waiting.toString());
        var held=reservations.create(waiting,new Create(null,null,List.of(seatIds.getFirst())),entry.path("token").asText());
        queue.refresh(event);assertThat(queue.admit(event)).isZero();
        assertThat(queue.status(event,waiting,false).soldOut()).isTrue();
        assertThat(queue.newlyAdmitted(event,20)).isEmpty();
        expiry.cancel(waiting,held.id());queue.refresh(event);
        assertThat(queue.status(event,waiting,false).soldOut()).isFalse();
    }
    String sectionPath(){return "/api/v1/events/"+event+"/sections/"+section+"/seats";}
    @Test void seatReadShapeOwnerOverlayEtagAndStaleConflict() throws Exception {
        String owner=token(user,"USER");UUID other=addUser();
        var first=request("GET",sectionPath(),null,owner,Map.of());
        assertThat(first.statusCode()).as(first.body()).isEqualTo(200);
        assertThat(json.readTree(first.body()).path("seats")).hasSize(30);
        String etag=first.headers().firstValue("ETag").orElseThrow();
        var same=request("GET",sectionPath(),null,owner,Map.of("If-None-Match",etag));
        assertThat(same.statusCode()).isEqualTo(304);assertThat(same.body()).isEmpty();
        assertThat(same.headers().firstValue("Cache-Control")).contains("private, no-cache");
        assertThat(same.headers().firstValue("Vary")).contains("Authorization");
        hold(user,List.of(seatIds.getFirst()));
        var owned=request("GET",sectionPath(),null,owner,Map.of("If-None-Match",etag));
        assertThat(owned.statusCode()).isEqualTo(200);
        var ownerSeats=json.readTree(owned.body()).path("seats");
        assertThat(java.util.stream.StreamSupport.stream(ownerSeats.spliterator(),false).filter(s->s.path("mine").asBoolean()).count()).isEqualTo(1);
        var foreign=request("GET",sectionPath(),null,token(other,"USER"),Map.of());
        assertThat(foreign.body()).doesNotContain(user.toString(),other.toString(),"userId","reservationId");
        for(var s:json.readTree(foreign.body()).path("seats"))assertThat(s.path("mine").asBoolean()).isFalse();
        var conflict=request("POST","/api/v1/reservations","{\"seatIds\":[\""+seatIds.getFirst()+"\"]}",token(other,"USER"),Map.of());
        assertThat(conflict.statusCode()).isEqualTo(409);
        assertThat(json.readTree(conflict.body()).path("unavailableSeatIds").get(0).asText()).isEqualTo(seatIds.getFirst().toString());
    }
    @Test void seatReadAuthorizationAndSafeMap() throws Exception {
        assertThat(request("GET",sectionPath(),null,null,Map.of()).statusCode()).isEqualTo(401);
        for(String role:List.of("USER","STAFF","ADMIN"))assertThat(request("GET",sectionPath(),null,token(user,role),Map.of()).statusCode()).isEqualTo(200);
        var map=request("GET","/api/v1/events/"+event+"/seatmap",null,null,Map.of());
        assertThat(map.statusCode()).isEqualTo(200);
        assertThat(map.body()).doesNotContain("userId","reservationId","password","shapePath");
        assertThat(json.readTree(map.body()).path("sections").get(0).path("seatCount").asInt()).isEqualTo(30);
        String suggest="/api/v1/events/"+event+"/seats/suggest",body="{\"sectionId\":\""+section+"\",\"quantity\":2}";
        assertThat(request("POST",suggest,body,null,Map.of()).statusCode()).isEqualTo(401);
        assertThat(request("POST",suggest,body,token(user,"STAFF"),Map.of()).statusCode()).isEqualTo(403);
        assertThat(request("POST",suggest,body,token(user,"USER"),Map.of()).statusCode()).isEqualTo(200);
        eventService.transition(event,EventStatus.CANCELLED);
        assertThat(request("GET",sectionPath(),null,token(user,"USER"),Map.of()).statusCode()).isEqualTo(404);
    }
    @Test @Timeout(30) void expiredSectionCacheHasOneRebuildForOneHundredRequests() throws Exception {
        reads.seats(event,section,user);
        Thread.sleep(1100);
        double before=metrics.counter("seat_read_cache_total","result","rebuild").count();
        String auth=token(user,"USER");
        var results=parallel(100,i->request("GET",sectionPath(),null,auth,Map.of()).statusCode());
        assertThat(results).containsOnly(200);
        assertThat(metrics.counter("seat_read_cache_total","result","rebuild").count()-before).isEqualTo(1);
        assertThat(metrics.counter("seat_read_cache_total","result","hit").count()).isGreaterThan(0);
    }
    @Test void suggestUsesStageRowCentreAislesAndAccessibilityWithoutHolding() {
        // Fixture-only topology edit before testing the published read contract.
        tx(()->{
            jdbc.update("UPDATE events SET status='DRAFT' WHERE id=?",event);
            jdbc.update("UPDATE seats SET adjacency_segment=CASE WHEN number<=15 THEN 0 ELSE 1 END,accessible=(number=14) WHERE section_id=?",section);
            jdbc.update("UPDATE events SET status='PUBLISHED' WHERE id=?",event);
        });
        var normal=reads.suggest(event,user,new SeatReadService.SuggestRequest(section,2,false),null);
        assertThat(normal.seats()).extracting(SeatedInventory.Assignment::number).containsExactly(16,17);
        assertThat(reads.suggest(event,user,new SeatReadService.SuggestRequest(section,2,false),null).seatIds()).isEqualTo(normal.seatIds());
        var accessible=reads.suggest(event,user,new SeatReadService.SuggestRequest(section,2,true),null);
        assertThat(accessible.seats()).extracting(SeatedInventory.Assignment::number).containsExactly(14,15);
        assertThat(seats.counts(tier).held()).isZero();
        jdbc.update("UPDATE event_seats SET status='BLOCKED' WHERE tier_id=? AND seat_id IN (SELECT id FROM seats WHERE number NOT IN (15,16))",tier);
        assertCode(()->reads.suggest(event,user,new SeatReadService.SuggestRequest(section,2,false),null),"NO_ADJACENT_SEATS");
        assertCode(()->reads.suggest(event,user,new SeatReadService.SuggestRequest(section,7,false),null),"INVALID_QUANTITY");
        roomEvents.configure(event,true,20,"fifo");queue.refresh(event);
        assertCode(()->reads.suggest(event,user,new SeatReadService.SuggestRequest(section,1,false),null),"WAITING_ROOM_REQUIRED");
    }
    @Test @Timeout(20) void seatReadDatabaseBulkheadRejectsExcessWork() throws Exception {
        var entered=new CountDownLatch(8);var release=new CountDownLatch(1);var pool=Executors.newFixedThreadPool(8);
        try {
            List<Future<?>> workers=new ArrayList<>();for(int i=0;i<8;i++) workers.add(pool.submit(()->readCache.database(()->{
                entered.countDown();try{release.await(10,TimeUnit.SECONDS);}catch(InterruptedException ex){Thread.currentThread().interrupt();}return true;
            })));
            assertThat(entered.await(5,TimeUnit.SECONDS)).isTrue();
            assertCode(()->readCache.database(()->true),"SEAT_READ_BUSY");
            release.countDown();for(var worker:workers)worker.get(5,TimeUnit.SECONDS);
        }finally{release.countDown();pool.shutdownNow();}
    }
    @Test void seatReadRateLimitsUserAndIp() throws Exception {
        String auth=token(user,"USER");boolean rejected=false;
        for(int i=0;i<140;i++) {
            var response=request("GET",sectionPath(),null,auth,Map.of());
            if(response.statusCode()==429){assertThat(response.headers().firstValue("Retry-After")).isPresent();rejected=true;break;}
            assertThat(response.statusCode()).isEqualTo(200);
        }
        assertThat(rejected).isTrue();
        String ipKey=redisKeys.key("rate-limit",com.vibe.ticketrush.auth.service.TokenService.hash("ip:127.0.0.1"),"seat-read-ip");
        // Exhaust the real shared IP bucket without sending 30,000 requests.
        redis.opsForHash().putAll(ipKey,Map.of("tokens","0","at",Long.toString(System.currentTimeMillis()+60000)));
        try {assertThat(request("GET","/api/v1/events/"+event+"/seatmap",null,null,Map.of()).statusCode()).isEqualTo(429);}
        finally {redis.delete(ipKey);}
    }
    @Test void devSeederIsTaggedIdempotentAccountFreeAndAbsentOutsideDev() throws Exception {
        for(String[] profiles:List.of(new String[]{"prod"},new String[]{"dev","prod"},new String[]{"loadtest"},new String[]{"demo"})) {
            try(var child=new org.springframework.context.annotation.AnnotationConfigApplicationContext()) {
                child.setParent(context);child.getEnvironment().setActiveProfiles(profiles);
                child.register(com.vibe.ticketrush.event.service.DevSeatedEventSeeder.class);child.refresh();
                assertThat(child.getBeansOfType(com.vibe.ticketrush.event.service.DevSeatedEventSeeder.class)).isEmpty();
            }
        }
        loader.run(null);long users=jdbc.queryForObject("SELECT count(*) FROM users",Long.class);
        try(var child=new org.springframework.context.annotation.AnnotationConfigApplicationContext()) {
            child.setParent(context);child.getEnvironment().setActiveProfiles("dev");
            child.register(com.vibe.ticketrush.event.service.DevSeatedEventSeeder.class);child.refresh();
            var seeder=child.getBean(com.vibe.ticketrush.event.service.DevSeatedEventSeeder.class);
            tx(()->seeder.run(null));tx(()->seeder.run(null));
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM users",Long.class)).isEqualTo(users);
        UUID seeded=jdbc.queryForObject("SELECT id FROM events WHERE description='[dev-seated-v1]' AND status='PUBLISHED'",UUID.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM event_seats WHERE event_id=?",Integer.class,seeded)).isEqualTo(3200);
        var map=request("GET","/api/v1/events/"+seeded+"/seatmap",null,null,Map.of());
        assertThat(map.statusCode()).isEqualTo(200);
        for(var s:json.readTree(map.body()).path("sections"))if(s.path("type").asText().equals("GA")) {
            assertThat(s.path("counts").isNull()).isTrue();assertThat(s.path("seatCount").asInt()).isZero();
            assertThat(request("GET","/api/v1/events/"+seeded+"/sections/"+s.path("id").asText()+"/seats",null,token(user,"USER"),Map.of()).statusCode()).isEqualTo(422);
        }
    }
    @Test @Timeout(40) void redisFailureFallsBackToPostgresForSeatReads() {
        var docker=REDIS.getDockerClient();
        docker.pauseContainerCmd(REDIS.getContainerId()).exec();
        try {
            var result=reads.seats(event,section,user);
            assertThat(result.seats()).hasSize(30);
            assertThat(result.counts().available()).isEqualTo(30);
        } finally {docker.unpauseContainerCmd(REDIS.getContainerId()).exec();}
    }
    @Test void holdConflictRollsBackReservationMembershipAndOutbox() {
        hold(user,seatIds.subList(0,2));
        long before=jdbc.queryForObject("SELECT count(*) FROM outbox_events",Long.class);
        UUID another=addUser();
        assertCode(()->hold(another,List.of(seatIds.get(1),seatIds.get(2))),"SEATS_UNAVAILABLE");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM reservations WHERE user_id=?",Integer.class,another)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events",Long.class)).isEqualTo(before);
        assertThat(seats.counts(tier).held()).isEqualTo(2);invariant();
    }
    @Test void mixedTierWrongModeDuplicateAndQuantityAreRejected() {
        UUID other=jdbc.queryForList("SELECT id FROM event_seats WHERE tier_id=?",UUID.class,otherTier).getFirst();
        assertCode(()->hold(user,List.of(seatIds.getFirst(),other)),"MIXED_TIERS");
        assertCode(()->reservations.create(user,tier,2),"WRONG_INVENTORY_MODE");
        assertCode(()->hold(user,List.of(seatIds.getFirst(),seatIds.getFirst())),"INVALID_SEAT_IDS");
        assertCode(()->hold(user,seatIds.subList(0,7)),"INVALID_QUANTITY");
        assertCode(()->reservations.create(user,new Create(tier,2,seatIds.subList(0,2)),null),"WRONG_INVENTORY_MODE");
    }
    @Test void expiryAndCancellationReleaseExactlyOnce() throws Exception {
        var reservation=hold(user,seatIds.subList(0,3));
        assertThat(reservation.expiresAt()).isEqualTo(clock.instant().plusSeconds(600));
        clock.advance(601);
        parallel(8,i->{expiry.expireBatch();return true;});
        assertThat(seats.counts(tier).available()).isEqualTo(30);
        assertThat(expiry.cancel(user,reservation.id())).isFalse();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM reservation_seats WHERE reservation_id=?",Integer.class,reservation.id())).isEqualTo(3);
        var next=hold(user,seatIds.subList(0,3));assertThat(expiry.cancel(user,next.id())).isTrue();
        assertThat(expiry.cancel(user,next.id())).isFalse();invariant();
    }
    @Test void signedPaymentIssuesSnapshotAndDuplicateLiveSeatIsRejected() throws Exception {
        UUID order=order(user,3);
        assertThat(webhook(event(order,Type.SUCCEEDED,"success")).statusCode()).isEqualTo(200);
        assertThat(seats.counts(tier).sold()).isEqualTo(3);
        assertThat(orders.tickets(user,order)).allSatisfy(t->{assertThat(t.seat().id()).isIn(seatIds.subList(0,3));assertThat(t.seat().sectionName()).isEqualTo("Stand A");});
        assertThatThrownBy(()->jdbc.update("""
            INSERT INTO tickets(id,order_id,user_id,event_id,tier_id,ticket_index,ticket_code,status,issued_at,seat_id,seat_snapshot)
            SELECT gen_random_uuid(),order_id,user_id,event_id,tier_id,99,'duplicate-seat','VALID',issued_at,seat_id,seat_snapshot FROM tickets LIMIT 1
            """)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class).hasMessageContaining("uq_live_ticket_seat");
        assertThat(webhook(event(order,Type.SUCCEEDED,"success-again")).statusCode()).isEqualTo(200);
        assertThat(orders.tickets(user,order)).hasSize(3);invariant();
    }
    @Test void paymentFailureReleasesSeats() throws Exception {
        UUID order=order(user,2);assertThat(webhook(event(order,Type.FAILED,"failed")).statusCode()).isEqualTo(200);
        assertThat(seats.counts(tier).available()).isEqualTo(30);invariant();
    }
    @Test @Timeout(60) void paymentExpiryRaceReacquiresSameSeatsOrRefunds() throws Exception {
        UUID order=order(user,4);clock.advance(601);
        parallel(2,i->{if(i==0) expiry.expireBatch();else assertThat(webhook(event(order,Type.SUCCEEDED,"race-expiry")).statusCode()).isEqualTo(200);return true;});
        assertThat(status(order)).isEqualTo("PAID");assertThat(seats.counts(tier).sold()).isEqualTo(4);invariant();
    }
    @Test @Timeout(60) void paymentCancelRaceHasOneConsistentOutcome() throws Exception {
        UUID order=order(user,4);
        parallel(2,i->{if(i==0) {try {orders.cancel(user,order);}catch(ApiException e){assertThat(e.getCode()).isEqualTo("ORDER_NOT_CANCELLABLE");}}
            else assertThat(webhook(event(order,Type.SUCCEEDED,"race-cancel")).statusCode()).isEqualTo(200);return true;});
        assertThat(status(order)).isEqualTo("PAID");assertThat(seats.counts(tier).sold()).isEqualTo(4);invariant();
    }
    @Test void latePaymentCannotTakeAnotherUsersSeats() throws Exception {
        UUID order=order(user,2);clock.advance(601);expiry.expireBatch();
        hold(addUser(),seatIds.subList(0,2));
        assertThat(webhook(event(order,Type.SUCCEEDED,"late")).statusCode()).isEqualTo(200);
        assertThat(status(order)).isEqualTo("REFUND_PENDING");assertThat(seats.counts(tier).held()).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM tickets",Integer.class)).isZero();invariant();
    }
    @Test @Timeout(60) void refundAndCheckInSerializeOnOrderAndUsedSeatNeverReleases() throws Exception {
        UUID order=order(user,2);assertThat(webhook(event(order,Type.SUCCEEDED,"paid")).statusCode()).isEqualTo(200);
        String code=orders.tickets(user,order).getFirst().ticketCode();UUID staff=addUser();
        var outcomes=parallel(2,i-> i==0 ? request("POST","/api/v1/admin/orders/"+order+"/refund",null,token(user,"ADMIN"),Map.of())
            : request("POST","/api/v1/gate/tickets/check-in","{\"ticketCode\":\""+code+"\"}",token(staff,"STAFF"),Map.of()));
        assertThat(outcomes.stream().map(HttpResponse::statusCode).sorted().toList()).containsExactly(200,409);
        if ("PAID".equals(status(order))) {
            assertCode(()->orders.refund(order),"TICKET_ALREADY_USED");
            assertThat(seats.counts(tier).sold()).isEqualTo(2);
        } else {
            assertThat(webhook(event(order,Type.REFUNDED,"refund")).statusCode()).isEqualTo(200);
            assertThat(seats.counts(tier).available()).isEqualTo(30);
        }
        invariant();
    }
    @Test void blockIsAtomicVersionedAndNumericCapacityRejected() {
        var first=new SeatingAdministration.SeatVersion(seatIds.get(0),0L);
        administration.block(event,new SeatingAdministration.Block(List.of(first),true,"Safety"));
        assertCode(()->administration.block(event,new SeatingAdministration.Block(List.of(first),false,"Open")),"SEAT_STATE_CONFLICT");
        hold(user,List.of(seatIds.get(1)));
        assertCode(()->administration.block(event,new SeatingAdministration.Block(List.of(new SeatingAdministration.SeatVersion(seatIds.get(2),0L),new SeatingAdministration.SeatVersion(seatIds.get(1),1L)),true,"Safety")),"SEAT_STATE_CONFLICT");
        assertThat(seats.counts(tier).blocked()).isEqualTo(1);
        administration.block(event,new SeatingAdministration.Block(List.of(new SeatingAdministration.SeatVersion(seatIds.get(0),1L)),false,"Open"));
        var response=request("PUT","/api/v1/admin/tiers/"+tier,"{\"name\":\"A\",\"price\":123,\"currency\":\"USD\",\"totalQuantity\":99,\"maxPerOrder\":6,\"inventoryMode\":\"SEATED\"}",token(user,"ADMIN"),Map.of());
        assertThat(response.statusCode()).as(response.body()).isEqualTo(422);invariant();
    }
    @Test void anonymousAndBuyerCannotUseSeatingAdminAndHoldRequiresAdmission() throws Exception {
        for(String path:List.of("/api/v1/admin/venues","/api/v1/admin/venues/"+venue)) {
            assertThat(request("GET",path,null,null,Map.of()).statusCode()).isEqualTo(401);
            assertThat(request("GET",path,null,token(user,"USER"),Map.of()).statusCode()).isEqualTo(403);
        }
        String body=json.writeValueAsString(Map.of("seatIds",seatIds.subList(0,2)));
        assertThat(request("POST","/api/v1/reservations",body,null,Map.of()).statusCode()).isEqualTo(401);
        jdbc.update("UPDATE events SET waiting_room_enabled=true WHERE id=?",event);
        var response=request("POST","/api/v1/reservations",body,token(user,"USER"),Map.of());
        assertThat(response.statusCode()).as(response.body()).isEqualTo(403);
    }
    @Test void stadiumTemplateHas3200SeatsAndIsIdempotentAndImmutable() throws Exception {
        loader.run(null);
        UUID stadium=jdbc.queryForObject("SELECT id FROM venues WHERE template_key='ticketrush-stadium'",UUID.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM seats s JOIN sections sec ON sec.id=s.section_id WHERE sec.venue_id=?",Integer.class,stadium)).isEqualTo(3200);
        assertThat(administration.venue(stadium).sections()).hasSize(5);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM seats s JOIN sections sec ON sec.id=s.section_id WHERE sec.venue_id=? AND sec.type='GA'",Integer.class,stadium)).isZero();
        assertThatThrownBy(()->jdbc.update("UPDATE seats SET x=2 WHERE section_id=?",section)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(()->jdbc.update("UPDATE venues SET name='changed' WHERE id=?",venue)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertCode(()->administration.map(event,new SeatingAdministration.SectionMapping(List.of(new SeatingAdministration.Mapping(section,tier)))),"TOPOLOGY_FROZEN");
    }
    @org.junit.jupiter.params.ParameterizedTest(name="constraint: {0}")
    @org.junit.jupiter.params.provider.MethodSource("invalidInserts")
    void databaseRejectsInvalidInserts(String constraint,String sql) {
        jdbc.update("UPDATE events SET status='DRAFT' WHERE id=?",event);
        var named=new org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate(jdbc);
        assertThatThrownBy(()->named.update(sql,Map.of("venue",venue,"section",section,"event",event,"tier",tier,"seat",seatIds.getFirst())))
            .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class)
            .hasMessageContaining(constraint);
    }
    static java.util.stream.Stream<org.junit.jupiter.params.provider.Arguments> invalidInserts() {
        return java.util.stream.Stream.of(
            org.junit.jupiter.params.provider.Arguments.of("venues_template_version_check","INSERT INTO venues VALUES(gen_random_uuid(),'bad',0,'Bad','{}')"),
            org.junit.jupiter.params.provider.Arguments.of("venues_geometry_check","INSERT INTO venues VALUES(gen_random_uuid(),'bad',1,'Bad','[]')"),
            org.junit.jupiter.params.provider.Arguments.of("venues_template_key_template_version_key","INSERT INTO venues SELECT gen_random_uuid(),template_key,template_version,name,geometry FROM venues WHERE id=:venue"),
            org.junit.jupiter.params.provider.Arguments.of("sections_venue_id_fkey","INSERT INTO sections VALUES(gen_random_uuid(),gen_random_uuid(),'X','X','SEATED','{}')"),
            org.junit.jupiter.params.provider.Arguments.of("events_venue_id_fkey","INSERT INTO events(id,title,start_time,end_time,sale_start_time,sale_end_time,venue_id) SELECT gen_random_uuid(),title,start_time,end_time,sale_start_time,sale_end_time,gen_random_uuid() FROM events WHERE id=:event"),
            org.junit.jupiter.params.provider.Arguments.of("event_tier_sections_section_id_fkey","INSERT INTO event_tier_sections VALUES(:event,gen_random_uuid(),:tier)"),
            org.junit.jupiter.params.provider.Arguments.of("sections_type_check","INSERT INTO sections VALUES(gen_random_uuid(),:venue,'X','X','OTHER','{}')"),
            org.junit.jupiter.params.provider.Arguments.of("sections_geometry_check","INSERT INTO sections VALUES(gen_random_uuid(),:venue,'X','X','SEATED','[]')"),
            org.junit.jupiter.params.provider.Arguments.of("sections_venue_id_code_key","INSERT INTO sections SELECT gen_random_uuid(),venue_id,code,name,type,geometry FROM sections WHERE id=:section"),
            org.junit.jupiter.params.provider.Arguments.of("seats_row_label_check","INSERT INTO seats VALUES(gen_random_uuid(),:section,'',0,100,0,1,1,false)"),
            org.junit.jupiter.params.provider.Arguments.of("seats_row_rank_check","INSERT INTO seats VALUES(gen_random_uuid(),:section,'X',-1,100,0,1,1,false)"),
            org.junit.jupiter.params.provider.Arguments.of("seats_number_check","INSERT INTO seats VALUES(gen_random_uuid(),:section,'X',0,0,0,1,1,false)"),
            org.junit.jupiter.params.provider.Arguments.of("seats_adjacency_segment_check","INSERT INTO seats VALUES(gen_random_uuid(),:section,'X',0,100,-1,1,1,false)"),
            org.junit.jupiter.params.provider.Arguments.of("seats_x_check","INSERT INTO seats VALUES(gen_random_uuid(),:section,'X',0,100,0,'NaN',1,false)"),
            org.junit.jupiter.params.provider.Arguments.of("seats_y_check","INSERT INTO seats VALUES(gen_random_uuid(),:section,'X',0,100,0,1,10001,false)"),
            org.junit.jupiter.params.provider.Arguments.of("seats_section_id_row_label_number_key","INSERT INTO seats SELECT gen_random_uuid(),section_id,row_label,row_rank,number,adjacency_segment,x,y,accessible FROM seats WHERE section_id=:section LIMIT 1"),
            org.junit.jupiter.params.provider.Arguments.of("ticket_tiers_inventory_mode_check","INSERT INTO ticket_tiers(id,event_id,name,price,total_quantity,available_quantity,inventory_mode) VALUES(gen_random_uuid(),:event,'invalid',1,0,0,'OTHER')"),
            org.junit.jupiter.params.provider.Arguments.of("event_tier_sections_pkey","INSERT INTO event_tier_sections VALUES(:event,:section,:tier)"),
            org.junit.jupiter.params.provider.Arguments.of("event_seats_event_id_seat_id_key","INSERT INTO event_seats(id,event_id,seat_id,section_id,tier_id,status) SELECT gen_random_uuid(),event_id,seat_id,section_id,tier_id,'AVAILABLE' FROM event_seats WHERE id=:seat"),
            org.junit.jupiter.params.provider.Arguments.of("event_seat_state","INSERT INTO event_seats(id,event_id,seat_id,section_id,tier_id,status) VALUES(gen_random_uuid(),:event,gen_random_uuid(),:section,:tier,'OTHER')"),
            org.junit.jupiter.params.provider.Arguments.of("event_seats_version_check","INSERT INTO event_seats(id,event_id,seat_id,section_id,tier_id,status,version) VALUES(gen_random_uuid(),:event,gen_random_uuid(),:section,:tier,'AVAILABLE',-1)"),
            org.junit.jupiter.params.provider.Arguments.of("event_seat_state","INSERT INTO event_seats(id,event_id,seat_id,section_id,tier_id,status) VALUES(gen_random_uuid(),:event,gen_random_uuid(),:section,:tier,'HELD')"),
            org.junit.jupiter.params.provider.Arguments.of("event_seat_state","INSERT INTO event_seats(id,event_id,seat_id,section_id,tier_id,status) VALUES(gen_random_uuid(),:event,gen_random_uuid(),:section,:tier,'SOLD')"),
            org.junit.jupiter.params.provider.Arguments.of("event_seat_state","INSERT INTO event_seats(id,event_id,seat_id,section_id,tier_id,status,expires_at) VALUES(gen_random_uuid(),:event,gen_random_uuid(),:section,:tier,'AVAILABLE',now())"),
            org.junit.jupiter.params.provider.Arguments.of("event_seat_state","INSERT INTO event_seats(id,event_id,seat_id,section_id,tier_id,status,expires_at) VALUES(gen_random_uuid(),:event,gen_random_uuid(),:section,:tier,'BLOCKED',now())"),
            org.junit.jupiter.params.provider.Arguments.of("event_seats_seat_id_section_id_fkey","INSERT INTO event_seats(id,event_id,seat_id,section_id,tier_id,status) VALUES(gen_random_uuid(),:event,gen_random_uuid(),:section,:tier,'AVAILABLE')"),
            org.junit.jupiter.params.provider.Arguments.of("reservation_seats_reservation_id_fkey","INSERT INTO reservation_seats VALUES(gen_random_uuid(),:seat)")
        );
    }
    @Test void deferredClaimRequiresMembershipAtCommitAndHistoricalMembershipIsRetained() {
        UUID reservation=hold(user,List.of(seatIds.getFirst())).id();
        assertThatThrownBy(()->tx(()->jdbc.update("UPDATE event_seats SET status='HELD',reservation_id=?,expires_at=? WHERE id=?",reservation,ts(600),seatIds.get(1))))
            .hasStackTraceContaining("fk_event_seat_current_claim");
        assertThatThrownBy(()->jdbc.update("INSERT INTO reservation_seats VALUES (?,?)",reservation,seatIds.getFirst())).hasMessageContaining("reservation_seats_pkey");
        assertThatThrownBy(()->jdbc.update("INSERT INTO reservation_seats VALUES (?,?)",reservation,UUID.randomUUID())).hasMessageContaining("reservation_seats_event_seat_id_fkey");
        expiry.cancel(user,reservation);assertThat(jdbc.queryForObject("SELECT count(*) FROM reservation_seats WHERE reservation_id=?",Integer.class,reservation)).isEqualTo(1);
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings={"SOLD_TICKET_ORDER","MULTIPLE_ACTIVE_RESERVATIONS","HELD_RESERVATION_TTL","RESERVATION_MEMBERSHIP","SECTION_CAPACITY","USED_SEAT_AVAILABLE","LIVE_TICKET_STATE"})
    void verifierDetectsCraftedBadData(String check) throws Exception {
        UUID reservation;
        switch(check) {
            case "SOLD_TICKET_ORDER" -> {
                reservation=hold(user,seatIds.subList(0,2)).id();
                tx(()->{seats.sellHeld(reservation,2);jdbc.update("UPDATE reservations SET status='CONFIRMED' WHERE id=?",reservation);});
            }
            case "MULTIPLE_ACTIVE_RESERVATIONS" -> {
                reservation=hold(user,List.of(seatIds.getFirst())).id();UUID other=UUID.randomUUID(),who=addUser();
                jdbc.update("INSERT INTO reservations SELECT ?,?,tier_id,quantity,status,expires_at,created_at,updated_at,version FROM reservations WHERE id=?",other,who,reservation);
                jdbc.update("INSERT INTO reservation_seats VALUES (?,?)",other,seatIds.getFirst());
            }
            case "HELD_RESERVATION_TTL" -> {hold(user,List.of(seatIds.getFirst()));jdbc.update("UPDATE event_seats SET expires_at=expires_at+interval '1 second' WHERE id=?",seatIds.getFirst());}
            case "RESERVATION_MEMBERSHIP" -> {reservation=hold(user,List.of(seatIds.getFirst())).id();jdbc.update("UPDATE reservations SET quantity=2 WHERE id=?",reservation);}
            case "SECTION_CAPACITY" -> jdbc.update("DELETE FROM event_seats WHERE id=?",seatIds.getFirst());
            case "USED_SEAT_AVAILABLE","LIVE_TICKET_STATE" -> {
                UUID order=order(user,1);assertThat(webhook(event(order,Type.SUCCEEDED,"paid")).statusCode()).isEqualTo(200);
                if(check.equals("USED_SEAT_AVAILABLE")) jdbc.update("UPDATE tickets SET status='USED',used_at=?,used_by=? WHERE order_id=?",ts(0),user,order);
                jdbc.update("UPDATE event_seats SET status='AVAILABLE',reservation_id=NULL,expires_at=NULL WHERE id=?",seatIds.getFirst());
            }
            default -> throw new AssertionError(check);
        }
        assertThat(verifier.verify(event)).extracting(SeatingVerifier.Violation::code).contains(check);
        assertThat(reconciliation.reconcile(event)).extracting(com.vibe.ticketrush.inventory.dto.InventoryViolation::code).contains(check);
    }
    @Test void adminCreatesAndPublishesCompleteStadiumAtomicallyWithDefaultSixSeatLimit() throws Exception {
        UUID stadium=jdbc.queryForObject("SELECT id FROM venues WHERE template_key='ticketrush-stadium'",UUID.class);
        var body=Map.of("title","Full stadium","startTime",clock.instant().plusSeconds(86400),"endTime",clock.instant().plusSeconds(90000),
            "saleStartTime",clock.instant().minusSeconds(60),"saleEndTime",clock.instant().plusSeconds(3600),"venueId",stadium);
        var created=request("POST","/api/v1/admin/events",json.writeValueAsString(body),token(user,"ADMIN"),Map.of());
        assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
        UUID id=UUID.fromString(json.readTree(created.body()).path("id").asText());
        assertThat(json.readTree(created.body()).path("venueId").asText()).isEqualTo(stadium.toString());
        List<Map<String,UUID>> mapping=new ArrayList<>();
        for(var sec:administration.venue(stadium).sections()) {
            boolean ga=sec.type().equals("GA");
            Map<String,Object> tierBody=new HashMap<>(Map.of("name",sec.name(),"price",123,"currency","USD","totalQuantity",ga?100:0,"inventoryMode",ga?"COUNTER":"SEATED"));
            if (ga) tierBody.put("maxPerOrder",1);
            var tierResponse=request("POST","/api/v1/admin/events/"+id+"/tiers",json.writeValueAsString(tierBody),token(user,"ADMIN"),Map.of());
            assertThat(tierResponse.statusCode()).as(tierResponse.body()).isEqualTo(201);
            var data=json.readTree(tierResponse.body());if(!ga) assertThat(data.path("maxPerOrder").asInt()).isEqualTo(6);
            mapping.add(Map.of("sectionId",sec.id(),"tierId",UUID.fromString(data.path("id").asText())));
        }
        var mapped=request("PUT","/api/v1/admin/events/"+id+"/section-tiers",json.writeValueAsString(Map.of("mappings",mapping)),token(user,"ADMIN"),Map.of());
        assertThat(mapped.statusCode()).as(mapped.body()).isEqualTo(200);
        assertThat(request("POST","/api/v1/admin/events/"+id+"/publish",null,token(user,"ADMIN"),Map.of()).statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM event_seats WHERE event_id=?",Integer.class,id)).isEqualTo(3200);
        assertThat(request("POST","/api/v1/admin/events/"+id+"/publish",null,token(user,"ADMIN"),Map.of()).statusCode()).isEqualTo(409);
        assertThat(verifier.verify(id)).isEmpty();
    }
    @Test void mappingRejectsForeignTierForeignVenueWrongModeMissingAndDuplicateSections() {
        jdbc.update("UPDATE events SET status='DRAFT' WHERE id=?",event);
        var good=new SeatingAdministration.Mapping(section,tier);
        assertCode(()->administration.map(event,new SeatingAdministration.SectionMapping(List.of(good))),"INVALID_SECTION_MAPPING");
        assertCode(()->administration.map(event,new SeatingAdministration.SectionMapping(List.of(good,good))),"INVALID_SECTION_MAPPING");
        assertCode(()->administration.map(event,new SeatingAdministration.SectionMapping(List.of(good,new SeatingAdministration.Mapping(otherSection,UUID.randomUUID())))),"INVALID_SECTION_MAPPING");
        UUID foreignSection=administration.venues().stream().filter(v->v.templateKey().equals("ticketrush-stadium")).map(v->administration.venue(v.id()).sections().getFirst().id()).findFirst().orElseThrow();
        assertCode(()->administration.map(event,new SeatingAdministration.SectionMapping(List.of(good,new SeatingAdministration.Mapping(foreignSection,otherTier)))),"INVALID_SECTION_MAPPING");
        jdbc.update("UPDATE ticket_tiers SET inventory_mode='COUNTER' WHERE id=?",otherTier);
        assertCode(()->administration.map(event,new SeatingAdministration.SectionMapping(List.of(good,new SeatingAdministration.Mapping(otherSection,otherTier)))),"INVALID_SECTION_MAPPING");
        jdbc.update("DELETE FROM event_seats WHERE event_id=?",event);jdbc.update("DELETE FROM event_tier_sections WHERE event_id=?",event);
        assertCode(()->eventService.transition(event,EventStatus.PUBLISHED),"INVALID_SECTION_MAPPING");
        assertThat(jdbc.queryForObject("SELECT status FROM events WHERE id=?",String.class,event)).isEqualTo("DRAFT");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM event_seats WHERE event_id=?",Integer.class,event)).isZero();
    }
    @Test void compositeTopologyForeignKeysRejectWrongEventAndSectionAndMapping() {
        jdbc.update("UPDATE events SET status='DRAFT' WHERE id=?",event);
        UUID newSection=UUID.randomUUID(),physical=UUID.randomUUID();
        jdbc.update("INSERT INTO sections VALUES (?,?,'UNMAPPED','Unmapped','SEATED','{}')",newSection,venue);
        jdbc.update("INSERT INTO seats VALUES (?,?,'R',0,1,0,1,1,false)",physical,newSection);
        assertThatThrownBy(()->jdbc.update("INSERT INTO event_tier_sections VALUES (?,?,?)",event,newSection,UUID.randomUUID())).hasMessageContaining("event_tier_sections_tier_id_event_id_fkey");
        assertThatThrownBy(()->jdbc.update("INSERT INTO event_seats(id,event_id,seat_id,section_id,tier_id,status) VALUES (?,?,?,?,?,'AVAILABLE')",UUID.randomUUID(),event,physical,section,tier)).hasMessageContaining("event_seats_seat_id_section_id_fkey");
        assertThatThrownBy(()->jdbc.update("INSERT INTO event_seats(id,event_id,seat_id,section_id,tier_id,status) VALUES (?,?,?,?,?,'AVAILABLE')",UUID.randomUUID(),event,physical,newSection,tier)).hasMessageContaining("event_seats_event_id_section_id_tier_id_fkey");
        UUID ga=UUID.randomUUID();jdbc.update("INSERT INTO sections VALUES (?,?,'GA','Pit','GA','{}')",ga,venue);
        assertThatThrownBy(()->jdbc.update("INSERT INTO seats VALUES (?,?,'R',0,1,0,1,1,false)",UUID.randomUUID(),ga)).hasMessageContaining("Physical seats require a SEATED section");
    }
    @Test void ticketSnapshotAndEventSeatForeignKeyAreEnforcedAndSnapshotCannotChange() throws Exception {
        UUID order=order(user,1);assertThat(webhook(event(order,Type.SUCCEEDED,"paid")).statusCode()).isEqualTo(200);
        assertThatThrownBy(()->jdbc.update("""
            INSERT INTO tickets(id,order_id,user_id,event_id,tier_id,ticket_index,ticket_code,status,issued_at,seat_id,seat_snapshot)
            SELECT gen_random_uuid(),order_id,user_id,event_id,tier_id,99,'missing-snapshot','CANCELLED',issued_at,seat_id,NULL FROM tickets LIMIT 1
            """)).hasMessageContaining("ticket_seat_snapshot");
        assertThatThrownBy(()->jdbc.update("""
            INSERT INTO tickets(id,order_id,user_id,event_id,tier_id,ticket_index,ticket_code,status,issued_at,seat_id,seat_snapshot)
            SELECT gen_random_uuid(),order_id,user_id,event_id,tier_id,99,'wrong-event-seat','CANCELLED',issued_at,gen_random_uuid(),seat_snapshot FROM tickets LIMIT 1
            """)).hasMessageContaining("fk_ticket_event_seat");
        assertThatThrownBy(()->jdbc.update("UPDATE tickets SET seat_snapshot=jsonb_set(seat_snapshot,'{row}','\"wrong\"') WHERE order_id=?",order)).hasMessageContaining("Issued seat snapshot is immutable");
    }
    @Test void usedTicketAlwaysRefusesRefundAndRemainsSold() throws Exception {
        UUID order=order(user,2);assertThat(webhook(event(order,Type.SUCCEEDED,"paid")).statusCode()).isEqualTo(200);
        String code=orders.tickets(user,order).getFirst().ticketCode();UUID staff=addUser();
        var response=request("POST","/api/v1/gate/tickets/check-in",json.writeValueAsString(Map.of("ticketCode",code)),token(staff,"STAFF"),Map.of());
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        assertCode(()->orders.refund(order),"TICKET_ALREADY_USED");
        clock.advance(1000);expiry.expireBatch();
        assertThat(seats.counts(tier).sold()).isEqualTo(2);invariant();
    }
    @Test @Timeout(60) void lockedSeatsFailImmediatelyAndUserTierLockDoesNotWait() throws Exception {
        CountDownLatch locked=new CountDownLatch(1),release=new CountDownLatch(1);
        var executor=Executors.newSingleThreadExecutor();
        try {
            Future<?> blocker=executor.submit(()->tx(()->{
                jdbc.queryForList("SELECT id FROM event_seats WHERE id=? FOR UPDATE",seatIds.getFirst());
                seats.tryUserTierLock(user,tier);locked.countDown();
                try {assertThat(release.await(10,TimeUnit.SECONDS)).isTrue();}catch(InterruptedException ex){Thread.currentThread().interrupt();throw new IllegalStateException(ex);}
            }));
            assertThat(locked.await(5,TimeUnit.SECONDS)).isTrue();
            assertCode(()->hold(addUser(),List.of(seatIds.getFirst())),"SEATS_UNAVAILABLE");
            assertCode(()->hold(user,List.of(seatIds.get(1))),"INVENTORY_BUSY");
            release.countDown();blocker.get(10,TimeUnit.SECONDS);
        } finally {release.countDown();executor.shutdownNow();}
        assertThat(seats.counts(tier).held()).isZero();invariant();
    }
    @Test void holdHttpContractContainsAssignmentsAndConflictSeatIdsAndAdminMutationsAreProtected() throws Exception {
        String body=json.writeValueAsString(Map.of("seatIds",seatIds.subList(0,2)));
        var first=request("POST","/api/v1/reservations",body,token(user,"USER"),Map.of());
        assertThat(first.statusCode()).as(first.body()).isEqualTo(201);
        var data=json.readTree(first.body());assertThat(data.path("inventoryMode").asText()).isEqualTo("SEATED");
        assertThat(data.path("seats").size()).isEqualTo(2);assertThat(data.path("unitPrice").asLong()).isEqualTo(123);
        var conflict=request("POST","/api/v1/reservations",body,token(addUser(),"USER"),Map.of());
        assertThat(conflict.statusCode()).isEqualTo(409);assertThat(json.readTree(conflict.body()).path("unavailableSeatIds").size()).isEqualTo(2);
        String block=json.writeValueAsString(new SeatingAdministration.Block(List.of(new SeatingAdministration.SeatVersion(seatIds.get(2),0L)),true,"Test"));
        for(String role:List.of("USER","STAFF")) assertThat(request("POST","/api/v1/admin/events/"+event+"/seats/block",block,token(user,role),Map.of()).statusCode()).isEqualTo(403);
        assertThat(request("POST","/api/v1/admin/events/"+event+"/seats/block",block,null,Map.of()).statusCode()).isEqualTo(401);
    }
    @Test void capacityPatchIsCounterOnlyAndChecksVersionAndCommittedStock() throws Exception {
        UUID counter=UUID.randomUUID();
        jdbc.update("INSERT INTO ticket_tiers(id,event_id,name,price,total_quantity,available_quantity,max_per_order) VALUES (?,?,'GA',1,10,10,6)",counter,event);
        reservations.create(user,counter,3);
        long version=jdbc.queryForObject("SELECT version FROM ticket_tiers WHERE id=?",Long.class,counter);
        String path="/api/v1/admin/tiers/"+counter+"/capacity";
        var below=request("PATCH",path,json.writeValueAsString(Map.of("totalQuantity",2,"expectedVersion",version)),token(user,"ADMIN"),Map.of());
        assertThat(below.statusCode()).isEqualTo(409);assertThat(json.readTree(below.body()).path("code").asText()).isEqualTo("CAPACITY_BELOW_COMMITTED");
        var changed=request("PATCH",path,json.writeValueAsString(Map.of("totalQuantity",15,"expectedVersion",version)),token(user,"ADMIN"),Map.of());
        assertThat(changed.statusCode()).as(changed.body()).isEqualTo(200);assertThat(json.readTree(changed.body()).path("availableQuantity").asInt()).isEqualTo(12);
        var stale=request("PATCH",path,json.writeValueAsString(Map.of("totalQuantity",16,"expectedVersion",version)),token(user,"ADMIN"),Map.of());
        assertThat(stale.statusCode()).isEqualTo(409);assertThat(json.readTree(stale.body()).path("code").asText()).isEqualTo("CAPACITY_VERSION_CONFLICT");
        var seated=request("PATCH","/api/v1/admin/tiers/"+tier+"/capacity","{\"totalQuantity\":10,\"expectedVersion\":0}",token(user,"ADMIN"),Map.of());
        assertThat(seated.statusCode()).isEqualTo(422);assertThat(json.readTree(seated.body()).path("code").asText()).isEqualTo("CAPACITY_DERIVED_FROM_SEATS");
        invariant();
    }
    @Test void seatedReadsDeriveCountsWithoutChangingCounterColumnsOrRedisGate() throws Exception {
        hold(user,seatIds.subList(0,3));
        administration.block(event,new SeatingAdministration.Block(List.of(new SeatingAdministration.SeatVersion(seatIds.get(5),0L)),true,"Closed"));
        var response=request("GET","/api/v1/admin/events/"+event+"/inventory",null,token(user,"ADMIN"),Map.of());
        assertThat(response.statusCode()).isEqualTo(200);
        JsonNode inventory=json.readTree(response.body());
        JsonNode data=java.util.stream.StreamSupport.stream(inventory.spliterator(),false).filter(t->t.path("id").asText().equals(tier.toString())).findFirst().orElseThrow();
        assertThat(data.path("totalQuantity").asInt()).isEqualTo(29);assertThat(data.path("availableQuantity").asInt()).isEqualTo(26);
        assertThat(data.path("heldQuantity").asInt()).isEqualTo(3);assertThat(data.path("sectionCounts").size()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT total_quantity+available_quantity FROM ticket_tiers WHERE id=?",Integer.class,tier)).isZero();
        assertThat(redis.keys("*"+tier+"*")).isEmpty();
        invariant();
    }
    @Test void refundAllowsResaleWithOneLiveTicketAndPreservesHistoricalMembership() throws Exception {
        UUID first=order(user,2);assertThat(webhook(event(first,Type.SUCCEEDED,"first-paid")).statusCode()).isEqualTo(200);
        orders.refund(first);assertThat(webhook(event(first,Type.REFUNDED,"first-refunded")).statusCode()).isEqualTo(200);
        UUID other=addUser(),second=order(other,2);assertThat(webhook(event(second,Type.SUCCEEDED,"second-paid")).statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM tickets WHERE status='CANCELLED'",Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM tickets WHERE status='VALID'",Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM reservation_seats",Integer.class)).isEqualTo(4);
        assertThat(seats.counts(tier).sold()).isEqualTo(2);invariant();
    }
}
