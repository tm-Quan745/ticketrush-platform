# 0035: Tolerate transient Redis delays at the waiting-room front door

## Context

The 900-user join setup for `checkout-V20-cpu-1` produced waiting-room 503s when a small number of Redis commands timed out. The former process-local breaker opened after its first qualifying failure and remained open for five seconds, turning a transient delay into a queue-wide outage.

## Options

1. Keep the one-failure breaker and fail all front-door traffic while it is open.
2. Disable the breaker and allow each request to wait for Redis independently.
3. Keep a bounded breaker, but open it only after sustained failures in a count-based window.

## Decision

Use option 3. The load-test defaults use a 1,000 ms Redis command timeout and a count-based window of 100 calls, with at least 50 calls and a 50% failure rate before opening. The open wait remains configurable (`REDIS_CIRCUIT_COOLDOWN`, five seconds by default) and three successful half-open probes close it. The guard records calls, qualifying failures and state transitions.

The waiting-room join and status paths can return their existing controlled fallback response while Redis is unavailable. `POST /reservations` remains fail-closed: a Redis failure must not bypass its admission requirement.

## Consequences

A few slow Redis commands no longer reject an entire cohort. Sustained Redis failure still sheds front-door work and exposes its reason in metrics and logs. The 1,000 ms timeout can make individual degraded requests slower; it is intentionally limited to the load-test front-door design until measurements show whether separate client policies are needed.

This decision does not change Redis persistence. If a repeat capture shows AOF fsync or fork stalls, any `appendfsync` change will be evaluated explicitly for the load-test profile only.
