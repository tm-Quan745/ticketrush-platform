package com.vibe.ticketrush.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vibe.ticketrush.auth.service.TokenService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import org.springframework.test.annotation.DirtiesContext;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.junit.jupiter.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class AuthIntegrationTest {
    private static final String PASSWORD = UUID.randomUUID().toString();
    private static final String REDIS_PASSWORD = UUID.randomUUID().toString();
    private static final String BROKER_PASSWORD = UUID.randomUUID().toString();
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17-alpine");
    @Container
    static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7.4-alpine")
            .withExposedPorts(6379).withCommand("redis-server", "--requirepass", REDIS_PASSWORD);
    @Container
    static final RabbitMQContainer RABBIT = new RabbitMQContainer("rabbitmq:4.1-management-alpine")
            .withAdminUser("testuser").withAdminPassword(BROKER_PASSWORD);

    @DynamicPropertySource
    static void configure(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.data.redis.host", REDIS::getHost);
        registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
        registry.add("spring.data.redis.password", () -> REDIS_PASSWORD);
        registry.add("spring.rabbitmq.host", RABBIT::getHost);
        registry.add("spring.rabbitmq.port", RABBIT::getAmqpPort);
        registry.add("spring.rabbitmq.username", RABBIT::getAdminUsername);
        registry.add("spring.rabbitmq.password", RABBIT::getAdminPassword);
        byte[] key = new byte[32];
        new java.security.SecureRandom().nextBytes(key);
        registry.add("app.auth.jwt-secret", () -> Base64.getEncoder().encodeToString(key));
        registry.add("app.auth.login-limit", () -> 5);
        registry.add("app.auth.login-window", () -> "60s");
    }

    @Autowired TestRestTemplate http;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired StringRedisTemplate redis;

    @BeforeEach
    void clean() {
        jdbc.execute("TRUNCATE refresh_tokens, user_roles, users, ticket_tiers, events CASCADE");
        try (var connection = Objects.requireNonNull(redis.getConnectionFactory()).getConnection()) {
            connection.serverCommands().flushDb();
        }
    }

    @Test
    void completeAuthFlowAndRoleBoundaries() throws Exception {
        var registered = register("Student@Example.com");
        assertThat(registered.getStatusCode().value()).isEqualTo(201);
        var user = json(registered);
        assertThat(user.path("email").asText()).isEqualTo("student@example.com");
        assertThat(user.path("roles").toString()).isEqualTo("[\"USER\"]");
        String stored = jdbc.queryForObject("SELECT password_hash FROM users", String.class);
        assertThat(stored).startsWith("$2a$12$").isNotEqualTo(PASSWORD);
        assertThat(register("student@example.com").getStatusCode().value()).isEqualTo(409);

        var loggedIn = login("student@example.com", PASSWORD);
        assertThat(loggedIn.getStatusCode().value()).isEqualTo(200);
        assertThat(loggedIn.getHeaders().getCacheControl()).contains("no-store");
        var first = json(loggedIn);
        String access = first.path("accessToken").asText();
        String refresh = first.path("refreshToken").asText();
        assertThat(get("/api/v1/auth/me", access).getStatusCode().value()).isEqualTo(200);
        assertThat(get("/actuator/info", access).getStatusCode().value()).isEqualTo(403);
        assertThat(get("/api/v1/auth/me", null).getStatusCode().value()).isEqualTo(401);
        assertThat(get("/api/v1/auth/me", "invalid").getStatusCode().value()).isEqualTo(401);
        assertThat(jdbc.queryForObject("SELECT token_hash FROM refresh_tokens", String.class))
                .isEqualTo(TokenService.hash(refresh)).isNotEqualTo(refresh);

        var rotated = post("refresh", Map.of("refreshToken", refresh));
        assertThat(rotated.getStatusCode().value()).isEqualTo(200);
        String next = json(rotated).path("refreshToken").asText();
        assertThat(next).isNotEqualTo(refresh);
        assertThat(post("refresh", Map.of("refreshToken", refresh)).getStatusCode().value()).isEqualTo(401);
        assertThat(post("logout", Map.of("refreshToken", next)).getStatusCode().value()).isEqualTo(204);
        assertThat(post("logout", Map.of("refreshToken", next)).getStatusCode().value()).isEqualTo(204);
        assertThat(post("refresh", Map.of("refreshToken", next)).getStatusCode().value()).isEqualTo(401);
        // Stateless access JWTs remain valid until expiry, even after logout.
        assertThat(get("/api/v1/auth/me", access).getStatusCode().value()).isEqualTo(200);

        jdbc.update("INSERT INTO user_roles(user_id, role_id) VALUES (?, 2)", UUID.fromString(user.path("id").asText()));
        String adminAccess = json(login("student@example.com", PASSWORD)).path("accessToken").asText();
        assertThat(get("/actuator/info", adminAccess).getStatusCode().value()).isEqualTo(200);
    }

    @Test
    void invalidInputCredentialsAndExpiredTokensUseConsistentErrors() throws Exception {
        assertError(post("register", Map.of("email", "bad", "password", "short")), 400, "VALIDATION_ERROR");
        assertError(post("register", Map.of("email", "a@example.com", "password", "界".repeat(30))), 400, "VALIDATION_ERROR");
        var headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        assertError(http.postForEntity("/api/v1/auth/register", new HttpEntity<>("{broken", headers), String.class),
                400, "INVALID_REQUEST");
        register("a@example.com");
        assertError(login("a@example.com", "incorrect-password"), 401, "UNAUTHORIZED");
        assertError(login("missing@example.com", "incorrect-password"), 401, "UNAUTHORIZED");
        String token = json(login("a@example.com", PASSWORD)).path("refreshToken").asText();
        jdbc.update("UPDATE refresh_tokens SET created_at = now() - interval '2 days', expires_at = now() - interval '1 day'");
        assertError(post("refresh", Map.of("refreshToken", token)), 401, "UNAUTHORIZED");
        assertError(post("refresh", Map.of("refreshToken", "a".repeat(43))), 401, "UNAUTHORIZED");
        assertError(get("/api/v1/auth/me", null), 401, "UNAUTHORIZED");
    }

    @Test
    void concurrentRefreshHasExactlyOneWinner() throws Exception {
        register("a@example.com");
        String token = json(login("a@example.com", PASSWORD)).path("refreshToken").asText();
        var results = concurrently(8, () -> post("refresh", Map.of("refreshToken", token)));
        assertThat(results.stream().filter(r -> r.getStatusCode().value() == 200).count()).isEqualTo(1);
        assertThat(results.stream().filter(r -> r.getStatusCode().value() == 401).count()).isEqualTo(7);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM refresh_tokens WHERE revoked_at IS NULL", Long.class)).isEqualTo(1);
    }

    @Test
    void concurrentRegistrationCreatesOneUser() throws Exception {
        var results = concurrently(4, () -> register("same@example.com"));
        assertThat(results.stream().filter(r -> r.getStatusCode().value() == 201).count()).isEqualTo(1);
        assertThat(results.stream().filter(r -> r.getStatusCode().value() == 409).count()).isEqualTo(3);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM users", Long.class)).isEqualTo(1);
    }

    @Test
    void concurrentLoginRateLimitIsAtomicAndCannotBeBypassedWithForwardedHeaders() throws Exception {
        var results = concurrently(12, () -> {
            var headers = new HttpHeaders();
            headers.set("X-Forwarded-For", UUID.randomUUID().toString());
            return http.postForEntity("/api/v1/auth/login", new HttpEntity<>(
                    Map.of("email", "missing@example.com", "password", PASSWORD), headers), String.class);
        });
        assertThat(results.stream().filter(r -> r.getStatusCode().value() == 401).count()).isEqualTo(5);
        assertThat(results.stream().filter(r -> r.getStatusCode().value() == 429).count()).isEqualTo(7);
        var limited = login("missing@example.com", PASSWORD);
        assertError(limited, 429, "RATE_LIMITED");
        assertThat(limited.getHeaders().getFirst("Retry-After")).isEqualTo("60");
        Set<String> keys = redis.keys("auth:login:*");
        assertThat(keys).hasSize(1);
        String key = keys.iterator().next();
        assertThat(redis.getExpire(key)).isBetween(1L, 60L);
        redis.expire(key, Duration.ofMillis(1));
        org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(3)).until(() -> !redis.hasKey(key));
        assertThat(login("missing@example.com", PASSWORD).getStatusCode().value()).isEqualTo(401);
    }

    @Test
    void schemaConstraintsHealthAndOpenApi() throws Exception {
        UUID event = UUID.randomUUID();
        jdbc.update("INSERT INTO events(id, title, start_time, end_time, sale_start_time, sale_end_time) VALUES (?, ?, now(), now() + interval '1 hour', now() - interval '1 day', now())", event, "Launch");
        assertThatThrownBy(() -> jdbc.update("INSERT INTO ticket_tiers(id, event_id, name, price, total_quantity, available_quantity) VALUES (?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(), event, "VIP", 10, 10, -1)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO ticket_tiers(id, event_id, name, price, total_quantity, available_quantity) VALUES (?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(), event, "VIP", 10, 10, 11)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(get("/actuator/health", null).getStatusCode().value()).isEqualTo(200);
        assertThat(json(get("/v3/api-docs", null)).path("paths").has("/api/v1/auth/login")).isTrue();
    }

    private List<ResponseEntity<String>> concurrently(int count, Callable<ResponseEntity<String>> operation) throws Exception {
        var ready = new CountDownLatch(count);
        var start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(count)) {
            var futures = IntStream.range(0, count).mapToObj(i -> pool.submit(() -> {
                ready.countDown();
                if (!start.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Start barrier timed out");
                return operation.call();
            })).toList();
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            var results = new ArrayList<ResponseEntity<String>>();
            for (var future : futures) results.add(future.get(30, TimeUnit.SECONDS));
            return results;
        }
    }
    private ResponseEntity<String> register(String email) { return post("register", Map.of("email", email, "password", PASSWORD)); }
    private ResponseEntity<String> login(String email, String password) { return post("login", Map.of("email", email, "password", password)); }
    private ResponseEntity<String> post(String action, Object body) { return http.postForEntity("/api/v1/auth/" + action, body, String.class); }
    private ResponseEntity<String> get(String path, String token) {
        var headers = new HttpHeaders();
        if (token != null) headers.setBearerAuth(token);
        return http.exchange(path, HttpMethod.GET, new HttpEntity<>(headers), String.class);
    }
    private JsonNode json(ResponseEntity<String> response) throws Exception { return mapper.readTree(response.getBody()); }
    private void assertError(ResponseEntity<String> response, int status, String code) throws Exception {
        assertThat(response.getStatusCode().value()).isEqualTo(status);
        var body = json(response);
        assertThat(body.path("status").asInt()).isEqualTo(status);
        assertThat(body.path("code").asText()).isEqualTo(code);
        assertThat(body.hasNonNull("timestamp")).isTrue();
        assertThat(body.hasNonNull("message")).isTrue();
        assertThat(body.hasNonNull("path")).isTrue();
        assertThat(body.path("fieldErrors").isObject()).isTrue();
        assertThat(body.has("trace")).isFalse();
    }
}
