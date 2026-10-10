package com.vibe.ticketrush.order.service;

import com.vibe.ticketrush.order.domain.OrderStatus;
import com.vibe.ticketrush.order.dto.OrderDtos.*;
import com.vibe.ticketrush.order.repository.OrderRepository;
import com.vibe.ticketrush.reservation.domain.ReservationStatus;
import com.vibe.ticketrush.reservation.service.*;
import com.vibe.ticketrush.inventory.service.PurchaseInventory;
import com.vibe.ticketrush.payment.domain.PaymentScenario;
import com.vibe.ticketrush.payment.service.PaymentOperations;
import com.vibe.ticketrush.common.service.*;
import com.vibe.ticketrush.common.events.EventPayloads;
import com.vibe.ticketrush.outbox.service.OutboxPublisher;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.time.*;
import java.util.*;

@Service
public class OrderService {
    private final OrderRepository orders;
    private final PurchaseReservation reservations;
    private final PurchaseInventory inventory;
    private final PaymentOperations payments;
    private final IdempotencyService idempotency;
    private final ObjectMapper json;
    private final Clock clock;
    private final OutboxPublisher outbox;
    public OrderService(OrderRepository orders,PurchaseReservation reservations,
            PurchaseInventory inventory,PaymentOperations payments,IdempotencyService idempotency,ObjectMapper json,Clock clock,OutboxPublisher outbox) {
        this.orders=orders; this.reservations=reservations;
        this.inventory=inventory; this.payments=payments; this.idempotency=idempotency; this.json=json; this.clock=clock; this.outbox=outbox;
    }
    public IdempotencyService.StoredResponse create(UUID user,UUID reservation,UUID key,PaymentScenario scenario) {
        return idempotency.execute(user,"POST /api/v1/orders",key,reservation+":"+scenario,() -> {
            // Lazy expiry must commit even when an expired reservation is rejected below.
            reservations.expireOwned(user,reservation);
            var hold=reservations.lock(reservation);
            if (!hold.userId().equals(user)) throw forbidden();
            if (orders.exists(reservation)) throw conflict("RESERVATION_ALREADY_ORDERED");
            if (hold.status()!=ReservationStatus.HELD || hold.expiresAt().isBefore(clock.instant())) throw conflict("RESERVATION_NOT_HELD");
            var price=inventory.snapshot(hold.tierId());
            long total=Math.multiplyExact(price.unitPrice(),hold.quantity());
            UUID id=UUID.randomUUID();
            orders.create(id,user,reservation,total,price.currency(),hold.expiresAt(),clock.instant(),
                hold.tierId(),price.eventId(),price.name(),price.unitPrice(),hold.quantity());
            outbox.publish("order.created","order",id,new EventPayloads.Order(id,user));
            String reference=payments.initiate(id,total,price.currency(),scenario);
            try { return new IdempotencyService.StoredResponse(201,json.writeValueAsString(orders.view(orders.get(id),reference)),false); }
            catch (JsonProcessingException e) { throw new IllegalStateException(e); }
        });
    }
    @Transactional(readOnly=true)
    public View get(UUID user,UUID id) { return view(owned(user,id)); }
    @Transactional(readOnly=true)
    public Listing list(UUID user,OrderStatus status,int page,int size) {
        if (page<0 || size<1 || size>100) throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_PAGE","page >= 0 and size 1..100 required");
        long count=orders.count(user,status);
        return new Listing(orders.list(user,status,page,size).stream().map(this::view).toList(),page,size,count,(count+size-1)/size);
    }
    @Transactional
    public View cancel(UUID user,UUID id) {
        var initial=owned(user,id);
        var hold=reservations.lock(initial.reservationId());
        var order=orders.lock(id);
        if (order.status()!=OrderStatus.PENDING_PAYMENT || payments.succeeded(id)) throw conflict("ORDER_NOT_CANCELLABLE");
        orders.transition(id,OrderStatus.PENDING_PAYMENT,OrderStatus.CANCELLED,clock.instant());
        reservations.release(hold,ReservationStatus.CANCELLED,clock.instant());
        outbox.publish("order.cancelled","order",id,new EventPayloads.Order(id,initial.userId()));
        return view(orders.get(id));
    }
    @Transactional(readOnly=true)
    public List<Ticket> tickets(UUID user,UUID id) {
        if (owned(user,id).status()!=OrderStatus.PAID) throw conflict("ORDER_NOT_PAID");
        return orders.tickets(id);
    }
    @Transactional
    public View refund(UUID id) {
        var initial=orders.get(id);
        reservations.lock(initial.reservationId());
        var order=orders.lock(id);
        if (order.status()!=OrderStatus.PAID) throw conflict("ORDER_NOT_REFUNDABLE");
        orders.transition(id,OrderStatus.PAID,OrderStatus.REFUND_PENDING,clock.instant());
        payments.refund(id);
        outbox.publish("order.refund_requested","order",id,new EventPayloads.Order(id,initial.userId()));
        return view(orders.get(id));
    }
    @EventListener
    public void reservationChanged(ReservationChanged event) {
        if (event.status()==ReservationStatus.EXPIRED || event.status()==ReservationStatus.CANCELLED) {
            var order=orders.getByReservation(event.id());
            if (order!=null && orders.reservationReleased(event.id(),event.status().name(),clock.instant()))
                outbox.publish(event.status()==ReservationStatus.EXPIRED ? "order.expired" : "order.cancelled","order",order.id(),new EventPayloads.Order(order.id(),order.userId()));
        }
    }
    private OrderRepository.Row owned(UUID user,UUID id) {
        var order=orders.get(id);
        if (!order.userId().equals(user)) throw forbidden();
        return order;
    }
    private View view(OrderRepository.Row row) { return orders.view(row,payments.reference(row.id())); }
    private static ApiException forbidden() { return new ApiException(HttpStatus.FORBIDDEN,"FORBIDDEN","Order or reservation belongs to another user"); }
    private static ApiException conflict(String code) { return new ApiException(HttpStatus.CONFLICT,code,"Invalid order or reservation state"); }
}
