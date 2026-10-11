# ADR 0025: Sorted-set waiting room with global atomic admission

## Context
Protect the reservation path and give authenticated users a position without one
queue entry per HTTP retry. Several application instances share one sale.

## Options
Per-instance queues, message-broker queues, Redis sorted sets; polling versus push.

## Decision
One sorted-set member per user/event; INCR produces strictly increasing scores.
Redis-time heartbeats remove stale members. One Lua admission call checks a shared
budget, pops a batch, and creates 256-bit random tokens under user/event-specific
keys. Tokens last 10 minutes. FIFO is default; lottery shuffles the pre-open live
cohort once, placing later joins behind it. Poll every 2 seconds. Pause admissions
when all tiers are sold out or the sale is closed.

## Consequences
No double admission or per-instance budget multiplication. Polling is easy to operate
but adds reads, bounded by the polling limiter. Queue/token loss requires rejoining;
neither represents ownership of tickets. Sold-out status is explicit. Very large
lotteries/stale cleanup need bounded/batched designs in a later scaling milestone.
