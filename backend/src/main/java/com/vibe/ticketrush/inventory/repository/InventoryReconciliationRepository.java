package com.vibe.ticketrush.inventory.repository;
import java.util.*;
import com.vibe.ticketrush.inventory.dto.InventoryViolation;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
@Repository
public class InventoryReconciliationRepository {
    private final JdbcTemplate jdbc;
    public InventoryReconciliationRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    public List<InventoryViolation> violations(UUID eventId) {
        return jdbc.query("""
            SELECT t.id,t.available_quantity,t.total_quantity,
                COALESCE(SUM(r.quantity) FILTER (WHERE r.status='HELD'),0) held,
                COALESCE(SUM(r.quantity) FILTER (WHERE r.status='CONFIRMED'),0) confirmed
            FROM ticket_tiers t LEFT JOIN reservations r ON r.tier_id=t.id
            WHERE t.event_id=? GROUP BY t.id
            HAVING t.available_quantity + COALESCE(SUM(r.quantity) FILTER (WHERE r.status IN ('HELD','CONFIRMED')),0) <> t.total_quantity
            ORDER BY t.id
            """, (rs,n) -> new InventoryViolation(rs.getObject("id",UUID.class),rs.getLong("available_quantity"),rs.getLong("held"),rs.getLong("confirmed"),rs.getLong("total_quantity")),eventId);
    }
}
