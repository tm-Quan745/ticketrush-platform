package com.vibe.ticketrush.outbox.controller;

import com.vibe.ticketrush.outbox.domain.*;
import com.vibe.ticketrush.outbox.repository.OutboxRepository;
import java.time.Clock;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/v1/admin/outbox")
public class OutboxAdminController {
    private final OutboxRepository events; private final Clock clock;
    public OutboxAdminController(OutboxRepository events,Clock clock) { this.events=events;this.clock=clock; }
    @GetMapping public List<OutboxEvent> list(@RequestParam(defaultValue="FAILED") OutboxStatus status,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { if(page<0||size<1||size>100) throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST); return events.list(status,page,size); }
    @PostMapping("/{id}/retry") public ResponseEntity<Void> retry(@PathVariable UUID id) { return events.retry(id,clock.instant())?ResponseEntity.noContent().build():ResponseEntity.notFound().build(); }
}
