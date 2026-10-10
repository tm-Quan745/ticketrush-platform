package com.vibe.ticketrush.payment.service;

import com.vibe.ticketrush.payment.domain.PaymentScenario;
import java.util.UUID;

public interface PaymentGateway {
    String createPayment(UUID orderId,long amount,String currency,PaymentScenario scenario);
    void refund(String providerPaymentId,long amount,String currency);
}
