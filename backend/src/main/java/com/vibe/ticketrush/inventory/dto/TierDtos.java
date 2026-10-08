package com.vibe.ticketrush.inventory.dto;

import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.UUID;

public final class TierDtos {
    private TierDtos() {}
    public enum Availability { AVAILABLE, LOW, SOLD_OUT }
    public record WriteTier(@NotBlank @Size(max = 100) String name,
            @Size(max = 10000) String description, @NotNull @PositiveOrZero Long price,
            @NotBlank @Pattern(regexp = "[A-Z]{3}") String currency,
            @NotNull @PositiveOrZero Integer totalQuantity, @NotNull @Min(1) Integer maxPerOrder) {}
    public record PublicTier(UUID id, String name, String description, long price,
            String currency, int maxPerOrder, Availability availability) {}
    public record InventoryView(UUID id, UUID eventId, String name, String description, long price,
            String currency, int totalQuantity, int availableQuantity, int maxPerOrder,
            long version, Instant createdAt, Instant updatedAt) {}
}
