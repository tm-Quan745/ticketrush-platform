package com.vibe.ticketrush.reservation.controller;
import com.vibe.ticketrush.reservation.service.*;
import com.vibe.ticketrush.reservation.dto.ReservationDtos.*;
import com.vibe.ticketrush.reservation.domain.ReservationStatus;
import com.vibe.ticketrush.common.service.ApiException;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;
import java.util.UUID;
@RestController
@RequestMapping("/api/v1/reservations")
@SecurityRequirement(name="bearerAuth")
public class ReservationController {
    private final ReservationService service;
    private final ReservationTransactions transactions;
    public ReservationController(ReservationService service, ReservationTransactions transactions) { this.service=service; this.transactions=transactions; }
    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public View create(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody Create request) {
        return service.create(UUID.fromString(jwt.getSubject()),request.tierId(),request.quantity());
    }
    @GetMapping("/me")
    public Listing mine(@AuthenticationPrincipal Jwt jwt,@RequestParam(required=false) ReservationStatus status,
            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) {
        return transactions.mine(UUID.fromString(jwt.getSubject()),status,page,size);
    }
    @GetMapping("/{id}")
    public View get(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) { return transactions.get(UUID.fromString(jwt.getSubject()),id); }
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) {
        if (!transactions.cancel(UUID.fromString(jwt.getSubject()),id))
            throw new ApiException(HttpStatus.CONFLICT,"INVALID_RESERVATION_TRANSITION","Reservation is no longer held");
    }
}
