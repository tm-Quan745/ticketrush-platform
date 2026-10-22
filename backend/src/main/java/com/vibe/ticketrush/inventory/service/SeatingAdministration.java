package com.vibe.ticketrush.inventory.service;

import com.fasterxml.jackson.databind.*;
import com.vibe.ticketrush.common.service.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

@Service
@Transactional
public class SeatingAdministration implements VenueOperations {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    public SeatingAdministration(JdbcTemplate jdbc,ObjectMapper json) { this.jdbc=jdbc; this.json=json; }
    public record Mapping(@NotNull UUID sectionId,@NotNull UUID tierId) {}
    public record SectionMapping(@NotEmpty @Size(max=100) List<@Valid Mapping> mappings) {}
    public record SeatVersion(@NotNull UUID id,@NotNull @PositiveOrZero Long expectedVersion) {}
    public record Block(@NotEmpty @Size(max=500) List<@Valid SeatVersion> seats,@NotNull Boolean blocked,@NotBlank @Size(max=500) String reason) {}
    public record Venue(UUID id,String templateKey,int templateVersion,String name) {}
    public record Section(UUID id,String code,String name,String type,JsonNode geometry) {}
    public record VenueDetail(UUID id,String templateKey,int templateVersion,String name,JsonNode geometry,List<Section> sections) {}
    public List<Venue> venues() {
        return jdbc.query("SELECT * FROM venues ORDER BY template_key,template_version",(rs,n)->new Venue(rs.getObject("id",UUID.class),rs.getString("template_key"),rs.getInt("template_version"),rs.getString("name")));
    }
    public VenueDetail venue(UUID id) {
        var sections=jdbc.query("SELECT * FROM sections WHERE venue_id=? ORDER BY code",(rs,n)->new Section(rs.getObject("id",UUID.class),rs.getString("code"),rs.getString("name"),rs.getString("type"),parse(rs.getString("geometry"))),id);
        return jdbc.query("SELECT * FROM venues WHERE id=?",(rs,n)->new VenueDetail(id,rs.getString("template_key"),rs.getInt("template_version"),rs.getString("name"),parse(rs.getString("geometry")),sections),id)
            .stream().findFirst().orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"VENUE_NOT_FOUND","Venue not found"));
    }
    private JsonNode parse(String value) { try { return json.readTree(value); } catch (Exception e) { throw new IllegalStateException(e); } }
    public void clearMapping(UUID event) { jdbc.update("DELETE FROM event_tier_sections WHERE event_id=?",event); }
    public void requireVenue(UUID id) { if (id!=null) venue(id); }
    public void map(UUID event,SectionMapping request) {
        var state=jdbc.queryForList("SELECT venue_id,status FROM events WHERE id=? FOR UPDATE",event);
        if (state.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND,"EVENT_NOT_FOUND","Event not found");
        if (!"DRAFT".equals(state.getFirst().get("status"))) throw conflict("TOPOLOGY_FROZEN");
        UUID venue=(UUID)state.getFirst().get("venue_id");
        if (venue==null) throw SeatedInventory.invalid("VENUE_REQUIRED","Select a venue first");
        var sections=jdbc.queryForList("SELECT id FROM sections WHERE venue_id=?",UUID.class,venue);
        var mapped=request.mappings().stream().map(Mapping::sectionId).toList();
        if (new HashSet<>(mapped).size()!=mapped.size() || !new HashSet<>(mapped).equals(new HashSet<>(sections)))
            throw SeatedInventory.invalid("INVALID_SECTION_MAPPING","Map every venue section exactly once");
        for (var m:request.mappings()) {
            Boolean valid=jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM ticket_tiers t JOIN sections s ON s.id=? WHERE t.id=? AND t.event_id=? AND s.venue_id=?
                AND ((s.type='GA' AND t.inventory_mode='COUNTER') OR (s.type='SEATED' AND t.inventory_mode='SEATED')))
                """,Boolean.class,m.sectionId(),m.tierId(),event,venue);
            if (!Boolean.TRUE.equals(valid)) throw SeatedInventory.invalid("INVALID_SECTION_MAPPING","Tier event, venue or mode does not match section");
        }
        jdbc.update("DELETE FROM event_tier_sections WHERE event_id=?",event);
        for (var m:request.mappings()) jdbc.update("INSERT INTO event_tier_sections(event_id,section_id,tier_id) VALUES (?,?,?)",event,m.sectionId(),m.tierId());
    }
    /** Called while EventService owns the event publication lock, before status is changed. */
    public void publish(UUID event,UUID venue) {
        if (venue==null) {
            if (Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM ticket_tiers WHERE event_id=? AND inventory_mode='SEATED')",Boolean.class,event)))
                throw SeatedInventory.invalid("VENUE_REQUIRED","Seated tiers require a venue");
            return;
        }
        jdbc.queryForList("SELECT id FROM venues WHERE id=? FOR UPDATE",venue);
        int missing=jdbc.queryForObject("""
            SELECT count(*) FROM sections s LEFT JOIN event_tier_sections m ON m.section_id=s.id AND m.event_id=?
            LEFT JOIN ticket_tiers t ON t.id=m.tier_id WHERE s.venue_id=? AND (m.tier_id IS NULL OR t.event_id<>?
            OR (s.type='GA' AND t.inventory_mode<>'COUNTER') OR (s.type='SEATED' AND t.inventory_mode<>'SEATED'))
            """,Integer.class,event,venue,event);
        if (missing!=0) throw SeatedInventory.invalid("INVALID_SECTION_MAPPING","Complete a valid section mapping before publication");
        jdbc.update("""
            INSERT INTO event_seats(id,event_id,seat_id,section_id,tier_id,status)
            SELECT gen_random_uuid(),m.event_id,s.id,s.section_id,m.tier_id,'AVAILABLE'
            FROM event_tier_sections m JOIN seats s ON s.section_id=m.section_id WHERE m.event_id=?
            """,event);
    }
    public Map<String,Object> block(UUID event,Block request) {
        var ids=request.seats().stream().map(SeatVersion::id).toList();
        if (new HashSet<>(ids).size()!=ids.size()) throw SeatedInventory.invalid("INVALID_SEAT_IDS","Duplicate seat IDs");
        var locked=new NamedParameterJdbcTemplate(jdbc).queryForList("SELECT id,version,status FROM event_seats WHERE event_id=:event AND id IN (:ids) ORDER BY id FOR UPDATE SKIP LOCKED",Map.of("event",event,"ids",ids));
        if (locked.size()!=ids.size()) throw conflict("SEAT_STATE_CONFLICT");
        Map<UUID,Long> versions=new HashMap<>();
        request.seats().forEach(s->versions.put(s.id(),s.expectedVersion()));
        for (var seat:locked) if (!Objects.equals(seat.get("status"),request.blocked()?"AVAILABLE":"BLOCKED")
                || ((Number)seat.get("version")).longValue()!=versions.get(seat.get("id"))) throw conflict("SEAT_STATE_CONFLICT");
        for (var seat:locked) jdbc.update("UPDATE event_seats SET status=?,version=version+1 WHERE id=?",request.blocked()?"BLOCKED":"AVAILABLE",seat.get("id"));
        return Map.of("eventId",event,"updatedSeatIds",ids,"sections",sectionCounts(event));
    }
    public List<Map<String,Object>> sectionCounts(UUID event) {
        return jdbc.query("""
            SELECT section_id,count(*) AS physical,count(*) FILTER(WHERE status='AVAILABLE') AS available,
            count(*) FILTER(WHERE status='HELD') AS held,count(*) FILTER(WHERE status='SOLD') AS sold,
            count(*) FILTER(WHERE status='BLOCKED') AS blocked FROM event_seats WHERE event_id=? GROUP BY section_id
            """,(rs,n)->Map.of("sectionId",rs.getObject(1),"counts",Map.of("physical",rs.getLong(2),"available",rs.getLong(3),"held",rs.getLong(4),"sold",rs.getLong(5),"blocked",rs.getLong(6),"sellable",rs.getLong(2)-rs.getLong(6))),event);
    }
    private static ApiException conflict(String code) { return new ApiException(HttpStatus.CONFLICT,code,"Seating state changed or is immutable"); }
}
