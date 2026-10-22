package com.vibe.ticketrush.common.bulkhead;

import com.vibe.ticketrush.auth.service.SecurityErrorWriter;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.web.filter.OncePerRequestFilter;

public class BulkheadFilter extends OncePerRequestFilter {
    private final RequestBulkhead bulkhead;
    private final SecurityErrorWriter errors;
    private final MeterRegistry metrics;

    public BulkheadFilter(RequestBulkhead bulkhead, SecurityErrorWriter errors, MeterRegistry metrics) {
        this.bulkhead = bulkhead;
        this.errors = errors;
        this.metrics = metrics;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"POST".equals(request.getMethod()) || !("/api/v1/reservations".equals(request.getRequestURI())
            || "/api/v1/orders".equals(request.getRequestURI()));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String endpoint = request.getRequestURI().endsWith("orders") ? "orders" : "reservations";
        if (!bulkhead.tryAcquire(endpoint)) {
            request.setAttribute("metric.error", "BULKHEAD_REJECTED");
            metrics.counter("request_bulkhead_rejected_total", "endpoint", endpoint).increment();
            response.setHeader("Retry-After", "1");
            errors.write(request, response, 429, "BULKHEAD_REJECTED", "Request capacity is temporarily full");
            return;
        }
        try {
            chain.doFilter(request, response);
        } finally {
            bulkhead.release();
        }
    }
}
