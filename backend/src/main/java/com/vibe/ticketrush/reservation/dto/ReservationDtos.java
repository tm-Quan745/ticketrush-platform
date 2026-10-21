package com.vibe.ticketrush.reservation.dto;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.vibe.ticketrush.reservation.domain.ReservationStatus;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.*;
public final class ReservationDtos {
    private ReservationDtos() {}
    public record Create(UUID tierId, Integer quantity, List<UUID> seatIds) {
        public Create(UUID tierId,int quantity) { this(tierId,quantity,null); }
    }
    public record View(UUID id, ReservationStatus status, int quantity,
        @JsonProperty("expires_at") Instant expiresAt,
        @JsonProperty("seconds_remaining") long secondsRemaining,
        UUID userId,UUID tierId,UUID eventId,String tierName,long unitPrice,String currency,String inventoryMode,
        Instant createdAt,List<com.vibe.ticketrush.inventory.service.SeatedInventory.Assignment> seats) {}
    public record Listing(List<View> content, int page, int size, long totalElements, int totalPages) {}
}
