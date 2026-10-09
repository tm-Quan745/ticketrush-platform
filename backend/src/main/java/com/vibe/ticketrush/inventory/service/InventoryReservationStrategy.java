package com.vibe.ticketrush.inventory.service;
import java.util.UUID;
/** Must join the reservation transaction. Optimistic conflicts require a fresh transaction. */
public interface InventoryReservationStrategy {
    void take(UUID tierId, int quantity);
}
