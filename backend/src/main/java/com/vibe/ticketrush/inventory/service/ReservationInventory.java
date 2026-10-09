package com.vibe.ticketrush.inventory.service;
import java.time.Instant;
import java.util.UUID;
/** Module boundary for reservation inventory operations. */
public interface ReservationInventory {
    void validateSale(UUID tierId, int quantity, Instant now);
    void restore(UUID tierId, int quantity, Instant now);
}
