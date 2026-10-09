package com.vibe.ticketrush.inventory.repository;
import com.vibe.ticketrush.inventory.domain.TicketTier;
import org.springframework.data.jpa.repository.*;
import java.util.*;
public interface TicketTierRepository extends JpaRepository<TicketTier, UUID> {
    List<TicketTier> findByEventIdOrderByNameAsc(UUID eventId);
    @Query("select t.eventId from TicketTier t where t.id = :id")
    Optional<UUID> findEventId(UUID id);
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = """
            UPDATE ticket_tiers SET name = :name, description = :description, price = :price,
                currency = :currency, max_per_order = :maxPerOrder,
                available_quantity = available_quantity + (:total - total_quantity),
                total_quantity = :total, version = version + 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = :id AND :total >= total_quantity - available_quantity
            """, nativeQuery = true)
    int updateCapacity(UUID id, String name, String description, long price, String currency, int maxPerOrder, int total);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value="UPDATE ticket_tiers SET available_quantity=available_quantity-:quantity, version=version+1, updated_at=:now WHERE id=:id AND available_quantity>=:quantity", nativeQuery=true)
    int take(UUID id, int quantity, java.time.Instant now);
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value="UPDATE ticket_tiers SET available_quantity=available_quantity+:quantity, version=version+1, updated_at=:now WHERE id=:id", nativeQuery=true)
    int restore(UUID id, int quantity, java.time.Instant now);
    @Query(value="SELECT * FROM ticket_tiers WHERE id=:id FOR UPDATE", nativeQuery=true)
    Optional<TicketTier> lockForReservation(UUID id);
}
