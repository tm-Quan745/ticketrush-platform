# Deploying TicketRush on Render

## Scope

`render.yaml` deploys the existing modular monolith without publishing the
backend, Postgres, RabbitMQ, Redis-compatible cache, or Mailpit to the public
internet. The public frontend keeps the existing same-origin Node proxy.

## Before creating the Blueprint

1. Run `python scripts/security/scan.py` from the repository root.
2. Run `npm --prefix frontend run lint`, `npm --prefix frontend test`, and
   `npm --prefix frontend run build`.
3. Run `mvn -B -ntp -f backend/pom.xml verify` when Docker is available for the
   Testcontainers integration tests.
4. Commit these changes and push the intended branch only after the security
   gate passes.

## Create the Blueprint

1. In Render, create a Blueprint and select the pushed repository branch.
2. Select `render.yaml` at the repository root.
3. Review the generated resources and choose an affordable region and plan
   before applying. All resources must remain in one region.
4. Open the frontend service URL after both frontend and backend are healthy.

Render creates `JWT_SECRET`, `PAYMENT_WEBHOOK_SECRET`, RabbitMQ credentials,
and database credentials. They are never stored in this repository.

## Resource layout

| Resource | Visibility | Purpose |
|---|---|---|
| `ticketrush-frontend` | Public | React assets and same-origin proxy |
| `ticketrush-backend` | Private | Spring Boot API, scheduler, outbox consumer |
| `ticketrush-postgres` | Private only | Transactional source of truth |
| `ticketrush-redis` | Private only | Redis 7.4 admission gate |
| `ticketrush-rabbitmq` | Private only | Outbox and notification messages |
| `ticketrush-mailpit` | Private only | Demo email capture |

## Operational notes

The Blueprint runs Redis 7.4 as a Render Private Service to preserve the
project's agreed stack. It uses the smallest private-service plan, which is
currently paid. Redis is configured with `noeviction` because the waiting room
uses it as an admission gate; silent eviction would weaken overload control.

The managed Postgres plan is free for a portfolio preview only. Upgrade the
database and all private services before relying on this deployment for a public
demo. Redis and RabbitMQ have persistent disks because losing their state can
weaken admission control or discard unconsumed outbox messages. Mailpit is a
test inbox, not a real outbound mail provider.

The frontend receives the backend private host and port from Render. The backend
receives the exact public frontend origin from Render for cookie and WebSocket
origin validation. Do not replace these references with hardcoded URLs.

## Post-deploy checks

1. Open `https://<frontend-service>.onrender.com/actuator/health`; it should
   return the proxied Spring Boot health response.
2. Register and log in. Reload the page to verify the secure refresh cookie.
3. Create a test event using a provisioned admin account, then complete one mock
   payment and verify its order status.
4. Check backend logs for successful Flyway migration, Redis connection, and
   RabbitMQ topology declaration.
