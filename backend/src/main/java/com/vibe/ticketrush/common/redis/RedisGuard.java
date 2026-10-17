package com.vibe.ticketrush.common.redis;

import io.micrometer.core.instrument.MeterRegistry;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.actuate.info.Info;
import org.springframework.boot.actuate.info.InfoContributor;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.RedisSystemException;
import org.springframework.stereotype.Component;

/** Process-local, count-based circuit breaker for Redis. */
@Component
public class RedisGuard implements InfoContributor {
    private static final Logger LOG = LoggerFactory.getLogger(RedisGuard.class);
    private enum State { CLOSED, OPEN, HALF_OPEN }
    private record Permit(long generation, boolean halfOpen) { }

    private final RedisProperties properties;
    private final MeterRegistry metrics;
    private final String strategy;
    private final Deque<Boolean> outcomes = new ArrayDeque<>();
    private State state = State.CLOSED;
    private long openUntil;
    private long generation;
    private int halfOpenPermits;
    private int halfOpenSuccesses;

    public RedisGuard(RedisProperties properties, MeterRegistry metrics,
                      com.vibe.ticketrush.reservation.service.ReservationProperties reservations) {
        this.properties = properties;
        this.metrics = metrics;
        this.strategy = reservations.strategy();
        metrics.gauge("redis_gate_active", this, g -> !"redis-gate".equals(strategy) || g.isOpen() ? 0 : 1);
        metrics.gauge("redis_circuit_open", this, g -> g.isOpen() ? 1 : 0);
    }

    public synchronized boolean isOpen() { return state != State.CLOSED; }

    private synchronized Permit permit() {
        if (state == State.CLOSED) return new Permit(generation, false);
        if (state == State.OPEN) {
            if (System.nanoTime() < openUntil) return null;
            state = State.HALF_OPEN;
            halfOpenPermits = properties.breakerHalfOpenProbes();
            halfOpenSuccesses = 0;
            transition("half_open", "cooldown_elapsed", 0, 0);
        }
        if (halfOpenPermits == 0) return null;
        halfOpenPermits--;
        return new Permit(generation, true);
    }

    public <T> T call(String feature, Supplier<T> operation, Supplier<T> fallback) {
        metrics.counter("redis_guard_calls_total", "feature", feature).increment();
        Permit permit = permit();
        if (permit == null) return fallback(feature, "circuit_open", fallback);
        try {
            T result = operation.get();
            success(permit);
            return result;
        } catch (RedisConnectionFailureException | QueryTimeoutException | RedisSystemException ex) {
            metrics.counter("redis_guard_failures_total", "feature", feature, "reason", ex.getClass().getSimpleName()).increment();
            failure(permit, ex.getClass().getSimpleName());
            return fallback(feature, ex.getClass().getSimpleName(), fallback);
        } catch (RuntimeException ex) {
            // An application exception after a successful Redis command cannot strand HALF_OPEN.
            success(permit);
            throw ex;
        }
    }

    private synchronized void success(Permit permit) {
        if (permit.generation() != generation) return;
        if (permit.halfOpen()) {
            halfOpenSuccesses++;
            if (halfOpenSuccesses == properties.breakerHalfOpenProbes()) {
                state = State.CLOSED;
                outcomes.clear();
                transition("closed", "half_open_success", 0, 0);
            }
            return;
        }
        record(false);
    }

    private synchronized void failure(Permit permit, String reason) {
        if (permit.generation() != generation) return;
        if (permit.halfOpen()) {
            open(reason, 1, 1);
            return;
        }
        record(true);
        int failures = (int) outcomes.stream().filter(Boolean::booleanValue).count();
        if (outcomes.size() >= properties.breakerMinimumCalls()
                && ((double) failures / outcomes.size()) >= properties.breakerFailureRateThreshold()) {
            open(reason, outcomes.size(), failures);
        }
    }

    private void record(boolean failure) {
        outcomes.addLast(failure);
        while (outcomes.size() > properties.breakerWindowSize()) outcomes.removeFirst();
    }

    private void open(String reason, int calls, int failures) {
        generation++;
        state = State.OPEN;
        openUntil = System.nanoTime() + properties.cooldown().toNanos();
        halfOpenPermits = 0;
        halfOpenSuccesses = 0;
        transition("open", reason, calls, failures);
    }

    private void transition(String target, String reason, int calls, int failures) {
        metrics.counter("redis_circuit_transitions_total", "state", target, "reason", reason).increment();
        LOG.warn("redis_circuit_transition state={} reason={} calls={} failures={} generation={}",
                target, reason, calls, failures, generation);
    }

    private <T> T fallback(String feature, String reason, Supplier<T> fallback) {
        metrics.counter("redis_fallback_total", "feature", feature, "reason", reason).increment();
        LOG.warn("redis_fallback feature={} reason={} correlation_id={}", feature, reason,
                com.vibe.ticketrush.common.service.CorrelationId.current());
        return fallback.get();
    }

    @Override
    public void contribute(Info.Builder builder) {
        builder.withDetail("redis", java.util.Map.of("mode", "redis-gate".equals(strategy) && isOpen() ? "fallback" : strategy));
    }
}
