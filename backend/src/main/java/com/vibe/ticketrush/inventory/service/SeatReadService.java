package com.vibe.ticketrush.inventory.service;

import com.fasterxml.jackson.databind.*;
import com.vibe.ticketrush.common.service.ApiException;
import com.vibe.ticketrush.event.service.EventService;
import com.vibe.ticketrush.inventory.dto.TierDtos.PublicTier;
import com.vibe.ticketrush.queue.service.ReservationAdmission;
import jakarta.validation.constraints.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import java.time.*;
import java.util.*;

@Service
public class SeatReadService {
    public record Seat(UUID id,String rowLabel,int rowRank,int number,int adjacencySegment,double x,double y,
                       boolean accessible,String status,boolean mine,long version) {
        Seat owned(boolean value) {return new Seat(id,rowLabel,rowRank,number,adjacencySegment,x,y,accessible,value ? "HELD":status,value,version);}
    }
    public record Counts(int physicalCapacity,int sellableCapacity,int available,int held,int sold,int blocked) {}
    public record SectionSeats(UUID eventId,UUID sectionId,UUID tierId,Counts counts,Instant observedAt,List<Seat> seats) {}
    public record SuggestRequest(@NotNull UUID sectionId,@Min(1) @Max(100) int quantity,boolean accessible) {}
    public record Suggestion(UUID eventId,UUID sectionId,UUID tierId,List<UUID> seatIds,List<SeatedInventory.Assignment> seats,Instant observedAt) {}
    private record Section(UUID tier,String code,String name,int limit) {}
    private final JdbcTemplate jdbc;
    private final SeatReadCache cache;
    private final EventService events;
    private final InventoryRead inventory;
    private final ReservationAdmission admission;
    private final ObjectMapper json;
    private final Clock clock;
    public SeatReadService(JdbcTemplate jdbc,SeatReadCache cache,EventService events,InventoryRead inventory,ReservationAdmission admission,ObjectMapper json,Clock clock) {
        this.jdbc=jdbc;this.cache=cache;this.events=events;this.inventory=inventory;this.admission=admission;this.json=json;this.clock=clock;
    }
    private Section section(UUID event,UUID section) {
        events.publicDetail(event);
        var rows=jdbc.query("""
            SELECT t.id,s.code,s.name,t.max_per_order,s.type FROM event_tier_sections m
            JOIN sections s ON s.id=m.section_id JOIN ticket_tiers t ON t.id=m.tier_id
            WHERE m.event_id=? AND m.section_id=?
            """,(rs,n)->{
                if (!"SEATED".equals(rs.getString(5))) throw SeatedInventory.invalid("SECTION_NOT_SEATED","Choose a reserved section");
                return new Section(rs.getObject(1,UUID.class),rs.getString(2),rs.getString(3),rs.getInt(4));
            },event,section);
        if(rows.isEmpty())throw new ApiException(HttpStatus.NOT_FOUND,"SECTION_NOT_FOUND","Section not found");
        return rows.getFirst();
    }
    private List<Seat> rows(UUID event,UUID section) {
        return jdbc.query("""
            SELECT es.id,s.row_label,s.row_rank,s.number,s.adjacency_segment,s.x,s.y,s.accessible,es.status,es.version
            FROM event_seats es JOIN seats s ON s.id=es.seat_id
            WHERE es.event_id=? AND es.section_id=? ORDER BY s.row_rank,s.row_label,s.number,es.id
            """,(r,n)->new Seat(r.getObject(1,UUID.class),r.getString(2),r.getInt(3),r.getInt(4),r.getInt(5),r.getDouble(6),r.getDouble(7),r.getBoolean(8),r.getString(9),false,r.getLong(10)),event,section);
    }
    private Counts counts(List<Seat> seats) {
        int a=0,h=0,s=0,b=0;for(Seat seat:seats)switch(seat.status()){case "AVAILABLE"->a++;case "HELD"->h++;case "SOLD"->s++;case "BLOCKED"->b++;default->throw new IllegalStateException("Invalid seat state");}
        return new Counts(seats.size(),seats.size()-b,a,h,s,b);
    }
    public record StaticSeat(UUID id,String rowLabel,int number,double x,double y,boolean accessible,int adjacencySegment) {}
    public record Geometry(UUID eventId,UUID sectionId,UUID tierId,List<StaticSeat> seats) {}
    public record Wire(String body,String etag) {}
    public record Status(String geometryVersion,String states) {}
    private final Map<String,Wire> geometries=Collections.synchronizedMap(new LinkedHashMap<>(256,0.75f,true) {
        @Override protected boolean removeEldestEntry(Map.Entry<String,Wire> entry){return size()>256;}
    });
    private Wire wire(Object body) {
        try {String encoded=json.writeValueAsString(body);return new Wire(encoded,"\""+com.vibe.ticketrush.auth.service.TokenService.hash(encoded)+"\"");}
        catch (com.fasterxml.jackson.core.JsonProcessingException ex) {throw new IllegalStateException(ex);}
    }
    private Wire geometry(UUID event,UUID section,UUID tier,List<Seat> seats) {
        return wire(new Geometry(event,section,tier,seats.stream().map(s->new StaticSeat(s.id(),s.rowLabel(),s.number(),s.x(),s.y(),s.accessible(),s.adjacencySegment())).toList()));
    }
    public Wire geometry(UUID event,UUID section,String version) {
        String key=event+":"+section+":"+version;
        Wire cached=geometries.get(key);if(cached!=null)return cached;
        return cache.database(()->{
            var mapping=section(event,section);var result=geometry(event,section,mapping.tier(),rows(event,section));
            if(!result.etag().equals("\""+version+"\""))throw new ApiException(HttpStatus.NOT_FOUND,"GEOMETRY_NOT_FOUND","Unknown geometry version");
            geometries.put(key,result);return result;
        });
    }
    public Wire seats(UUID event,UUID section,UUID ignoredUser) {
        return cache.get(event,section,Wire.class,()->{
            var mapping=section(event,section);var seats=rows(event,section);
            var geometry=geometry(event,section,mapping.tier(),seats);
            String version=geometry.etag().substring(1,geometry.etag().length()-1);
            StringBuilder states=new StringBuilder(seats.size());
            for(var seat:seats)states.append(switch(seat.status()){case "AVAILABLE"->'A';case "HELD"->'H';case "SOLD"->'S';case "BLOCKED"->'B';default->throw new IllegalStateException("Unknown status");});
            return wire(new Status(version,states.toString()));
        });
    }
    @org.springframework.transaction.event.TransactionalEventListener(phase=org.springframework.transaction.event.TransactionPhase.AFTER_COMMIT)
    public void published(SeatReadPublication publication) {
        // A new transaction sees committed publication; Redis is advisory and cannot undo it.
        for(UUID section:jdbc.queryForList("SELECT DISTINCT section_id FROM event_seats WHERE event_id=?",UUID.class,publication.eventId())) {
            try {seats(publication.eventId(),section,null);}catch(RuntimeException ex) {
                org.slf4j.LoggerFactory.getLogger(getClass()).warn("Seat snapshot prewarm failed for section {}",section);
            }
        }
    }
    public Suggestion suggest(UUID event,UUID user,SuggestRequest request,String token) {
        return cache.database(()->{
            var section=section(event,request.sectionId());
            if(request.quantity()>section.limit())throw SeatedInventory.invalid("INVALID_QUANTITY","Quantity exceeds tier limit");
            admission.requireAdmission(section.tier(),user,token);
            var all=rows(event,request.sectionId());
            List<List<Seat>> runs=new ArrayList<>();
            for(int i=0;i+request.quantity()<=all.size();i++) {
                var run=all.subList(i,i+request.quantity());var first=run.getFirst();boolean valid=true;
                for(int j=0;j<run.size();j++) {
                    var s=run.get(j);
                    if(!"AVAILABLE".equals(s.status()) || !s.rowLabel().equals(first.rowLabel()) || s.adjacencySegment()!=first.adjacencySegment()
                        || s.number()!=first.number()+j || (!request.accessible() && s.accessible())) {valid=false;break;}
                }
                if(valid && (!request.accessible() || run.stream().anyMatch(Seat::accessible)))runs.add(run);
            }
            Comparator<List<Seat>> score=Comparator.comparingInt((List<Seat> run)->run.getFirst().rowRank())
                .thenComparingDouble(run->{
                    var row=all.stream().filter(s->s.rowLabel().equals(run.getFirst().rowLabel())).mapToInt(Seat::number).summaryStatistics();
                    return Math.abs((run.getFirst().number()+run.getLast().number())/2.0-(row.getMin()+row.getMax())/2.0);
                }).thenComparingInt(run->run.getFirst().number()).thenComparing(run->run.getFirst().id());
            var best=runs.stream().min(score).orElseThrow(()->new ApiException(HttpStatus.CONFLICT,"NO_ADJACENT_SEATS","No adjacent seats match; choose another section or quantity"));
            return new Suggestion(event,request.sectionId(),section.tier(),best.stream().map(Seat::id).toList(),best.stream().map(s->new SeatedInventory.Assignment(s.id(),request.sectionId(),section.code(),section.name(),s.rowLabel(),s.number(),s.accessible())).toList(),clock.instant());
        });
    }
    public Map<String,Object> seatmap(UUID event) {
        return cache.database(()->{
            var detail=events.publicDetail(event);
            if(detail.venueId()==null)throw new ApiException(HttpStatus.NOT_FOUND,"SEATMAP_NOT_CONFIGURED","No venue configured");
            var venue=jdbc.queryForMap("SELECT id,template_key,template_version,name,geometry::text FROM venues WHERE id=?",detail.venueId());
            var geometry=parse((String)venue.get("geometry"));
            List<Double> viewBox=List.of(0d,0d,safeNumber(geometry.path("width"),640),safeNumber(geometry.path("height"),520));
            var tiers=inventory.publicTiers(event);Map<UUID,PublicTier> byId=new HashMap<>();tiers.forEach(t->byId.put(t.id(),t));
            var sections=jdbc.query("""
                SELECT s.id,s.code,s.name,s.type,s.geometry::text,m.tier_id FROM event_tier_sections m
                JOIN sections s ON s.id=m.section_id WHERE m.event_id=? ORDER BY s.code
                """,(r,n)->{
                    UUID id=r.getObject(1,UUID.class);var tier=byId.get(r.getObject(6,UUID.class));boolean seated="SEATED".equals(r.getString(4));
                    var seats=seated?rows(event,id):List.<Seat>of();var counts=counts(seats);
                    Map<String,Object> result=new LinkedHashMap<>();result.put("id",id);result.put("code",r.getString(2));result.put("name",r.getString(3));result.put("type",r.getString(4));
                    result.put("tierId",tier.id());result.put("price",tier.price());result.put("currency",tier.currency());
                    result.put("geometry",safeGeometry(parse(r.getString(5)),viewBox));
                    result.put("availability",seated?(counts.available()==0?"SOLD_OUT":counts.available()*10<counts.sellableCapacity()?"LOW":"AVAILABLE"):tier.availability());
                    result.put("geometryVersion",seated?geometry(event,id,tier.id(),seats).etag().replace("\"",""):null);
                    result.put("counts",seated?counts:null);result.put("seatCount",seats.size());result.put("rowCount",seats.stream().map(Seat::rowLabel).distinct().count());return result;
                },event);
            return Map.of("eventId",event,"venue",Map.of("id",detail.venueId(),"templateKey",venue.get("template_key"),"templateVersion",venue.get("template_version"),"name",venue.get("name"),"viewBox",viewBox),"sections",sections,"tiers",tiers,"observedAt",clock.instant());
        });
    }
    private JsonNode parse(String value){try{return json.readTree(value);}catch(Exception ex){throw new IllegalStateException(ex);}}
    private double safeNumber(JsonNode node,double fallback){double v=node.asDouble(fallback);return Double.isFinite(v)&&Math.abs(v)<=10000?v:fallback;}
    private Map<String,Object> safeGeometry(JsonNode geometry,List<Double> viewBox) {
        List<Map<String,Double>> polygon=new ArrayList<>();
        if(geometry.path("polygon").isArray() && geometry.path("polygon").size()<=32)for(var point:geometry.path("polygon")) {
            if(point.isArray()&&point.size()==2)polygon.add(Map.of("x",safeNumber(point.get(0),0),"y",safeNumber(point.get(1),0)));
        }
        String color=geometry.path("color").asText("");if(!color.matches("#[0-9a-fA-F]{6}"))color="#64748b";
        return Map.of("viewBox",viewBox,"polygon",polygon,"color",color);
    }
}
