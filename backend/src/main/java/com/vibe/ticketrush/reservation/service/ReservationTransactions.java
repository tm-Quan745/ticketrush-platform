package com.vibe.ticketrush.reservation.service;
import com.vibe.ticketrush.reservation.domain.*;
import com.vibe.ticketrush.reservation.repository.ReservationRepository;
import com.vibe.ticketrush.reservation.dto.ReservationDtos.*;
import com.vibe.ticketrush.inventory.service.*;
import com.vibe.ticketrush.common.service.ApiException;
import com.vibe.ticketrush.common.events.EventPayloads;
import com.vibe.ticketrush.outbox.service.OutboxPublisher;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.http.HttpStatus;
import org.springframework.data.domain.*;
import java.time.*;
import java.util.*;
@Service
@Transactional(propagation=Propagation.REQUIRES_NEW)
public class ReservationTransactions {
    private final ReservationRepository reservations;
    private final ReservationInventory inventory;
    private final InventoryReservationStrategy strategy;
    private final ReservationProperties properties;
    private final Clock clock;
    private final EntityManager em;
    private final org.springframework.context.ApplicationEventPublisher events;
    private final OutboxPublisher outbox;
    public ReservationTransactions(ReservationRepository reservations, ReservationInventory inventory,
            InventoryReservationStrategy strategy, ReservationProperties properties, Clock clock, EntityManager em,
            org.springframework.context.ApplicationEventPublisher events, OutboxPublisher outbox) {
        this.reservations=reservations; this.inventory=inventory; this.strategy=strategy;
        this.properties=properties; this.clock=clock; this.em=em; this.events=events; this.outbox=outbox;
    }
    private void lockTimeout() { em.createNativeQuery("SET LOCAL lock_timeout = '3s'").executeUpdate(); }
    public View create(UUID user, UUID tier, int quantity) {
        lockTimeout();
        Instant now=clock.instant();
        inventory.validateSale(tier,quantity,now);
        // Validation must not leave a stale managed tier for SELECT FOR UPDATE.
        em.clear();
        for (var old: reservations.expiredForUser(user,now)) expire(old,now);
        if (reservations.existsByUserIdAndTierIdAndStatus(user,tier,ReservationStatus.HELD)) throw duplicate();
        strategy.take(tier,quantity);
        Reservation r=new Reservation(); r.setId(UUID.randomUUID()); r.setUserId(user); r.setTierId(tier);
        r.setQuantity(quantity); r.setStatus(ReservationStatus.HELD); r.setExpiresAt(now.plus(properties.holdDuration()));
        r.setCreatedAt(now); r.setUpdatedAt(now);
        reservations.saveAndFlush(r);
        outbox.publish("reservation.created","reservation",r.getId(),new EventPayloads.Reservation(r.getId(),r.getUserId()));
        return view(r,now);
    }
    public View get(UUID user, UUID id) {
        lockTimeout();
        Reservation r=owned(user,id);
        Instant now=clock.instant(); expire(r,now);
        return view(r,now);
    }
    public Listing mine(UUID user, ReservationStatus status, int page, int size) {
        if (page<0 || size<1 || size>100) throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_PAGE","page >= 0 and size 1..100 required");
        lockTimeout(); Instant now=clock.instant();
        for (var r:reservations.expiredForUser(user,now)) expire(r,now);
        var result=reservations.mine(user,status,PageRequest.of(page,size,Sort.by("createdAt","id").descending()));
        return new Listing(result.map(r -> view(r,now)).getContent(),page,size,result.getTotalElements(),result.getTotalPages());
    }
    public boolean cancel(UUID user, UUID id) {
        lockTimeout(); Reservation r=owned(user,id); Instant now=clock.instant();
        if (expire(r,now)) return false;
        if (r.getStatus()!=ReservationStatus.HELD) return false;
        return release(r,ReservationStatus.CANCELLED,now);
    }
    /** No public endpoint; Week 4 payment flow will call this method. */
    public boolean confirm(UUID id) {
        lockTimeout(); Reservation r=locked(id); Instant now=clock.instant();
        if (expire(r,now) || !r.getStatus().canTransitionTo(ReservationStatus.CONFIRMED)) return false;
        return reservations.transition(id,"CONFIRMED",now)==1;
    }
    public int expireBatch() {
        lockTimeout(); Instant now=clock.instant(); int changed=0;
        for (var r:reservations.expiredBatch(now,properties.batchSize())) if (expire(r,now)) changed++;
        return changed;
    }
    private boolean expire(Reservation r, Instant now) {
        return r.getStatus()==ReservationStatus.HELD && r.getExpiresAt().isBefore(now)
            && release(r,ReservationStatus.EXPIRED,now);
    }
    private boolean release(Reservation r, ReservationStatus next, Instant now) {
        if (!r.getStatus().canTransitionTo(next)) return false;
        if (reservations.transition(r.getId(),next.name(),now)!=1) return false;
        inventory.restore(r.getTierId(),r.getQuantity(),now);
        outbox.publish(next==ReservationStatus.EXPIRED ? "reservation.expired" : "reservation.cancelled","reservation",r.getId(),new EventPayloads.Reservation(r.getId(),r.getUserId()));
        events.publishEvent(new ReservationChanged(r.getId(),next));
        r.setStatus(next); return true;
    }
    private Reservation locked(UUID id) {
        return reservations.lock(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,"RESERVATION_NOT_FOUND","Reservation not found"));
    }
    private Reservation owned(UUID user, UUID id) {
        Reservation r=locked(id);
        if (!r.getUserId().equals(user)) throw new ApiException(HttpStatus.FORBIDDEN,"FORBIDDEN","Reservation belongs to another user");
        return r;
    }
    private View view(Reservation r, Instant now) {
        long seconds=r.getStatus()==ReservationStatus.HELD ? Math.max(0,Duration.between(now,r.getExpiresAt()).getSeconds()) : 0;
        return new View(r.getId(),r.getStatus(),r.getQuantity(),r.getExpiresAt(),seconds);
    }
    public static ApiException duplicate() { return new ApiException(HttpStatus.CONFLICT,"ALREADY_HELD","User already holds this tier"); }
}
