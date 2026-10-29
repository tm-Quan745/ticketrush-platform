# Deploying TicketRush on Render

## Scope

`render.yaml` deploys a free demo. The frontend and backend are public Render
Web Services. Postgres and the Redis-compatible cache remain private. The public
frontend keeps the existing same-origin Node proxy.

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
| `ticketrush-backend` | Public | Spring Boot API and scheduler |
| `ticketrush-postgres` | Private only | Transactional source of truth |
| `ticketrush-redis` | Private only | Valkey, Redis-protocol-compatible admission gate |

## Operational notes

Render Key Value is free but currently runs Valkey, a Redis-protocol-compatible
store. The free plan has 25 MB RAM and 50 connections, and its state is lost on
restart because free instances have no persistence. Redis is configured with
`noeviction` because the waiting room uses it as an admission gate; silent
eviction would weaken overload control.

The managed Postgres plan is free for a portfolio preview only and expires after
30 days. The demo profile disables RabbitMQ relay/consumer and email delivery,
so it preserves outbox writes but cannot demonstrate asynchronous outbox delivery
or email notifications. Upgrade to the paid Blueprint before presenting those
features. Mailpit is intentionally absent from the free deployment.

The frontend receives the backend private host and port from Render. The backend
receives the exact public frontend origin from Render for cookie and WebSocket
origin validation. Do not replace these references with hardcoded URLs.

## Post-deploy checks

1. Open `https://<frontend-service>.onrender.com/actuator/health`; it should
   return the proxied Spring Boot health response.
2. Register and log in. Reload the page to verify the secure refresh cookie.
3. Create a test event using a provisioned admin account, then complete one mock
   payment and verify its order status.
4. Check backend logs for successful Flyway migration and Redis connection.
