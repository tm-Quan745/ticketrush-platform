package com.vibe.ticketrush.auth.service;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.util.List;

public class LoginRateLimitFilter extends OncePerRequestFilter {
    private static final DefaultRedisScript<Long> SCRIPT = new DefaultRedisScript<>("""
            local count = redis.call('INCR', KEYS[1])
            if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
            return count
            """, Long.class);
    private final StringRedisTemplate redis;
    private final AuthProperties properties;
    private final SecurityErrorWriter errors;

    public LoginRateLimitFilter(StringRedisTemplate redis, AuthProperties properties, SecurityErrorWriter errors) {
        this.redis = redis;
        this.properties = properties;
        this.errors = errors;
    }
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !("POST".equals(request.getMethod()) && "/api/v1/auth/login".equals(request.getServletPath()));
    }
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        try {
            String key = "auth:login:" + TokenService.hash(request.getRemoteAddr());
            Long count = redis.execute(SCRIPT, List.of(key), Long.toString(properties.loginWindow().toSeconds()));
            if (count == null) throw new IllegalStateException("Missing rate-limit result");
            if (count > properties.loginLimit()) {
                response.setHeader("Retry-After", Long.toString(properties.loginWindow().toSeconds()));
                errors.write(request, response, 429, "RATE_LIMITED", "Too many login attempts");
                return;
            }
        } catch (DataAccessException ex) {
            errors.write(request, response, 503, "AUTH_UNAVAILABLE", "Login temporarily unavailable");
            return;
        }
        chain.doFilter(request, response);
    }
}
