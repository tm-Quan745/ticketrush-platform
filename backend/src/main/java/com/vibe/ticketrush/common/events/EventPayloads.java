package com.vibe.ticketrush.common.events;

import java.util.UUID;

/** Minimal, PII-free payloads; consumers resolve addresses and detailed data themselves. */
public final class EventPayloads {
    private EventPayloads() {}
    public record Reservation(UUID reservationId, UUID userId) {}
    public record Order(UUID orderId, UUID userId) {}
    public record TicketIssued(UUID orderId, UUID userId) {}
}
