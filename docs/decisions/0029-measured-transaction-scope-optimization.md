# ADR 0029: Remove overlapping connections from order preparation

## Context

Week 7 baseline C on `eaf4898` failed all three repetitions. Median HTTP failure rate was
0.9760840998685939 and median dropped iterations was 1929. The JFR recording contains
Hikari connection-acquisition waits; PostgreSQL reports 83,438.41989299988 ms total over
1,302 guarded inventory updates in C-1. Both pool pressure and hot-row contention exist.
See the [baseline tables](../performance/tables.md) and
[deep JFR stacks](../performance/results/baseline-C-1-deep-profile.json).

Inspection found a specific source of avoidable pool pressure: order creation holds its
business transaction connection while `expireOwned()` starts a `REQUIRES_NEW` transaction.
A new regression test reproduced connection timeout with one application connection and
eight real threads using PostgreSQL and Redis Testcontainers. Flyway has a separate
connection source because its migration startup itself needs two connections.

## Options

1. Increase the pool. This can mask the nested-connection problem and increase database contention.
2. Include lazy expiry in the order transaction. Rejection would roll back ticket restoration.
3. Perform lazy expiry after the idempotency claim commits, before the business transaction starts.

## Decision

Use option 3 as one isolated optimization. Add a preparation callback to IdempotencyService;
the existing overload delegates with empty preparation. Replay and payload mismatch return
before preparation. Failed preparation abandons the claim through the existing failure path.
Order writes, payment creation, outbox rows and key completion still share one transaction.
Reservation state and ownership are checked again under the business transaction's lock.

## Consequences and validation

Each normal order request needs at most one connection at a time for these stages. Lazy
expiry remains independently committed, including when the order is rejected. This does
not remove hot-tier lock contention or repair the separately identified outbox routing defect.
The test also covers lazy-expiry persistence and replay without preparation side effects.

The initial test setup failed at Flyway startup and is not application evidence. After
separating Flyway connections, the unoptimized implementation failed with Hikari timeout
inside `PurchaseReservationService.expireOwned`. Post-change test and load measurements
are recorded in the [experiment log](../performance/log.md); no throughput gain is assumed.
