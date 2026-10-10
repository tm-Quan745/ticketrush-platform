package com.vibe.ticketrush.payment.service;

import com.vibe.ticketrush.payment.domain.PaymentScenario;
import java.util.UUID;

public interface PaymentOperations {
    PaymentScenario scenario(String requested,String token);
    String initiate(UUID order,long amount,String currency,PaymentScenario scenario);
    String reference(UUID order);
    boolean succeeded(UUID order);
    void refund(UUID order);
}
