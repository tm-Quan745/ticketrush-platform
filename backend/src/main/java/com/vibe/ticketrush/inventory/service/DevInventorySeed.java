package com.vibe.ticketrush.inventory.service;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.nio.charset.StandardCharsets;
import java.util.*;
@Service
@Profile("dev & !prod & !test")
public class DevInventorySeed implements InventorySeed {
    private final JdbcTemplate jdbc;
    public DevInventorySeed(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public void seedTiers(List<UUID> eventIds, int countPerEvent) {
        List<SeedTier> batch = new ArrayList<>(500);
        for (UUID eventId : eventIds) {
            for (int i = 0; i < countPerEvent; i++) {
                batch.add(new SeedTier(eventId, i));
                if (batch.size() == 500) { insert(batch); batch.clear(); }
            }
        }
        insert(batch);
    }
    private record SeedTier(UUID eventId, int number) {}
    private void insert(List<SeedTier> batch) {
        if (batch.isEmpty()) return;
        jdbc.batchUpdate("""
                INSERT INTO ticket_tiers(id, event_id, name, price, currency, total_quantity,
                    available_quantity, max_per_order)
                VALUES (?, ?, ?, ?, 'USD', 1000, 1000, 5) ON CONFLICT DO NOTHING
                """, batch, 500, (ps, t) -> {
            UUID id = UUID.nameUUIDFromBytes(("ticketrush:dev:tier:" + t.eventId() + ":" + t.number())
                    .getBytes(StandardCharsets.UTF_8));
            ps.setObject(1, id); ps.setObject(2, t.eventId()); ps.setString(3, "Tier " + (t.number() + 1));
            ps.setLong(4, (t.number() + 1L) * 2500);
        });
    }
}
