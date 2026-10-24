# ADR 0038: Real role screens and minimal administrative reads

## Context

M3b needs gate seat snapshots, administrative draft/cancelled event listings and
versioned seat state. The buyer compact snapshot intentionally omits versions and
identity. The user approved minimal read API additions with authorization tests.

## Decision

- GET /api/v1/admin/events?page=&size= lists all event lifecycle states, validated
  pagination (size 1..50); GET /api/v1/admin/events/{id} reads any state. Public
  catalog behavior remains published-only.
- GET /api/v1/admin/events/{id}/sections returns mappings and exact seated counts;
  GET /api/v1/admin/events/{id}/sections/{sectionId}/seats returns ordered geometry,
  current state and version for existing optimistic block/unblock commands.
- GET /api/v1/admin/events/{id}/waiting-room returns stored configuration so a
  settings form never pretends defaults are the current values.
- Existing gate responses add event/tier labels and the immutable ticket seat
  snapshot. They contain no buyer identity. STAFF and ADMIN can verify/check in;
  USER remains forbidden and anonymous remains unauthorized.
- Wallet fetches every page of orders/holds, then issued tickets for paid/refund
  states. A failed page/ticket request is surfaced, never silently omitted.
- Dashboard counts come from complete real lists. There is no synthetic revenue,
  capacity, traffic or performance data. A future aggregate endpoint would avoid
  fetching large lists but is not necessary for the current scope.
- Invoice omits unavailable timestamps/taxes; ticket issue/use times come from
  persisted fields. QR is encoded locally from the server ticket code.

## Consequences and alternatives

Separate administrative reads preserve small, user-independent buyer snapshots.
The tradeoff is additional read endpoints and full-list dashboard cost; PostgreSQL
remains authoritative for mutations. Version conflicts refresh the seat grid and
clear selection. Existing signed payment webhook/refund/check-in serialization is
unchanged. Changing the gate role matrix is intentional for the approved M3b
STAFF/ADMIN policy, with both frontend and backend tests updated.

There is no new aggregate endpoint, payment shortcut, account seed in production,
transfer, notification center or batch-admit feature. SEATED prices are set when
creating tiers; the existing backend rejects subsequent seated tier updates, so
the UI does not expose an unsupported edit action.
