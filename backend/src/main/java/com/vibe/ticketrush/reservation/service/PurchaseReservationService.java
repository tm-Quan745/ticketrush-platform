package com.vibe.ticketrush.reservation.service;

import com.vibe.ticketrush.reservation.repository.ReservationRepository;
import com.vibe.ticketrush.reservation.domain.ReservationStatus;
import com.vibe.ticketrush.inventory.service.*;
import com.vibe.ticketrush.common.service.ApiException;
import com.vibe.ticketrush.common.events.EventPayloads;
import com.vibe.ticketrush.outbox.service.OutboxPublisher;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.time.*;
import java.util.*;

@Service
@Transactional(propagation=Propagation.MANDATORY)
public class PurchaseReservationService implements PurchaseReservation {
    private final ReservationRepository reservations;
    private final ReservationInventory inventory;
    private final PurchaseInventory purchaseInventory;
    private final ApplicationEventPublisher events;
    private final ReservationTransactions transactions;
    private final OutboxPublisher outbox;
    public PurchaseReservationService(ReservationRepository reservations, ReservationInventory inventory,
            PurchaseInventory purchaseInventory, ApplicationEventPublisher events,ReservationTransactions transactions,OutboxPublisher outbox) {
        this.reservations=reservations; this.inventory=inventory; this.purchaseInventory=purchaseInventory; this.events=events;
        this.transactions=transactions; this.outbox=outbox;
    }
    public void expireOwned(UUID user,UUID id) { transactions.get(user,id); }
    public Hold lock(UUID id) {
        var r=reservations.lock(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,"RESERVATION_NOT_FOUND","Reservation not found"));
        return new Hold(r.getId(),r.getUserId(),r.getTierId(),r.getQuantity(),r.getStatus(),r.getExpiresAt());
    }
    public void release(Hold hold,ReservationStatus next,Instant now) {
        if (reservations.transition(hold.id(),next.name(),now)==1) {
            inventory.restore(hold.tierId(),hold.quantity(),now);
            outbox.publish(next==ReservationStatus.EXPIRED ? "reservation.expired" : "reservation.cancelled","reservation",hold.id(),new EventPayloads.Reservation(hold.id(),hold.userId()));
            events.publishEvent(new ReservationChanged(hold.id(),next));
        }
    }
    public boolean confirm(Hold hold,Instant now,Duration grace) {
        if (hold.status()==ReservationStatus.HELD && !hold.expiresAt().isBefore(now))
            return reservations.transition(hold.id(),"CONFIRMED",now)==1;
        if (hold.status()==ReservationStatus.HELD) release(hold,ReservationStatus.EXPIRED,now);
        if (now.isAfter(hold.expiresAt().plus(grace))) return false;
        if (!purchaseInventory.reacquire(hold.tierId(),hold.quantity(),now)) return false;
        if (reservations.confirmReleased(hold.id(),now)!=1) throw new IllegalStateException("Reservation changed under lock");
        return true;
    }
    public void refund(Hold hold,Instant now) {
        if (reservations.cancelConfirmed(hold.id(),now)!=1) throw new IllegalStateException("Confirmed reservation required");
        inventory.restore(hold.tierId(),hold.quantity(),now);
        outbox.publish("reservation.cancelled","reservation",hold.id(),new EventPayloads.Reservation(hold.id(),hold.userId()));
    }
}
