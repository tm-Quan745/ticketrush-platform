package com.vibe.ticketrush.common.service;
import com.vibe.ticketrush.event.service.EventSeed;
import com.vibe.ticketrush.inventory.service.InventorySeed;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
@Component
@Profile("dev & !prod & !test")
@ConditionalOnProperty(name = "app.seed.enabled", havingValue = "true", matchIfMissing = true)
public class DevDataSeeder implements ApplicationRunner {
    private final EventSeed events;
    private final InventorySeed inventory;
    private final int eventCount;
    private final int tiersPerEvent;
    public DevDataSeeder(EventSeed events, InventorySeed inventory,
            @Value("${app.seed.events:50}") int eventCount, @Value("${app.seed.tiers-per-event:3}") int tiersPerEvent) {
        if (eventCount < 0 || eventCount > 100000 || tiersPerEvent < 0 || tiersPerEvent > 1000
                || (long) eventCount * tiersPerEvent > 1000000)
            throw new IllegalArgumentException("Seed limits: 0..100000 events, 0..1000 tiers/event, <=1000000 tiers");
        this.events = events; this.inventory = inventory;
        this.eventCount = eventCount; this.tiersPerEvent = tiersPerEvent;
    }
    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        inventory.seedTiers(events.seedEvents(eventCount), tiersPerEvent);
    }
}
