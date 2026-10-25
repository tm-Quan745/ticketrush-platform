package com.vibe.ticketrush.order.repository;

import com.vibe.ticketrush.order.dto.GateDtos.Ticket;
import com.vibe.ticketrush.common.service.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

@Repository
public class GateRepository {
    private final JdbcTemplate jdbc;
    public GateRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public Ticket find(String code) {
        return jdbc.query("""
            SELECT t.*,e.title,e.venue_name,i.tier_name,es.id AS event_seat_id,
            t.seat_snapshot->>'section' AS section_label,t.seat_snapshot->>'row' AS row_label,
            t.seat_snapshot->>'number' AS seat_number,t.seat_snapshot->>'sectionId' AS section_id,
            t.seat_snapshot->>'sectionCode' AS section_code,t.seat_snapshot->>'accessible' AS accessible
            FROM tickets t JOIN events e ON e.id=t.event_id
            JOIN order_items i ON i.order_id=t.order_id AND i.tier_id=t.tier_id
            LEFT JOIN event_seats es ON es.event_id=t.event_id AND es.seat_id=t.seat_id
            WHERE t.ticket_code = ?
            """, (rs, n) -> {
            Timestamp used = rs.getTimestamp("used_at");
            return new Ticket(rs.getObject("id", UUID.class), rs.getObject("event_id", UUID.class),
                rs.getObject("tier_id", UUID.class), rs.getString("ticket_code"), rs.getString("status"),
                used == null ? null : used.toInstant(),rs.getString("title"),rs.getString("venue_name"),rs.getString("tier_name"),
                rs.getObject("seat_id")==null ? null : new com.vibe.ticketrush.inventory.service.SeatedInventory.Assignment(
                    rs.getObject("event_seat_id",UUID.class),UUID.fromString(rs.getString("section_id")),rs.getString("section_code"),
                    rs.getString("section_label"),rs.getString("row_label"),rs.getInt("seat_number"),rs.getBoolean("accessible")));
        }, code).stream().findFirst().orElseThrow(() -> new ApiException(
            HttpStatus.NOT_FOUND, "TICKET_NOT_FOUND", "Ticket not found"));
    }

    public String lockOrder(String code) {
        return jdbc.query("""
            SELECT o.status FROM orders o JOIN tickets t ON t.order_id = o.id
            WHERE t.ticket_code = ? FOR UPDATE OF o
            """, (rs, n) -> rs.getString(1), code).stream().findFirst().orElseThrow(() ->
                new ApiException(HttpStatus.NOT_FOUND, "TICKET_NOT_FOUND", "Ticket not found"));
    }

    public boolean use(String code, UUID staff, Instant now) {
        return jdbc.update("""
            UPDATE tickets SET status = 'USED', used_at = ?, used_by = ?
            WHERE ticket_code = ? AND status = 'VALID'
            """, Timestamp.from(now), staff, code) == 1;
    }
}
