package com.vibe.ticketrush.inventory.service;
import com.vibe.ticketrush.inventory.repository.TicketTierRepository;
import com.vibe.ticketrush.event.service.EventAccess;
import com.vibe.ticketrush.common.service.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.time.Instant;
import java.util.UUID;
@Service
@Transactional(propagation = Propagation.MANDATORY)
public class ReservationInventoryService implements ReservationInventory {
    private final TicketTierRepository tiers;
    private final EventAccess events;
    public ReservationInventoryService(TicketTierRepository tiers, EventAccess events) { this.tiers=tiers; this.events=events; }
    public void validateSale(UUID id, int quantity, Instant now) {
        var tier=tiers.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,"TIER_NOT_FOUND","Ticket tier not found"));
        events.requireOnSale(tier.getEventId(), now);
        if (quantity < 1 || quantity > tier.getMaxPerOrder())
            throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_QUANTITY","Quantity exceeds tier limit");
    }
    public void restore(UUID id, int quantity, Instant now) {
        if (tiers.restore(id, quantity, now) != 1) throw new IllegalStateException("Missing inventory tier");
    }
}
