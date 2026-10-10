package com.vibe.ticketrush.reservation.service;

import com.vibe.ticketrush.reservation.domain.ReservationStatus;
import java.util.UUID;

/** Synchronous in-process event: listeners participate in the caller's transaction. */
public record ReservationChanged(UUID id, ReservationStatus status) {}
