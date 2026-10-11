package com.vibe.ticketrush.inventory.service;

import com.vibe.ticketrush.common.redis.*;
import com.vibe.ticketrush.common.service.ApiException;
import com.vibe.ticketrush.inventory.repository.InventoryReconciliationRepository;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.scheduling.annotation.Scheduled;

@Service
public class RedisInventoryGate implements InventoryAdmission {
    private static final String TTL = "86400000";
    private static final org.slf4j.Logger LOG=org.slf4j.LoggerFactory.getLogger(RedisInventoryGate.class);
    private final StringRedisTemplate redis;
    private final RedisProperties properties;
    private final RedisGuard guard;
    private final RedisScript<String> gate, finish, sync;
    private final InventoryReconciliationRepository repository;
    private final MeterRegistry metrics;
    private final AtomicLong drift = new AtomicLong();
    private final boolean enabled;
    public RedisInventoryGate(StringRedisTemplate redis, RedisProperties properties, RedisGuard guard,
            RedisScript<String> inventoryGateScript, RedisScript<String> inventoryFinishScript,
            RedisScript<String> inventorySyncScript, InventoryReconciliationRepository repository, MeterRegistry metrics,
            com.vibe.ticketrush.reservation.service.ReservationProperties reservations) {
        this.redis=redis; this.properties=properties; this.guard=guard; this.gate=inventoryGateScript;
        this.finish=inventoryFinishScript; this.sync=inventorySyncScript; this.repository=repository; this.metrics=metrics;
        metrics.gauge("inventory_drift", drift);
        this.enabled="redis-gate".equals(reservations.strategy());
    }
    public String counter(UUID tier) { return properties.key("inventory", tier, "available"); }
    private List<String> keys(UUID tier, UUID attempt) {
        return List.of(counter(tier), properties.key("inventory",tier,"revision"),
            properties.key("inventory",tier,"pending"), properties.key("inventory",attempt,"attempt"),
            properties.key("inventory",tier,"generation"));
    }
    private List<String> syncKeys(UUID tier) {
        return List.of(counter(tier), properties.key("inventory",tier,"revision"),
            properties.key("inventory",tier,"pending"), properties.key("inventory",tier,"generation"),
            properties.key("inventory",tier,"warm-lock"));
    }
    public Attempt begin(UUID tier, int quantity) {
        if (quantity < 1) throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_QUANTITY","Quantity must be positive");
        UUID id=UUID.randomUUID();
        String result=guard.call("inventory", () -> redis.execute(gate, keys(tier,id), Integer.toString(quantity),id.toString(),TTL,Long.toString(properties.attemptLease().toMillis())), () -> {
            if (!properties.fallbackEnabled()) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"INVENTORY_UNAVAILABLE","Inventory gate unavailable");
            return "FALLBACK";
        });
        metrics.counter("reservation_gate_total","result", "INSUFFICIENT".equals(result) ? "sold_out" : result.toLowerCase(Locale.ROOT)).increment();
        LOG.debug("inventory_gate correlation_id={} tier_id={} result={}",com.vibe.ticketrush.common.service.CorrelationId.current(),tier,result);
        if ("INSUFFICIENT".equals(result)) throw InventoryErrors.soldOut();
        return new Attempt(tier,id,result);
    }
    public void complete(Attempt attempt, boolean committed) {
        if (attempt == null || "FALLBACK".equals(attempt.result())) return;
        guard.call("compensation", () -> {
            String result=redis.execute(finish,keys(attempt.tier(),attempt.id()),attempt.id().toString(),committed ? "1":"0",TTL);
            if ("REFUNDED".equals(result)) metrics.counter("redis_compensation_total").increment();
            return result;
        }, () -> "FALLBACK");
        if ("MISSING".equals(attempt.result())) warm(attempt.tier());
    }
    public void afterCommit(UUID tier, int delta) {
        if (!enabled) return;
        AfterCommit.run(() -> guard.call("inventory-sync", () -> command(tier,"delta",Integer.toString(delta),"0",""), () -> "FALLBACK"));
    }
    private String command(UUID tier,String op,String value,String revision,String generation) {
        return redis.execute(sync,syncKeys(tier),op,value,revision,generation,TTL);
    }
    public void warm(UUID tier) {
        guard.call("warm-up", () -> {
            String owner=UUID.randomUUID().toString();
            if (!"OK".equals(command(tier,"lock","0","0",owner))) return "BUSY";
            try {
                if (!Boolean.TRUE.equals(redis.hasKey(counter(tier)))) {
                    metrics.counter("inventory_warmup_total").increment();
                    return heal(tier).result();
                }
                return "PRESENT";
            } finally { command(tier,"unlock","0","0",owner); }
        }, () -> "FALLBACK");
    }
    private Drift heal(UUID tier) {
        String snapshot=command(tier,"snapshot","0","0","");
        if ("BUSY".equals(snapshot)) return new Drift(tier,null,0,"BUSY");
        String[] parts=snapshot.split(":");
        Long observed="MISSING".equals(parts[1]) ? null : Long.valueOf(parts[1]);
        Long expected=repository.expected(tier);
        if (expected == null) return new Drift(tier,observed,0,"REMOVED");
        String result=command(tier,"heal",Long.toString(expected),parts[0],UUID.randomUUID().toString());
        if (observed==null || observed.longValue()!=expected.longValue())
            LOG.info("inventory_reconcile correlation_id={} tier_id={} observed={} expected={} result={}",
                com.vibe.ticketrush.common.service.CorrelationId.current(),tier,observed,expected,result);
        return new Drift(tier,observed,expected,result);
    }
    public List<Drift> reconcile(UUID event) {
        return guard.call("reconcile", () -> {
            List<Drift> result=new ArrayList<>();
            for (UUID tier:repository.tierIds(event)) result.add(heal(tier));
            drift.set(result.stream().filter(d -> d.observed()!=null).mapToLong(d -> Math.abs(d.expected()-d.observed())).sum());
            return result;
        }, () -> { throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"REDIS_UNAVAILABLE","Reconciliation requires Redis"); });
    }
    @Scheduled(fixedDelayString="${ticketrush.redis.reconcile-interval:30s}", initialDelayString="${ticketrush.redis.reconcile-interval:30s}")
    public void scheduled() {
        if (!enabled) return;
        guard.call("reconcile", () -> {
            long total=0;
            for (UUID tier:repository.tierIds(null)) {
                Drift value=heal(tier);
                if (value.observed()!=null) total+=Math.abs(value.expected()-value.observed());
            }
            drift.set(total); return true;
        }, () -> false);
    }
}
