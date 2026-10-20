package com.vibe.ticketrush.common.redis;

import static org.assertj.core.api.Assertions.assertThat;

import com.vibe.ticketrush.reservation.service.ReservationProperties;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.dao.QueryTimeoutException;

class RedisGuardTest {
    @Test
    void shortTimeoutBurstDoesNotOpenCountBasedCircuit() {
        RedisGuard guard = guard(Duration.ofMillis(20));
        for (int attempt = 0; attempt < 3; attempt++) {
            assertThat(guard.call("waiting-room", this::timeout, () -> "fallback")).isEqualTo("fallback");
        }
        assertThat(guard.isOpen()).isFalse();
        assertThat(guard.call("waiting-room", () -> "ok", () -> "fallback")).isEqualTo("ok");
    }

    @Test
    void sustainedTimeoutsOpenThenSuccessfulHalfOpenProbesCloseCircuit() throws Exception {
        RedisGuard guard = guard(Duration.ofMillis(20));
        for (int attempt = 0; attempt < 5; attempt++) {
            assertThat(guard.call("waiting-room", this::timeout, () -> "fallback")).isEqualTo("fallback");
        }
        assertThat(guard.isOpen()).isTrue();
        assertThat(guard.call("waiting-room", () -> "unexpected", () -> "fallback")).isEqualTo("fallback");

        Thread.sleep(30);
        for (int probe = 0; probe < 3; probe++) {
            assertThat(guard.call("waiting-room", () -> "ok", () -> "fallback")).isEqualTo("ok");
        }
        assertThat(guard.isOpen()).isFalse();
    }

    @Test
    void legacyLoadTestModeOpensOnFirstQualifyingFailure() {
        RedisGuard guard = guard(Duration.ofSeconds(5), "legacy-immediate");

        assertThat(guard.call("waiting-room", this::timeout, () -> "fallback")).isEqualTo("fallback");
        assertThat(guard.isOpen()).isTrue();
        assertThat(guard.call("waiting-room", () -> "unexpected", () -> "fallback")).isEqualTo("fallback");
    }

    private RedisGuard guard(Duration cooldown) {
        return guard(cooldown, "count-based");
    }

    private RedisGuard guard(Duration cooldown, String mode) {
        RedisProperties properties = new RedisProperties("test", cooldown, true, Duration.ofMinutes(1), 10, 5, 0.5, 3, mode);
        ReservationProperties reservations = new ReservationProperties("conditional-update", Duration.ofMinutes(10), 100, 20);
        return new RedisGuard(properties, new SimpleMeterRegistry(), reservations);
    }

    private String timeout() {
        throw new QueryTimeoutException("synthetic Redis timeout");
    }
}
