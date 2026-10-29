# ADR 0046: WebSocket invalidations for order notifications

## Context

ADR 0043 presents the latest 50 owned orders as notifications. Minute polling
delays payment, cancellation, expiry, refund and manual-review updates.

## Options

1. Keep polling only.
2. Native WebSocket invalidations and authenticated REST snapshots.
3. STOMP with a broker relay and a persistent notification inbox.

## Decision

Use option 2, retaining the existing Spring/React architecture. Add Spring Boot's
WebSocket starter; browsers use their native WebSocket implementation.
`/api/v1/notifications/ws` accepts an initial JSON frame
`{"type":"authenticate","token":"<access token>"}` within five seconds.
Validate the JWT with the existing decoder, require USER and a UUID subject,
and close at token expiry. Never put credentials in URLs or browser storage.
No client-selected subscriptions or business commands are supported.
Configure exact browser origins through `NOTIFICATION_WS_ORIGINS`.

Outbox insertion publishes an in-process order event within the same transaction.
An AFTER_COMMIT listener marks only the owner's connected sessions dirty.
Rollback never invalidates clients. A one-second scheduler coalesces dirty flags
and sends `orders.changed`; `ready` also triggers a snapshot fetch to close the
connection establishment gap. The business transaction performs no socket I/O.
JWT deadlines use wall time, matching the JWT decoder, not the business test clock.

Sessions are capped at 1000 per instance; incoming frames at 4096 bytes. Concurrent
sends use Spring's ConcurrentWebSocketSessionDecorator (1s send limit, 4096-byte
buffer). Twenty-second heartbeats let browsers detect dead connections. Browser
reconnect uses jittered exponential backoff and obtains current credentials via
the existing authenticated API and refresh-token rotation. Disconnect on unmount.
Keep visibility-aware minute polling and respect Retry-After; coalesce refreshes
arriving while a fetch is in progress. Read state remains per-account/browser.

The Node same-origin proxy forwards HTTP Upgrade and bidirectional socket bytes,
preserves Origin and strips forwarded headers. Production requires HTTPS/WSS and
the public frontend origin in the allowlist.
Compose passes this allowlist to the backend and defaults to frontend port 3100.
When changing FRONTEND_PORT, also update NOTIFICATION_WS_ORIGINS.

## Consequences

- Updates normally reach connected users in about one second plus REST latency.
- Delivery is best effort and signals contain no order details. Duplicate signals
  are harmless because REST snapshots and existing read IDs determine UI state.
- This is a single-instance push implementation. An event committed on another
  instance or during a crash is recovered by the minute poll or reconnect fetch.
  Multi-instance realtime requires a separate Redis Pub/Sub or RabbitMQ fan-out
  design; the existing competing email consumer is not a broadcast mechanism.
- No durable inbox, cross-device read synchronization, marketing notifications or
  replay of intermediate order states is added.
- A stateless access token remains valid until expiry after logout, as in existing
  REST authentication; the browser closes its connection when the user logs out.
- Integration tests use real WebSocket clients, PostgreSQL and Redis containers,
  including concurrent committing threads, rollback, owner isolation and auth.

## Reference

[Spring WebSocket server API](https://docs.spring.io/spring-framework/reference/6.2/web/websocket/server.html)
