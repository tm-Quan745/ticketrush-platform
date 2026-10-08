# Week 1 verification

Date: 2026-10-08 (Asia/Bangkok). **Local Definition of Done met.**

## Environment

- Windows, Oracle JDK 21.0.8, Maven 3.9.9.
- Docker Desktop Linux engine 29.3.1, Docker Compose 5.1.1.
- Docker storage moved to drive D by the user after the previous disk-space failure.
- Maven and its cache are in ignored `.tools/` on drive D.
- Local `.env` contains independent generated secrets and is ignored by Git.
- Local `POSTGRES_PORT=15432` avoids an existing host service on 5432. The backend
  container still uses `postgres:5432`; committed defaults remain 5432.

## Build and integration tests

Executed with Java 21 and Maven 3.9.9:

```text
mvn -B -ntp -f backend/pom.xml clean verify

Tests run: 6, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
Total time: 34.822 s
Finished at: 2026-10-08T10:17:31+07:00
```

The local invocation used the downloaded Maven executable and
`-Dmaven.repo.local=D:\My pro\ticketrush-platform\.tools\m2` to keep its cache on D.
Tests used actual PostgreSQL 17, Redis 7.4, and RabbitMQ 4.1 Testcontainers, random
ports, and runtime-generated secrets. No concurrency mocks were used.

Coverage:

- Registration, normalized/unique email, BCrypt storage, login, authenticated me.
- USER denied access to admin-only Actuator info; ADMIN allowed after a new login.
- Refresh rotation, replay rejection, logout, repeated logout, refresh after logout.
- Malformed JSON, invalid input, UTF-8 BCrypt byte limit, invalid credentials,
  expired/unknown refresh tokens, missing/invalid access token, error format.
- Eight concurrent refresh requests: exactly one 200 and seven 401 responses.
- Four concurrent registrations: one 201 and three 409 responses.
- Twelve concurrent logins: five allowed attempts and seven 429 responses under
  the test quota, including forwarded-header spoofing and quota expiry checks.
- Negative/excess ticket quantity constraints, Actuator health and OpenAPI.

Report: `backend/target/surefire-reports/com.vibe.ticketrush.auth.AuthIntegrationTest.txt`.
The executable application JAR was packaged by the same successful verify run.

## Docker Compose

```text
docker compose config --quiet
Exit code: 0

docker compose up --build --wait --wait-timeout 240
Exit code: 0

SERVICE     STATUS      HOST PORT
backend     healthy     127.0.0.1:8080
postgres    healthy     127.0.0.1:15432
redis       healthy     127.0.0.1:6379
rabbitmq    healthy     127.0.0.1:5672, 127.0.0.1:15672
```

The multi-stage Docker build compiles/packages on Java 21 and runs the application
as a non-root user. Image packaging skips tests because Testcontainers is verified
separately by `clean verify` and CI. Flyway history was queried inside PostgreSQL:

```text
version | description | success
1       | foundation  | t
```

## HTTP smoke test against Compose

```text
health HTTP 200, status UP
register HTTP 201
login HTTP 200
me HTTP 200
refresh HTTP 200
refresh replay HTTP 401
logout HTTP 204
refresh after logout HTTP 401
openapi HTTP 200
COMPOSE AUTH SMOKE PASS
```

The smoke test used one generated `smoke-...@example.com` account and did not print
passwords or tokens. That test account and its revoked token records remain in
the local development database. The Compose stack is left running for inspection.

## Fixes discovered during verification

- Pinned Testcontainers 1.21.4 for Docker 29 API compatibility.
- Configured RabbitMQContainer credentials with `withAdminUser` /
  `withAdminPassword` and read them through its getters. The initial test setup
  supplied environment variables overwritten by the container's configuration.
- Removed the nonessential Docker `dependency:go-offline` prefetch step after it
  stalled; direct `mvn package` completed successfully.
- Made the PostgreSQL host port configurable to avoid local port conflicts.

## Limits

GitHub Actions is configured to run build/tests, but no remote workflow run was
triggered or verified. This is a local Week 1 validation, not a production audit
or load test. Reservation, overselling logic, payment, idempotency, outbox, frontend,
and monitoring dashboards remain outside this milestone.


# Week 2 verification

Date: 2026-10-08 (Asia/Bangkok). Implementation/build/tests passed. Compose was
verified using an isolated project; the existing default dev environment has
credential/port issues described below.

## Build, lint and real PostgreSQL tests

```text
.\backend\mvnw.cmd -f backend/pom.xml -B -ntp clean verify

Tests run: 6, Failures: 0, Errors: 0, Skipped: 0 -- AuthIntegrationTest
Tests run: 9, Failures: 0, Errors: 0, Skipped: 0 -- EventInventoryIntegrationTest
Tests run: 1, Failures: 0, Errors: 0, Skipped: 0 -- MigrationIntegrationTest
Tests run: 16, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
Total time: 53.153 s
Finished at: 2026-10-08T13:05:28+07:00
```

Java 21.0.8. Compiler lint runs on main and test compilation with
`-Xlint:unchecked,deprecation -Werror`; this is compiler lint, not Checkstyle/PMD.
`git diff --check` also passed. Existing non-fatal environment warnings: an optional
Flyway package-repository metadata request returned 401; Mockito/Byte Buddy emitted
JDK dynamic-agent warnings. These did not skip tests or fail the build.

Week 2 coverage includes lifecycle, ENDED and invalid transitions; date/quantity/
price/currency validation (including fractional-price rejection); all admin route
role boundaries; public draft hiding and availability thresholds; conditional
capacity success/rejection; pagination/title/date/onSale filtering; dev seed
batching/idempotence and absence from test context; OpenAPI success/error schemas.
Fifty real threads send HTTP capacity writes against real PostgreSQL, reconciling
all returned versions/deltas and final available/total. No concurrency mocks.
A separate migration test upgrades populated V1 to V2 and preserves committed
inventory while converting the price. Existing Week 1 tests still run against
PostgreSQL, Redis and RabbitMQ; no new Week 2 Redis/broker behavior was introduced.

## Compose environment notes

The initial normal `docker compose up -d --build --wait` built successfully, but
host PostgreSQL port 5432 could not bind. Retrying with a process-level port 15432
override exposed an existing volume credential mismatch (`password authentication
failed`). No `.env`, passwords, or existing volume contents were changed to fix it.
The existing default backend remains unable to start with those credentials.

An isolated `ticketrush-week2-check` project uses the same root Compose file plus
`infrastructure/compose.week2-check.yml`, fresh project-scoped volumes, and no
published infrastructure ports. Port 18080 was also reserved by Windows
(excluded range 18043..18142), so the checked-in override uses backend port 28080.
See `infrastructure/README.md` for exact commands and cleanup without volume deletion.


## Final Compose and smoke results

After rebuilding the final OpenAPI fix, the isolated Compose project started with
all four services healthy. Docker Desktop was later restarted and the smoke test
was rerun successfully against the same persisted fixtures.

```text
PASS: USER denied; ADMIN create event/tier, publish, exact inventory; anonymous list/detail
PASS: draft hidden; public quantities hidden; OpenAPI 9 paths; Swagger UI HTTP 200
Cleanup: removed only this run's account/event/tier fixtures

SERVICE    STATUS    HOST PORT
backend    healthy   127.0.0.1:28080
postgres   healthy   not published
rabbitmq   healthy   not published
redis      healthy   not published

 events | tiers
--------+-------
     50 |   150
```

Swagger UI was also opened in a browser and visibly displayed all Week 2 routes.
Final smoke assertions check EventPage, Detail, PublicTier and InventoryView
schemas, plus successful 200/201 response documentation. Seed counts remained
50 events / 150 tiers after rebuilds/restarts. The isolated stack is left running
for review at http://127.0.0.1:28080/swagger-ui/index.html.

No reservations, orders, payments, booking Redis usage, business RabbitMQ queues,
or later milestones were implemented. No production deployment or git commit was
made. Pre-existing working-tree changes were preserved; V1 is unchanged.
