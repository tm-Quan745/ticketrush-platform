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
    public InventoryReconciliationService(InventoryReconciliationRepository repository, EventAccess events) { this.repository=repository; this.events=events; }
    @Transactional(readOnly=true)
    public List<InventoryViolation> reconcile(UUID eventId) { events.requireExists(eventId); return repository.violations(eventId); }
}
