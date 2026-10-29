package com.vibe.ticketrush.event;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

@Testcontainers(disabledWithoutDocker = true)
class DbeaverSeedIntegrationTest {
    @Container static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17-alpine");

    @Test void seedsBookableVndEventsAndResetsDataWithoutRemovingSchemaOrRoles() throws Exception {
        var flyway = Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword()).load();
        flyway.migrate();
        Path scripts = Path.of(System.getProperty("basedir", ".")).toAbsolutePath()
                .resolve("../infrastructure/scripts/dbeaver").normalize();
        String seed = Files.readString(scripts.resolve("02-seed-vietnam-concerts.sql")).replace("\uFEFF", "");
        String reset = Files.readString(scripts.resolve("01-reset-all-data.sql")).replace("\uFEFF", "");
        try (Connection connection = DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
             var statement = connection.createStatement()) {
            long appliedMigrations = count(connection, "SELECT count(*) FROM flyway_schema_history WHERE success");
            assertThat(appliedMigrations).isPositive();
            statement.execute(seed);
            assertThat(count(connection, "SELECT count(*) FROM events WHERE status='PUBLISHED' AND sale_start_time<now() AND sale_end_time>now()")).isEqualTo(16);
            assertThat(count(connection, "SELECT count(*) FROM ticket_tiers WHERE currency='VND' AND price>=350000")).isEqualTo(48);
            assertThat(count(connection, "SELECT count(*) FROM event_tier_sections")).isEqualTo(48);
            assertThat(count(connection, "SELECT count(*) FROM seats")).isEqualTo(200);
            assertThat(count(connection, "SELECT count(*) FROM event_seats WHERE status='AVAILABLE' AND reservation_id IS NULL AND expires_at IS NULL")).isEqualTo(3200);
            assertThat(count(connection, "SELECT count(*) FROM ticket_tiers WHERE inventory_mode='COUNTER' AND available_quantity=500 AND total_quantity=500")).isEqualTo(16);
            assertThat(count(connection, "SELECT count(*) FROM ticket_tiers WHERE inventory_mode='SEATED' AND (available_quantity<>0 OR total_quantity<>0)")).isZero();
            assertThat(count(connection, "SELECT count(*) FROM events e WHERE (SELECT count(*) FROM event_seats s WHERE s.event_id=e.id)<>200")).isZero();

            assertThrows(SQLException.class, () -> statement.execute(seed));
            statement.execute("ROLLBACK");
            assertThat(count(connection, "SELECT count(*) FROM events")).isEqualTo(16);

            statement.execute("INSERT INTO users(id,email,password_hash) VALUES(gen_random_uuid(),'seed-test@example.test','not-a-login-hash')");
            statement.execute("INSERT INTO user_roles SELECT id,1 FROM users");
            statement.execute(reset);
            assertThat(count(connection, """
                SELECT (SELECT count(*) FROM events) + (SELECT count(*) FROM ticket_tiers)
                     + (SELECT count(*) FROM venues) + (SELECT count(*) FROM sections)
                     + (SELECT count(*) FROM seats) + (SELECT count(*) FROM event_seats)
                     + (SELECT count(*) FROM users) + (SELECT count(*) FROM user_roles)
                """)).isZero();
            assertThat(count(connection, "SELECT count(*) FROM roles")).isEqualTo(3);
            assertThat(count(connection, "SELECT count(*) FROM flyway_schema_history WHERE success")).isEqualTo(appliedMigrations);
            assertThat(flyway.info().pending()).isEmpty();
            flyway.validate();
            statement.execute(seed);
            assertThat(count(connection, "SELECT count(*) FROM events")).isEqualTo(16);
        }
    }

    private static long count(Connection connection, String sql) throws SQLException {
        try (var statement = connection.createStatement(); var result = statement.executeQuery(sql)) {
            result.next();
            return result.getLong(1);
        }
    }
}
