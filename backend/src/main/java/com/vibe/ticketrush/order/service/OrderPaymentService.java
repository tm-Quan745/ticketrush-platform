package com.vibe.ticketrush.order.service;

import com.vibe.ticketrush.order.repository.OrderRepository;
import com.vibe.ticketrush.order.domain.OrderStatus;
import com.vibe.ticketrush.reservation.domain.ReservationStatus;
import com.vibe.ticketrush.reservation.service.PurchaseReservation;
import com.vibe.ticketrush.payment.service.*;
import com.vibe.ticketrush.common.service.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.time.Clock;
import java.util.UUID;

/** Module boundary for webhook business changes; reservation lock always precedes order lock. */
@Service
@Transactional(propagation=Propagation.MANDATORY)
public class OrderPaymentService implements PaymentOrderOperations {
    private final OrderRepository orders;
    private final PurchaseReservation reservations;
    private final PaymentOperations payments;
    private final PaymentProperties properties;
    private final Clock clock;
    public OrderPaymentService(OrderRepository orders,PurchaseReservation reservations,PaymentOperations payments,PaymentProperties properties,Clock clock) {
        this.orders=orders; this.reservations=reservations; this.payments=payments; this.properties=properties; this.clock=clock;
    }
    public void lock(UUID id) { reservations.lock(orders.get(id).reservationId()); orders.lock(id); }
    public boolean matches(UUID id,long amount,String currency) { var o=orders.get(id); return o.total()==amount && o.currency().equals(currency); }
    public void mismatch(UUID id) {
        var order=orders.get(id); orders.review(id);
        if (order.status()==OrderStatus.PENDING_PAYMENT) failed(id);
    }
    public void succeeded(UUID id) {
        var order=orders.get(id);
        if (order.status()==OrderStatus.PAID || order.status()==OrderStatus.REFUND_PENDING || order.status()==OrderStatus.REFUNDED) return;
        var hold=reservations.lock(order.reservationId());
        boolean eligible=order.status()==OrderStatus.PENDING_PAYMENT || order.status()==OrderStatus.EXPIRED || order.status()==OrderStatus.CANCELLED;
        if (eligible && reservations.confirm(hold,clock.instant(),properties.lateGrace())) {
            // Lazy expiry may have transitioned the order synchronously.
            order=orders.get(id);
            orders.transition(id,order.status(),OrderStatus.PAID,clock.instant());
            orders.issue(id,clock.instant());
            // TODO Week 5: publish OrderPaid and TicketsIssued through the transactional outbox.
        } else {
            order=orders.get(id);
            if (order.status()!=OrderStatus.PENDING_PAYMENT && order.status()!=OrderStatus.EXPIRED && order.status()!=OrderStatus.CANCELLED)
                throw new ApiException(HttpStatus.CONFLICT,"UNEXPECTED_PAYMENT_STATE","Unexpected order state for successful payment");
            orders.transition(id,order.status(),OrderStatus.REFUND_PENDING,clock.instant());
            payments.refund(id);
        }
    }
    public void failed(UUID id) {
        var order=orders.get(id);
        if (order.status()!=OrderStatus.PENDING_PAYMENT) return;
        orders.transition(id,OrderStatus.PENDING_PAYMENT,OrderStatus.PAYMENT_FAILED,clock.instant());
        reservations.release(reservations.lock(order.reservationId()),ReservationStatus.CANCELLED,clock.instant());
        // TODO Week 5: publish PaymentFailed through the transactional outbox.
    }
    public void refunded(UUID id) {
        var order=orders.get(id);
        if (order.status()!=OrderStatus.REFUND_PENDING) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"UNEXPECTED_REFUND","Refund was not requested");
        var hold=reservations.lock(order.reservationId());
        orders.transition(id,OrderStatus.REFUND_PENDING,OrderStatus.REFUNDED,clock.instant());
        if (hold.status()==ReservationStatus.CONFIRMED) {
            reservations.refund(hold,clock.instant());
            orders.cancelTickets(id);
        }
        // TODO Week 5: publish OrderRefunded through the transactional outbox.
    }
}
