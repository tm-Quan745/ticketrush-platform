package com.vibe.ticketrush.common.redis;

import io.micrometer.core.instrument.MeterRegistry;
import java.util.function.Supplier;
import org.springframework.stereotype.Component;
import org.springframework.boot.actuate.info.*;
import org.slf4j.*;

/** Local circuit breaker: fail fast while open, one half-open probe per process. */
@Component
public class RedisGuard implements InfoContributor {
    private static final Logger LOG = LoggerFactory.getLogger(RedisGuard.class);
    private final RedisProperties properties;
    private final MeterRegistry metrics;
    private long openUntil;
    private boolean probing;
    private long generation;
    private final String strategy;
    public RedisGuard(RedisProperties properties, MeterRegistry metrics,com.vibe.ticketrush.reservation.service.ReservationProperties reservations) {
        this.properties = properties; this.metrics = metrics;
        this.strategy=reservations.strategy();
        metrics.gauge("redis_gate_active", this, g -> !"redis-gate".equals(strategy) || g.isOpen() ? 0 : 1);
    }
    public synchronized boolean isOpen() { return openUntil != 0; }
    private synchronized Long permit() {
        if (openUntil == 0) return generation;
        if (System.nanoTime() < openUntil || probing) return null;
        probing = true; return generation;
    }
    public <T> T call(String feature, Supplier<T> operation, Supplier<T> fallback) {
        Long ticket=permit();
        if (ticket==null) return fallback(feature, fallback);
        try {
            T result = operation.get();
            success(ticket);
            return result;
        } catch (org.springframework.data.redis.RedisConnectionFailureException |
                 org.springframework.dao.QueryTimeoutException | org.springframework.data.redis.RedisSystemException ex) {
            synchronized (this) {
                if (ticket==generation) {
                    generation++;
                    openUntil = System.nanoTime() + properties.cooldown().toNanos(); probing = false;
                }
            }
            return fallback(feature, fallback);
        } catch (RuntimeException ex) {
            // A successful Redis probe followed by an application error must not strand HALF_OPEN.
            success(ticket); throw ex;
        }
    }
    private synchronized void success(long ticket) {
        if (ticket==generation) { openUntil=0; probing=false; }
    }
    private <T> T fallback(String feature, Supplier<T> fallback) {
        metrics.counter("redis_fallback_total", "feature", feature).increment();
        LOG.warn("redis_fallback feature={} correlation_id={}", feature, com.vibe.ticketrush.common.service.CorrelationId.current());
        return fallback.get();
    }
    public void contribute(Info.Builder builder) {
        builder.withDetail("redis", java.util.Map.of("mode", "redis-gate".equals(strategy) && isOpen() ? "fallback" : strategy));
    }
}
