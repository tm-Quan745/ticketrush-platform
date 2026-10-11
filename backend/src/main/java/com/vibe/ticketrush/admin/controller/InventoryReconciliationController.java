package com.vibe.ticketrush.admin.controller;
import com.vibe.ticketrush.inventory.service.InventoryReconciliationService;
import com.vibe.ticketrush.inventory.dto.InventoryViolation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController
@SecurityRequirement(name="bearerAuth")
public class InventoryReconciliationController {
    private final InventoryReconciliationService service;
    private final com.vibe.ticketrush.inventory.service.InventoryAdmission gate;
    private final com.vibe.ticketrush.event.service.EventAccess events;
    public InventoryReconciliationController(InventoryReconciliationService service,
            com.vibe.ticketrush.inventory.service.InventoryAdmission gate, com.vibe.ticketrush.event.service.EventAccess events) {
        this.service=service; this.gate=gate; this.events=events;
    }
    @PostMapping("/api/v1/admin/events/{id}/inventory/redis-reconcile")
    public List<com.vibe.ticketrush.inventory.service.InventoryAdmission.Drift> redisReconcile(@PathVariable UUID id) {
        events.requireExists(id); return gate.reconcile(id);
    }
    @GetMapping("/api/v1/admin/events/{id}/inventory/reconcile")
    public List<InventoryViolation> reconcile(@PathVariable UUID id) { return service.reconcile(id); }
}
