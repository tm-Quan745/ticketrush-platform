package com.vibe.ticketrush.common.observability;

import java.time.Instant;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Internal load-test probe. It is not created outside the loadtest and test profiles. */
@RestController
@Profile({"loadtest", "test"})
public class LoadtestDurabilityController {
    private final DatabaseDurabilityReporter reporter;

    public LoadtestDurabilityController(DatabaseDurabilityReporter reporter) {
        this.reporter = reporter;
    }

    @GetMapping("/internal/loadtest/durability")
    public Response durability() {
        DatabaseDurabilityReporter.DurabilitySnapshot snapshot = reporter.snapshot();
        return new Response(snapshot.synchronousCommit(), snapshot.fsync(), snapshot.observedAt());
    }

    public record Response(String synchronousCommit, String fsync, Instant observedAt) { }
}
