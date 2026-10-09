package com.vibe.ticketrush.auth.service;

import com.vibe.ticketrush.auth.domain.*;
import com.vibe.ticketrush.auth.dto.AuthDtos.*;
import com.vibe.ticketrush.auth.repository.*;
import com.vibe.ticketrush.common.service.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class AuthService {
    private final java.time.Clock clock;
    private final UserRepository users;
    private final RoleRepository roles;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordEncoder passwords;
    private final TokenService tokens;
    private final AuthProperties properties;
    private final String dummyHash;

    public AuthService(UserRepository users, RoleRepository roles, RefreshTokenRepository refreshTokens,
                       PasswordEncoder passwords, TokenService tokens, AuthProperties properties, java.time.Clock clock) {
        this.clock=clock;
        this.users = users;
        this.roles = roles;
        this.refreshTokens = refreshTokens;
        this.passwords = passwords;
        this.tokens = tokens;
        this.properties = properties;
        this.dummyHash = passwords.encode(UUID.randomUUID().toString());
    }

    @Transactional
    public UserResponse register(Credentials request) {
        validatePassword(request.password());
        User user = new User(normalize(request.email()), passwords.encode(request.password()),
                roles.findByName("USER").orElseThrow(), clock.instant());
        users.saveAndFlush(user);
        return response(user);
    }

    @Transactional
    public TokenResponse login(Credentials request) {
        validatePassword(request.password());
        var user = users.findByEmail(normalize(request.email()));
        boolean matches = passwords.matches(request.password(), user.map(User::getPasswordHash).orElse(dummyHash));
        if (!matches || user.isEmpty()) throw unauthorized("Invalid email or password");
        return issue(user.get(), clock.instant());
    }

    @Transactional
    public TokenResponse refresh(String rawToken) {
        var token = refreshTokens.findForUpdate(TokenService.hash(rawToken))
                .orElseThrow(() -> unauthorized("Invalid refresh token"));
        Instant now = clock.instant();
        if (!token.isActive(now)) throw unauthorized("Invalid refresh token");
        token.revoke(now);
        return issue(token.getUser(), now);
    }

    @Transactional
    public void logout(String rawToken) {
        refreshTokens.findForUpdate(TokenService.hash(rawToken)).ifPresent(t -> t.revoke(clock.instant()));
    }

    @Transactional(readOnly = true)
    public UserResponse currentUser(UUID id) {
        return response(users.findById(id).orElseThrow(() -> unauthorized("User no longer exists")));
    }

    private TokenResponse issue(User user, Instant now) {
        String raw = tokens.newRefreshToken();
        refreshTokens.save(new RefreshToken(user, TokenService.hash(raw), now, now.plus(properties.refreshTtl())));
        return new TokenResponse(tokens.accessToken(user, now), raw, "Bearer", properties.accessTtl().toSeconds());
    }
    private UserResponse response(User user) {
        return new UserResponse(user.getId(), user.getEmail(), user.getRoles().stream()
                .map(Role::getName).collect(Collectors.toSet()));
    }
    private String normalize(String email) { return email.trim().toLowerCase(Locale.ROOT); }
    private void validatePassword(String password) {
        if (password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Password must be at most 72 UTF-8 bytes");
        }
    }
    private ApiException unauthorized(String message) {
        return new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", message);
    }
}
