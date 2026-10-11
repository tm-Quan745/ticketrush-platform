package com.vibe.ticketrush.observability;

import io.micrometer.core.instrument.MeterRegistry;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;

@SpringBootTest
@ActiveProfiles("test")
@AutoConfigureMockMvc
@org.springframework.boot.test.autoconfigure.actuate.observability.AutoConfigureObservability
@Testcontainers
@DirtiesContext
class ObservabilityIntegrationTest {
    static final String PASSWORD = UUID.randomUUID().toString();
    @Container static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17-alpine");
    @Container static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7.4-alpine")
        .withCommand("redis-server", "--requirepass", PASSWORD).withExposedPorts(6379);
    @DynamicPropertySource static void configure(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        r.add("spring.datasource.username", POSTGRES::getUsername);
        r.add("spring.datasource.password", POSTGRES::getPassword);
        r.add("spring.data.redis.host", REDIS::getHost);
        r.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
        r.add("spring.data.redis.password", () -> PASSWORD);
        r.add("spring.rabbitmq.password", () -> PASSWORD);
        r.add("METRICS_PASSWORD", () -> PASSWORD);
        r.add("app.auth.jwt-secret", () -> Base64.getEncoder().encodeToString(PASSWORD.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    }
    @Autowired MockMvc http;
    @Autowired MeterRegistry meters;

    @Test void scrapeIsAuthenticatedAndNeverLeaksIdentityLabelsOrRawRoutes() throws Exception {
        http.perform(get("/actuator/prometheus")).andExpect(status().isUnauthorized());
        http.perform(get("/actuator/prometheus").with(httpBasic("prometheus", "incorrect")))
            .andExpect(status().isUnauthorized());
        String id = UUID.randomUUID().toString();
        http.perform(get("/api/v1/events/" + id)).andExpect(status().isNotFound());
        http.perform(post("/api/v1/reservations").contentType("application/json").content("{}"))
            .andExpect(status().isUnauthorized());
        String scrape = http.perform(get("/actuator/prometheus").with(httpBasic("prometheus", PASSWORD)))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(scrape).contains("http_server_requests_seconds_bucket", "hikaricp_connections", "jvm_memory_used_bytes",
            "reservation_attempts_total", "uri=\"/api/v1/events/{id}\"");
        assertThat(scrape).doesNotContain(id, "user_id=", "order_id=", "reservation_id=", "correlation_id=", "email=", "token=");
        meters.counter("forbidden_metric", "user_id", id).increment();
        assertThat(meters.find("forbidden_metric").meter()).isNull();
    }

    @Test void correlationHeaderIsBoundedAndThreadContextIsCleared() throws Exception {
        http.perform(get("/actuator/health/liveness").header("X-Correlation-Id", "loadtest-123"))
            .andExpect(header().string("X-Correlation-Id", "loadtest-123"));
        String generated = http.perform(get("/actuator/health/liveness").header("X-Correlation-Id", "x".repeat(1000)))
            .andReturn().getResponse().getHeader("X-Correlation-Id");
        assertThat(generated).hasSize(36);
        assertThat(org.slf4j.MDC.get("correlation_id")).isNull();
    }
}
