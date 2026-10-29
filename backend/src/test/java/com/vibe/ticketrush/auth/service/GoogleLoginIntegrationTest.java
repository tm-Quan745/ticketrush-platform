package com.vibe.ticketrush.auth.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.*;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.test.context.*;
import org.springframework.test.annotation.DirtiesContext;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.junit.jupiter.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.stream.IntStream;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties="ticketrush.rate-limit.enabled=true")
@ActiveProfiles("test")
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Import(GoogleLoginIntegrationTest.GoogleTestConfig.class)
class GoogleLoginIntegrationTest {
    static final com.nimbusds.jose.jwk.RSAKey KEY = key();
    static com.nimbusds.jose.jwk.RSAKey key() {
        try { return new RSAKeyGenerator(2048).generate(); } catch (JOSEException e) { throw new IllegalStateException(e); }
    }
    @TestConfiguration
    static class GoogleTestConfig {
        @Bean @Primary GoogleTokenVerifier testGoogleVerifier() throws JOSEException {
            return new GoogleTokenVerifier("test-client", NimbusJwtDecoder.withPublicKey(KEY.toRSAPublicKey()).build());
        }
    }
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
        registry.add("app.auth.login-limit", () -> 100);
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


    String credential(String subject, String email) throws JOSEException {
        var claims = new JWTClaimsSet.Builder().issuer("https://accounts.google.com").audience("test-client")
                .subject(subject).claim("email", email).claim("email_verified", true)
                .issueTime(new Date()).expirationTime(Date.from(Instant.now().plusSeconds(300))).build();
        var jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.RS256), claims);
        jwt.sign(new RSASSASigner(KEY)); return jwt.serialize();
    }
    ResponseEntity<String> google(String token) {
        return http.postForEntity("/api/v1/auth/google", Map.of("credential", token), String.class);
    }
    @Test void browserGoogleLoginIssuesOnlyHttpOnlyRefreshCookie() throws Exception {
        var headers = new HttpHeaders();
        headers.set("X-Auth-Mode", "cookie"); headers.setOrigin("http://localhost:3000");
        var response = http.postForEntity("/api/v1/auth/google", new HttpEntity<>(
                Map.of("credential", credential("browser-google", "browser@gmail.com")), headers), String.class);
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(mapper.readTree(response.getBody()).hasNonNull("refreshToken")).isFalse();
        assertThat(response.getHeaders().getFirst(HttpHeaders.SET_COOKIE)).contains("HttpOnly", "Secure", "SameSite=Lax");
    }

    @Test void createsUserReusesSubjectAndSupportsRefreshLogout() throws Exception {
        var first = google(credential("google-1", "Person@gmail.com"));
        assertThat(first.getStatusCode().value()).isEqualTo(200);
        assertThat(first.getHeaders().getCacheControl()).contains("no-store");
        var tokens = mapper.readTree(first.getBody());
        var headers = new HttpHeaders(); headers.setBearerAuth(tokens.path("accessToken").asText());
        var me = http.exchange("/api/v1/auth/me", HttpMethod.GET, new HttpEntity<>(headers), String.class);
        assertThat(me.getStatusCode().value()).isEqualTo(200);
        assertThat(mapper.readTree(me.getBody()).path("roles").toString()).isEqualTo("[\"USER\"]");
        assertThat(mapper.readTree(me.getBody()).path("email").asText()).isEqualTo("person@gmail.com");
        assertThat(http.exchange("/api/v1/admin/events", HttpMethod.GET, new HttpEntity<>(headers), String.class)
                .getStatusCode().value()).isEqualTo(403);
        assertThat(google(credential("google-1", "changed@gmail.com")).getStatusCode().value()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM users", Integer.class)).isEqualTo(1);
        String refresh = tokens.path("refreshToken").asText();
        var rotated = http.postForEntity("/api/v1/auth/refresh", Map.of("refreshToken", refresh), String.class);
        assertThat(rotated.getStatusCode().value()).isEqualTo(200);
        String next = mapper.readTree(rotated.getBody()).path("refreshToken").asText();
        assertThat(http.postForEntity("/api/v1/auth/logout", Map.of("refreshToken", next), String.class)
                .getStatusCode().value()).isEqualTo(204);
        assertThat(http.postForEntity("/api/v1/auth/refresh", Map.of("refreshToken", next), String.class)
                .getStatusCode().value()).isEqualTo(401);
    }
    @Test void rejectsExistingEmailWithoutLinkingOrGrantingRoles() throws Exception {
        assertThat(http.postForEntity("/api/v1/auth/register", Map.of("email", "existing@gmail.com", "password", PASSWORD), String.class)
                .getStatusCode().value()).isEqualTo(201);
        var conflict = google(credential("new-sub", "existing@gmail.com"));
        assertThat(conflict.getStatusCode().value()).isEqualTo(409);
        assertThat(mapper.readTree(conflict.getBody()).path("code").asText()).isEqualTo("GOOGLE_ACCOUNT_CONFLICT");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM users WHERE google_subject IS NOT NULL", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM refresh_tokens", Integer.class)).isZero();
    }
    @Test void validatesPublicEndpointsAndRejectsInvalidCredentials() {
        assertThat(http.getForEntity("/api/v1/auth/google/config", String.class).getBody()).contains("test-client");
        assertThat(google("").getStatusCode().value()).isEqualTo(400);
        assertThat(google("x".repeat(8193)).getStatusCode().value()).isEqualTo(400);
        assertThat(google("not-a-jwt").getStatusCode().value()).isEqualTo(401);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM users", Integer.class)).isZero();
    }
    @Test void concurrentFirstLoginCreatesExactlyOneUser() throws Exception {
        String token = credential("concurrent", "concurrent@gmail.com");
        int count = 6;
        var ready = new CountDownLatch(count); var start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(count)) {
            var futures = IntStream.range(0, count).mapToObj(i -> pool.submit(() -> {
                ready.countDown();
                if (!start.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Barrier timed out");
                return google(token).getStatusCode().value();
            })).toList();
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue(); start.countDown();
            var statuses = new ArrayList<Integer>();
            for (var future : futures) statuses.add(future.get(30, TimeUnit.SECONDS));
            assertThat(statuses).contains(200).allMatch(status -> status == 200 || status == 409);
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM users", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM user_roles", Integer.class)).isEqualTo(1);
        assertThat(google(token).getStatusCode().value()).isEqualTo(200);
    }
}
