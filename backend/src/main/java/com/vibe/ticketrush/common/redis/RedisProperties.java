package com.vibe.ticketrush.common.redis;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("ticketrush.redis")
public record RedisProperties(@DefaultValue("dev") String environment,
        @DefaultValue("2s") Duration cooldown, @DefaultValue("true") boolean fallbackEnabled,
        @DefaultValue("1m") Duration attemptLease,
        @DefaultValue("100") int breakerWindowSize,
        @DefaultValue("50") int breakerMinimumCalls,
        @DefaultValue("0.5") double breakerFailureRateThreshold,
        @DefaultValue("3") int breakerHalfOpenProbes,
        @DefaultValue("count-based") String breakerMode) {
    public RedisProperties {
        if (environment == null || !environment.matches("[a-zA-Z0-9_-]+") || cooldown.isNegative() || cooldown.isZero())
            throw new IllegalArgumentException("Invalid Redis namespace or cooldown");
        if (attemptLease == null || attemptLease.toMillis()<1 || attemptLease.compareTo(Duration.ofHours(24))>=0)
            throw new IllegalArgumentException("Attempt lease must be positive and shorter than refund retention");
        if (breakerWindowSize < 1 || breakerMinimumCalls < 1 || breakerMinimumCalls > breakerWindowSize
                || breakerFailureRateThreshold <= 0 || breakerFailureRateThreshold > 1 || breakerHalfOpenProbes < 1)
            throw new IllegalArgumentException("Invalid Redis circuit breaker settings");
        if (!"count-based".equals(breakerMode) && !"legacy-immediate".equals(breakerMode))
            throw new IllegalArgumentException("Redis breaker mode must be count-based or legacy-immediate");
    }
    public String key(String module, Object id, String purpose) {
        return "ticketrush:" + environment + ":" + module + ":" + id + ":" + purpose;
    }
}
