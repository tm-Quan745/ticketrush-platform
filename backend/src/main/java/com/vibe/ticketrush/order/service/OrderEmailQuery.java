package com.vibe.ticketrush.order.service;

import java.util.List;
import java.util.UUID;

public interface OrderEmailQuery {
    record EmailOrder(UUID id, UUID userId, long total, String currency, List<String> ticketCodes) {}
    EmailOrder emailOrder(UUID orderId);
}
