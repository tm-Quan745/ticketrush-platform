package com.vibe.ticketrush.payment.repository;

import com.vibe.ticketrush.payment.domain.*;
import com.vibe.ticketrush.payment.dto.PaymentEvent;
import com.vibe.ticketrush.common.service.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.sql.*;
import java.time.Instant;
import java.util.*;

@Repository
public class PaymentRepository {
    private final JdbcTemplate jdbc;
    public PaymentRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    public record Row(UUID id,UUID orderId,String reference,long amount,String currency,PaymentStatus status,PaymentScenario scenario) {}
    private Row row(ResultSet rs) throws SQLException {
        return new Row(rs.getObject("id",UUID.class),rs.getObject("order_id",UUID.class),rs.getString("provider_payment_id"),
            rs.getLong("amount"),rs.getString("currency"),PaymentStatus.valueOf(rs.getString("status")),PaymentScenario.valueOf(rs.getString("scenario")));
    }
    public void create(UUID order,String reference,long amount,String currency,PaymentScenario scenario,Instant now) {
        jdbc.update("""
            INSERT INTO payments(id,order_id,provider,provider_payment_id,amount,currency,status,scenario,next_dispatch_at,created_at,updated_at)
            VALUES (?,?,'MOCK',?,?,?,'INITIATED',?,?,?,?)
            """,UUID.randomUUID(),order,reference,amount,currency,scenario.name(),Timestamp.from(now.plusSeconds(60)),Timestamp.from(now),Timestamp.from(now));
    }
    public Row byReference(String reference) {
        return jdbc.query("SELECT * FROM payments WHERE provider_payment_id=?",(rs,n) -> row(rs),reference).stream().findFirst()
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,"PAYMENT_NOT_FOUND","Unknown payment reference"));
    }
    public Row byOrder(UUID order) { return jdbc.queryForObject("SELECT * FROM payments WHERE order_id=?",(rs,n) -> row(rs),order); }
    public boolean event(Row payment,PaymentEvent event,String payload,Instant now) {
        return jdbc.update("""
            INSERT INTO payment_events(id,provider_event_id,payment_id,type,payload,received_at)
            VALUES (?,?,?,?,?,?) ON CONFLICT(provider_event_id) DO NOTHING
            """,UUID.randomUUID(),event.providerEventId(),payment.id(),event.type().name(),payload,Timestamp.from(now))==1;
    }
    public void markReview(String event) { jdbc.update("UPDATE payment_events SET review_required=true WHERE provider_event_id=?",event); }
    public boolean transition(UUID id,PaymentStatus expected,PaymentStatus next,Instant now) {
        return jdbc.update("UPDATE payments SET status=?,updated_at=? WHERE id=? AND status=?",next.name(),Timestamp.from(now),id,expected.name())==1;
    }
    public List<Row> due(Instant now) {
        var rows=jdbc.query("""
            SELECT p.* FROM payments p JOIN orders o ON o.id=p.order_id
            WHERE ((p.status='INITIATED') OR (p.status='SUCCEEDED' AND o.status='REFUND_PENDING'))
            AND p.next_dispatch_at<=? ORDER BY p.next_dispatch_at LIMIT 50 FOR UPDATE OF p SKIP LOCKED
            """,(rs,n) -> row(rs),Timestamp.from(now));
        for (var row:rows) jdbc.update("UPDATE payments SET next_dispatch_at=? WHERE id=?",Timestamp.from(now.plusSeconds(60)),row.id());
        return rows;
    }
}
