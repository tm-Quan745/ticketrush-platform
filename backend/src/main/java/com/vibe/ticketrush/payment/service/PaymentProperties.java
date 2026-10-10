package com.vibe.ticketrush.payment.service;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;
import jakarta.validation.constraints.*;
import java.time.Duration;

@Validated
@ConfigurationProperties("ticketrush.payment")
public record PaymentProperties(@DefaultValue("") String webhookSecret,
        @DefaultValue("http://127.0.0.1:8080/api/v1/payments/webhook") String webhookUrl,
        @DefaultValue("500ms") Duration delay,
        @DefaultValue("11m") Duration delayedSuccessDelay,
        @DefaultValue("5m") Duration timestampTolerance,
        @DefaultValue("5m") Duration lateGrace,
        @DefaultValue("20") @Min(2) @Max(100) int duplicateCount,
        @DefaultValue("false") boolean testScenariosEnabled,
        @DefaultValue("") String testToken) {
    public PaymentProperties {
        if (delay==null || delay.isNegative() || delayedSuccessDelay==null || delayedSuccessDelay.isNegative()
                || timestampTolerance==null || timestampTolerance.isNegative() || timestampTolerance.isZero()
                || lateGrace==null || lateGrace.isNegative()) throw new IllegalArgumentException("Invalid payment durations");
    }
}
