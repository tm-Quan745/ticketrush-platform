# Pessimistic tier serialization before a transaction

## Context

The pessimistic reservation strategy uses PostgreSQL `SELECT ... FOR UPDATE` on
one ticket tier. With many same-tier callers, each waiter opened a transaction
and consumed a Hikari connection while waiting for the same row lock. The real
200-thread PostgreSQL invariant test exhausted the 40-connection test pool even
with a 30-second acquisition timeout.

## Options

1. Increase the production pool or its timeout.
2. Return a pool timeout to callers.
3. Serialize same-tier pessimistic work before opening its transaction, while
   retaining the database lock for cross-instance correctness.

## Decision

For `strategy=pessimistic`, `ReservationService` uses 256 local lock stripes by
tier before it opens `ReservationTransactions.create`. Callers for other tiers
can proceed concurrently. PostgreSQL remains the authoritative lock across
instances; the local stripe only removes same-instance connection-pool lock
convoys. The test profile has a 30-second Hikari acquisition timeout so the
real 200-thread invariant test can wait for its bounded queue. Production stays
at 1,500 ms and maps acquisition failure to its existing retryable response.

## Consequences

The pessimistic option is deliberately lower-throughput for one hot tier, but
it avoids consuming one JDBC connection per waiter. A hash collision may
serialize two unrelated tiers within one instance; 256 stripes keeps that
trade-off small without an unbounded lock map. This does not replace PostgreSQL
locking or make multi-instance requests depend on JVM-local state.
