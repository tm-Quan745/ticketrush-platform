package com.vibe.ticketrush.event.controller;
import com.vibe.ticketrush.event.domain.EventStatus;
import com.vibe.ticketrush.event.dto.EventDtos.*;
import com.vibe.ticketrush.event.service.EventService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.*;
import io.swagger.v3.oas.annotations.media.*;
import com.vibe.ticketrush.common.dto.ApiError;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
@ApiResponses({
    @ApiResponse(responseCode = "400", description = "Invalid input", content = @Content(schema = @Schema(implementation = ApiError.class))),
    @ApiResponse(responseCode = "401", description = "Authentication required or token invalid", content = @Content(schema = @Schema(implementation = ApiError.class))),
    @ApiResponse(responseCode = "403", description = "ADMIN role required", content = @Content(schema = @Schema(implementation = ApiError.class))),
    @ApiResponse(responseCode = "404", description = "Resource not found", content = @Content(schema = @Schema(implementation = ApiError.class))),
    @ApiResponse(responseCode = "409", description = "Invalid transition, capacity, sale restriction, or duplicate tier", content = @Content(schema = @Schema(implementation = ApiError.class)))
})
@RestController
@RequestMapping("/api/v1/admin/events")
@SecurityRequirement(name = "bearerAuth")
public class AdminEventController {
    private final EventService events;
    public AdminEventController(EventService events) { this.events = events; }
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @ApiResponse(responseCode = "201", description = "Success", useReturnTypeSchema = true)
    @Operation(summary = "Create a draft event (ADMIN)")
    public EventView create(@Valid @RequestBody WriteEvent request, @AuthenticationPrincipal Jwt jwt) {
        return events.create(request, UUID.fromString(jwt.getSubject()));
    }
    @PutMapping("/{id}")
    @ApiResponse(responseCode = "200", description = "Success", useReturnTypeSchema = true)
    @Operation(summary = "Update event details (ADMIN)", description = "Status cannot be edited here. Sale start is immutable once published sales have started.")
    public EventView update(@PathVariable UUID id, @Valid @RequestBody WriteEvent request) { return events.update(id, request); }
    @PostMapping("/{id}/publish")
    @ApiResponse(responseCode = "200", description = "Success", useReturnTypeSchema = true)
    @Operation(summary = "Publish a draft event (ADMIN)", description = "Only DRAFT -> PUBLISHED; invalid transitions return 409.")
    public EventView publish(@PathVariable UUID id) { return events.transition(id, EventStatus.PUBLISHED); }
    @PostMapping("/{id}/cancel")
    @ApiResponse(responseCode = "200", description = "Success", useReturnTypeSchema = true)
    @Operation(summary = "Cancel a published event (ADMIN)", description = "Only PUBLISHED -> CANCELLED; invalid transitions return 409.")
    public EventView cancel(@PathVariable UUID id) { return events.transition(id, EventStatus.CANCELLED); }
}
