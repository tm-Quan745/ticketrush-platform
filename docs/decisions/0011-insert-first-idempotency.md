# 0011: Insert-first request idempotency

## Context
Parallel HTTP retries must create one order and one payment initiation record. A process can stop after claiming a key.

## Options
Select then insert races without a unique constraint. One long transaction hides IN_PROGRESS from other requests. An independent claim plus atomic completion exposes retry semantics and permits crash recovery.

## Decision
Use PostgreSQL `INSERT ... ON CONFLICT DO NOTHING` with UNIQUE(user_id, endpoint, key). Canonical request hashing includes reservation ID and the mock scenario header; unrecognized client prices are ignored. Claim commits independently. A 30-second business transaction locks the claim and atomically writes order, item, payment initiation, and the exact response bytes. Same hash replays the stored status/body with `Idempotency-Replayed: true`; a different hash returns 422; active work returns 409. Errors roll back business writes and remove the claim. Process death leaves a 60-second lease; recovery deletes an expired lease with `FOR UPDATE SKIP LOCKED` before insert-first retry. Locked active work cannot be stolen. Keys expire after 24 hours and a scheduled job deletes unlocked expired rows.

## Consequences
Two transactions cost additional round trips. Claim UUID fencing prevents an old worker completing a replacement claim. The reusable service accepts a transaction-scoped action and stored response, independent of orders. Only successful responses are cached. The reservation's lazy expiry runs in a separate transaction so rejection cannot undo expiry. A different key cannot create a second order because reservation_id is unique.

Interview trap: a database unique constraint, not an application pre-check, decides who owns the key. A rolled-back insert cannot be used as durable IN_PROGRESS state.
