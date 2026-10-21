package com.vibe.ticketrush.inventory.service;

import com.vibe.ticketrush.common.service.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

/** Event-seat rows are the sole inventory authority for SEATED tiers. */
@Service
public class SeatedInventory implements SeatingOperations {
    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate named;
    public SeatedInventory(JdbcTemplate jdbc) { this.jdbc=jdbc; this.named=new NamedParameterJdbcTemplate(jdbc); }
    public boolean isSeated(UUID tier) {
        return jdbc.query("SELECT inventory_mode FROM ticket_tiers WHERE id=?",(rs,n)->rs.getString(1),tier)
            .stream().anyMatch("SEATED"::equals);
    }
    public UUID tierFor(List<UUID> ids) {
        validateIds(ids);
        var tiers=named.query("SELECT DISTINCT tier_id FROM event_seats WHERE id IN (:ids)",Map.of("ids",ids),(rs,n)->rs.getObject(1,UUID.class));
        if (tiers.isEmpty()) throw new SeatsUnavailable(ids);
        if (tiers.size()!=1) throw invalid("MIXED_TIERS","Select seats from exactly one tier");
        if (!isSeated(tiers.getFirst())) throw invalid("WRONG_INVENTORY_MODE","Seat IDs require a SEATED tier");
        return tiers.getFirst();
    }
    public static void validateIds(List<UUID> ids) {
        if (ids==null || ids.isEmpty() || ids.size()>100 || ids.stream().anyMatch(Objects::isNull) || new HashSet<>(ids).size()!=ids.size())
            throw invalid("INVALID_SEAT_IDS","Provide 1..100 distinct event-scoped seat IDs");
    }
    @Transactional(propagation=Propagation.MANDATORY)
    public void tryUserTierLock(UUID user,UUID tier) {
        jdbc.execute("SET LOCAL lock_timeout='100ms'");
        jdbc.execute("SET LOCAL statement_timeout='5s'");
        boolean locked=Boolean.TRUE.equals(jdbc.queryForObject("SELECT pg_try_advisory_xact_lock(hashtextextended(?,0))",Boolean.class,"seat-hold:"+user+":"+tier));
        if (!locked) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"INVENTORY_BUSY","Another hold is in progress; retry later");
    }
    @Transactional(propagation=Propagation.MANDATORY)
    public void hold(UUID reservation,UUID tier,List<UUID> ids,Instant expiresAt) {
        var locked=available(ids,tier);
        if (locked.size()!=ids.size()) throw new SeatsUnavailable(ids.stream().filter(id->!locked.contains(id)).toList());
        for (UUID id:locked) {
            jdbc.update("INSERT INTO reservation_seats(reservation_id,event_seat_id) VALUES (?,?)",reservation,id);
            jdbc.update("UPDATE event_seats SET status='HELD',reservation_id=?,expires_at=?,version=version+1 WHERE id=?",
                reservation,Timestamp.from(expiresAt),id);
        }
    }
    private List<UUID> available(List<UUID> ids,UUID tier) {
        return named.query("SELECT id FROM event_seats WHERE id IN (:ids) AND tier_id=:tier AND status='AVAILABLE' ORDER BY id FOR UPDATE SKIP LOCKED",
            Map.of("ids",ids,"tier",tier),(rs,n)->rs.getObject(1,UUID.class));
    }
    private List<UUID> history(UUID reservation) {
        return jdbc.query("SELECT event_seat_id FROM reservation_seats WHERE reservation_id=? ORDER BY event_seat_id",(rs,n)->rs.getObject(1,UUID.class),reservation);
    }
    @Transactional(propagation=Propagation.MANDATORY)
    public void release(UUID reservation,boolean refund) {
        lockClaim(reservation);
        jdbc.update("UPDATE event_seats SET status='AVAILABLE',reservation_id=NULL,expires_at=NULL,version=version+1 WHERE reservation_id=? AND status=?",
            reservation,refund?"SOLD":"HELD");
    }
    @Transactional(propagation=Propagation.MANDATORY)
    public void sellHeld(UUID reservation,int quantity) {
        lockClaim(reservation);
        int changed=jdbc.update("UPDATE event_seats SET status='SOLD',expires_at=NULL,version=version+1 WHERE reservation_id=? AND status='HELD'",reservation);
        if (changed!=quantity) throw new IllegalStateException("Incomplete seat claim");
    }
    @Transactional(propagation=Propagation.MANDATORY)
    public boolean reacquire(UUID reservation,UUID tier,int quantity) {
        var ids=history(reservation);
        if (ids.size()!=quantity) throw new IllegalStateException("Incomplete seat history");
        var locked=available(ids,tier);
        if (locked.size()!=quantity) return false;
        for (UUID id:locked) jdbc.update("UPDATE event_seats SET status='SOLD',reservation_id=?,expires_at=NULL,version=version+1 WHERE id=?",reservation,id);
        return true;
    }
    private void lockClaim(UUID reservation) {
        jdbc.query("SELECT id FROM event_seats WHERE reservation_id=? ORDER BY id FOR UPDATE",(rs,n)->rs.getObject(1),reservation);
    }
    public record Assignment(UUID id,UUID sectionId,String sectionCode,String sectionName,String rowLabel,int number,boolean accessible) {}
    public List<Assignment> assignments(UUID reservation) {
        return jdbc.query("""
            SELECT es.id,s.section_id,sec.code,sec.name,s.row_label,s.number,s.accessible
            FROM reservation_seats rs JOIN event_seats es ON es.id=rs.event_seat_id
            JOIN seats s ON s.id=es.seat_id JOIN sections sec ON sec.id=s.section_id
            WHERE rs.reservation_id=? ORDER BY es.id
            """,(rs,n)->new Assignment(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getString(3),rs.getString(4),rs.getString(5),rs.getInt(6),rs.getBoolean(7)),reservation);
    }
    public record TicketSeat(UUID physicalSeatId,String snapshot) {}
    public List<TicketSeat> ticketSeats(UUID reservation) {
        return jdbc.query("""
            SELECT s.id,jsonb_build_object('section',sec.name,'row',s.row_label,'number',s.number,'sectionId',sec.id,'sectionCode',sec.code,'accessible',s.accessible)::text AS snapshot
            FROM event_seats es JOIN seats s ON s.id=es.seat_id JOIN sections sec ON sec.id=s.section_id
            WHERE es.reservation_id=? AND es.status='SOLD' ORDER BY es.id
            """,(rs,n)->new TicketSeat(rs.getObject(1,UUID.class),rs.getString(2)),reservation);
    }
    public record Counts(int physical,int available,int held,int sold,int blocked) {}
    public List<Map<String,Object>> sectionCounts(UUID tier) {
        return jdbc.query("""
            SELECT section_id,count(*),count(*) FILTER(WHERE status='AVAILABLE'),count(*) FILTER(WHERE status='HELD'),
            count(*) FILTER(WHERE status='SOLD'),count(*) FILTER(WHERE status='BLOCKED') FROM event_seats WHERE tier_id=? GROUP BY section_id
            """,(rs,n)->Map.of("sectionId",rs.getObject(1),"counts",Map.of("physical",rs.getLong(2),"available",rs.getLong(3),"held",rs.getLong(4),"sold",rs.getLong(5),"blocked",rs.getLong(6),"sellable",rs.getLong(2)-rs.getLong(6))),tier);
    }
    public Counts counts(UUID tier) {
        return jdbc.queryForObject("""
            SELECT count(*),count(*) FILTER(WHERE status='AVAILABLE'),count(*) FILTER(WHERE status='HELD'),
                count(*) FILTER(WHERE status='SOLD'),count(*) FILTER(WHERE status='BLOCKED') FROM event_seats WHERE tier_id=?
            """,(rs,n)->new Counts(rs.getInt(1),rs.getInt(2),rs.getInt(3),rs.getInt(4),rs.getInt(5)),tier);
    }
    public static ApiException invalid(String code,String message) { return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,code,message); }
    public static class SeatsUnavailable extends ApiException {
        private final List<UUID> ids;
        public SeatsUnavailable(List<UUID> ids) { super(HttpStatus.CONFLICT,"SEATS_UNAVAILABLE","Some selected seats are unavailable; choose again"); this.ids=List.copyOf(ids); }
        public List<UUID> unavailableSeatIds() { return ids; }
    }
}
