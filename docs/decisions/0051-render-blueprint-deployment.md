# 0051: Render Blueprint deployment

## Context

TicketRush needs a reproducible free portfolio deployment. Render does not offer
free Private Services, while the full application needs RabbitMQ, Redis, and an
email test inbox in addition to the backend.

## Options

- Pay for the full private-service stack.
- Use free web services, Render Postgres and Key Value, and disable messaging.
- Replace RabbitMQ/email with external services.

## Decision

Use `render.yaml` to create a free frontend, free backend, free Postgres, and
free Render Key Value in one region. The demo profile disables RabbitMQ relay,
consumer and email delivery. Render injects service addresses and generated
secrets. The backend entrypoint translates managed Postgres and Key Value URLs
into the existing Spring variables.

## Consequences

No credentials are committed. The frontend retains same-origin cookies and
WebSocket origin validation while its server-side proxy calls the backend's
public URL. The demo uses Valkey rather than Redis 7.4 and intentionally omits
asynchronous delivery. Free services can sleep, Key Value data is volatile, and
the free Postgres database expires after 30 days. The paid deployment is still
required to demonstrate RabbitMQ outbox delivery and email notifications.
