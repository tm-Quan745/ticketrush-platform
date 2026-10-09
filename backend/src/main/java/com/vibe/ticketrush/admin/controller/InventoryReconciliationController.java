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
    public InventoryReconciliationController(InventoryReconciliationService service) { this.service=service; }
    @GetMapping("/api/v1/admin/events/{id}/inventory/reconcile")
    public List<InventoryViolation> reconcile(@PathVariable UUID id) { return service.reconcile(id); }
}
