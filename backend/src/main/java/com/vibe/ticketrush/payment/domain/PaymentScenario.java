package com.vibe.ticketrush.payment.domain;

public enum PaymentScenario {
    SUCCESS, FAILURE, DELAYED_SUCCESS, DUPLICATE_WEBHOOK, OUT_OF_ORDER, INVALID_SIGNATURE, AMOUNT_MISMATCH
}
