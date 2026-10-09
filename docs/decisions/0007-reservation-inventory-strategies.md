# Reservation inventory strategies

Status: Accepted

## Context

Hot tiers need atomic stock deduction without overselling. Existing tiers have a version column.

## Options

| Strategy | Correctness | Contention and throughput | Failure modes | Complexity |
|---|---|---|---|---|
| Conditional UPDATE | Predicate and row lock make decrement atomic | One UPDATE; short lock hold; expected good hot-tier throughput | Lock waits and deadlocks remain possible | Low |
| Optimistic @Version | Stale version rejects the entire transaction | Parallel reads; hot-tier retries amplify work; distributed tiers reduce conflicts | Retry storms, bounded retry exhaustion | Medium |
| Pessimistic FOR UPDATE | Fresh locked row serializes read/decrement | Lock waits serialize hot tier; independent tiers progress separately | Lock waits, timeout, deadlocks | Medium |

## Decision

Default to conditional-update. All strategies join the same reservation transaction,
and all counter updates increment version, including native SQL updates. Optimistic
conflicts retry the whole transaction with a new EntityManager, up to 20 attempts
with 2..99 ms jitter; exhaustion returns 503. Lock timeout is 3 seconds per acquisition.
No retry occurs inside a rollback-only transaction. A small retry counter supports
benchmark reporting, not a new monitoring architecture.

## Consequences

All three must pass the same PostgreSQL/thread suite. Unique active-hold violations
roll back stock deduction and map specifically to ALREADY_HELD. Validation cannot
leave a stale managed entity before pessimistic loading; clear the context first.
No production throughput claim follows from the rough comparison: see week3 benchmark.
Interview focus: atomic predicate vs read-then-write, retry transaction boundaries,
and why native writes must advance the optimistic version.
