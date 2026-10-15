# ADR 0034: Jitter waiting-room poll intervals

## Context

Closed-loop polling gives many users the same `Retry-After`. They wake together and create a
short Redis/Tomcat burst even when the average request rate is modest.

## Options

Leave clients synchronized; use client-only jitter; or randomize the server-advised polling
interval per response.

## Decision

For a base interval above one second, the server returns an integer interval randomly chosen from
approximately +/-25% of that base. The body field and `Retry-After` header use the same value.
One-second intervals remain one second. Clients also add a random delay before their first status
poll, so an immediately joined cohort does not synchronize on its first request.

## Consequences

This spreads polling work without increasing average polling pressure or changing FIFO/admission
semantics. A user can wait up to 25% longer than the base advisory interval. The response value is
advisory; rate limiting remains the safety boundary.
