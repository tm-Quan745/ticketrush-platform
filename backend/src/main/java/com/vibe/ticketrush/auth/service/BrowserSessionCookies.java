package com.vibe.ticketrush.auth.service;

import com.vibe.ticketrush.auth.dto.AuthDtos.TokenResponse;
import com.vibe.ticketrush.common.service.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import java.time.Duration;
import java.util.*;

/** Browser opt-in keeps the existing explicit-token API available to non-browser clients. */
@Component
public class BrowserSessionCookies {
    public static final String NAME = "tr_refresh";
    private final boolean secure;
    private final Set<String> origins;
    private final AuthProperties properties;

    public BrowserSessionCookies(AuthProperties properties, Environment environment,
            @Value("${app.auth.cookie-secure:true}") boolean secure,
            @Value("${app.auth.browser-origins:http://localhost:3000,http://127.0.0.1:3000,http://localhost:3100,http://127.0.0.1:3100}") String[] origins) {
        if (!secure && environment.matchesProfiles("prod"))
            throw new IllegalArgumentException("Production refresh cookies require Secure");
        for (String origin : origins) {
            var uri = java.net.URI.create(origin);
            if (origin.contains("*") || uri.getHost() == null || uri.getRawQuery() != null
                    || uri.getRawFragment() != null || uri.getUserInfo() != null || !uri.getPath().isEmpty()
                    || !("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())))
                throw new IllegalArgumentException("Exact HTTP(S) browser origins required");
        }
        this.secure = secure; this.origins = Set.of(origins); this.properties = properties;
    }

    public boolean browser(HttpServletRequest request) {
        String mode = request.getHeader("X-Auth-Mode");
        if (mode == null) return false;
        String origin = request.getHeader("Origin");
        if (!"cookie".equals(mode) || origin == null || !origins.contains(origin))
            throw new ApiException(HttpStatus.FORBIDDEN, "UNTRUSTED_ORIGIN", "Browser authentication requires a trusted Origin");
        return true;
    }

    public String token(HttpServletRequest request) {
        if (request.getCookies() != null) {
            for (var cookie : request.getCookies()) {
                if (NAME.equals(cookie.getName()) && cookie.getValue().matches("[A-Za-z0-9_-]{43}")) return cookie.getValue();
            }
        }
        return null;
    }

    public String cookie(String token) {
        return ResponseCookie.from(NAME, token == null ? "" : token).httpOnly(true).secure(secure)
                .sameSite("Lax").path("/api/v1/auth")
                .maxAge(token == null ? Duration.ZERO : properties.refreshTtl()).build().toString();
    }

    public ResponseEntity<TokenResponse> response(TokenResponse tokens, boolean browser) {
        var response = ResponseEntity.ok().cacheControl(CacheControl.noStore());
        if (!browser) return response.body(tokens);
        return response.header(HttpHeaders.SET_COOKIE, cookie(tokens.refreshToken()))
                .body(new TokenResponse(tokens.accessToken(), null, tokens.tokenType(), tokens.expiresIn()));
    }
}
