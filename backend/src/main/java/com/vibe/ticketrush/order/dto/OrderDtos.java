package com.vibe.ticketrush.order.dto;

import com.vibe.ticketrush.order.domain.OrderStatus;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.*;

public final class OrderDtos {
    private OrderDtos() {}
    @io.swagger.v3.oas.annotations.media.Schema(name="OrderCreate")
    public record Create(@NotNull UUID reservationId) {}
    @io.swagger.v3.oas.annotations.media.Schema(name="OrderItem")
    public record Item(UUID tierId, String tierName, long unitPrice, int quantity) {}
    @io.swagger.v3.oas.annotations.media.Schema(name="OrderView")
    public record View(UUID id, UUID userId, UUID reservationId, OrderStatus status, long totalAmount,
                       String currency, Instant paymentDeadline, String paymentReference,
                       boolean manualReview, List<Item> items) {}
    @io.swagger.v3.oas.annotations.media.Schema(name="OrderPage")
    public record Listing(List<View> content, int page, int size, long totalElements, long totalPages) {}
    @io.swagger.v3.oas.annotations.media.Schema(name="IssuedTicket")
    public record Ticket(UUID id, UUID eventId, UUID tierId, String ticketCode, String status, Instant issuedAt) {}
}
