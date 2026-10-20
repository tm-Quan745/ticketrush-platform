package com.vibe.ticketrush.reservation;

import com.vibe.ticketrush.common.service.ApiException;
import com.vibe.ticketrush.order.service.OrderService;
import com.vibe.ticketrush.payment.domain.PaymentScenario;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.utility.DockerImageName;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;

@TestPropertySource(properties={
    "spring.datasource.hikari.maximum-pool-size=1",
    "spring.datasource.hikari.connection-timeout=2000",
    "ticketrush.payment.delay=24h", "ticketrush.payment.dispatch-interval=24h"})
class OrderSmallPoolIntegrationTest extends ReservationTestFixture {
    @Container static final GenericContainer<?> REDIS=new GenericContainer<>(DockerImageName.parse("redis:7.4-alpine"))
        .withExposedPorts(6379);
    @DynamicPropertySource static void redis(DynamicPropertyRegistry r) {
        // Flyway uses two connections while migrating; isolate that startup requirement.
        r.add("spring.flyway.url",POSTGRES::getJdbcUrl);
        r.add("spring.flyway.user",POSTGRES::getUsername);
        r.add("spring.flyway.password",POSTGRES::getPassword);
        String paymentSecret=UUID.randomUUID().toString()+UUID.randomUUID();
        r.add("ticketrush.payment.webhook-secret",() -> paymentSecret);
        r.add("spring.data.redis.host",REDIS::getHost);
        r.add("spring.data.redis.port",() -> REDIS.getMappedPort(6379));
        r.add("spring.data.redis.password",() -> "");
    }
    @Autowired OrderService orders;

    @Test void concurrentOrdersNeedOnlyOneConnectionPerRequest() throws Exception {
        UUID[] users=new UUID[8],holds=new UUID[8],keys=new UUID[8];
        for (int i=0;i<users.length;i++) {
            users[i]=addUser();
            holds[i]=service.create(users[i],tier,1).id();
            keys[i]=UUID.randomUUID();
        }
        var responses=concurrent(users.length,i -> orders.create(users[i],holds[i],keys[i],PaymentScenario.SUCCESS));
        assertThat(responses).allSatisfy(response -> assertThat(response.status()).isEqualTo(201));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM orders",Integer.class)).isEqualTo(8);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM idempotency_keys WHERE status='COMPLETED'",Integer.class)).isEqualTo(8);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events e JOIN orders o ON e.aggregate_id=o.id WHERE e.event_type='order.created'",Integer.class)).isEqualTo(8);
        invariant();
    }

    @Test void lazyExpiryCommitsEvenWhenOrderIsRejected() {
        var hold=service.create(user,tier,2);
        clock.advance(3600);
        assertThatThrownBy(() -> orders.create(user,hold.id(),UUID.randomUUID(),PaymentScenario.SUCCESS))
            .isInstanceOfSatisfying(ApiException.class,e -> assertThat(e.getCode()).isEqualTo("RESERVATION_NOT_HELD"));
        assertAvailable(50);
        assertThat(jdbc.queryForObject("SELECT status FROM reservations WHERE id=?",String.class,hold.id())).isEqualTo("EXPIRED");
        invariant();
    }

    @Test void completedKeyReplaysBeforeReservationPreparation() {
        var hold=service.create(user,tier,1);
        UUID key=UUID.randomUUID();
        var first=orders.create(user,hold.id(),key,PaymentScenario.SUCCESS);
        clock.advance(3600);
        var replay=orders.create(user,hold.id(),key,PaymentScenario.SUCCESS);
        assertThat(replay.replayed()).isTrue();
        assertThat(replay.body()).isEqualTo(first.body());
        assertThat(jdbc.queryForObject("SELECT status FROM reservations WHERE id=?",String.class,hold.id())).isEqualTo("HELD");
        assertThatThrownBy(() -> orders.create(user,UUID.randomUUID(),key,PaymentScenario.SUCCESS))
            .isInstanceOfSatisfying(ApiException.class,e -> assertThat(e.getCode()).isEqualTo("IDEMPOTENCY_PAYLOAD_MISMATCH"));
    }
}
