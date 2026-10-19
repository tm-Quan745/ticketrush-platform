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
        return jdbc.query("SELECT * FROM tickets WHERE ticket_code = ?", (rs, n) -> {
            Timestamp used = rs.getTimestamp("used_at");
            return new Ticket(rs.getObject("id", UUID.class), rs.getObject("event_id", UUID.class),
                rs.getObject("tier_id", UUID.class), rs.getString("ticket_code"), rs.getString("status"),
                used == null ? null : used.toInstant());
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
