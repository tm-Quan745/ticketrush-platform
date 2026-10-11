# ADR 0024: Feature-specific Redis outage policies

## Context
A dead Redis must not hang request threads or stop ordinary PostgreSQL ticket sales.
Some Redis state, such as a global admission budget, cannot safely be recreated locally.

## Options
Fail everything closed, fail everything open, or choose per feature.

## Decision
300 ms connection/command timeouts and a small local circuit breaker (open on first
connectivity failure, 5 s cooldown, one half-open probe). Inventory defaults to SQL
fallback; it can be configured closed. Cache falls through to SQL. Waiting room
fails 503, including token validation. Limiters default to bounded local token
buckets; login capacity is stricter. Policies can explicitly choose OPEN or CLOSED.

## Consequences
Disabled waiting-room events continue sales while Redis is down. Enabled events
require Redis recovery. Local rate limits multiply with replicas and cannot provide
a global outage guarantee. Recovery probes resume normal behavior; reconciliation
repairs inventory drift. Each fallback is logged and counted. No new circuit-breaker
library is needed for this small fail-fast state machine.
