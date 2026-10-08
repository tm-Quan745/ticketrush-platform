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
}
