package com.vibe.ticketrush.event;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.*;
import java.sql.*;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;

@Testcontainers
class MigrationIntegrationTest {
    @Container static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17-alpine");
    @Test void v2PreservesLegacyDataAndConvertsMajorToMinorUnits() throws Exception {
        Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .target("1").load().migrate();
        UUID event = UUID.randomUUID(); UUID tier = UUID.randomUUID();
        try (Connection c = DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())) {
            try (var ps = c.prepareStatement("INSERT INTO events(id, name, starts_at) VALUES (?, 'Legacy', now())")) {
                ps.setObject(1, event); ps.executeUpdate();
            }
            try (var ps = c.prepareStatement("INSERT INTO ticket_tiers(id, event_id, name, price, total_quantity, available_quantity) VALUES (?, ?, 'Legacy tier', 12.34, 100, 40)")) {
                ps.setObject(1, tier); ps.setObject(2, event); ps.executeUpdate();
            }
            var flyway = Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword()).load();
            assertThat(flyway.migrate().migrationsExecuted).isEqualTo(1);
            flyway.validate();
            try (var statement = c.createStatement(); var rs = statement.executeQuery("SELECT title, status, end_time > start_time AS valid, created_by FROM events")) {
                assertThat(rs.next()).isTrue(); assertThat(rs.getString("title")).isEqualTo("Legacy");
                assertThat(rs.getString("status")).isEqualTo("DRAFT"); assertThat(rs.getBoolean("valid")).isTrue();
                assertThat(rs.getObject("created_by")).isNull();
            }
            try (var statement = c.createStatement(); var rs = statement.executeQuery("SELECT price, currency, available_quantity, total_quantity FROM ticket_tiers")) {
                assertThat(rs.next()).isTrue(); assertThat(rs.getLong("price")).isEqualTo(1234);
                assertThat(rs.getString("currency")).isEqualTo("USD");
                assertThat(rs.getInt("available_quantity")).isEqualTo(40); assertThat(rs.getInt("total_quantity")).isEqualTo(100);
            }
        }
    }
}
