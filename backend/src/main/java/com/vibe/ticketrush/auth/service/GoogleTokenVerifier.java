package com.vibe.ticketrush.auth.service;

import com.vibe.ticketrush.common.service.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Component;

import java.util.Set;

@Component
public class GoogleTokenVerifier {
    private final String clientId;
    private final JwtDecoder decoder;

    @org.springframework.beans.factory.annotation.Autowired
    public GoogleTokenVerifier(@Value("${app.auth.google-client-id:}") String clientId) {
        this(clientId, NimbusJwtDecoder.withJwkSetUri("https://www.googleapis.com/oauth2/v3/certs").build());
    }

    GoogleTokenVerifier(String clientId, NimbusJwtDecoder decoder) {
        this.clientId = clientId.trim();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(new JwtTimestampValidator(), jwt -> {
            boolean valid = Set.of("https://accounts.google.com", "accounts.google.com")
                    .contains(String.valueOf(jwt.getClaimAsString("iss")))
                    && jwt.getAudience() != null && jwt.getAudience().contains(this.clientId)
                    && (jwt.getClaimAsString("azp") == null || this.clientId.equals(jwt.getClaimAsString("azp")))
                    && jwt.getExpiresAt() != null && jwt.getIssuedAt() != null
                    && !jwt.getIssuedAt().isAfter(java.time.Instant.now().plusSeconds(60))
                    && jwt.getSubject() != null && !jwt.getSubject().isBlank() && jwt.getSubject().length() <= 255
                    && Boolean.TRUE.equals(jwt.getClaimAsBoolean("email_verified"));
            return valid ? OAuth2TokenValidatorResult.success()
                    : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token"));
        }));
        this.decoder = decoder;
    }

    public String clientId() { return clientId; }

    public Identity verify(String credential) {
        if (clientId.isBlank()) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                "GOOGLE_LOGIN_DISABLED", "Google login is not configured");
        try {
            Jwt jwt = decoder.decode(credential);
            String email = jwt.getClaimAsString("email");
            if (email == null || email.length() > 254 || !email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) {
                throw new IllegalArgumentException("Invalid email claim");
            }
            return new Identity(jwt.getSubject(), email);
        } catch (JwtException | IllegalArgumentException e) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_GOOGLE_TOKEN", "Invalid Google credential");
        }
    }

    public record Identity(String subject, String email) {}
}
