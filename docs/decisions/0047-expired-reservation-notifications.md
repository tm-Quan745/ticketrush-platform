# ADR 0047: Notify when ticket holds expire without an order

## Context

Order-only notifications omit reservations that expire before checkout creates an
order. All existing expiry paths already write `reservation.expired` in the same
transaction that releases inventory.

## Options

1. Infer expiry from a browser countdown.
2. Extend WebSocket invalidations and read existing owned reservation snapshots.
3. Add a durable notification inbox.

## Decision

Choose option 2. When inserting a `reservation.expired` outbox event, publish its
reservation payload as an application event. An AFTER_COMMIT listener marks only
the owner's sessions dirty and the existing scheduler sends `reservations.changed`.
Creation, cancellation and rollback do not generate expiry notifications. The
expiry transaction, inventory locking and idempotent release logic stay unchanged.

The notification center fetches the latest 50 owned reservations, then the latest
50 owned orders. This sequence matters: listing reservations can lazily expire
holds and change their orders. Display only server-confirmed EXPIRED reservations
without an order in the loaded order snapshot; existing order notifications cover
the other cases. Expired orders use the explicit hold-expiry message too. A paid
order supersedes its expired reservation in the UI, including late payment recovery.
Reservation notification IDs are stable and browser read state stays account-scoped.
The reservation entry links to its event so the user can select tickets again.

## Consequences

- Reconnect and minute polling recover missed signals within the snapshot window.
- No false expiry based only on browser time; notification latency includes the
  existing expiry job interval (30 seconds by default) or lazy expiry, then socket
  dispatch and REST latency. This is not an exact countdown alarm.
- Existing single-instance push and browser-local read-state limits still apply.
- This is a current-state notification view, not durable historical delivery.
- Tests cover owner isolation, rollback, real concurrent expiry calls with real
  PostgreSQL/Redis containers, one inventory release/outbox event, reconnect data,
  frontend duplicate suppression and late-payment precedence.
