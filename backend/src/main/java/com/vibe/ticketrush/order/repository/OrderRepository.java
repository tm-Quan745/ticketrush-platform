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
    public record OwnedView(UUID userId,View view) {}
    private Row row(ResultSet rs) throws SQLException {
        return new Row(rs.getObject("id",UUID.class),rs.getObject("user_id",UUID.class),rs.getObject("reservation_id",UUID.class),
            OrderStatus.valueOf(rs.getString("status")),rs.getLong("total_amount"),rs.getString("currency"),rs.getTimestamp("payment_deadline").toInstant(),rs.getBoolean("manual_review"));
    }
    public Row get(UUID id) {
        return jdbc.query("SELECT * FROM orders WHERE id=?",(rs,n) -> row(rs),id).stream().findFirst()
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,"ORDER_NOT_FOUND","Order not found"));
    }
    public OwnedView getView(UUID id) {
        return jdbc.query("""
            SELECT o.id AS order_id,o.user_id,o.reservation_id,o.status,o.total_amount,o.currency,o.payment_deadline,o.manual_review,
                   p.provider_payment_id,i.tier_id,i.tier_name,i.unit_price,i.quantity
            FROM orders o
            JOIN payments p ON p.order_id=o.id
            JOIN order_items i ON i.order_id=o.id
            WHERE o.id=? ORDER BY i.id
            """,rs -> {
                if (!rs.next()) throw new ApiException(HttpStatus.NOT_FOUND,"ORDER_NOT_FOUND","Order not found");
                UUID order=rs.getObject("order_id",UUID.class);
                UUID user=rs.getObject("user_id",UUID.class);
                UUID reservation=rs.getObject("reservation_id",UUID.class);
                OrderStatus status=OrderStatus.valueOf(rs.getString("status"));
                long total=rs.getLong("total_amount");
                String currency=rs.getString("currency");
                Instant deadline=rs.getTimestamp("payment_deadline").toInstant();
                String reference=rs.getString("provider_payment_id");
                boolean review=rs.getBoolean("manual_review");
                List<Item> items=new ArrayList<>();
                do {
                    items.add(new Item(rs.getObject("tier_id",UUID.class),rs.getString("tier_name"),rs.getLong("unit_price"),rs.getInt("quantity")));
                } while (rs.next());
                return new OwnedView(user,new View(order,user,reservation,status,total,currency,deadline,reference,review,items));
            },id);
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
    public boolean hasUsedTickets(UUID order) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM tickets WHERE order_id=? AND status='USED')",Boolean.class,order));
    }
    public void issue(UUID order,Instant now,java.util.List<com.vibe.ticketrush.inventory.service.SeatedInventory.TicketSeat> seats) {
        jdbc.query("SELECT o.user_id,i.* FROM orders o JOIN order_items i ON i.order_id=o.id WHERE o.id=?",rs -> {
            for(int index=0;index<rs.getInt("quantity");index++) {
                // UUID v4 provides 122 random bits; two UUIDs provide >128 random bits.
                String code=UUID.randomUUID().toString().replace("-","")+UUID.randomUUID().toString().replace("-","");
                jdbc.update("""
                    INSERT INTO tickets(id,order_id,user_id,event_id,tier_id,ticket_index,ticket_code,status,issued_at,seat_id,seat_snapshot)
                    VALUES (?,?,?,?,?,?,?,'VALID',?,?,?::jsonb) ON CONFLICT(order_id,ticket_index) DO NOTHING
                    """,UUID.randomUUID(),order,rs.getObject("user_id"),rs.getObject("event_id"),rs.getObject("tier_id"),index,code,Timestamp.from(now),seats.isEmpty()?null:seats.get(index).physicalSeatId(),seats.isEmpty()?null:seats.get(index).snapshot());
            }
        },order);
    }
    public List<Ticket> tickets(UUID order) {
        return jdbc.query("""
            SELECT t.*,es.id AS event_seat_id,e.title,e.venue_name,i.tier_name,
                t.seat_snapshot->>'section' AS section_label,t.seat_snapshot->>'row' AS row_label,
                t.seat_snapshot->>'number' AS seat_number,t.seat_snapshot->>'sectionId' AS section_id,
                t.seat_snapshot->>'sectionCode' AS section_code,t.seat_snapshot->>'accessible' AS accessible
            FROM tickets t JOIN events e ON e.id=t.event_id JOIN order_items i ON i.order_id=t.order_id AND i.tier_id=t.tier_id
            LEFT JOIN event_seats es ON es.event_id=t.event_id AND es.seat_id=t.seat_id
            WHERE t.order_id=? ORDER BY t.ticket_index
            """,(rs,n) -> {
                var assignment=rs.getObject("seat_id")==null ? null : new com.vibe.ticketrush.inventory.service.SeatedInventory.Assignment(
                    rs.getObject("event_seat_id",UUID.class),UUID.fromString(rs.getString("section_id")),rs.getString("section_code"),rs.getString("section_label"),rs.getString("row_label"),rs.getInt("seat_number"),rs.getBoolean("accessible"));
                Timestamp used=rs.getTimestamp("used_at");
                return new Ticket(rs.getObject("id",UUID.class),rs.getObject("event_id",UUID.class),rs.getObject("tier_id",UUID.class),
                    rs.getString("ticket_code"),rs.getString("status"),rs.getTimestamp("issued_at").toInstant(),rs.getObject("order_id",UUID.class),
                    rs.getString("title"),rs.getString("venue_name"),rs.getString("tier_name"),assignment,used==null?null:used.toInstant());
            },order);
    }

    public void cancelTickets(UUID order) { jdbc.update("UPDATE tickets SET status='CANCELLED' WHERE order_id=? AND status='VALID'",order); }
    public Map<UUID,Long> validTicketCounts(UUID event) {
        Map<UUID,Long> result=new HashMap<>();
        jdbc.query("SELECT tier_id,count(*) AS quantity FROM tickets WHERE event_id=? AND status IN ('VALID','USED') GROUP BY tier_id",
            (org.springframework.jdbc.core.RowCallbackHandler)rs -> result.put(rs.getObject("tier_id",UUID.class),rs.getLong("quantity")),event);
        return result;
    }
}
