package com.vibe.ticketrush.queue.controller;

import com.vibe.ticketrush.queue.service.WaitingRoomService;
import com.vibe.ticketrush.event.service.WaitingRoomEvents;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
@SecurityRequirement(name="bearerAuth")
@io.swagger.v3.oas.annotations.responses.ApiResponses({
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode="401",description="Authentication required"),
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode="403",description="Required role or token missing"),
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode="429",description="Rate limited; Retry-After and X-RateLimit headers"),
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode="503",description="Waiting room temporarily unavailable")
})
public class WaitingRoomController {
    private final WaitingRoomService queue;
    private final WaitingRoomEvents events;
    private final Timer statusResponse;
    public WaitingRoomController(WaitingRoomService queue,WaitingRoomEvents events,MeterRegistry metrics) {
        this.queue=queue; this.events=events;
        this.statusResponse=Timer.builder("waiting_room_status_response_seconds").publishPercentileHistogram().register(metrics);
    }
    public record Configure(boolean enabled,@Min(1) @Max(1000) int rate,@NotNull @Pattern(regexp="fifo|lottery") String mode) {}
    @PutMapping("/admin/events/{id}/waiting-room")
    @Operation(summary="Configure waiting room (ADMIN)")
    public WaitingRoomEvents.Settings configure(@PathVariable UUID id,@Valid @RequestBody Configure request) {
        WaitingRoomEvents.Settings settings=events.configure(id,request.enabled(),request.rate(),request.mode());
        queue.refresh(id);
        return settings;
    }
    @PostMapping("/events/{id}/waiting-room/join")
    @Operation(summary="Join once, preserving the original position (USER)")
    public ResponseEntity<WaitingRoomService.Status> join(@PathVariable UUID id,@AuthenticationPrincipal Jwt jwt) { return status(id,jwt,true); }
    @GetMapping("/events/{id}/waiting-room/status")
    @Operation(summary="Poll admission and refresh heartbeat (USER)")
    public ResponseEntity<WaitingRoomService.Status> status(@PathVariable UUID id,@AuthenticationPrincipal Jwt jwt) {
        return statusResponse.record(() -> status(id,jwt,false));
    }
    private ResponseEntity<WaitingRoomService.Status> status(UUID id,Jwt jwt,boolean join) {
        var result=queue.status(id,UUID.fromString(jwt.getSubject()),join);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Retry-After",Integer.toString(result.pollIntervalSeconds())).body(result);
    }
    @DeleteMapping("/events/{id}/waiting-room/leave") @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary="Leave queue and revoke admission (USER)")
    public void leave(@PathVariable UUID id,@AuthenticationPrincipal Jwt jwt) { queue.leave(id,UUID.fromString(jwt.getSubject())); }
}
