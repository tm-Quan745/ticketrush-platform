package com.vibe.ticketrush.inventory.controller;
import com.vibe.ticketrush.inventory.dto.TierDtos.*;
import com.vibe.ticketrush.inventory.service.InventoryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.*;
import io.swagger.v3.oas.annotations.media.*;
import com.vibe.ticketrush.common.dto.ApiError;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@ApiResponses({
    @ApiResponse(responseCode = "400", description = "Invalid input", content = @Content(schema = @Schema(implementation = ApiError.class))),
    @ApiResponse(responseCode = "401", description = "Authentication required or token invalid", content = @Content(schema = @Schema(implementation = ApiError.class))),
    @ApiResponse(responseCode = "403", description = "ADMIN role required", content = @Content(schema = @Schema(implementation = ApiError.class))),
    @ApiResponse(responseCode = "404", description = "Resource not found", content = @Content(schema = @Schema(implementation = ApiError.class))),
    @ApiResponse(responseCode = "409", description = "Invalid transition, capacity, sale restriction, or duplicate tier", content = @Content(schema = @Schema(implementation = ApiError.class)))
})
@RestController
@RequestMapping("/api/v1/admin")
@SecurityRequirement(name = "bearerAuth")
public class InventoryController {
    private final InventoryService inventory;
    public InventoryController(InventoryService inventory) { this.inventory = inventory; }
    @PostMapping("/events/{id}/tiers")
    @ResponseStatus(HttpStatus.CREATED)
    @ApiResponse(responseCode = "201", description = "Success", useReturnTypeSchema = true)
    @Operation(summary = "Create tier (ADMIN)", description = "Integer minor-unit price and ISO 4217 currency. Available quantity starts at total. Forbidden once published sales have started (409).")
    public InventoryView create(@PathVariable UUID id, @Valid @RequestBody WriteTier request) { return inventory.create(id, request); }
    @PutMapping("/tiers/{id}")
    @ApiResponse(responseCode = "200", description = "Success", useReturnTypeSchema = true)
    @Operation(summary = "Update tier and capacity atomically (ADMIN)", description = "409 if total is below sold+held, name conflicts, or price/currency changes after published sales start.")
    public InventoryView update(@PathVariable UUID id, @Valid @RequestBody WriteTier request) { return inventory.update(id, request); }
    @GetMapping("/events/{id}/inventory")
    @ApiResponse(responseCode = "200", description = "Success", useReturnTypeSchema = true)
    @Operation(summary = "Read exact tier inventory (ADMIN)")
    public List<InventoryView> inventory(@PathVariable UUID id) { return inventory.inventory(id); }
}
