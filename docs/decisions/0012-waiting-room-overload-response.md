# Waiting-room status overload response

## Context

The waiting-room status endpoint is Redis-only, but a synchronized first poll from a large joined cohort can still overload Redis, Tomcat, or the load generator. The previous 2,500 requests/s burst recorded uncontrolled-looking client failures because the load script did not classify response codes.

## Options

1. Let Redis failures propagate as HTTP 500.
2. Return a controlled retryable response from the waiting-room boundary.
3. Make reservation admission fail open while Redis is unavailable.

## Decision

Status requests receive a controlled HTTP 503 with `WAITING_ROOM_UNAVAILABLE` and a randomized `Retry-After` of one or two seconds whenever the Redis guard cannot serve the waiting room. Rate limiting remains HTTP 429 with `Retry-After`. Clients spread their first poll uniformly over the `Retry-After` received during join and apply jitter to later polls. Reservation admission remains fail-closed: it requires a Redis-validated admission token.

The load test records status and application error code for checkout and burst requests so a future result can distinguish a controlled 429/503 from an unexpected 500.

## Consequences

The service avoids pretending an overload is an internal server defect and gives clients a bounded retry hint. `Retry-After` is advisory, so the front-end must preserve the per-user delay and must not turn waiting users into permanently allocated load-generator VUs.
