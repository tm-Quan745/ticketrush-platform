package com.vibe.ticketrush.outbox.service;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("ticketrush.outbox")
public record OutboxProperties(Duration relayInterval,int batchSize,int maxAttempts,Duration initialBackoff,
                               Duration maxBackoff,Duration confirmTimeout,Duration cleanupInterval,int retentionDays) {}
