package com.vibe.ticketrush.admin.controller;

import com.vibe.ticketrush.order.service.OrderService;
import com.vibe.ticketrush.order.domain.OrderStatus;
import com.vibe.ticketrush.order.dto.OrderDtos.*;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/orders")
@SecurityRequirement(name="bearerAuth")
public class AdminOrderController {
    private final OrderService orders;
    public AdminOrderController(OrderService orders) { this.orders=orders; }
    @GetMapping
    public Listing list(@RequestParam(required=false) UUID userId,@RequestParam(required=false) OrderStatus status,
            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) {
        return orders.list(userId,status,page,size);
    }
    @PostMapping("/{id}/refund")
    public View refund(@PathVariable UUID id) { return orders.refund(id); }
}
