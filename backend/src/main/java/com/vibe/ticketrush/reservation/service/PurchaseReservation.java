package com.vibe.ticketrush.reservation.service;

import com.vibe.ticketrush.reservation.domain.ReservationStatus;
import java.time.*;
import java.util.UUID;

public interface PurchaseReservation {
    record Hold(UUID id,UUID userId,UUID tierId,int quantity,ReservationStatus status,Instant expiresAt) {}
    void expireOwned(UUID user,UUID id);
    Hold lock(UUID id);
    void release(Hold hold,ReservationStatus next,Instant now);
    boolean confirm(Hold hold,Instant now,Duration grace);
    void refund(Hold hold,Instant now);
}
