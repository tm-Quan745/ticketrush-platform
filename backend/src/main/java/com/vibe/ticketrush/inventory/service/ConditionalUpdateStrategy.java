package com.vibe.ticketrush.inventory.service;
import com.vibe.ticketrush.inventory.repository.TicketTierRepository;
import java.time.Clock;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.transaction.annotation.*;
import static com.vibe.ticketrush.inventory.service.InventoryErrors.soldOut;
@Service
@ConditionalOnProperty(name="ticketrush.reservation.strategy", havingValue="conditional-update", matchIfMissing=true)
@Transactional(propagation=Propagation.MANDATORY)
public class ConditionalUpdateStrategy implements InventoryReservationStrategy {
    private final TicketTierRepository tiers;
    private final Clock clock;
    public ConditionalUpdateStrategy(TicketTierRepository tiers, Clock clock) { this.tiers=tiers; this.clock=clock; }
    public void take(UUID id, int quantity) {
        if (quantity < 1) throw new IllegalArgumentException("quantity must be positive");
        if (tiers.take(id, quantity, clock.instant()) != 1) throw soldOut();
    }
}
