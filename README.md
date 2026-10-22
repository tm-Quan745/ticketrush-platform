# TicketRush

## Performance (Week 7)

One bounded sell-out run passed for a 5,000-entry FIFO cohort at 20 offered admission/checkout
opportunities per second: exactly 5,000 tickets sold, zero available/held, zero oversell,
verified FIFO/token binding, and all users accounted for as PAID or SOLD_OUT. The full backend
suite passed 111 tests. This is not a claim of 5,000 concurrent purchases or 20 paid orders/s;
calibration beyond 20/s and three successful repetitions were not done. Performance work is closed.
See the [final evidence and limitations](docs/performance/README.md#final-bounded-result-2026-10-18).

The [performance laboratory](docs/performance/README.md) provides an isolated bulk seeder, open-model
k6 scenarios, automatic SQL/API correctness verification, Prometheus/Grafana dashboards and measured
artifacts. See the [experiment log](docs/performance/log.md) for failures as well as successes.

```sh
python3 infrastructure/scripts/loadtest.py init
python3 infrastructure/scripts/loadtest.py up
make loadtest-smoke
```

On Windows use `python` instead of `python3`, or `make PYTHON=python loadtest-smoke`.
For the normal development stack set `METRICS_PASSWORD` and `GRAFANA_PASSWORD` in `.env` and run
`docker compose --profile observability up --build`. No frontend is added in Week 7.

## Historical foundation notes

Week 1 foundation and authentication for a Java 21 / Spring Boot modular monolith.
Frontend and future booking modules are placeholders only.

## Requirements

- Docker Engine / Docker Desktop running Linux containers and Docker Compose.
- For host-side development/tests: JDK 21 and Maven 3.9+.
- Free loopback ports: 5432, 6379, 5672, 15672, 8080.

If a local PostgreSQL already uses 5432, set `POSTGRES_PORT=15432` in `.env`.
This changes the host port only; the backend container still connects on 5432.

## Start with Docker Compose

Copy `.env.example` to `.env`, fill all four secret values, then run:

```sh
docker compose up --build --wait --wait-timeout 240
docker compose ps
curl http://localhost:8080/actuator/health
```

The required secrets are `POSTGRES_PASSWORD`, `REDIS_PASSWORD`,
`RABBITMQ_PASSWORD`, and `JWT_SECRET`. Generate each independently; never commit
`.env`. Example PowerShell setup (preserves an existing `.env` by refusing overwrite):

```powershell
if (Test-Path .env) { throw '.env already exists; edit it instead' }
$config = Get-Content .env.example -Raw
foreach ($name in 'POSTGRES_PASSWORD','REDIS_PASSWORD','RABBITMQ_PASSWORD','JWT_SECRET') {
    $bytes = [byte[]]::new(32)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $value = [Convert]::ToBase64String($bytes)
    $config = $config.Replace("$name=", "$name=$value")
}
Set-Content .env $config
```

On Unix, `openssl rand -base64 32` generates an individual suitable value.
JWT_SECRET must decode to at least 32 bytes. Do not reuse a secret across services.
Compose loads `.env` automatically. Plain `docker compose up` also starts all four
services after this initial setup; the backend runs Flyway automatically.

- API: [localhost:8080](http://localhost:8080)
- Swagger: [Swagger UI](http://localhost:8080/swagger-ui.html)
- RabbitMQ: [management UI](http://localhost:15672), credentials from `.env`
- Stop, retaining data: `docker compose down`

Database credentials initialize new volumes only. Editing `.env` does not change
credentials inside existing PostgreSQL/RabbitMQ volumes. Do not delete data to
resolve credentials; update the service credentials deliberately.

## Build and test

```sh
mvn -B -ntp -f backend/pom.xml clean verify
```

Tests start real PostgreSQL, Redis, and RabbitMQ containers on random ports. They
do not require `.env` or the Compose stack and do not skip when Docker is missing.
Secrets are generated at test runtime. Tests include auth lifecycle, input/error
contracts, authorization, expiry, concurrent registration/rotation, and concurrent
Redis rate limiting. GitHub Actions runs the same Maven command on Java 21.

To run the backend on the host, fill the root `.env`, start the dependencies,
and run Maven. Spring Boot imports `.env` automatically from the repository root
or its parent when the working directory is `backend/`; no manual shell export
is needed. OS environment variables still take precedence over file values.

```sh
docker compose up -d postgres redis rabbitmq
docker compose stop backend
mvn -f backend/pom.xml spring-boot:run -Dspring-boot.run.profiles=dev
```

When `POSTGRES_PORT` differs from 5432, set
`DB_URL=jdbc:postgresql://localhost:15432/ticketrush` (adjust port/database) for
host-side backend development in `.env`. Stopping the Compose backend avoids a
port 8080 conflict while the host backend runs. Use plain `KEY=value` entries in
`.env`, without shell `export` or surrounding quotes; Spring reads it as a
properties file. Missing `.env` is allowed for deployments that supply all
required settings through environment variables.

`DB_URL`, `REDIS_HOST`, `REDIS_PORT`, `RABBITMQ_HOST`, and `SPRING_PROFILES_ACTIVE`
can override defaults. Production must use `prod`, TLS, managed secrets, and a
reviewed proxy/client-IP configuration. Compose is a local development setup.

## Authentication API

| Method | Path | Body / authorization |
| --- | --- | --- |
| POST | `/api/v1/auth/register` | `email`, `password`; returns USER (201) |
| POST | `/api/v1/auth/login` | `email`, `password`; returns token pair |
| POST | `/api/v1/auth/refresh` | `refreshToken`; rotates token pair |
| POST | `/api/v1/auth/logout` | `refreshToken`; revokes it (204) |
| GET | `/api/v1/auth/me` | `Authorization: Bearer <accessToken>` |

Use a password with at least 12 characters and no more than 72 UTF-8 bytes. Store
the rotated refresh token; the old token cannot be reused. Logout revokes refresh
only; existing access tokens expire after 15 minutes. Registration grants USER
regardless of client input. ADMIN is provisioned by a trusted operator, for example
with this parameterized SQL (bind `$1` to the user's UUID):

```sql
INSERT INTO user_roles (user_id, role_id)
SELECT $1, id FROM roles WHERE name = 'ADMIN'
ON CONFLICT DO NOTHING;
```

## Structure and design

- `backend/`: Spring Boot, modules, Flyway V1, tests, Dockerfile.
- `frontend/`: empty placeholder for a later Next.js milestone.
- `infrastructure/`: infrastructure notes; root Compose defines local services.
- `docs/architecture.md`: architecture, HTTP security and error format.
- `docs/database.md`: Mermaid ERD, constraints and indexes.
- `docs/decisions/`: refresh-token and Redis tradeoffs.
- `docs/verification.md`: actual validation results for this milestone.

No reservation, payment, outbox, event CRUD, queue consumer, k6 scenario, or
Prometheus/Grafana deployment is implemented in Week 1.

## Week 4 orders and payments

The current backend includes Week 2 events/inventory, Week 3 PostgreSQL
reservations, and Week 4 orders, signed mock payment webhooks, idempotency,
tickets and refunds. Configure `PAYMENT_WEBHOOK_SECRET` with at least 32 random
characters before creating orders. Development mock scenarios require explicit
enablement and a test token; they are rejected in prod.

Run `./infrastructure/week4-verify.ps1` for build/compiler lint/all tests and five
concurrency repetitions. See [API](docs/api.md), [purchase diagrams](docs/week4-flow.md),
[verification](docs/verification.md), and [isolated Compose smoke instructions](infrastructure/README.md).
Week 5 outbox/RabbitMQ/email and Week 6 Redis admission features are now included.

## Week 6 Redis

Select `RESERVATION_STRATEGY=redis-gate` to enable the Redis admission gate in front
of PostgreSQL. The default remains `conditional-update`. Waiting room is disabled
per event by default. Rate limits and public event cache use Redis with documented
outage behavior. Compose enables Redis AOF and noeviction.

- [Redis keys, configuration, failure modes and diagrams](docs/redis.md)
- [API](docs/api.md), [database migration](docs/database.md), ADRs 0021–0026
- [Single-machine benchmark](docs/benchmarks/week6.md)
- [Week 6 verification](docs/week6-verification.md)

```powershell
cd backend
./mvnw.cmd -B -ntp verify
./mvnw.cmd -B -ntp -Pweek6-benchmark test
```

From the repository root, `./infrastructure/week6-smoke.ps1` creates a disposable
Compose project, exercises gate/queue/outage/login behavior, then removes only
that project's containers and volumes. `week6-mutations.ps1` temporarily mutates
sources and restores their original bytes in `finally`; run it without other builds
or edits in progress. k6, dashboards and frontend remain outside Week 6.

## Imported frontend integration

The active frontend is `frontend/src/` (React 19/Vite/TypeScript SPA). The duplicate
root `src/` was removed at the user's request. Build output is `frontend/dist/`.
The root Express server only proxies `/api/*` and `/actuator/health` to Spring
Boot. M0b restores normal login, URL routes, role guards and the COUNTER purchase
flow in this canonical app. Legacy map/seat components remain in source awaiting
the seating milestone; they are not connected to a new seating backend. See
[M0b lineage and verification](docs/m0b-lineage-and-baseline.md) and
[generated role matrix/page map](docs/frontend-access.md).

1. Fill required secrets in `.env`, including `PAYMENT_WEBHOOK_SECRET` (32+ random
   characters); start the backend with `docker compose up --build -d --wait`.
2. Set `BACKEND_URL=http://127.0.0.1:8080` and `PORT=3000` as needed in `.env`.
3. Run `npm ci`, then `npm run dev`; open http://localhost:3000.
4. Register/login normally. USER buys tickets, STAFF uses `/gate`, and ADMIN uses
   `/admin`. ADMIN/STAFF provisioning is not exposed by the frontend.
   The mock gateway sends a signed webhook; the browser only polls order status.

Validation: `npm run lint`, `npm test`, `npm run build`, and
`mvn -B -ntp -f backend/pom.xml clean verify`. M0b results: 115 backend tests,
35 frontend unit tests, lint/build and all 5 authored Playwright access/purchase
tests pass against the real Compose stack. The historical **111-test execution
tested `fcb976f`**; its report was committed in **`b19db2b`**. Local annotated tag
**`perf-v1` points to `b19db2b`**, which contains the performance work and evidence.
`codex/m0b-integration` joins that line (tip `494a33d`) with M0 in merge `b4803bf`;
both `fcb976f` and M0 are now ancestors. The initial merge base was `13c36d9`.
The additional four tests are three STAFF/gate tests and one inventory audit test.
No benchmark profile was part of 111 or 115.
For production static hosting, build first, set `NODE_ENV=production`, then
`npm start`. Do not use `vite preview` as the API proxy.

Current limits: no real payment provider, seat assignment, ticket
transfer, browser reseeding or profile-update API. Illustrative notification and
profile widgets are not persisted to the backend. Public inventory intentionally
returns availability buckets, not exact quantities. Spring STAFF gate endpoints
exist and the active staff page uses them. Access and refresh tokens stay in
memory because the backend returns the refresh token in JSON, not an httpOnly
cookie; reloading requires login. There is no active demo login or role-switch UI.
Backend APIs remain authoritative. Public admin event listing currently excludes
drafts because a dedicated admin listing endpoint is absent.

### Existing-machine isolated dev stack

If the existing PostgreSQL volume credentials differ from `.env`, preserve that
volume. This workspace has an ignored `.env.frontend.local` with independent
random secrets and an isolated `ticketrush-frontend` Compose project:

```powershell
docker compose --env-file .env.frontend.local -p ticketrush-frontend -f docker-compose.yml -f infrastructure/frontend-compose.yml up -d --wait
npm run dev:isolated
npm run test:smoke
```

Compose frontend: http://localhost:3100; local dev server: http://localhost:3000;
isolated backend: http://localhost:18080. This machine's local PostgreSQL host
port is now 25433: Windows reserved 15433 after a Docker restart. The internal
database port and existing volume are unchanged. The smoke test creates a USER and purchases one dev
ticket; it never uses a real payment provider. Stop this stack using the same
Compose arguments followed by `stop`; do not remove volumes to repair credentials.
The ignored env file is local-only, not included in a fresh checkout. Fresh
checkouts should follow the normal setup above with independently generated secrets.

### M1: seated inventory backend

The Spring backend now supports hybrid inventory: existing COUNTER tiers plus
SEATED holds using event-scoped `event_seats.id`. V8 introduces immutable stadium
templates, event/section mapping, atomic publication, block/unblock, seat claims,
seat ticket snapshots and live-sale uniqueness. The stadium has 3,200 reserved
seats; VIP Pit remains GA. See [M1 implementation and verification](docs/m1-seated-inventory.md),
[the data model](docs/seating-data-model.md), and [ADR 0029](docs/decisions/0029-hybrid-counter-seated-inventory.md).

M1 changes Spring and verification tooling only. Seatmap/status/suggest APIs (M2),
SPA integration (M3), demo mode (M4), and seat-mode performance evidence (M5) are
not implemented by this milestone. The earlier 5,000-ticket sell-out evidence is
for COUNTER inventory. No seat-mode performance claim is made.

### M2: seat read APIs

Spring exposes a public seatmap, authenticated section statuses with private ETags,
and deterministic adjacent-seat suggestions. A short Redis cache is advisory;
PostgreSQL remains authoritative for holds. The dev profile seeds one tagged
stadium event without accounts. No SPA components are changed; M3 integrates them.
See [M2 evidence, policy, merge preview and verification](docs/m2-seat-read.md).
The bounded 200/400 requests/s read experiment is not checkout or sell-out evidence.

M2b follow-up: [shared seat read contract, verification and repository audit](docs/m2b-seat-read.md).
The [single read campaign](docs/performance/m2b-read/README.md) failed its work minimum
(5/6 runs passed; one run dropped 2 iterations). No throughput readiness claim.
