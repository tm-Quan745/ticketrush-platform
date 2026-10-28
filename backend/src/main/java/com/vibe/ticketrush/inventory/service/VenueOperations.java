package com.vibe.ticketrush.inventory.service;

import java.util.*;
import com.vibe.ticketrush.inventory.service.SeatingAdministration.*;

/** Publication and administration boundary for the inventory-owned venue topology. */
public interface VenueOperations {
    VenueDetail createVenue(com.vibe.ticketrush.inventory.dto.VenueTemplateDtos.CreateVenue request);
    List<Venue> venues();
    VenueDetail venue(UUID id);
    void requireVenue(UUID id);
    void clearMapping(UUID event);
    void map(UUID event,SectionMapping request);
    void publish(UUID event,UUID venue);
    Map<String,Object> block(UUID event,Block request);
    List<Map<String,Object>> sections(UUID event);
    List<AdminSeat> adminSeats(UUID event,UUID section);
}
