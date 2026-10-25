package com.vibe.ticketrush.order.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

public final class GateDtos {
    private GateDtos() {}
    public record Scan(@NotBlank @Size(max = 64) String ticketCode) {}
    public record Ticket(UUID id, UUID eventId, UUID tierId, String ticketCode,
                         String status, Instant usedAt,String eventTitle,String venue,String tierName,
                         com.vibe.ticketrush.inventory.service.SeatedInventory.Assignment seat) {}
}
