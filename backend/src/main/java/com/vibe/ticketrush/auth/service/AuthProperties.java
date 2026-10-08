package com.vibe.ticketrush.auth.service;

import jakarta.validation.constraints.*;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;
import java.time.Duration;

@Validated
@ConfigurationProperties("app.auth")
public record AuthProperties(@NotBlank String jwtSecret, @NotBlank String issuer,
                             @NotNull Duration accessTtl, @NotNull Duration refreshTtl,
                             @Min(1) int loginLimit, @NotNull Duration loginWindow) {
    public AuthProperties {
        if (accessTtl != null && (accessTtl.isNegative() || accessTtl.isZero())
                || refreshTtl != null && (refreshTtl.isNegative() || refreshTtl.isZero())
                || loginWindow != null && loginWindow.toSeconds() < 1) {
            throw new IllegalArgumentException("Auth durations must be positive (login window >= 1s)");
        }
    }
}
