package com.vibe.ticketrush.event.service;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
@Service
@Profile("dev & !prod & !test")
public class DevEventSeed implements EventSeed {
    private final java.time.Clock clock;
    private final JdbcTemplate jdbc;
    public DevEventSeed(JdbcTemplate jdbc, java.time.Clock clock) { this.jdbc = jdbc; this.clock=clock; }
    public List<UUID> seedEvents(int count) {
        List<Integer> numbers = java.util.stream.IntStream.range(0, count).boxed().toList();
        Instant base = clock.instant().truncatedTo(ChronoUnit.SECONDS);
        jdbc.batchUpdate("""
                INSERT INTO events(id, title, description, venue_name, venue_address, start_time,
                    end_time, sale_start_time, sale_end_time, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PUBLISHED') ON CONFLICT (id) DO NOTHING
                """, numbers, 500, (ps, i) -> {
            Instant start = base.plus(i + 30L, ChronoUnit.DAYS);
            ps.setObject(1, id(i)); ps.setString(2, "Dev Event " + (i + 1));
            ps.setString(3, "Deterministic development fixture"); ps.setString(4, "TicketRush Hall");
            ps.setString(5, "Development venue"); ps.setTimestamp(6, Timestamp.from(start));
            ps.setTimestamp(7, Timestamp.from(start.plus(2, ChronoUnit.HOURS)));
            ps.setTimestamp(8, Timestamp.from(base.minus(1, ChronoUnit.DAYS)));
            ps.setTimestamp(9, Timestamp.from(start.minus(1, ChronoUnit.HOURS)));
        });
        return numbers.stream().map(DevEventSeed::id).toList();
    }
    private static UUID id(int i) {
        return UUID.nameUUIDFromBytes(("ticketrush:dev:event:" + i).getBytes(StandardCharsets.UTF_8));
    }
}
