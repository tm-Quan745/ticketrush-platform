# 0051: Render Blueprint deployment

## Context

TicketRush needs a reproducible portfolio deployment while preserving the
same-origin frontend proxy, Spring Boot monolith, PostgreSQL, Redis admission
gate, RabbitMQ outbox transport, and notification flow.

## Options

- Deploy frontend and backend independently and manually copy connection URLs.
- Use one Render Blueprint with private service references.
- Move the backend to serverless functions or replace infrastructure services.

## Decision

Use `render.yaml` to create a public frontend, private backend, managed
Postgres, Redis 7.4, RabbitMQ, and Mailpit in one region. Render injects service
addresses and generated secrets. The backend entrypoint translates the managed
Postgres connection URL into the existing Spring variables.

## Consequences

No credentials or public backend address are committed. The frontend retains
same-origin cookies and WebSocket origin validation. Redis remains version 7.4
in both local Compose and Render. Render Private Services have no free tier, so
Redis, RabbitMQ, Mailpit, and the backend require a paid deployment; the free
Postgres plan is suitable only for a temporary portfolio preview.
