package com.vibe.ticketrush.outbox.domain;

import java.time.Instant;
import java.util.UUID;

public record OutboxEvent(UUID id, String aggregateType, UUID aggregateId, String eventType,
                         int schemaVersion, String payload, String headers, OutboxStatus status,
                         int attempts, Instant nextAttemptAt, Instant createdAt) {}
