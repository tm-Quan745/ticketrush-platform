package com.vibe.ticketrush.auth.dto;

import jakarta.validation.constraints.*;
import java.util.Set;
import java.util.UUID;

public final class AuthDtos {
    private AuthDtos() {}

    public record Credentials(
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(min = 12, max = 72) String password) {}

    public record RefreshRequest(
            @NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{43}") String refreshToken) {}

    public record TokenResponse(String accessToken, String refreshToken, String tokenType,
                                long expiresIn) {}

    public record UserResponse(UUID id, String email, Set<String> roles) {}
}
