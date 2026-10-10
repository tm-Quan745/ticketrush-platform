package com.vibe.ticketrush.order.service;

import com.vibe.ticketrush.order.repository.OrderRepository;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class OrderEmailQueryService implements OrderEmailQuery {
    private final OrderRepository orders;
    public OrderEmailQueryService(OrderRepository orders) { this.orders=orders; }
    public EmailOrder emailOrder(UUID orderId) {
        var row=orders.get(orderId);
        return new EmailOrder(row.id(),row.userId(),row.total(),row.currency(),orders.tickets(orderId).stream().map(t -> t.ticketCode()).toList());
    }
}
