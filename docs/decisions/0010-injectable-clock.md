# Injectable UTC Clock

Status: Accepted

## Context

Sale windows and expiry depend on time. Sleeping ten minutes makes tests slow
and flaky, while static Instant.now calls cannot be advanced deterministically.

## Options

Call system time directly; use database time for business deadlines; inject Clock.

## Decision

Provide Clock.systemUTC as a Spring bean and inject it in business services.
Pass the captured instant to predicates and timestamp writes. Reservation tests use
a thread-safe mutable Clock and advance it without sleeping. Existing event,
inventory, auth creation/token issuance and dev event seeding use the shared clock.
API error timestamps are diagnostic wall-clock timestamps, not business deadlines.

## Consequences

Expiry and inclusive sale boundaries are reproducible under concurrent tests.
Hosts still require synchronized clocks; this is not a distributed time service.
PostgreSQL TIMESTAMPTZ stores instants. Interview focus: time zone conversion does
not solve clock skew; Clock injection solves controllability, not synchronization.
