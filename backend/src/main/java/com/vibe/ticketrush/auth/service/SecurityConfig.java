package com.vibe.ticketrush.auth.service;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.server.resource.authentication.*;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.util.Base64;

@Configuration
public class SecurityConfig {
    @Bean
    PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(12); }

    @Bean
    SecretKey jwtKey(AuthProperties properties) {
        byte[] key = Base64.getDecoder().decode(properties.jwtSecret());
        if (key.length < 32) throw new IllegalArgumentException("JWT_SECRET must contain at least 32 random bytes");
        return new SecretKeySpec(key, "HmacSHA256");
    }
    @Bean
    JwtEncoder jwtEncoder(SecretKey key) { return new NimbusJwtEncoder(new ImmutableSecret<>(key)); }

    @Bean
    JwtDecoder jwtDecoder(SecretKey key, AuthProperties properties) {
        var decoder = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
        OAuth2TokenValidator<Jwt> audience = jwt -> jwt.getAudience().contains("ticketrush-api")
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token"));
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer(properties.issuer()), audience));
        return decoder;
    }

    @Bean
    SecurityFilterChain security(HttpSecurity http, StringRedisTemplate redis, AuthProperties properties,
                                 SecurityErrorWriter errors, Environment environment) throws Exception {
        var authorities = new JwtGrantedAuthoritiesConverter();
        authorities.setAuthoritiesClaimName("roles");
        authorities.setAuthorityPrefix("ROLE_");
        var converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(authorities);

        http.csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> {
                    auth.requestMatchers(HttpMethod.POST, "/api/v1/auth/register", "/api/v1/auth/login",
                            "/api/v1/auth/refresh", "/api/v1/auth/logout").permitAll();
                    auth.requestMatchers(HttpMethod.GET, "/actuator/health", "/actuator/health/liveness",
                            "/actuator/health/readiness").permitAll();
                    if (!environment.matchesProfiles("prod")) {
                        auth.requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll();
                    }
                    auth.requestMatchers(HttpMethod.GET, "/api/v1/events", "/api/v1/events/*").permitAll();
                    auth.requestMatchers("/actuator/**", "/api/v1/admin/**").hasRole("ADMIN");
                    auth.requestMatchers(HttpMethod.GET, "/api/v1/auth/me").hasAnyRole("USER", "ADMIN");
                    auth.anyRequest().denyAll();
                })
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((req, res, e) -> errors.write(req, res, 401, "UNAUTHORIZED", "Authentication required"))
                        .accessDeniedHandler((req, res, e) -> errors.write(req, res, 403, "FORBIDDEN", "Access denied")))
                .oauth2ResourceServer(oauth -> oauth.jwt(jwt -> jwt.jwtAuthenticationConverter(converter))
                        .authenticationEntryPoint((req, res, e) -> errors.write(req, res, 401, "UNAUTHORIZED", "Invalid access token"))
                        .accessDeniedHandler((req, res, e) -> errors.write(req, res, 403, "FORBIDDEN", "Access denied")))
                .addFilterBefore(new LoginRateLimitFilter(redis, properties, errors), UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
