package com.vibe.ticketrush.queue.service;

import com.vibe.ticketrush.common.redis.*;
import com.vibe.ticketrush.common.service.ApiException;
import com.vibe.ticketrush.event.service.WaitingRoomEvents;
import com.vibe.ticketrush.inventory.service.InventoryRead;
import com.vibe.ticketrush.inventory.dto.TierDtos.Availability;
import com.fasterxml.jackson.databind.*;
import io.micrometer.core.instrument.MeterRegistry;
import java.security.SecureRandom;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
@EnableConfigurationProperties(QueueProperties.class)
public class WaitingRoomService implements ReservationAdmission {
    public record Status(String state,long position,long estimatedWaitSeconds,int pollIntervalSeconds,
                         boolean soldOut,String token,Instant expiresAt) {}
    private final StringRedisTemplate redis;
    private final RedisScript<String> script;
    private final RedisProperties keys;
    private final QueueProperties properties;
    private final WaitingRoomEvents events;
    private final InventoryRead inventory;
    private final RedisGuard guard;
    private final ObjectMapper json;
    private final Clock clock;
    private final MeterRegistry metrics;
    private final AtomicLong size=new AtomicLong();
    private final SecureRandom random=new SecureRandom();
    public WaitingRoomService(StringRedisTemplate redis,RedisScript<String> waitingRoomScript,RedisProperties keys,
            QueueProperties properties,WaitingRoomEvents events,InventoryRead inventory,RedisGuard guard,
            ObjectMapper json,Clock clock,MeterRegistry metrics) {
        this.redis=redis; this.script=waitingRoomScript; this.keys=keys; this.properties=properties; this.events=events;
        this.inventory=inventory; this.guard=guard; this.json=json; this.clock=clock; this.metrics=metrics;
        metrics.gauge("waiting_room_size",size);
        metrics.counter("waiting_room_admitted_total");
        io.micrometer.core.instrument.Timer.builder("waiting_room_wait_seconds").publishPercentileHistogram().register(metrics);
    }
    private String execute(WaitingRoomEvents.Settings event,String op,UUID user,boolean open,String... tokens) {
        List<String> names=List.of(keys.key("queue",event.id(),"waiting"),keys.key("queue",event.id(),"heartbeat"),
            keys.key("queue",event.id(),"sequence"),keys.key("queue",event.id(),"opened"),
            keys.key("queue",event.id(),"budget"),keys.key("queue",event.id(),"user")+":");
        List<String> args=new ArrayList<>(List.of(op,user.toString(),open ? "1":"0",event.mode(),Integer.toString(event.rate()),
            Long.toString(properties.interval().toMillis()),Long.toString(properties.heartbeatTtl().toMillis()),
            Long.toString(properties.tokenTtl().toMillis()),"604800000"));
        args.addAll(Arrays.asList(tokens));
        return guard.call("waiting-room",() -> redis.execute(script,names,args.toArray()),() -> {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"WAITING_ROOM_UNAVAILABLE","Waiting room temporarily unavailable; retry later");
        });
    }
    private JsonNode parse(String raw) {
        try { return json.readTree(raw); } catch (com.fasterxml.jackson.core.JsonProcessingException e) { throw new IllegalStateException(e); }
    }
    private WaitingRoomEvents.Settings settings(UUID id) {
        var event=events.settings(id);
        if (!event.published()) throw new ApiException(HttpStatus.NOT_FOUND,"EVENT_NOT_FOUND","Event not found");
        if (!event.enabled()) throw new ApiException(HttpStatus.CONFLICT,"WAITING_ROOM_DISABLED","Waiting room is disabled");
        return event;
    }
    private boolean open(WaitingRoomEvents.Settings e) { return !clock.instant().isBefore(e.saleStart()) && clock.instant().isBefore(e.saleEnd()); }
    private boolean soldOut(UUID event) { return inventory.publicTiers(event).stream().noneMatch(t -> t.availability()!=Availability.SOLD_OUT); }
    public Status status(UUID eventId,UUID user,boolean join) {
        var event=settings(eventId);
        var data=parse(execute(event,join ? "join":"status",user,open(event)));
        long position=data.path("position").asLong();
        return new Status(data.path("state").asText(),position,(long)Math.ceil((double)position/event.rate())*Math.max(1,properties.interval().toSeconds()),
            2,soldOut(eventId),data.path("token").isMissingNode() ? null:data.path("token").asText(),
            data.has("expiresAt") ? Instant.ofEpochMilli(data.path("expiresAt").asLong()):null);
    }
    public void leave(UUID event,UUID user) { execute(settings(event),"leave",user,false); }
    public void requireAdmission(UUID tier,UUID user,String token) {
        UUID eventId=inventory.eventId(tier);
        var event=events.settings(eventId);
        if (!event.enabled()) return;
        if (token==null || token.isBlank()) throw denied("WAITING_ROOM_REQUIRED");
        if (token.length()>128 || !"VALID".equals(execute(event,"validate",user,false,token))) throw denied("INVALID_ADMISSION_TOKEN");
    }
    private ApiException denied(String code) { return new ApiException(HttpStatus.FORBIDDEN,code,"Valid admission for this user and event required"); }
    public int admit(UUID id) {
        var event=settings(id);
        if (!open(event) || soldOut(id)) {
            // Liveness cleanup must continue even when no new admission is allowed.
            execute(event,"admit",new UUID(0,0),false);
            return 0;
        }
        String[] tokens=new String[event.rate()];
        for (int i=0;i<tokens.length;i++) { byte[] bytes=new byte[32];random.nextBytes(bytes);tokens[i]=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }
        var admitted=parse(execute(event,"admit",new UUID(0,0),true,tokens));
        for (var wait:admitted) io.micrometer.core.instrument.Timer.builder("waiting_room_wait_seconds").publishPercentileHistogram().register(metrics).record(Duration.ofMillis(wait.asLong()));
        metrics.counter("waiting_room_admitted_total").increment(admitted.size());
        if (!admitted.isEmpty()) org.slf4j.LoggerFactory.getLogger(getClass()).info("waiting_room_admit correlation_id={} event_id={} count={}",
            com.vibe.ticketrush.common.service.CorrelationId.current(),id,admitted.size());
        return admitted.size();
    }
    @Scheduled(fixedDelayString="${ticketrush.queue.interval:1s}",initialDelayString="${ticketrush.queue.initial-delay:1s}")
    public void scheduled() {
        long count=0;
        for (UUID event:events.enabledEvents()) {
            try {
                admit(event);
                Long value=guard.call("waiting-room",() -> redis.opsForZSet().zCard(keys.key("queue",event,"waiting")),() -> 0L);
                if (value!=null) count+=value;
            } catch (ApiException ex) { /* Retry next interval; no tokens are admitted locally. */ }
        }
        size.set(count);
    }
}
