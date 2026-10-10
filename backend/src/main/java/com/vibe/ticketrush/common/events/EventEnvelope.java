package com.vibe.ticketrush.common.events;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.UUID;

/** Versioned wire contract. Event identifiers are allocated once by the outbox. */
public record EventEnvelope(UUID eventId, String eventType, int schemaVersion,
                            String aggregateType, UUID aggregateId, Instant occurredAt,
                            String correlationId, JsonNode payload) {}
