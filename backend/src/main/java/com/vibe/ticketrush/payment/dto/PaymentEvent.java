package com.vibe.ticketrush.payment.dto;

import jakarta.validation.constraints.*;

public record PaymentEvent(
        @NotBlank @Size(max=150) String providerEventId,
        @NotBlank @Size(max=100) String providerPaymentId,
        @NotNull Type type, @PositiveOrZero long amount,
        @NotNull @Pattern(regexp="[A-Z]{3}") String currency) {
    public enum Type { SUCCEEDED, FAILED, REFUNDED }
}
