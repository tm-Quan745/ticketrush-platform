package com.vibe.ticketrush.inventory.service;
import com.vibe.ticketrush.common.service.ApiException;
import com.vibe.ticketrush.event.service.EventAccess;
import com.vibe.ticketrush.inventory.domain.TicketTier;
import com.vibe.ticketrush.inventory.dto.TierDtos.*;
import com.vibe.ticketrush.inventory.dto.TierMapper;
import com.vibe.ticketrush.inventory.repository.TicketTierRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;
@Service
@Transactional(readOnly = true)
public class InventoryService implements InventoryRead {
    private final java.time.Clock clock;
    private final TicketTierRepository tiers;
    private final EventAccess events;
    private final RedisInventoryGate gate;
    private final com.vibe.ticketrush.event.service.EventCacheInvalidation cache;
    public InventoryService(TicketTierRepository tiers, EventAccess events, java.time.Clock clock, RedisInventoryGate gate,com.vibe.ticketrush.event.service.EventCacheInvalidation cache) { this.tiers = tiers; this.events = events; this.clock=clock; this.gate=gate; this.cache=cache; }
    public List<PublicTier> publicTiers(UUID eventId) {
        return tiers.findByEventIdOrderByNameAsc(eventId).stream().map(TierMapper::publicView).toList();
    }
    public UUID eventId(UUID tierId) { return tiers.findEventId(tierId).orElseThrow(InventoryService::missing); }
    public List<InventoryView> inventory(UUID eventId) {
        events.requireExists(eventId);
        return tiers.findByEventIdOrderByNameAsc(eventId).stream().map(TierMapper::inventory).toList();
    }
    @Transactional
    public InventoryView create(UUID eventId, WriteTier r) {
        validateCurrency(r.currency());
        if (events.lockForTierChange(eventId).saleStarted(clock.instant())) throw saleConflict();
        TicketTier t = new TicketTier(); t.setId(UUID.randomUUID()); t.setEventId(eventId);
        t.setName(r.name().trim()); t.setDescription(r.description()); t.setPrice(r.price()); t.setCurrency(r.currency());
        t.setTotalQuantity(r.totalQuantity()); t.setAvailableQuantity(r.totalQuantity()); t.setMaxPerOrder(r.maxPerOrder());
        t.setCreatedAt(clock.instant()); t.setUpdatedAt(t.getCreatedAt());
        cache.invalidate();
        return TierMapper.inventory(tiers.saveAndFlush(t));
    }
    @Transactional
    public InventoryView update(UUID id, WriteTier r) {
        validateCurrency(r.currency());
        UUID eventId = tiers.findEventId(id).orElseThrow(InventoryService::missing);
        var state = events.lockForTierChange(eventId);
        // Load mutable tier fields only after acquiring the event lock.
        TicketTier t = tiers.findById(id).orElseThrow(InventoryService::missing);
        int capacityDelta=r.totalQuantity()-t.getTotalQuantity();
        if (state.saleStarted(clock.instant()) && (t.getPrice() != r.price() || !t.getCurrency().equals(r.currency())))
            throw saleConflict();
        if (tiers.updateCapacity(id, r.name().trim(), r.description(), r.price(), r.currency(), r.maxPerOrder(), r.totalQuantity()) != 1)
            throw new ApiException(HttpStatus.CONFLICT, "CAPACITY_BELOW_COMMITTED", "Total quantity cannot be below sold plus held tickets");
        gate.afterCommit(id,capacityDelta);
        cache.invalidate();
        return TierMapper.inventory(find(id));
    }
    private TicketTier find(UUID id) { return tiers.findById(id).orElseThrow(InventoryService::missing); }
    private static ApiException missing() { return new ApiException(HttpStatus.NOT_FOUND, "TIER_NOT_FOUND", "Ticket tier not found"); }
    private static ApiException saleConflict() { return new ApiException(HttpStatus.CONFLICT, "SALE_ALREADY_STARTED", "Cannot create tiers or change price/currency after sale starts"); }
    private void validateCurrency(String currency) {
        try { Currency.getInstance(currency); }
        catch (IllegalArgumentException ex) { throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_CURRENCY", "Use an ISO 4217 currency code"); }
    }
}
