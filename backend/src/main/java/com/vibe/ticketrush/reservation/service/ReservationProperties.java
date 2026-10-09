package com.vibe.ticketrush.reservation.service;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;
import jakarta.validation.constraints.*;
@Validated
@ConfigurationProperties("ticketrush.reservation")
public record ReservationProperties(
    @DefaultValue("conditional-update") @Pattern(regexp="conditional-update|optimistic|pessimistic") String strategy,
    @DefaultValue("10m") Duration holdDuration,
    @DefaultValue("100") @Min(1) @Max(10000) int batchSize,
    @DefaultValue("20") @Min(1) @Max(100) int optimisticAttempts) {
    public ReservationProperties {
        if (holdDuration == null || holdDuration.isNegative() || holdDuration.isZero())
            throw new IllegalArgumentException("hold-duration must be positive");
    }
}
