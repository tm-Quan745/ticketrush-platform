package com.vibe.ticketrush.order.repository;

import com.vibe.ticketrush.order.dto.OrderDtos.*;
import com.vibe.ticketrush.order.domain.OrderStatus;
import com.vibe.ticketrush.common.service.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.sql.*;
import java.time.Instant;
import java.util.*;

@Repository
public class OrderRepository {
    private final JdbcTemplate jdbc;
    public OrderRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    public record Row(UUID id,UUID userId,UUID reservationId,OrderStatus status,long total,String currency,Instant deadline,boolean review) {}
    private Row row(ResultSet rs) throws SQLException {
        return new Row(rs.getObject("id",UUID.class),rs.getObject("user_id",UUID.class),rs.getObject("reservation_id",UUID.class),
            OrderStatus.valueOf(rs.getString("status")),rs.getLong("total_amount"),rs.getString("currency"),rs.getTimestamp("payment_deadline").toInstant(),rs.getBoolean("manual_review"));
    }
    public Row get(UUID id) {
        return jdbc.query("SELECT * FROM orders WHERE id=?",(rs,n) -> row(rs),id).stream().findFirst()
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,"ORDER_NOT_FOUND","Order not found"));
    }
    public Row getByReservation(UUID reservation) {
        return jdbc.query("SELECT * FROM orders WHERE reservation_id=?",(rs,n) -> row(rs),reservation).stream().findFirst().orElse(null);
    }
    public Row lock(UUID id) {
        return jdbc.query("SELECT * FROM orders WHERE id=? FOR UPDATE",(rs,n) -> row(rs),id).stream().findFirst().orElseThrow();
    }
    public boolean exists(UUID reservation) { return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM orders WHERE reservation_id=?)",Boolean.class,reservation)); }
    public void create(UUID id,UUID user,UUID reservation,long total,String currency,Instant deadline,Instant now,
            UUID tier,UUID event,String name,long price,int quantity) {
        jdbc.update("""
            INSERT INTO orders(id,user_id,reservation_id,status,total_amount,currency,payment_deadline,created_at,updated_at)
            VALUES (?,?,?,'PENDING_PAYMENT',?,?,?,?,?)
            """,id,user,reservation,total,currency,Timestamp.from(deadline),Timestamp.from(now),Timestamp.from(now));
        jdbc.update("INSERT INTO order_items(id,order_id,tier_id,event_id,tier_name,unit_price,quantity) VALUES (?,?,?,?,?,?,?)",
            UUID.randomUUID(),id,tier,event,name,price,quantity);
    }
    public void transition(UUID id,OrderStatus expected,OrderStatus next,Instant now) {
        if (jdbc.update("UPDATE orders SET status=?,updated_at=?,version=version+1 WHERE id=? AND status=?",next.name(),Timestamp.from(now),id,expected.name())!=1)
            throw new ApiException(HttpStatus.CONFLICT,"ORDER_TRANSITION_CONFLICT","Order state changed");
    }
    public boolean reservationReleased(UUID reservation,String next,Instant now) {
        return jdbc.update("UPDATE orders SET status=?,updated_at=?,version=version+1 WHERE reservation_id=? AND status='PENDING_PAYMENT'",next,Timestamp.from(now),reservation)==1;
    }
    public void review(UUID id) { jdbc.update("UPDATE orders SET manual_review=true WHERE id=?",id); }
    public View view(Row r,String reference) {
        var items=jdbc.query("SELECT * FROM order_items WHERE order_id=? ORDER BY id",(rs,n) ->
            new Item(rs.getObject("tier_id",UUID.class),rs.getString("tier_name"),rs.getLong("unit_price"),rs.getInt("quantity")),r.id());
        return new View(r.id(),r.userId(),r.reservationId(),r.status(),r.total(),r.currency(),r.deadline(),reference,r.review(),items);
    }
    public List<Row> list(UUID user,OrderStatus status,int page,int size) {
        return jdbc.query("""
            SELECT * FROM orders WHERE (?::uuid IS NULL OR user_id=?) AND (?::varchar IS NULL OR status=?)
            ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?
            """,(rs,n) -> row(rs),user,user,status==null?null:status.name(),status==null?null:status.name(),size,(long)page*size);
    }
    public long count(UUID user,OrderStatus status) {
        return jdbc.queryForObject("SELECT count(*) FROM orders WHERE (?::uuid IS NULL OR user_id=?) AND (?::varchar IS NULL OR status=?)",
            Long.class,user,user,status==null?null:status.name(),status==null?null:status.name());
    }
    public void issue(UUID order,Instant now) {
        jdbc.query("SELECT o.user_id,i.* FROM orders o JOIN order_items i ON i.order_id=o.id WHERE o.id=?",rs -> {
            for(int index=0;index<rs.getInt("quantity");index++) {
                // UUID v4 provides 122 random bits; two UUIDs provide >128 random bits.
                String code=UUID.randomUUID().toString().replace("-","")+UUID.randomUUID().toString().replace("-","");
                jdbc.update("""
                    INSERT INTO tickets(id,order_id,user_id,event_id,tier_id,ticket_index,ticket_code,status,issued_at)
                    VALUES (?,?,?,?,?,?,?,'VALID',?) ON CONFLICT(order_id,ticket_index) DO NOTHING
                    """,UUID.randomUUID(),order,rs.getObject("user_id"),rs.getObject("event_id"),rs.getObject("tier_id"),index,code,Timestamp.from(now));
            }
        },order);
    }
    public List<Ticket> tickets(UUID order) {
        return jdbc.query("SELECT * FROM tickets WHERE order_id=? ORDER BY ticket_index",(rs,n) ->
            new Ticket(rs.getObject("id",UUID.class),rs.getObject("event_id",UUID.class),rs.getObject("tier_id",UUID.class),
                rs.getString("ticket_code"),rs.getString("status"),rs.getTimestamp("issued_at").toInstant()),order);
    }
    public void cancelTickets(UUID order) { jdbc.update("UPDATE tickets SET status='CANCELLED' WHERE order_id=? AND status='VALID'",order); }
    public Map<UUID,Long> validTicketCounts(UUID event) {
        Map<UUID,Long> result=new HashMap<>();
        jdbc.query("SELECT tier_id,count(*) AS quantity FROM tickets WHERE event_id=? AND status='VALID' GROUP BY tier_id",
            (org.springframework.jdbc.core.RowCallbackHandler)rs -> result.put(rs.getObject("tier_id",UUID.class),rs.getLong("quantity")),event);
        return result;
    }
}
