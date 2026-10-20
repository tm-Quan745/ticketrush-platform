package com.vibe.ticketrush.common.observability;

import io.micrometer.core.instrument.MeterRegistry;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.Map;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component @Order(-105)
public class ReservationMetricsFilter extends OncePerRequestFilter {
    private final MeterRegistry registry;
    public ReservationMetricsFilter(MeterRegistry registry) {
        this.registry = registry;
        for (String result : new String[]{"success", "sold_out", "rate_limited", "waiting_room_required", "error"})
            registry.counter("reservation_attempts", "result", result);
    }
    @Override protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"POST".equals(request.getMethod()) || !"/api/v1/reservations".equals(request.getRequestURI());
    }
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {
        boolean completed = false;
        try { chain.doFilter(request, response); completed = true; }
        finally {
            String result = completed && response.getStatus() == 201 ? "success"
                : completed && response.getStatus() == 429 ? "rate_limited"
                : Map.of("SOLD_OUT", "sold_out", "WAITING_ROOM_REQUIRED", "waiting_room_required")
                    .getOrDefault(String.valueOf(request.getAttribute("metric.error")), "error");
            registry.counter("reservation_attempts", "result", result).increment();
        }
    }
}
