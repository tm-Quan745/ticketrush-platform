package com.vibe.ticketrush.event.service;

import com.vibe.ticketrush.event.dto.EventDtos.WriteEvent;
import com.vibe.ticketrush.event.domain.EventStatus;
import com.vibe.ticketrush.inventory.dto.TierDtos.WriteTier;
import com.vibe.ticketrush.inventory.service.*;
import org.springframework.boot.*;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.util.*;

/** One tagged event, no accounts; never runs in demo/loadtest/prod, even with dev also active. */
@Component
@Profile("dev & !prod & !demo & !loadtest")
@Order(10)
public class DevSeatedEventSeeder implements ApplicationRunner {
    public static final String TAG="[dev-seated-v1]";
    private final JdbcTemplate jdbc;
    private final EventService events;
    private final InventoryService inventory;
    private final VenueOperations venues;
    private final Clock clock;
    public DevSeatedEventSeeder(JdbcTemplate jdbc,EventService events,InventoryService inventory,VenueOperations venues,Clock clock) {
        this.jdbc=jdbc;this.events=events;this.inventory=inventory;this.venues=venues;this.clock=clock;
    }
    @Override @Transactional public void run(ApplicationArguments arguments) {
        jdbc.execute("SELECT pg_advisory_xact_lock(297002)");
        if(jdbc.queryForObject("SELECT count(*) FROM events WHERE description=?",Long.class,TAG)>0)return;
        var venue=venues.venues().stream().filter(v->v.templateKey().equals("ticketrush-stadium")&&v.templateVersion()==1).findFirst().orElseThrow();
        var now=clock.instant();var start=now.plusSeconds(30*86400);var end=start.plusSeconds(7200);var saleEnd=start.minusSeconds(86400);
        var draft=events.create(new WriteEvent(TAG+" Stadium",TAG,venue.name(),null,null,start,end,now.plusSeconds(3600),saleEnd,venue.id()),null);
        List<SeatingAdministration.Mapping> mappings=new ArrayList<>();
        for(var section:venues.venue(venue.id()).sections()) {
            boolean ga=section.type().equals("GA");
            var tier=inventory.create(draft.id(),new WriteTier(section.name(),null,ga?8000L:12000L,"USD",ga?500:0,6,ga?"COUNTER":"SEATED"));
            mappings.add(new SeatingAdministration.Mapping(section.id(),tier.id()));
        }
        venues.map(draft.id(),new SeatingAdministration.SectionMapping(mappings));
        events.update(draft.id(),new WriteEvent(draft.title(),TAG,venue.name(),null,null,start,end,now.minusSeconds(60),saleEnd,venue.id()));
        events.transition(draft.id(),EventStatus.PUBLISHED);
    }
}
