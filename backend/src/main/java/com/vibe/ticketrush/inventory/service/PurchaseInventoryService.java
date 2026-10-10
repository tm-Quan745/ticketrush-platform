package com.vibe.ticketrush.inventory.service;

import com.vibe.ticketrush.inventory.repository.TicketTierRepository;
import com.vibe.ticketrush.common.service.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.time.*;
import java.util.UUID;

@Service
@Transactional(propagation=Propagation.MANDATORY)
public class PurchaseInventoryService implements PurchaseInventory {
    private final TicketTierRepository tiers;
    public PurchaseInventoryService(TicketTierRepository tiers) { this.tiers=tiers; }
    public Price snapshot(UUID tierId) {
        var tier=tiers.findById(tierId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,"TIER_NOT_FOUND","Tier not found"));
        return new Price(tier.getEventId(),tier.getName(),tier.getPrice(),tier.getCurrency());
    }
    public boolean reacquire(UUID tierId,int quantity,Instant now) { return tiers.take(tierId,quantity,now)==1; }
}
