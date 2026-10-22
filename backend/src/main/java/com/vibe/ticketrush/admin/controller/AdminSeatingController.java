package com.vibe.ticketrush.admin.controller;

import com.vibe.ticketrush.inventory.service.VenueOperations;
import com.vibe.ticketrush.inventory.service.SeatingAdministration.*;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/v1/admin")
public class AdminSeatingController {
    private final VenueOperations seating;
    public AdminSeatingController(VenueOperations seating) { this.seating=seating; }
    @GetMapping("/venues") public List<Venue> venues() { return seating.venues(); }
    @GetMapping("/venues/{id}") public VenueDetail venue(@PathVariable UUID id) { return seating.venue(id); }
    @PutMapping("/events/{id}/section-tiers") public void map(@PathVariable UUID id,@Valid @RequestBody SectionMapping body) { seating.map(id,body); }
    @PostMapping("/events/{id}/seats/block") public Map<String,Object> block(@PathVariable UUID id,@Valid @RequestBody Block body) { return seating.block(id,body); }
}
