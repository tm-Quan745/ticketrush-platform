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
    private final SeatedInventory seats;
    private final java.time.Clock clock;
    private final TicketTierRepository tiers;
    private final EventAccess events;
    private final RedisInventoryGate gate;
    private final com.vibe.ticketrush.event.service.EventCacheInvalidation cache;
    public InventoryService(TicketTierRepository tiers, EventAccess events, java.time.Clock clock, RedisInventoryGate gate,com.vibe.ticketrush.event.service.EventCacheInvalidation cache,SeatedInventory seats) { this.seats=seats; this.tiers = tiers; this.events = events; this.clock=clock; this.gate=gate; this.cache=cache; }
    public List<PublicTier> publicTiers(UUID eventId) {
        return tiers.findByEventIdOrderByNameAsc(eventId).stream().map(this::publicView).toList();
    }
    public UUID eventId(UUID tierId) { return tiers.findEventId(tierId).orElseThrow(InventoryService::missing); }
    public List<InventoryView> inventory(UUID eventId) {
        events.requireExists(eventId);
        return tiers.findByEventIdOrderByNameAsc(eventId).stream().map(this::inventoryView).toList();
    }
    @Transactional
    public InventoryView create(UUID eventId, WriteTier r) {
        validateCurrency(r.currency());
        if (events.lockForTierChange(eventId).saleStarted(clock.instant())) throw saleConflict();
        TicketTier t = new TicketTier(); t.setId(UUID.randomUUID()); t.setEventId(eventId);
        t.setName(r.name().trim()); t.setDescription(r.description()); t.setPrice(r.price()); t.setCurrency(r.currency());
        if ("SEATED".equals(r.mode()) && r.totalQuantity()!=0) throw SeatedInventory.invalid("SEATED_CAPACITY_DERIVED","Seated capacity derives from mapped seats; specify zero");
        t.setInventoryMode(r.mode());
        t.setTotalQuantity(r.totalQuantity()); t.setAvailableQuantity(r.totalQuantity()); t.setMaxPerOrder(r.limit());
        t.setCreatedAt(clock.instant()); t.setUpdatedAt(t.getCreatedAt());
        cache.invalidate();
        return inventoryView(tiers.saveAndFlush(t));
    }
    @Transactional
    public InventoryView update(UUID id, WriteTier r) {
        validateCurrency(r.currency());
        UUID eventId = tiers.findEventId(id).orElseThrow(InventoryService::missing);
        var state = events.lockForTierChange(eventId);
        // Load mutable tier fields only after acquiring the event lock.
        TicketTier t = tiers.findById(id).orElseThrow(InventoryService::missing);
        if (!t.getInventoryMode().equals(r.mode())) throw SeatedInventory.invalid("INVENTORY_MODE_IMMUTABLE","Create a new tier to select a different mode");
        if ("SEATED".equals(t.getInventoryMode())) throw SeatedInventory.invalid("SEATED_CAPACITY_DERIVED","Use seat block/unblock for seated capacity");
        int capacityDelta=r.totalQuantity()-t.getTotalQuantity();
        if (state.saleStarted(clock.instant()) && (t.getPrice() != r.price() || !t.getCurrency().equals(r.currency())))
            throw saleConflict();
        if (tiers.updateCapacity(id, r.name().trim(), r.description(), r.price(), r.currency(), r.limit(), r.totalQuantity()) != 1)
            throw new ApiException(HttpStatus.CONFLICT, "CAPACITY_BELOW_COMMITTED", "Total quantity cannot be below sold plus held tickets");
        gate.afterCommit(id,capacityDelta);
        cache.invalidate();
        return inventoryView(find(id));
    }
    @Transactional
    public InventoryView capacity(UUID id,CapacityChange request) {
        UUID eventId=tiers.findEventId(id).orElseThrow(InventoryService::missing);
        events.lockForTierChange(eventId);
        TicketTier tier=find(id);
        if (!"COUNTER".equals(tier.getInventoryMode())) throw SeatedInventory.invalid("CAPACITY_DERIVED_FROM_SEATS","Use block/unblock for seated capacity");
        if (tier.getVersion()!=request.expectedVersion()) throw new ApiException(HttpStatus.CONFLICT,"CAPACITY_VERSION_CONFLICT","Capacity version changed");
        if (request.totalQuantity()<tier.getTotalQuantity()-tier.getAvailableQuantity())
            throw new ApiException(HttpStatus.CONFLICT,"CAPACITY_BELOW_COMMITTED","Capacity cannot be below held plus sold");
        int delta=request.totalQuantity()-tier.getTotalQuantity();
        if (tiers.changeCapacity(id,request.totalQuantity(),request.expectedVersion())!=1)
            throw new ApiException(HttpStatus.CONFLICT,"CAPACITY_VERSION_CONFLICT","Inventory changed; read its version again");
        gate.afterCommit(id,delta);cache.invalidate();return inventoryView(find(id));
    }
    private PublicTier publicView(TicketTier tier) {
        if (!"SEATED".equals(tier.getInventoryMode())) return TierMapper.publicView(tier);
        var c=seats.counts(tier.getId());
        var availability=c.available()==0 ? Availability.SOLD_OUT : c.available()*10<c.physical()-c.blocked() ? Availability.LOW : Availability.AVAILABLE;
        return new PublicTier(tier.getId(),tier.getName(),tier.getDescription(),tier.getPrice(),tier.getCurrency(),tier.getMaxPerOrder(),availability,tier.getInventoryMode());
    }
    private InventoryView inventoryView(TicketTier tier) {
        if (!"SEATED".equals(tier.getInventoryMode())) {
            var c=tiers.committed(tier.getId());
            return new InventoryView(tier.getId(),tier.getEventId(),tier.getName(),tier.getDescription(),tier.getPrice(),tier.getCurrency(),tier.getTotalQuantity(),tier.getAvailableQuantity(),tier.getMaxPerOrder(),tier.getVersion(),tier.getCreatedAt(),tier.getUpdatedAt(),tier.getInventoryMode(),c.getHeld(),c.getSold(),List.of());
        }
        var c=seats.counts(tier.getId());
        return new InventoryView(tier.getId(),tier.getEventId(),tier.getName(),tier.getDescription(),tier.getPrice(),tier.getCurrency(),c.physical()-c.blocked(),c.available(),tier.getMaxPerOrder(),tier.getVersion(),tier.getCreatedAt(),tier.getUpdatedAt(),tier.getInventoryMode(),c.held(),c.sold(),seats.sectionCounts(tier.getId()));
    }
    private TicketTier find(UUID id) { return tiers.findById(id).orElseThrow(InventoryService::missing); }
    private static ApiException missing() { return new ApiException(HttpStatus.NOT_FOUND, "TIER_NOT_FOUND", "Ticket tier not found"); }
    private static ApiException saleConflict() { return new ApiException(HttpStatus.CONFLICT, "SALE_ALREADY_STARTED", "Cannot create tiers or change price/currency after sale starts"); }
    private void validateCurrency(String currency) {
        try { Currency.getInstance(currency); }
        catch (IllegalArgumentException ex) { throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_CURRENCY", "Use an ISO 4217 currency code"); }
    }
}
