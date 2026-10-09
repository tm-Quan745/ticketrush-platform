# Conditional reservation transitions

Status: Accepted

## Context

Cancellation, expiry and future payment confirmation can race.

## Options

Read status then unconditionally save; optimistic entity version only; conditional UPDATE.

## Decision

Every transition requires status=HELD in SQL and checks the affected row count.
Only the winner restores stock for EXPIRED/CANCELLED, in the same transaction.
A terminal reservation has no outgoing transitions. Confirmation has no endpoint
and does not restore inventory. Locks permit checking owner and expiry consistently;
the conditional predicate remains the final transition guard.

## Consequences

Duplicate work is a no-op internally; cancellation exposes 409. Partial uniqueness
is enforced in the database rather than relying on an application precheck.
A failed insert or release rolls back its counter mutation. Interview focus:
checking status in Java alone is insufficient across application instances.
