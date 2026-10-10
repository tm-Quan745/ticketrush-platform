package com.vibe.ticketrush.order.service;

import com.vibe.ticketrush.order.repository.OrderRepository;
import org.springframework.stereotype.Service;
import java.util.*;

@Service
public class TicketInventoryAuditService implements TicketInventoryAudit {
    private final OrderRepository orders;
    public TicketInventoryAuditService(OrderRepository orders) { this.orders=orders; }
    public Map<UUID,Long> validTickets(UUID eventId) { return orders.validTicketCounts(eventId); }
}
