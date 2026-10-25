package com.vibe.ticketrush.inventory.dto;
import java.util.UUID;
public record InventoryViolation(UUID tierId, long available, long held, long confirmed, long total, long validTickets, String code, UUID entityId) {
    public InventoryViolation(UUID tierId,long available,long held,long confirmed,long total,long validTickets) {
        this(tierId,available,held,confirmed,total,validTickets,null,null);
    }
}
