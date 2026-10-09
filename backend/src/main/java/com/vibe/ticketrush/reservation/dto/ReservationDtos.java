package com.vibe.ticketrush.reservation.dto;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.vibe.ticketrush.reservation.domain.ReservationStatus;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.*;
public final class ReservationDtos {
    private ReservationDtos() {}
    public record Create(@NotNull UUID tierId, @Min(1) int quantity) {}
    public record View(UUID id, ReservationStatus status, int quantity,
        @JsonProperty("expires_at") Instant expiresAt,
        @JsonProperty("seconds_remaining") long secondsRemaining) {}
    public record Listing(List<View> content, int page, int size, long totalElements, int totalPages) {}
}
