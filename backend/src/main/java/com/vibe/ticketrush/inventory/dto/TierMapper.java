package com.vibe.ticketrush.inventory.dto;
import com.vibe.ticketrush.inventory.domain.TicketTier;
import com.vibe.ticketrush.inventory.dto.TierDtos.*;
public final class TierMapper {
    private TierMapper() {}
    public static PublicTier publicView(TicketTier t) {
        Availability availability = t.getAvailableQuantity() == 0 ? Availability.SOLD_OUT
                : (long) t.getAvailableQuantity() * 10 < t.getTotalQuantity() ? Availability.LOW : Availability.AVAILABLE;
        return new PublicTier(t.getId(), t.getName(), t.getDescription(), t.getPrice(),
                t.getCurrency(), t.getMaxPerOrder(), availability);
    }
    public static InventoryView inventory(TicketTier t) {
        return new InventoryView(t.getId(), t.getEventId(), t.getName(), t.getDescription(), t.getPrice(),
                t.getCurrency(), t.getTotalQuantity(), t.getAvailableQuantity(), t.getMaxPerOrder(),
                t.getVersion(), t.getCreatedAt(), t.getUpdatedAt());
    }
}
