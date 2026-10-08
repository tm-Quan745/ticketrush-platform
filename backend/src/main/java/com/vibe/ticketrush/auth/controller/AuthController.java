package com.vibe.ticketrush.auth.controller;

import com.vibe.ticketrush.auth.dto.AuthDtos.*;
import com.vibe.ticketrush.auth.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final AuthService auth;
    public AuthController(AuthService auth) { this.auth = auth; }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public UserResponse register(@Valid @RequestBody Credentials request) { return auth.register(request); }

    @PostMapping("/login")
    public ResponseEntity<TokenResponse> login(@Valid @RequestBody Credentials request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(auth.login(request));
    }

    @PostMapping("/refresh")
    public ResponseEntity<TokenResponse> refresh(@Valid @RequestBody RefreshRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(auth.refresh(request.refreshToken()));
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Revoke the supplied refresh token; possession authorizes revocation")
    public void logout(@Valid @RequestBody RefreshRequest request) { auth.logout(request.refreshToken()); }

    @GetMapping("/me")
    @SecurityRequirement(name = "bearerAuth")
    public UserResponse me(@AuthenticationPrincipal Jwt jwt) {
        return auth.currentUser(UUID.fromString(jwt.getSubject()));
    }
}
