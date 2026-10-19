package com.vibe.ticketrush.order.controller;

import com.vibe.ticketrush.order.dto.GateDtos.*;
import com.vibe.ticketrush.order.service.GateService;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/gate/tickets")
@SecurityRequirement(name = "bearerAuth")
public class GateController {
    private final GateService gate;
    public GateController(GateService gate) { this.gate = gate; }
    @PostMapping("/verify")
    public Ticket verify(@Valid @RequestBody Scan scan) { return gate.verify(scan.ticketCode()); }
    @PostMapping("/check-in")
    public Ticket checkIn(@Valid @RequestBody Scan scan, @AuthenticationPrincipal Jwt jwt) {
        return gate.checkIn(scan.ticketCode(), UUID.fromString(jwt.getSubject()));
    }
}
