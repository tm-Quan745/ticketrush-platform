package com.vibe.ticketrush.common.redis;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("ticketrush.redis")
public record RedisProperties(@DefaultValue("dev") String environment,
        @DefaultValue("5s") Duration cooldown, @DefaultValue("true") boolean fallbackEnabled,
        @DefaultValue("1m") Duration attemptLease) {
    public RedisProperties {
        if (environment == null || !environment.matches("[a-zA-Z0-9_-]+") || cooldown.isNegative() || cooldown.isZero())
            throw new IllegalArgumentException("Invalid Redis namespace or cooldown");
        if (attemptLease == null || attemptLease.toMillis()<1 || attemptLease.compareTo(Duration.ofHours(24))>=0)
            throw new IllegalArgumentException("Attempt lease must be positive and shorter than refund retention");
    }
    public String key(String module, Object id, String purpose) {
        return "ticketrush:" + environment + ":" + module + ":" + id + ":" + purpose;
    }
}
