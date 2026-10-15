package com.vibe.ticketrush.reservation;

import com.vibe.ticketrush.common.redis.*;
import com.vibe.ticketrush.common.ratelimit.*;
import com.vibe.ticketrush.common.service.ApiException;
import com.vibe.ticketrush.inventory.service.*;
import com.vibe.ticketrush.queue.service.*;
import com.vibe.ticketrush.event.service.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.context.*;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.assertj.core.api.Assertions.*;
import static org.awaitility.Awaitility.await;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

@SpringBootTest(properties={"ticketrush.reservation.strategy=redis-gate","ticketrush.redis.cooldown=200ms",
    "spring.data.redis.timeout=2s","ticketrush.redis.attempt-lease=5s",
    "ticketrush.queue.capture-admitted=true",
    "ticketrush.payment.delay=24h","ticketrush.payment.dispatch-interval=24h",
    "ticketrush.rate-limit.enabled=true","ticketrush.rate-limit.policies.reservations.capacity=10",
    "ticketrush.rate-limit.policies.reservations.period=1h","ticketrush.rate-limit.policies.reservations.local-capacity=3",
    "ticketrush.rate-limit.policies.reservations.failure=LOCAL"})
class Week6RedisIntegrationTest extends ReservationTestFixture {
    static int freePort() {
        try (var socket=new java.net.ServerSocket(0)) { return socket.getLocalPort(); }
        catch (java.io.IOException ex) { throw new IllegalStateException(ex); }
    }
    private static final int REDIS_PORT=freePort();
    @Container static final GenericContainer<?> REDIS=new GenericContainer<>("redis:7.4-alpine").withExposedPorts(6379)
        .withCreateContainerCmdModifier(cmd -> cmd.getHostConfig().withPortBindings(new com.github.dockerjava.api.model.PortBinding(
            com.github.dockerjava.api.model.Ports.Binding.bindPort(REDIS_PORT),new com.github.dockerjava.api.model.ExposedPort(6379))))
        .withCommand("redis-server","--maxmemory-policy","noeviction");
    @DynamicPropertySource static void redisProperties(DynamicPropertyRegistry r) {
        r.add("spring.data.redis.host",REDIS::getHost);r.add("spring.data.redis.port",() -> REDIS.getMappedPort(6379));
        r.add("spring.data.redis.password",() -> "");
        String secret=UUID.randomUUID().toString()+UUID.randomUUID();
        r.add("ticketrush.payment.webhook-secret",() -> secret);
    }
    @Autowired RedisInventoryGate gate;
    @Autowired StringRedisTemplate redis;
    @Autowired RedisProperties keys;
    @Autowired RedisGuard guard;
    @Autowired WaitingRoomService queue;
    @Autowired WaitingRoomEvents roomEvents;
    @Autowired RedisRateLimiter limiter;
    @Autowired PublicEventCache cache;
    @Autowired io.micrometer.core.instrument.MeterRegistry metrics;
    @Autowired com.vibe.ticketrush.order.service.OrderService orders;
    @Autowired com.vibe.ticketrush.payment.service.WebhookService webhooks;
    @Autowired com.fasterxml.jackson.databind.ObjectMapper json;
    @Autowired org.springframework.context.ApplicationContext context;
    @Autowired InventoryService inventoryService;
    @Autowired org.springframework.data.redis.core.script.RedisScript<String> waitingRoomScript;
    boolean ping() { try(var c=redis.getConnectionFactory().getConnection()) { return "PONG".equals(c.ping()); } }
    @BeforeEach void resetRedis() {
        await().atMost(Duration.ofSeconds(10)).until(() -> guard.call("test",this::ping,() -> false));
        try (var c=redis.getConnectionFactory().getConnection()) { c.serverCommands().flushAll(); }
    }
    void capacity(int value) { jdbc.update("UPDATE ticket_tiers SET total_quantity=?,available_quantity=? WHERE id=?",value,value,tier);gate.warm(tier); }
    void both() {
        invariant();
        assertThat(Long.valueOf(redis.opsForValue().get(gate.counter(tier)))).isEqualTo(jdbc.queryForObject("SELECT available_quantity FROM ticket_tiers WHERE id=?",Long.class,tier));
    }
    List<UUID> users(int count) { List<UUID> result=new ArrayList<>();for(int i=0;i<count;i++)result.add(addUser());return result; }
    @Test @Tag("redis-stress") void fiveHundredThreadsForOneHundredTickets() throws Exception {
        capacity(100);var users=users(500);
        var result=concurrent(500,i -> reserve(users.get(i),tier,1));
        assertThat(Collections.frequency(result,"OK")).isEqualTo(100);
        assertThat(Collections.frequency(result,"SOLD_OUT")).isEqualTo(400);both();
        long before=service.databaseAttempts();
        assertThat(concurrent(100,i -> reserve(users.get(i),tier,1))).containsOnly("SOLD_OUT");
        assertThat(service.databaseAttempts()).isEqualTo(before);
    }
    @Test @Tag("redis-stress") void mixedQuantitiesTwoHundredThreads() throws Exception {
        capacity(250);var users=users(200);
        assertThat(concurrent(200,i -> reserve(users.get(i),tier,i%4+1))).allMatch(s -> Set.of("OK","SOLD_OUT").contains(s));both();
    }
    @Test @Tag("redis-stress") void rollbackAndDuplicateCompensation() {
        capacity(50);
        assertThatThrownBy(() -> service.create(UUID.randomUUID(),tier,3)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);both();
        var attempt=gate.begin(tier,4);gate.complete(attempt,false);gate.complete(attempt,false);both();
        var r=service.create(user,tier,2);
        assertThat(reserve(user,tier,2)).isEqualTo("ALREADY_HELD");both();
        transactions.cancel(user,r.id());both();
    }
    @Test @Tag("redis-stress") void wrongRedisValueStillUsesDatabaseGuard() {
        capacity(0);redis.opsForValue().set(gate.counter(tier),"10",Duration.ofDays(1));
        assertThatThrownBy(() -> service.create(user,tier,1)).isInstanceOfSatisfying(ApiException.class,e -> assertThat(e.getCode()).isEqualTo("SOLD_OUT"));invariant();
        assertThat(redis.opsForValue().get(gate.counter(tier))).isEqualTo("10");
        assertThat(gate.reconcile(event).getFirst().observed()).isEqualTo(10);both();
    }
    @Test @Tag("redis-stress") void commitCrashDriftAndReconciliationWithPendingAttempt() {
        capacity(50);var r=service.create(user,tier,3);
        // Simulate commit followed by process loss: release in SQL without afterCommit callback.
        new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource())).execute(s -> {
            jdbc.update("UPDATE reservations SET status='CANCELLED' WHERE id=?",r.id());
            jdbc.update("UPDATE ticket_tiers SET available_quantity=available_quantity+3 WHERE id=?",tier);return null;
        });
        assertThat(gate.reconcile(event).getFirst().observed()).isEqualTo(47);both();
        var attempt=gate.begin(tier,1);
        assertThat(gate.reconcile(event).getFirst().result()).isEqualTo("BUSY");
        gate.complete(attempt,false);both();
    }
    @Test @Tag("redis-stress") void flushDuringTrafficAndSingleFlightWarmup() throws Exception {
        capacity(100);var users=users(200);
        var result=concurrent(200,i -> {
            if (i==50) try(var c=redis.getConnectionFactory().getConnection()) { c.serverCommands().flushAll(); }
            return reserve(users.get(i),tier,1);
        });
        assertThat(result).allMatch(s -> Set.of("OK","SOLD_OUT").contains(s));invariant();gate.reconcile(event);both();
        redis.delete(gate.counter(tier));
        double before=metrics.counter("inventory_warmup_total").count();
        concurrent(100,i -> {gate.warm(tier);return true;});
        assertThat(metrics.counter("inventory_warmup_total").count()-before).isEqualTo(1);both();
    }
    @Test @Tag("redis-stress") void redisOutageContinuesSalesAndRecovers() throws Exception {
        capacity(100);var users=users(200);String id=REDIS.getContainerId();
        try {
            assertThat(concurrent(200,i -> {
                if (i==50) REDIS.getDockerClient().stopContainerCmd(id).withTimeout(0).exec();
                return reserve(users.get(i),tier,1);
            })).allMatch(s -> Set.of("OK","SOLD_OUT").contains(s));
            assertThat(guard.isOpen()).isTrue();assertAvailable(0);invariant();
            var policy=new RateLimitProperties.Policy(10,Duration.ofHours(1),2,RateLimitProperties.Failure.LOCAL);
            assertThat(concurrent(20,i -> limiter.check("outage","same",policy).allowed()).stream().filter(Boolean::booleanValue).count()).isEqualTo(2);
        } finally { REDIS.getDockerClient().startContainerCmd(id).exec(); }
        await().atMost(Duration.ofSeconds(30)).until(() -> guard.call("recovery",this::ping,() -> false));
        assertThat(guard.isOpen()).isFalse();
        await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> { gate.reconcile(event);both(); });
    }
    @Test @Tag("redis-stress") void abandonedAttemptLeaseHealsWithoutLateDoubleRefund() {
        capacity(50);var attempt=gate.begin(tier,3);
        assertThat(gate.reconcile(event).getFirst().result()).isEqualTo("BUSY");
        // No finish callback: model a process that died after obtaining permits.
        await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> {
            assertThat(gate.reconcile(event).getFirst().result()).isEqualTo("HEALED");both();
        });
        gate.complete(attempt,false);gate.complete(attempt,false);both();
    }
    @Test void cancelExpiryAndCapacityChanges() {
        capacity(50);var r=service.create(user,tier,3);transactions.cancel(user,r.id());both();
        service.create(user,tier,4);clock.advance(601);transactions.expireBatch();both();
        inventoryService.update(tier,new com.vibe.ticketrush.inventory.dto.TierDtos.WriteTier("VIP",null,100L,"USD",60,4));both();assertAvailable(60);
    }
    @Test @Tag("redis-stress") void paymentFailureLateReacquireAndRefundStayConsistent() throws Exception {
        capacity(50);
        UUID first=createOrder(user,3);
        payment(first,com.vibe.ticketrush.payment.dto.PaymentEvent.Type.FAILED,3);both();assertAvailable(50);
        UUID second=createOrder(addUser(),4);clock.advance(601);transactions.expireBatch();both();assertAvailable(50);
        payment(second,com.vibe.ticketrush.payment.dto.PaymentEvent.Type.SUCCEEDED,4);both();assertAvailable(46);
        orders.refund(second);payment(second,com.vibe.ticketrush.payment.dto.PaymentEvent.Type.REFUNDED,4);both();assertAvailable(50);
    }
    UUID createOrder(UUID who,int quantity) throws Exception {
        var response=orders.create(who,service.create(who,tier,quantity).id(),UUID.randomUUID(),com.vibe.ticketrush.payment.domain.PaymentScenario.SUCCESS);
        return UUID.fromString(json.readTree(response.body()).path("id").asText());
    }
    void payment(UUID order,com.vibe.ticketrush.payment.dto.PaymentEvent.Type type,int quantity) {
        var value=new com.vibe.ticketrush.payment.dto.PaymentEvent(UUID.randomUUID().toString(),"mock_"+order,type,quantity*100L,"USD");
        webhooks.process(value,"{}");
    }
    @Test @Tag("redis-stress") void thousandJoinsAreUniqueAndIdempotent() throws Exception {
        roomEvents.configure(event,true,10,"fifo");var users=users(1000);
        var positions=concurrent(1000,i -> queue.status(event,users.get(i),true).position());
        assertThat(new HashSet<>(positions)).hasSize(1000);assertThat(Collections.min(positions)).isEqualTo(1);assertThat(Collections.max(positions)).isEqualTo(1000);
        for (int i=0;i<10;i++) assertThat(queue.status(event,users.get(i),true).position()).isEqualTo(positions.get(i));
    }
    @Test @Tag("redis-stress") void threeAdmittersShareOneBudgetAndTokensAreBound() throws Exception {
        roomEvents.configure(event,true,3,"fifo");var users=users(9);
        for(UUID id:users)queue.status(event,id,true);
        List<WaitingRoomService> instances=new ArrayList<>();
        for(int i=0;i<3;i++) instances.add(new WaitingRoomService(redis,waitingRoomScript,
            keys,context.getBean(QueueProperties.class),roomEvents,inventoryService,guard,json,clock,new io.micrometer.core.instrument.simple.SimpleMeterRegistry()));
        assertThat(concurrent(3,i -> instances.get(i).admit(event)).stream().mapToInt(Integer::intValue).sum()).isEqualTo(3);
        assertThat(queue.admit(event)).isZero();
        var admitted=queue.newlyAdmitted(event,3);
        assertThat(admitted).hasSize(3).extracting(WaitingRoomService.AdmittedUser::user).containsExactlyElementsOf(users.subList(0,3));
        assertThat(admitted).allSatisfy(value -> assertThat(value.token()).hasSizeGreaterThanOrEqualTo(22));
        assertThat(queue.newlyAdmitted(event,3)).isEmpty();
        var first=queue.status(event,users.getFirst(),false);assertThat(first.state()).isEqualTo("ADMITTED");
        assertThat(first.token().length()).isGreaterThanOrEqualTo(22);
        queue.requireAdmission(tier,users.getFirst(),first.token());
        assertThatThrownBy(() -> queue.requireAdmission(tier,users.get(1),first.token())).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> queue.requireAdmission(tier,users.getFirst(),null)).isInstanceOf(ApiException.class);
        String admission=keys.key("queue",event,"user")+":"+users.getFirst()+":admission";
        redis.expire(admission,Duration.ofMillis(20));
        await().atMost(Duration.ofSeconds(2)).until(() -> !redis.hasKey(admission));
        assertThat(queue.status(event,users.getFirst(),false).state()).isEqualTo("EXPIRED");
        assertThatThrownBy(() -> queue.requireAdmission(tier,users.getFirst(),first.token())).isInstanceOf(ApiException.class);
    }
    @Test void statusUsesRedisSettingsAndPollIntervalGrowsWithQueuePosition() {
        roomEvents.configure(event,true,3,"fifo");
        UUID second=addUser(); UUID third=addUser();
        queue.status(event,user,true);queue.status(event,second,true);queue.status(event,third,true);
        var status=queue.status(event,third,false);
        assertThat(status.position()).isEqualTo(3);
        assertThat(status.pollIntervalSeconds()).isEqualTo(1);
        for(int i=0;i<500;i++) queue.status(event,addUser(),true);
        jdbc.update("UPDATE events SET waiting_room_enabled=false WHERE id=?",event);
        status=queue.status(event,third,false);
        assertThat(status.queueLength()).isGreaterThan(3);
        assertThat(status.pollIntervalSeconds()).isGreaterThan(1);
    }
    @Test void statusJittersLongPollIntervalsByTwentyFivePercent() {
        roomEvents.configure(event,true,3,"fifo");
        queue.status(event,user,true);
        for (int i=0;i<2_000;i++) queue.status(event,addUser(),true);
        var intervals=new HashSet<Integer>();
        for (int i=0;i<30;i++) intervals.add(queue.status(event,user,false).pollIntervalSeconds());
        // 2,001 queued users / the default 500 status req/s gives a base interval of 5 s.
        assertThat(intervals).allSatisfy(value -> assertThat(value).isBetween(4,6));
        assertThat(intervals).hasSizeGreaterThan(1);
    }
    @Test void admissionHttpBindingAndAdminAuthorization() throws Exception {
        roomEvents.configure(event,true,3,"fifo");UUID other=addUser();
        queue.status(event,user,true);queue.admit(event);String token=queue.status(event,user,false).token();
        var owner=jwt().jwt(j -> j.subject(user.toString())).authorities(new SimpleGrantedAuthority("ROLE_USER"));
        var stranger=jwt().jwt(j -> j.subject(other.toString())).authorities(new SimpleGrantedAuthority("ROLE_USER"));
        String body="{\"tierId\":\""+tier+"\",\"quantity\":1}";
        http.perform(get("/api/v1/events/"+event+"/waiting-room/status").with(owner))
            .andExpect(status().isOk()).andExpect(header().string("X-RateLimit-Limit","120"))
            .andExpect(header().string("Retry-After","1"));
        http.perform(post("/api/v1/reservations").with(stranger).header("X-Admission-Token",token).contentType("application/json").content(body))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("INVALID_ADMISSION_TOKEN"));
        http.perform(post("/api/v1/reservations").with(owner).contentType("application/json").content(body))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("WAITING_ROOM_REQUIRED"));
        http.perform(post("/api/v1/reservations").with(owner).header("X-Admission-Token",token).contentType("application/json").content(body)).andExpect(status().isCreated());
        redis.delete(keys.key("queue",event,"user")+":"+user+":admission");
        http.perform(post("/api/v1/reservations").with(owner).header("X-Admission-Token",token).contentType("application/json").content(body)).andExpect(status().isForbidden());
        http.perform(post("/api/v1/admin/events/"+event+"/inventory/redis-reconcile").with(owner)).andExpect(status().isForbidden());
        http.perform(post("/api/v1/admin/events/"+event+"/inventory/redis-reconcile").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))).andExpect(status().isOk());
        http.perform(get("/api/v1/events/"+event+"/waiting-room/status")).andExpect(status().isUnauthorized());
    }
    @Test void proxyTrustIsExplicitAndBucketIdentitiesAreIndependent() {
        var policy=new RateLimitProperties.Policy(1,Duration.ofHours(1),1,RateLimitProperties.Failure.LOCAL);
        assertThat(limiter.check("identity","user:a",policy).allowed()).isTrue();
        assertThat(limiter.check("identity","user:a",policy).allowed()).isFalse();
        assertThat(limiter.check("identity","ip:a",policy).allowed()).isTrue();
        var addresses=new ClientAddress(new RateLimitProperties(true,List.of("10.0.0.0/8"),Map.of()));
        var request=new org.springframework.mock.web.MockHttpServletRequest();request.setRemoteAddr("192.0.2.1");request.addHeader("X-Forwarded-For","198.51.100.2");
        assertThat(addresses.resolve(request)).isEqualTo("192.0.2.1");
        request.setRemoteAddr("10.0.0.2");assertThat(addresses.resolve(request)).isEqualTo("198.51.100.2");
        request.removeHeader("X-Forwarded-For");request.addHeader("X-Forwarded-For","deadbeef");
        assertThat(addresses.resolve(request)).isEqualTo("10.0.0.2");
    }
    @Test void publicCacheNeverContainsExactInventoryAndAdminCancelInvalidates() throws Exception {
        http.perform(get("/api/v1/events")).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
        http.perform(get("/api/v1/events").param("keyword","null")).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
        http.perform(get("/api/v1/events/"+event)).andExpect(status().isOk()).andExpect(jsonPath("$.tiers[0].availableQuantity").doesNotExist());
        String stored=redis.opsForValue().get(keys.key("event",event,"cache"));
        assertThat(stored).doesNotContain("availableQuantity","totalQuantity");
        context.getBean(EventService.class).transition(event,com.vibe.ticketrush.event.domain.EventStatus.CANCELLED);
        http.perform(get("/api/v1/events/"+event)).andExpect(status().isNotFound());
    }
    @Test void staleUsersSoldOutAndLottery() {
        roomEvents.configure(event,true,3,"fifo");UUID second=addUser();
        queue.status(event,user,true);queue.status(event,second,true);
        redis.opsForZSet().add(keys.key("queue",event,"heartbeat"),user.toString(),1);
        assertThat(queue.status(event,second,false).position()).isEqualTo(1);
        assertThat(queue.status(event,user,false).state()).isEqualTo("EXPIRED");
        capacity(0);queue.refresh(event);assertThat(queue.status(event,second,false).soldOut()).isTrue();assertThat(queue.admit(event)).isZero();
        redis.opsForZSet().add(keys.key("queue",event,"heartbeat"),second.toString(),1);
        assertThat(queue.admit(event)).isZero();
        assertThat(redis.opsForZSet().zCard(keys.key("queue",event,"waiting"))).isZero();
        try(var c=redis.getConnectionFactory().getConnection()){c.serverCommands().flushAll();}
        capacity(50);jdbc.update("UPDATE events SET sale_start_time=? WHERE id=?",ts(10),event);roomEvents.configure(event,true,3,"lottery");
        var users=users(30);for(UUID id:users)queue.status(event,id,true);
        var before=redis.opsForZSet().range(keys.key("queue",event,"waiting"),0,-1);
        clock.advance(10);UUID late=addUser();assertThat(queue.status(event,late,true).position()).isEqualTo(31);
        var after=redis.opsForZSet().range(keys.key("queue",event,"waiting"),0,29);
        assertThat(after).containsExactlyInAnyOrderElementsOf(before);assertThat(new ArrayList<>(after)).isNotEqualTo(new ArrayList<>(before));
    }
    @Test @Tag("redis-stress") void twoHundredRequestsLimitTenAndRefill() throws Exception {
        var policy=new RateLimitProperties.Policy(10,Duration.ofHours(1),3,RateLimitProperties.Failure.LOCAL);
        var decisions=concurrent(200,i -> limiter.check("parallel","one",policy));
        assertThat(decisions.stream().filter(RedisRateLimiter.Decision::allowed).count()).isEqualTo(10);
        assertThat(decisions.stream().filter(d -> !d.allowed())).allMatch(d -> d.remaining()==0 && d.retrySeconds()>0 && d.resetEpochSeconds()>0);
        var fast=new RateLimitProperties.Policy(1,Duration.ofMillis(150),1,RateLimitProperties.Failure.LOCAL);
        assertThat(limiter.check("refill","one",fast).allowed()).isTrue();assertThat(limiter.check("refill","one",fast).allowed()).isFalse();
        await().atMost(Duration.ofSeconds(3)).until(() -> limiter.check("refill","one",fast).allowed());
        assertThat(limiter.check("parallel","two",policy).allowed()).isTrue();
    }
    @Test @Tag("redis-stress") void httpRateHeadersAdmissionAndWebhookExclusion() throws Exception {
        var auth=jwt().jwt(j -> j.subject(user.toString())).authorities(new SimpleGrantedAuthority("ROLE_USER"));
        roomEvents.configure(event,true,10,"fifo");
        var results=concurrent(200,i -> {
            try { return http.perform(post("/api/v1/reservations").with(auth).contentType("application/json")
                .content("{\"tierId\":\""+tier+"\",\"quantity\":1}")).andReturn().getResponse(); }
            catch(Exception ex) {throw new IllegalStateException(ex);}
        });
        assertThat(results.stream().filter(r -> r.getStatus()==403).count()).isEqualTo(10);
        assertThat(results.stream().filter(r -> r.getStatus()==429).count()).isEqualTo(190);
        for(var response:results) if(response.getStatus()==429) {
            assertThat(response.getHeader("X-RateLimit-Limit")).isEqualTo("10");assertThat(response.getHeader("X-RateLimit-Remaining")).isEqualTo("0");
            assertThat(response.getHeader("Retry-After")).isNotNull();assertThat(response.getHeader("X-RateLimit-Reset")).isNotNull();
        }
        var response=http.perform(post("/api/v1/payments/webhook").contentType("application/json").content("{}")).andReturn().getResponse();
        assertThat(response.getStatus()).isNotEqualTo(429);assertThat(response.getHeader("X-RateLimit-Limit")).isNull();
    }
    @Test @Tag("redis-stress") void cacheStampedeHitAndInvalidation() throws Exception {
        AtomicInteger rebuilds=new AtomicInteger();
        var result=concurrent(100,i -> cache.get("test",String.class,() -> "value-"+rebuilds.incrementAndGet()));
        assertThat(result).containsOnly("value-1");assertThat(rebuilds).hasValue(1);
        cache.invalidate();assertThat(cache.get("test",String.class,() -> "value-"+rebuilds.incrementAndGet())).isEqualTo("value-2");
        redis.expire(keys.key("event","test","cache"),Duration.ofMillis(20));
        redis.expire(keys.key("event","test","stale"),Duration.ofMillis(20));
        await().atMost(Duration.ofSeconds(2)).until(() -> !redis.hasKey(keys.key("event","test","cache")) && !redis.hasKey(keys.key("event","test","stale")));
        concurrent(100,i -> cache.get("test",String.class,() -> "value-"+rebuilds.incrementAndGet()));assertThat(rebuilds).hasValue(3);
    }
}
