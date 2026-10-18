package com.vibe.ticketrush.queue.controller;

import com.vibe.ticketrush.queue.service.WaitingRoomService;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Exposes short-lived admission pairs only in the isolated loadtest profile. */
@Profile("loadtest")
@RestController
@RequestMapping("/internal/loadtest/events")
public class LoadtestAdmissionController {
    private final WaitingRoomService queue;

    public LoadtestAdmissionController(WaitingRoomService queue) {
        this.queue=queue;
    }

    public record SeedRequest(@jakarta.validation.constraints.Size(min=1,max=5000)
            @jakarta.validation.constraints.NotNull java.util.List<@jakarta.validation.constraints.NotNull UUID> users) {}

    @org.springframework.web.bind.annotation.PostMapping("/{eventId}/waiting-room/seed")
    public java.util.Map<String,Integer> seed(
            @org.springframework.web.bind.annotation.PathVariable UUID eventId,
            @jakarta.validation.Valid @org.springframework.web.bind.annotation.RequestBody SeedRequest request) {
        return java.util.Map.of("seeded",queue.seedClosedQueue(eventId,request.users()));
    }

    @GetMapping("/{eventId}/waiting-room/admissions")
    public java.util.List<WaitingRoomService.AdmittedUser> newlyAdmitted(
            @org.springframework.web.bind.annotation.PathVariable UUID eventId,
            @RequestParam(defaultValue="100") int limit) {
        return queue.newlyAdmitted(eventId,limit);
    }
}
