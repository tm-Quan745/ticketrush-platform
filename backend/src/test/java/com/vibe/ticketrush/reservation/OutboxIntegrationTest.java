package com.vibe.ticketrush.reservation;

import com.vibe.ticketrush.outbox.service.OutboxPublisher;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;

/** PostgreSQL integration checks for transaction-only, no-op-safe outbox writes. */
class OutboxIntegrationTest extends ReservationTestFixture {
    @Autowired OutboxPublisher outbox;
    @Autowired PlatformTransactionManager transactionManager;

    @Test void reservationCreateAndRepeatedCancelProduceOneEventPerActualTransition() {
        var reservation=service.create(user,tier,1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events WHERE aggregate_id=? AND event_type='reservation.created'",Long.class,reservation.id())).isEqualTo(1);
        assertThat(transactions.cancel(user,reservation.id())).isTrue();
        assertThat(transactions.cancel(user,reservation.id())).isFalse();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events WHERE aggregate_id=? AND event_type='reservation.cancelled'",Long.class,reservation.id())).isEqualTo(1);
    }

    @Test void publisherRequiresTransactionAndRowsRollbackWithTransaction() {
        assertThatThrownBy(() -> outbox.publish("order.created","order",UUID.randomUUID(),java.util.Map.of()))
            .isInstanceOf(org.springframework.transaction.IllegalTransactionStateException.class);
        UUID aggregate=UUID.randomUUID();
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            outbox.publish("order.created","order",aggregate,java.util.Map.of("orderId",aggregate));
            status.setRollbackOnly();
        });
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events WHERE aggregate_id=?",Long.class,aggregate)).isZero();
    }
}
