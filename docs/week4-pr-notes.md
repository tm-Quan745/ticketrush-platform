# Orders, signed mock payments, and request idempotency

Create owned orders from unexpired reservations with server-computed totals and
immutable item snapshots. Signed HTTP webhooks atomically deduplicate events,
confirm/reacquire inventory, transition orders and payments, and issue tickets.
Cancellation, expiry and refunds share guarded transitions and reservation-first
locking. Durable payment initiation records support mock callback redispatch after
restart. Development-only scenarios exercise duplicate, delayed, invalid and
out-of-order delivery. No Week 5 Redis reservation, RabbitMQ, outbox or email
implementation is included.

## Reviewer attention

- ADR 0013 resolves contradictory transition requirements by allowing signed late
  success to honor EXPIRED/CANCELLED orders within grace after conditional stock
  reacquisition. Cancellation can initially return 200 before a later charge is
  honored. If stock is gone or grace elapsed, the signed refund flow completes.
- Idempotency claims commit separately; business data and stored response commit
  together. The lease is fenced by claim UUID and cannot steal a locked worker.
- Payment events and all business effects share one transaction. Internal errors
  return 500, never a misleading conflict response that suppresses provider retry.
- Week 3 reservation-only tests retain their inventory assertion because their
  internal confirm hook deliberately bypasses purchasing. Week 4 tests assert both
  inventory and VALID-ticket reconciliation. This does not relax the purchase invariant.

## Mutation sanity check actually executed

Command: `./infrastructure/week4-mutation.ps1`.

1. Temporarily removed UNIQUE(provider_event_id) in V4. The real HTTP
   `twentyDuplicateWebhooks` test failed: PostgreSQL rejected `ON CONFLICT` because
   its required unique constraint was absent; callbacks returned 500 instead of 200.
   This mutation checks the query/schema dependency as well as webhook assertions.
2. Temporarily replaced the payment transition's expected-status predicate with an
   always-true predicate while preserving bind parameters. The
   `failureDuplicatesAndOutOfOrder` test failed with expected SUCCEEDED, actual FAILED.
3. Both sources were restored in finally. The build and ordinary tests were rerun
   against restored source. Exact summaries are in [verification](verification.md).

Five consecutive concurrency runs passed, each containing six tests including
100 barrier-started payment/expiry races. See verification for full build output,
durations, Compose smoke results and log locations. These notes are ready for the
eventual pull request; this task does not create or publish a pull request.
