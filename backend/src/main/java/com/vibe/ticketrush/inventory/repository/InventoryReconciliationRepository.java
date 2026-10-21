package com.vibe.ticketrush.inventory.repository;
import java.util.*;
import com.vibe.ticketrush.inventory.dto.InventoryViolation;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
@Repository
public class InventoryReconciliationRepository {
    private final JdbcTemplate jdbc;
    public InventoryReconciliationRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    public Long expected(UUID tier) {
        return jdbc.query("""
            SELECT t.total_quantity-COALESCE(SUM(r.quantity) FILTER (WHERE r.status IN ('HELD','CONFIRMED')),0) expected
            FROM ticket_tiers t LEFT JOIN reservations r ON r.tier_id=t.id WHERE t.id=? GROUP BY t.id
            """, rs -> rs.next() ? rs.getLong(1) : null,tier);
    }
    public List<UUID> tierIds(UUID event) {
        if (event == null) return jdbc.query("SELECT id FROM ticket_tiers WHERE inventory_mode='COUNTER' ORDER BY id",(rs,n) -> rs.getObject(1,UUID.class));
        return jdbc.query("SELECT id FROM ticket_tiers WHERE event_id=? AND inventory_mode='COUNTER' ORDER BY id",(rs,n) -> rs.getObject(1,UUID.class),event);
    }
    public List<InventoryViolation> violations(UUID eventId) {
        return jdbc.query("""
            SELECT t.id,t.available_quantity,t.total_quantity,
                COALESCE(SUM(r.quantity) FILTER (WHERE r.status='HELD'),0) held,
                COALESCE(SUM(r.quantity) FILTER (WHERE r.status='CONFIRMED'),0) confirmed
            FROM ticket_tiers t LEFT JOIN reservations r ON r.tier_id=t.id
            WHERE t.event_id=? AND t.inventory_mode='COUNTER' GROUP BY t.id
            ORDER BY t.id
            """, (rs,n) -> new InventoryViolation(rs.getObject("id",UUID.class),rs.getLong("available_quantity"),rs.getLong("held"),rs.getLong("confirmed"),rs.getLong("total_quantity"),0),eventId);
    }
}
