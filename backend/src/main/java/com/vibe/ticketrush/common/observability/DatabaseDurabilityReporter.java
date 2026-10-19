package com.vibe.ticketrush.common.observability;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Instant;
import javax.sql.DataSource;
import org.springframework.stereotype.Component;

/** Reads durability GUCs through a connection borrowed from the application Hikari pool. */
@Component
public class DatabaseDurabilityReporter {
    private static final Logger log = LoggerFactory.getLogger(DatabaseDurabilityReporter.class);
    private final DataSource dataSource;

    public DatabaseDurabilityReporter(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    public DurabilitySnapshot snapshot() {
        try (Connection connection = dataSource.getConnection()) {
            connection.setReadOnly(true);
            try (Statement statement = connection.createStatement()) {
                String sync = setting(statement, "synchronous_commit");
                String fsync = setting(statement, "fsync");
                Instant observedAt = Instant.now();
                log.info("database_durability_backend_connection synchronous_commit={} fsync={}", sync, fsync);
                return new DurabilitySnapshot(sync, fsync, observedAt);
            }
        } catch (Exception error) {
            throw new IllegalStateException("Could not read PostgreSQL durability settings through Hikari", error);
        }
    }

    private String setting(Statement statement, String name) throws Exception {
        try (ResultSet result = statement.executeQuery("SHOW " + name)) {
            if (!result.next()) {
                throw new IllegalStateException("PostgreSQL returned no value for " + name);
            }
            return result.getString(1);
        }
    }

    public record DurabilitySnapshot(String synchronousCommit, String fsync, Instant observedAt) { }
}
