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
import jakarta.servlet.http.HttpServletRequest;
import com.vibe.ticketrush.auth.service.BrowserSessionCookies;
import com.vibe.ticketrush.common.service.ApiException;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final AuthService auth;
    private final com.vibe.ticketrush.auth.service.GoogleTokenVerifier google;
    private final BrowserSessionCookies cookies;
    public AuthController(AuthService auth, com.vibe.ticketrush.auth.service.GoogleTokenVerifier google, BrowserSessionCookies cookies) {
        this.auth = auth; this.google = google; this.cookies = cookies;
    }

    @GetMapping("/google/config")
    public GoogleConfig googleConfig() { return new GoogleConfig(google.clientId()); }

    @PostMapping("/google")
    public ResponseEntity<TokenResponse> googleLogin(@Valid @RequestBody GoogleLoginRequest request, HttpServletRequest http) {
        boolean browser = cookies.browser(http);
        return cookies.response(auth.googleLogin(google.verify(request.credential())), browser);
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public UserResponse register(@Valid @RequestBody Credentials request) { return auth.register(request); }

    @PostMapping("/login")
    public ResponseEntity<TokenResponse> login(@Valid @RequestBody Credentials request, HttpServletRequest http) {
        boolean browser = cookies.browser(http);
        return cookies.response(auth.login(request), browser);
    }

    @PostMapping("/refresh")
    public ResponseEntity<TokenResponse> refresh(@Valid @RequestBody(required=false) RefreshRequest request, HttpServletRequest http) {
        boolean browser = cookies.browser(http);
        String token = browser ? cookies.token(http) : request == null ? null : request.refreshToken();
        if (token == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Refresh token required");
        return cookies.response(auth.refresh(token), browser);
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Revoke the supplied refresh token; possession authorizes revocation")
    public ResponseEntity<Void> logout(@Valid @RequestBody(required=false) RefreshRequest request, HttpServletRequest http) {
        boolean browser = cookies.browser(http);
        String token = browser ? cookies.token(http) : request == null ? null : request.refreshToken();
        if (token != null) auth.logout(token);
        var response = ResponseEntity.noContent().cacheControl(CacheControl.noStore());
        if (browser) response.header(HttpHeaders.SET_COOKIE, cookies.cookie(null));
        return response.build();
    }

    @GetMapping("/me")
    @SecurityRequirement(name = "bearerAuth")
    public UserResponse me(@AuthenticationPrincipal Jwt jwt) {
        return auth.currentUser(UUID.fromString(jwt.getSubject()));
    }
}
