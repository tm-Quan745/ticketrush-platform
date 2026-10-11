# ADR 0021: Redis admission, PostgreSQL authority

## Context
Hot sold-out inventory wastes SQL connections. Redis cannot atomically commit a
reservation, an order and an outbox event with PostgreSQL.

## Options
Make Redis authoritative and replicate asynchronously; or use it to reject requests
before the existing PostgreSQL transaction.

## Decision
Use an atomic Lua admission counter, then the Week 3 conditional UPDATE. Keep the
default strategy unchanged. Refund rejected/rolled-back attempts idempotently and
warm missing counters from SQL after fallback. Internal attempt IDs are not client
idempotency keys. All inventory return/reacquisition hooks execute after commit.

## Consequences
Sold-out requests avoid SQL. Successful requests add Redis round trips and can be
slower. Redis undercounts can reject legitimate sales; overcounts increase SQL
rejections but cannot oversell. The compensation guarantee lasts for the 24 h
attempt TTL. A process crash can leave drift until reconciliation.
