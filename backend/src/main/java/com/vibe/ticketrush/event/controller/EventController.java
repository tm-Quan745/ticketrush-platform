package com.vibe.ticketrush.event.controller;
import com.vibe.ticketrush.event.dto.EventDtos.*;
import com.vibe.ticketrush.event.service.EventService;
import com.vibe.ticketrush.inventory.service.InventoryRead;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.*;
import io.swagger.v3.oas.annotations.media.*;
import com.vibe.ticketrush.common.dto.ApiError;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.util.UUID;
@ApiResponses({
    @ApiResponse(responseCode = "400", description = "Invalid input", content = @Content(schema = @Schema(implementation = ApiError.class))),
    @ApiResponse(responseCode = "401", description = "Authentication required or token invalid", content = @Content(schema = @Schema(implementation = ApiError.class))),
    @ApiResponse(responseCode = "403", description = "ADMIN role required", content = @Content(schema = @Schema(implementation = ApiError.class))),
    @ApiResponse(responseCode = "404", description = "Resource not found", content = @Content(schema = @Schema(implementation = ApiError.class))),
    @ApiResponse(responseCode = "409", description = "Invalid transition, capacity, sale restriction, or duplicate tier", content = @Content(schema = @Schema(implementation = ApiError.class)))
})
@RestController
@RequestMapping("/api/v1/events")
public class EventController {
    private final EventService events;
    private final InventoryRead inventory;
    public EventController(EventService events, InventoryRead inventory) { this.events = events; this.inventory = inventory; }
    @GetMapping
    @ApiResponse(responseCode = "200", description = "Success", useReturnTypeSchema = true)
    @Operation(summary = "List published events", description = "Zero-based page; size 1..50. Sorted by startTime ascending, then id. from/to are inclusive UTC instants. onSale uses [saleStartTime, saleEndTime).")
    public EventPage list(@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(defaultValue = "false") boolean onSale) {
        return events.list(page, size, keyword, from, to, onSale);
    }
    @GetMapping("/{id}")
    @ApiResponse(responseCode = "200", description = "Success", useReturnTypeSchema = true)
    @Operation(summary = "Published event with ticket tiers", description = "Availability is AVAILABLE, LOW (<10%), or SOLD_OUT; exact quantities are private. Unpublished events return 404.")
    public Detail detail(@PathVariable UUID id) { return new Detail(events.publicDetail(id), inventory.publicTiers(id)); }
}
