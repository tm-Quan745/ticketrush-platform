package com.vibe.ticketrush.event.service;

import com.vibe.ticketrush.common.service.ApiException;
import com.vibe.ticketrush.event.domain.*;
import com.vibe.ticketrush.event.dto.EventDtos.*;
import com.vibe.ticketrush.event.dto.EventMapper;
import com.vibe.ticketrush.event.repository.EventRepository;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.time.Instant;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class EventService implements EventAccess {
    private final java.time.Clock clock;
    private final EventRepository events;
    public EventService(EventRepository events, java.time.Clock clock) { this.events = events; this.clock=clock; }
    public EventPage list(int page, int size, String keyword, Instant from, Instant to, boolean onSale) {
        if (page < 0 || size < 1 || size > 50 || (from != null && to != null && from.isAfter(to)))
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_FILTER", "page >= 0, size 1..50, and from <= to required");
        Instant now = clock.instant();
        Specification<Event> spec = (root, query, cb) -> cb.equal(root.get("status"), EventStatus.PUBLISHED);
        if (keyword != null && !keyword.isBlank()) {
            String pattern = "%" + keyword.trim().toLowerCase(java.util.Locale.ROOT)
                    .replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
            spec = spec.and((root, query, cb) -> cb.like(cb.lower(root.get("title")), pattern, '!'));
        }
        if (from != null) spec = spec.and((root, query, cb) -> cb.greaterThanOrEqualTo(root.get("startTime"), from));
        if (to != null) spec = spec.and((root, query, cb) -> cb.lessThanOrEqualTo(root.get("startTime"), to));
        if (onSale) spec = spec.and((root, query, cb) -> cb.and(
                cb.lessThanOrEqualTo(root.get("saleStartTime"), now), cb.greaterThan(root.get("saleEndTime"), now)));
        var result = events.findAll(spec, PageRequest.of(page, size, Sort.by("startTime", "id")));
        return new EventPage(result.map(EventMapper::view).getContent(), page, size,
                result.getTotalElements(), result.getTotalPages());
    }
    public EventView publicDetail(UUID id) {
        Event e = find(id);
        if (e.getStatus() != EventStatus.PUBLISHED) throw missing();
        return EventMapper.view(e);
    }
    @Transactional
    public EventView create(WriteEvent r, UUID creator) {
        validate(r);
        Event e = new Event(); e.setId(UUID.randomUUID()); e.setCreatedBy(creator);
        e.setStatus(EventStatus.DRAFT); e.setCreatedAt(clock.instant()); e.setUpdatedAt(e.getCreatedAt());
        EventMapper.apply(e, r);
        return EventMapper.view(events.save(e));
    }
    @Transactional
    public EventView update(UUID id, WriteEvent r) {
        validate(r);
        Event e = lock(id);
        // Once sales begin, moving the window forward would bypass the tier price rule.
        if (e.getStatus() == EventStatus.PUBLISHED && !clock.instant().isBefore(e.getSaleStartTime())
                && !r.saleStartTime().equals(e.getSaleStartTime()))
            throw new ApiException(HttpStatus.CONFLICT, "SALE_ALREADY_STARTED", "Cannot move sale start after sales have started");
        EventMapper.apply(e, r); e.setUpdatedAt(clock.instant());
        return EventMapper.view(e);
    }
    @Transactional
    public EventView transition(UUID id, EventStatus next) {
        Event e = lock(id);
        if (!e.getStatus().canTransitionTo(next))
            throw new ApiException(HttpStatus.CONFLICT, "INVALID_EVENT_TRANSITION", "Cannot transition from " + e.getStatus() + " to " + next);
        e.setStatus(next); e.setUpdatedAt(clock.instant());
        return EventMapper.view(e);
    }
    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public SaleState lockForTierChange(UUID id) {
        Event e = lock(id);
        return new SaleState(e.getStatus(), e.getSaleStartTime());
    }
    @Override public void requireExists(UUID id) { find(id); }
    private Event find(UUID id) { return events.findById(id).orElseThrow(EventService::missing); }
    private Event lock(UUID id) { return events.lockById(id).orElseThrow(EventService::missing); }
    private static ApiException missing() { return new ApiException(HttpStatus.NOT_FOUND, "EVENT_NOT_FOUND", "Event not found"); }
    private void validate(WriteEvent r) {
        if (!r.endTime().isAfter(r.startTime()) || r.saleEndTime().isAfter(r.startTime())
                || !r.saleStartTime().isBefore(r.saleEndTime()))
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_EVENT_DATES", "Require endTime > startTime and saleStartTime < saleEndTime <= startTime");
    }

    @Override
    public void requireOnSale(UUID id, Instant now) {
        Event event = find(id);
        if (event.getStatus() != EventStatus.PUBLISHED || now.isBefore(event.getSaleStartTime()) || now.isAfter(event.getSaleEndTime()))
            throw new ApiException(HttpStatus.CONFLICT, "SALE_NOT_OPEN", "Event is not on sale");
    }
}
