# 0012: Transactional webhook deduplication

## Context
Providers retry and deliver events concurrently or out of order. An acknowledged event must never leave half-applied inventory or tickets.

## Options
An in-memory set is lost on restart. Deduplication in another transaction can permanently lose business changes after a crash. Database deduplication in the business transaction rolls back both together.

## Decision
Verify HMAC-SHA256 over `timestamp + "." + raw request bytes` before parsing JSON. Require timestamps within a configurable symmetric tolerance and compare decoded signatures with `MessageDigest.isEqual`. Secrets come from environment variables. Insert provider_event_id with a unique constraint first. Duplicates return 200 without changing business state. The event, conditional payment/order/reservation transitions, inventory, and ticket issuance share one transaction. The service proxy commits before the controller returns 200. Invalid/unsupported payloads return 400, invalid signatures/timestamps 401, unknown payment references 404, unexpected refunds 422; unexpected/transient processing failures return 500 for retry. Amount/currency mismatch commits a review flag, fails a pending order, and releases its hold; it never marks an order PAID.

All lifecycle writers lock reservation before order. Conditional UPDATE row counts remain mandatory even with locks. Expiry synchronously emits an in-process event whose listener expires the pending order in the same transaction. This is not an outbox or broker event. Ticket UNIQUE(order_id,ticket_index) guards issuance independently. Read-only reconciliation uses REPEATABLE_READ across inventory and ticket audit queries.

## Consequences
Database locks serialize conflicting lifecycle operations and bound the concurrency design to PostgreSQL. Failed events after SUCCEEDED cannot overwrite payment state. Mock callbacks start after commit on a bounded worker pool, use real HTTP, and retry 5xx/network failures. INITIATED payments and pending refunds are redispatched from durable payment records after a 60-second retry lease, including after restart. A real gateway must implement provider-side idempotency by order ID when replacing this mock. Week 5 outbox hooks are TODO comments only.

Interview trap: returning 200 before commit or committing the dedup row separately can silently lose a payment.
