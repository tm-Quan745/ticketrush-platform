package com.vibe.ticketrush.common.bulkhead;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("ticketrush.bulkhead")
public record BulkheadProperties(@DefaultValue("true") boolean enabled, @DefaultValue("0") int maxConcurrent,
        @DefaultValue("3") int poolMultiplier, @DefaultValue("1") int assumedHoldSeconds,
        @DefaultValue("1.5") double safetyFactor) {
    public BulkheadProperties {
        if (maxConcurrent < 0 || poolMultiplier < 1 || poolMultiplier > 20 || assumedHoldSeconds < 1 || safetyFactor < 1 || safetyFactor > 10) {
            throw new IllegalArgumentException("Invalid bulkhead configuration");
        }
    }
}
