package com.vibe.ticketrush.inventory.dto;

import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.UUID;

public final class TierDtos {
    private TierDtos() {}
    public enum Availability { AVAILABLE, LOW, SOLD_OUT }
    public record CapacityChange(@NotNull @PositiveOrZero Integer totalQuantity,@NotNull @PositiveOrZero Long expectedVersion) {}
    public record WriteTier(@NotBlank @Size(max = 100) String name,
            @Size(max = 10000) String description, @NotNull @PositiveOrZero Long price,
            @NotBlank @Pattern(regexp = "[A-Z]{3}") String currency,
            @NotNull @PositiveOrZero Integer totalQuantity, @Min(1) Integer maxPerOrder,
            @Pattern(regexp="COUNTER|SEATED") String inventoryMode) {
        public WriteTier(String name,String description,Long price,String currency,Integer totalQuantity,Integer maxPerOrder) {
            this(name,description,price,currency,totalQuantity,maxPerOrder,"COUNTER");
        }
        public String mode() { return inventoryMode==null ? "COUNTER" : inventoryMode; }
        @AssertTrue(message="maxPerOrder is required for COUNTER tiers")
        @com.fasterxml.jackson.annotation.JsonIgnore
        public boolean isCounterLimitPresent() { return "SEATED".equals(mode()) || maxPerOrder!=null; }
        public int limit() { return maxPerOrder==null ? ("SEATED".equals(mode()) ? 6 : 1) : maxPerOrder; }
    }
    public record PublicTier(UUID id, String name, String description, long price,
            String currency, int maxPerOrder, Availability availability, String inventoryMode) {}
    public record InventoryView(UUID id, UUID eventId, String name, String description, long price,
            String currency, int totalQuantity, int availableQuantity, int maxPerOrder,
            long version, Instant createdAt, Instant updatedAt, String inventoryMode,
            long heldQuantity,long soldQuantity,java.util.List<java.util.Map<String,Object>> sectionCounts) {}
}
