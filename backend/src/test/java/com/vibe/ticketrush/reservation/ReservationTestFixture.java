package com.vibe.ticketrush.reservation;

import com.vibe.ticketrush.reservation.service.*;
import com.vibe.ticketrush.reservation.domain.*;
import com.vibe.ticketrush.inventory.service.InventoryReconciliationService;
import com.vibe.ticketrush.common.service.ApiException;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.IntFunction;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;

@SpringBootTest(properties={"ticketrush.reservation.expiry-enabled=false","ticketrush.reservation.batch-size=7","spring.datasource.hikari.maximum-pool-size=40"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(ReservationTestFixture.TimeConfiguration.class)
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
abstract class ReservationTestFixture {
    @Container static final PostgreSQLContainer<?> POSTGRES=new PostgreSQLContainer<>("postgres:17-alpine");
    @DynamicPropertySource static void configure(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url",POSTGRES::getJdbcUrl);
        r.add("spring.datasource.username",POSTGRES::getUsername);
        r.add("spring.datasource.password",POSTGRES::getPassword);
        byte[] secret=new byte[32];new java.security.SecureRandom().nextBytes(secret);
        r.add("app.auth.jwt-secret",() -> Base64.getEncoder().encodeToString(secret));
        r.add("spring.data.redis.password",() -> "unused-test-password");
        r.add("spring.rabbitmq.password",() -> "unused-test-password");
    }
    static class MutableClock extends Clock {
        final AtomicReference<Instant> value=new AtomicReference<>(Instant.parse("2030-01-01T00:00:00Z"));
        public ZoneId getZone() {return ZoneOffset.UTC;}
        public Clock withZone(ZoneId zone) {return this;}
        public Instant instant() {return value.get();}
        void advance(long seconds) {value.updateAndGet(t -> t.plusSeconds(seconds));}
    }
    @TestConfiguration static class TimeConfiguration {
        @Bean @Primary MutableClock testClock() {return new MutableClock();}
    }
    @Autowired JdbcTemplate jdbc;
    @Autowired ReservationService service;
    @Autowired ReservationTransactions transactions;
    @Autowired InventoryReconciliationService reconciliation;
    @Autowired MutableClock clock;
    @Autowired MockMvc http;
    UUID event,tier,user;
    @BeforeEach void setup() {
        jdbc.execute("TRUNCATE events, ticket_tiers, users CASCADE");
        clock.value.set(Instant.parse("2030-01-01T00:00:00Z"));
        user=addUser();event=UUID.randomUUID();
        jdbc.update("""
            INSERT INTO events(id,title,venue_name,venue_address,start_time,end_time,sale_start_time,sale_end_time,status,created_by)
            VALUES (?, 'Concert','Hall','City',?,?,?,?,'PUBLISHED',?)
            """,event,ts(86400),ts(90000),ts(-3600),ts(7200),user);
        tier=addTier(50);
    }
    java.sql.Timestamp ts(long offset) {return java.sql.Timestamp.from(clock.instant().plusSeconds(offset));}
    UUID addUser() {
        UUID id=UUID.randomUUID();
        jdbc.update("INSERT INTO users(id,email,password_hash) VALUES (?,?,?)",id,id+"@test.example","unused");return id;
    }
    UUID addTier(int capacity) {
        UUID id=UUID.randomUUID();
        jdbc.update("INSERT INTO ticket_tiers(id,event_id,name,price,currency,total_quantity,available_quantity,max_per_order) VALUES (?,?,?,100,'USD',?,?,4)",id,event,id.toString(),capacity,capacity);
        return id;
    }
    String reserve(UUID u,UUID t,int quantity) {
        try {service.create(u,t,quantity);return "OK";}
        catch (ApiException e) {return e.getCode();}
    }
    <T> List<T> concurrent(int count,IntFunction<T> task) throws Exception {
        ExecutorService pool=Executors.newFixedThreadPool(count);
        CountDownLatch ready=new CountDownLatch(count),start=new CountDownLatch(1);
        List<Future<T>> futures=new ArrayList<>();
        try {
            for(int i=0;i<count;i++) {final int index=i;futures.add(pool.submit(() -> {
                ready.countDown();if(!start.await(20,TimeUnit.SECONDS)) throw new TimeoutException("Start barrier timed out");
                return task.apply(index);
            }));}
            assertThat(ready.await(20,TimeUnit.SECONDS)).isTrue();start.countDown();
            long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(90);
            List<T> result=new ArrayList<>();
            for(var future:futures) result.add(future.get(Math.max(1,deadline-System.nanoTime()),TimeUnit.NANOSECONDS));
            return result;
        } finally {start.countDown();pool.shutdownNow();assertThat(pool.awaitTermination(10,TimeUnit.SECONDS)).isTrue();}
    }
    void invariant() {
        assertThat(reconciliation.reconcile(event)).isEmpty();
        assertThat(jdbc.queryForObject("SELECT min(available_quantity) FROM ticket_tiers",Integer.class)).isGreaterThanOrEqualTo(0);
    }
    void assertAvailable(int expected) {assertThat(jdbc.queryForObject("SELECT available_quantity FROM ticket_tiers WHERE id=?",Integer.class,tier)).isEqualTo(expected);}
}
