package com.vibe.ticketrush.common.bulkhead;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("ticketrush.bulkhead")
public record BulkheadProperties(@DefaultValue("true") boolean enabled, @DefaultValue("0") int maxConcurrent,
        @DefaultValue("3") int poolMultiplier) {
    public BulkheadProperties {
        if (maxConcurrent < 0 || poolMultiplier < 1 || poolMultiplier > 20) {
            throw new IllegalArgumentException("Invalid bulkhead configuration");
        }
    }
}
