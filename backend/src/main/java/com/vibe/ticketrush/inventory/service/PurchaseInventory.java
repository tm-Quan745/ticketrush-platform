package com.vibe.ticketrush.inventory.service;

import java.time.Instant;
import java.util.UUID;

public interface PurchaseInventory {
    record Price(UUID eventId,String name,long unitPrice,String currency) {}
    Price snapshot(UUID tierId);
    boolean reacquire(UUID tierId,int quantity,Instant now);
}
