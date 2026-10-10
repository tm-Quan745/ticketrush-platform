package com.vibe.ticketrush.inventory.service;
import com.vibe.ticketrush.inventory.repository.InventoryReconciliationRepository;
import com.vibe.ticketrush.inventory.dto.InventoryViolation;
import com.vibe.ticketrush.event.service.EventAccess;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service
public class InventoryReconciliationService {
    private final InventoryReconciliationRepository repository;
    private final EventAccess events;
    private final com.vibe.ticketrush.order.service.TicketInventoryAudit tickets;
    public InventoryReconciliationService(InventoryReconciliationRepository repository, EventAccess events,
            com.vibe.ticketrush.order.service.TicketInventoryAudit tickets) { this.repository=repository; this.events=events; this.tickets=tickets; }
    @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public List<InventoryViolation> reconcile(UUID eventId) {
        events.requireExists(eventId);
        var counts=tickets.validTickets(eventId);
        return repository.violations(eventId).stream().map(v -> new InventoryViolation(v.tierId(),v.available(),v.held(),v.confirmed(),v.total(),counts.getOrDefault(v.tierId(),0L)))
            .filter(v -> v.available()+v.held()+v.confirmed()!=v.total() || v.validTickets()!=v.confirmed()).toList();
    }
}
