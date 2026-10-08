# ADR 0005: Expose coarse public availability

Status: Accepted

## Context

Exact stock is operational information and becomes stale immediately under load.
Public users need enough information to choose a tier; admins need exact counters.

## Options

- Publish exact available quantities: informative, but reveals sales/hold changes,
  makes scraping easier, and may imply a guarantee the API cannot provide.
- Hide all availability: less information for users choosing a tier.
- Expose three buckets: useful signals with less operational disclosure.

## Decision

Public DTOs contain AVAILABLE, LOW (<10%), or SOLD_OUT (available=0), and never
contain total_quantity, available_quantity or version. Exactly 10% is AVAILABLE;
zero capacity is SOLD_OUT. Ratio comparison uses long arithmetic, avoiding integer
division rounding and overflow. ADMIN inventory DTOs expose exact counters.

## Consequences

A bucket is only a snapshot, not a ticket guarantee. Public list/detail only show
PUBLISHED events, returning 404 for private drafts and terminal states. Dedicated
DTOs and integration assertions prevent accidental entity/stock serialization.
Future caching must account for availability staleness; none is added now.
