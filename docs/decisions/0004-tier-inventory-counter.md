# ADR 0004: Inventory as a counter on ticket_tiers

Status: Accepted

## Context

Week 2 models general-admission capacity. Reservations, ticket assignment and
sales are later work. Remaining inventory must have one authoritative value.

## Options

- A row per ticket: supports assigned seats and individual ticket history, but
  requires O(capacity) rows, larger indexes, more insertion work and multi-row
  locking for bulk capacity and booking operations.
- A counter per tier: O(tiers) storage and a single row update; the popular tier
  becomes a contention point and does not encode individual seats.

## Decision

Use available_quantity on ticket_tiers as the source of truth. On creation,
available=total. Existing committed quantity is derived as total-available.
Changing capacity uses exactly one conditional SQL UPDATE:

```sql
UPDATE ticket_tiers
SET available_quantity = available_quantity + (:total - total_quantity),
    total_quantity = :total, version = version + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE id = :id AND :total >= total_quantity - available_quantity;
```

The production statement also updates editable metadata in that same write.
PostgreSQL evaluates against the locked current row; Java never calculates or
persists the new available counter from a previous read. Zero updated rows is 409.
DB constraints independently enforce 0 <= available <= total, nonnegative price,
and positive per-order limits. Rejected writes leave metadata and version intact.

Event edits, lifecycle transitions and tier admin writes acquire the same event
row lock first. Tier lookup before that lock selects only immutable event_id;
mutable tier state is loaded after acquiring the lock. This prevents publishing
or moving a sale window from racing with the price/create checks. Modules cross
service interfaces, never repositories. Native updates clear the persistence
context; version is advanced explicitly because native SQL bypasses JPA @Version.

## Consequences

Admin writes to different tiers of one event serialize. This is acceptable for
infrequent administration; future booking throughput must be designed/measured
separately. Tests use 50 real threads and PostgreSQL, verify every returned version
and delta, then reconcile final stock. This proves capacity-edit correctness, not
booking/no-overselling correctness for a booking API that does not yet exist.
No Redis counter, ticket rows, reservation, order or payment behavior is introduced.
