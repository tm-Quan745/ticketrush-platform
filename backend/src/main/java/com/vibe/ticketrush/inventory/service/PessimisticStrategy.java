package com.vibe.ticketrush.inventory.service;
import com.vibe.ticketrush.inventory.repository.TicketTierRepository;
import java.time.Clock;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.transaction.annotation.*;
import static com.vibe.ticketrush.inventory.service.InventoryErrors.soldOut;
@Service
@ConditionalOnProperty(name="ticketrush.reservation.strategy", havingValue="pessimistic", matchIfMissing=false)
@Transactional(propagation=Propagation.MANDATORY)
public class PessimisticStrategy implements InventoryReservationStrategy {
    private final TicketTierRepository tiers;
    private final Clock clock;
    public PessimisticStrategy(TicketTierRepository tiers, Clock clock) { this.tiers=tiers; this.clock=clock; }
    public void take(UUID id, int quantity) {
        if (quantity < 1) throw new IllegalArgumentException("quantity must be positive");
        var tier=tiers.lockForReservation(id).orElseThrow(InventoryErrors::soldOut);
        if (tier.getAvailableQuantity() < quantity) throw soldOut();
        tier.setAvailableQuantity(tier.getAvailableQuantity()-quantity);
        tier.setUpdatedAt(clock.instant());
        tiers.saveAndFlush(tier);
    }
}
