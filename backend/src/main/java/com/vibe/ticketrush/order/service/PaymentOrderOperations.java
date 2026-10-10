package com.vibe.ticketrush.order.service;

import java.util.UUID;

public interface PaymentOrderOperations {
    void lock(UUID id);
    boolean matches(UUID id,long amount,String currency);
    void mismatch(UUID id);
    void succeeded(UUID id);
    void failed(UUID id);
    void refunded(UUID id);
}
