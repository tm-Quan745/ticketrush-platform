package com.vibe.ticketrush.inventory.service;

import com.vibe.ticketrush.inventory.repository.TicketTierRepository;
import org.springframework.stereotype.Service;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.transaction.annotation.*;
import java.time.Clock;
import java.util.UUID;

/** Admission runs outside the transaction in ReservationService; this is the authority. */
@Service
@ConditionalOnProperty(name="ticketrush.reservation.strategy", havingValue="redis-gate")
@Transactional(propagation=Propagation.MANDATORY)
public class RedisGateStrategy implements InventoryReservationStrategy {
    private final TicketTierRepository tiers;
    private final Clock clock;
    public RedisGateStrategy(TicketTierRepository tiers, Clock clock) { this.tiers=tiers; this.clock=clock; }
    public void take(UUID tier, int quantity) {
        if (quantity < 1) throw new IllegalArgumentException("quantity must be positive");
        if (tiers.take(tier,quantity,clock.instant()) != 1) throw InventoryErrors.soldOut();
    }
}
