package com.vibe.ticketrush.event.dto;
import com.vibe.ticketrush.event.domain.Event;
import com.vibe.ticketrush.event.dto.EventDtos.*;
public final class EventMapper {
    private EventMapper() {}
    public static EventView view(Event e) {
        return new EventView(e.getId(), e.getTitle(), e.getDescription(), e.getVenueName(),
                e.getVenueAddress(), e.getImageUrl(), e.getStartTime(), e.getEndTime(),
                e.getSaleStartTime(), e.getSaleEndTime(), e.getStatus(), e.getCreatedAt(), e.getUpdatedAt());
    }
    public static void apply(Event e, WriteEvent r) {
        e.setTitle(r.title().trim()); e.setDescription(r.description());
        e.setVenueName(r.venueName()); e.setVenueAddress(r.venueAddress()); e.setImageUrl(r.imageUrl());
        e.setStartTime(r.startTime()); e.setEndTime(r.endTime());
        e.setSaleStartTime(r.saleStartTime()); e.setSaleEndTime(r.saleEndTime());
    }
}
