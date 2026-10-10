package com.vibe.ticketrush.order.controller;

import com.vibe.ticketrush.order.service.OrderService;
import com.vibe.ticketrush.order.domain.OrderStatus;
import com.vibe.ticketrush.order.dto.OrderDtos.*;
import com.vibe.ticketrush.payment.service.PaymentOperations;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/v1/orders")
@SecurityRequirement(name="bearerAuth")
public class OrderController {
    private final OrderService orders;
    private final PaymentOperations payments;
    public OrderController(OrderService orders,PaymentOperations payments) { this.orders=orders; this.payments=payments; }
    @PostMapping
    @io.swagger.v3.oas.annotations.Operation(summary="Create an order with an insert-first idempotency key",responses={
        @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode="201",description="Created or replayed response",content=@io.swagger.v3.oas.annotations.media.Content(schema=@io.swagger.v3.oas.annotations.media.Schema(implementation=View.class))),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode="400",description="Invalid payload or missing/invalid UUID key"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode="409",description="Request in progress or reservation unavailable/already ordered"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode="422",description="Same key with a different request")})
    public ResponseEntity<String> create(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody Create request,
            @RequestHeader("Idempotency-Key") UUID key,
            @RequestHeader(value="X-Mock-Scenario",required=false) String scenario,
            @RequestHeader(value="X-Mock-Test-Token",required=false) String token) {
        var result=orders.create(UUID.fromString(jwt.getSubject()),request.reservationId(),key,payments.scenario(scenario,token));
        var response=ResponseEntity.status(result.status()).contentType(MediaType.APPLICATION_JSON);
        if (result.replayed()) response.header("Idempotency-Replayed","true");
        return response.body(result.body());
    }
    @GetMapping("/me")
    public Listing mine(@AuthenticationPrincipal Jwt jwt,@RequestParam(required=false) OrderStatus status,
            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) {
        return orders.list(UUID.fromString(jwt.getSubject()),status,page,size);
    }
    @GetMapping("/{id}")
    public View get(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) { return orders.get(UUID.fromString(jwt.getSubject()),id); }
    @PostMapping("/{id}/cancel")
    public View cancel(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) { return orders.cancel(UUID.fromString(jwt.getSubject()),id); }
    @GetMapping("/{id}/tickets")
    public List<Ticket> tickets(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) { return orders.tickets(UUID.fromString(jwt.getSubject()),id); }
}
