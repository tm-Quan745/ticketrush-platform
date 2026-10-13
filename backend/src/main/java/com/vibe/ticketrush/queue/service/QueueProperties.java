package com.vibe.ticketrush.queue.service;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("ticketrush.queue")
public record QueueProperties(@DefaultValue("false") boolean enabledByDefault,
        @DefaultValue("fifo") String mode, @DefaultValue("20") int rate,
        @DefaultValue("1s") Duration interval, @DefaultValue("30s") Duration heartbeatTtl,
        @DefaultValue("10m") Duration tokenTtl, @DefaultValue("15") int maxPollIntervalSeconds) {
    public QueueProperties {
        if (!java.util.Set.of("fifo","lottery").contains(mode) || rate<1 || rate>1000 || interval.toMillis()<1
                || heartbeatTtl.toMillis()<1 || tokenTtl.toMillis()<1 || maxPollIntervalSeconds<1 || maxPollIntervalSeconds>60)
            throw new IllegalArgumentException("Invalid queue configuration");
    }
}
