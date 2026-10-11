package com.vibe.ticketrush.event.service;

import com.vibe.ticketrush.event.repository.EventRepository;
import com.vibe.ticketrush.event.domain.*;
import com.vibe.ticketrush.common.service.ApiException;
import com.vibe.ticketrush.queue.service.QueueProperties;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

@Service
@Transactional(readOnly=true)
public class WaitingRoomEventService implements WaitingRoomEvents {
    private final EventRepository events;
    private final QueueProperties properties;
    public WaitingRoomEventService(EventRepository events,QueueProperties properties) { this.events=events; this.properties=properties; }
    public Settings settings(UUID id) { return view(events.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,"EVENT_NOT_FOUND","Event not found"))); }
    public List<UUID> enabledEvents() { return events.waitingRoomEvents(); }
    @Transactional
    public Settings configure(UUID id,boolean enabled,int rate,String mode) {
        Event event=events.lockById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,"EVENT_NOT_FOUND","Event not found"));
        event.setWaitingRoomEnabled(enabled); event.setWaitingRoomRate(rate); event.setWaitingRoomMode(mode);
        return view(event);
    }
    private Settings view(Event e) {
        return new Settings(e.getId(),e.isWaitingRoomEnabled(), e.getWaitingRoomRate()==null ? properties.rate():e.getWaitingRoomRate(),
            e.getWaitingRoomMode()==null ? properties.mode():e.getWaitingRoomMode(), e.getSaleStartTime(),e.getSaleEndTime(),e.getStatus()==EventStatus.PUBLISHED);
    }
}
