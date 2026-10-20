package com.vibe.ticketrush.common.controller;

import com.vibe.ticketrush.common.service.ApiException;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.junit.jupiter.api.Assertions.assertEquals;

class GlobalExceptionHandlerTest {
    @Test
    void countsApiExceptionWithNormalizedEndpoint() {
        var registry = new SimpleMeterRegistry();
        var handler = new GlobalExceptionHandler(registry);
        var request = new MockHttpServletRequest("POST", "/api/v1/orders/123e4567-e89b-12d3-a456-426614174000");

        handler.api(new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "DATABASE_POOL_TIMEOUT", "full"), request);

        assertEquals(1.0, registry.find("api_exceptions_total").tags("code", "DATABASE_POOL_TIMEOUT",
                "status", "503", "endpoint", "/api/v1/orders/{id}").counter().count());
    }
}
