package com.vibe.ticketrush.reservation.domain;
public enum ReservationStatus {
    HELD, CONFIRMED, EXPIRED, CANCELLED;
    public boolean canTransitionTo(ReservationStatus next) { return this == HELD && next != null && next != HELD; }
}
