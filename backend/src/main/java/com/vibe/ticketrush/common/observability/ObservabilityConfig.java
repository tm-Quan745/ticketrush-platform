package com.vibe.ticketrush.common.observability;

import io.micrometer.core.instrument.config.MeterFilter;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class ObservabilityConfig {
    @Bean @Order(1)
    SecurityFilterChain scrapeSecurity(HttpSecurity http,
            @Value("${METRICS_PASSWORD:}") String password) throws Exception {
        http.securityMatcher("/actuator/prometheus")
            .csrf(csrf -> csrf.disable())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authenticationManager(auth -> {
                if (password.isBlank() || !"prometheus".equals(auth.getName()) ||
                        !MessageDigest.isEqual(password.getBytes(StandardCharsets.UTF_8),
                            String.valueOf(auth.getCredentials()).getBytes(StandardCharsets.UTF_8)))
                    throw new BadCredentialsException("Invalid scrape credentials");
                return new UsernamePasswordAuthenticationToken("prometheus", null,
                    List.of(new SimpleGrantedAuthority("ROLE_METRICS")));
            })
            .httpBasic(basic -> {})
            .authorizeHttpRequests(a -> a.requestMatchers(org.springframework.http.HttpMethod.GET,
                "/actuator/prometheus").hasRole("METRICS").anyRequest().denyAll());
        return http.build();
    }

    @Bean MeterFilter boundedHttpRoutes() {
        // MVC's uri label is a route template. Unmapped/security failures use bounded sentinel values.
        return MeterFilter.maximumAllowableTags("http.server.requests", "uri", 100, MeterFilter.deny());
    }

    @Bean MeterFilter rejectIdentityLabels() {
        return MeterFilter.deny(id -> id.getTags().stream().anyMatch(t ->
            List.of("user_id", "order_id", "reservation_id", "correlation_id", "token", "email")
                .contains(t.getKey())));
    }
}
