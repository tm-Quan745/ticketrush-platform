package com.vibe.ticketrush.event.dto;

import com.vibe.ticketrush.event.domain.EventStatus;
import com.vibe.ticketrush.inventory.dto.TierDtos.PublicTier;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.*;

public final class EventDtos {
    private EventDtos() {}
    public record WriteEvent(@NotBlank @Size(max = 200) String title,
            @Size(max = 10000) String description, @Size(max = 200) String venueName,
            @Size(max = 500) String venueAddress, @Size(max = 2048) String imageUrl,
            @NotNull Instant startTime, @NotNull Instant endTime,
            @NotNull Instant saleStartTime, @NotNull Instant saleEndTime) {}
    public record EventView(UUID id, String title, String description, String venueName,
            String venueAddress, String imageUrl, Instant startTime, Instant endTime,
            Instant saleStartTime, Instant saleEndTime, EventStatus status,
            Instant createdAt, Instant updatedAt) {}
    public record Detail(EventView event, List<PublicTier> tiers) {}
    public record EventPage(List<EventView> content, int page, int size, long totalElements, int totalPages) {}
}
