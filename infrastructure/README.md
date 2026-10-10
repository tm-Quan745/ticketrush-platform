# Infrastructure

Week 1 dependencies are managed by the root Docker Compose file. PostgreSQL owns
persistent application data; Redis owns short-lived login counters; RabbitMQ is
provisioned for future milestones without business queues or consumers.

## Week 2 isolated verification

Use this when existing dev volumes have different credentials or host ports are
occupied. Run from the repository root with Docker Desktop and a configured `.env`.
The override requires Docker Compose 2.24.4+ for `!override` support (tested 5.1.1).
It creates a separate project/volumes and exposes only backend port 28080.

```powershell
$env:COMPOSE_PROJECT_NAME = 'ticketrush-week2-check'
$env:COMPOSE_FILE = 'docker-compose.yml;infrastructure/compose.week2-check.yml'
$env:BACKEND_PORT = '28080'
docker compose up -d --build --wait
python infrastructure/week2-smoke.py
```

Swagger: http://127.0.0.1:28080/swagger-ui/index.html
The smoke script creates an ephemeral account, verifies USER denial, assigns
ADMIN to that account, logs in again, creates an event/tier, publishes, reads exact
admin inventory and coarse public availability, and checks OpenAPI/Swagger.
It removes only its own fixtures in `finally`; it prints no passwords or JWTs.
Default fixtures remain available (50 events, 150 tiers).

To stop the isolated project while retaining its data, run `docker compose down`
in the same shell. Do not use `down -v` on existing development data. For the normal
stack, use a fresh shell without these overrides and `docker compose up -d --build
--wait`, after ensuring `.env` matches the credentials used to initialize its
PostgreSQL volume. Changing POSTGRES_PASSWORD alone does not change an existing
volume's database password.

Host-side Spring Boot uses `DB_URL`; Compose overrides it with the internal
PostgreSQL hostname. If changing POSTGRES_PORT for host access, update the local
DB_URL accordingly. Keep secrets in the ignored `.env`, never in source control.


## Week 3 verification

Run build/lint/tests and five consecutive concurrency runs:

```powershell
./infrastructure/week3-verify.ps1
# Include the separately tagged rough comparison:
./infrastructure/week3-verify.ps1 -Benchmark
```

Logs are written to `backend/target/week3-*.log`. Docker Desktop must be running.
The benchmark can also run alone with `mvn -B -ntp -f backend/pom.xml -Pweek3-benchmark test`.

Isolated HTTP smoke flow (existing `.env` secrets are required):

```powershell
$env:COMPOSE_PROJECT_NAME = 'ticketrush-week3-check'
$env:COMPOSE_FILE = 'docker-compose.yml;infrastructure/compose.week3-check.yml'
$env:BACKEND_PORT = '28081'
docker compose up --build -d --wait
python infrastructure/week3-smoke.py
docker compose down
Remove-Item Env:COMPOSE_PROJECT_NAME, Env:COMPOSE_FILE, Env:BACKEND_PORT
```

This uses an isolated project and localhost port 28081. The script deletes only
its temporary account, reservations, event and tier. Compose down preserves volumes.
Reservation code uses PostgreSQL only; Redis and RabbitMQ remain existing platform
services, with Redis still serving the pre-existing login rate limiter.

## Week 4 verification

Populate `.env` from `.env.example`, including a random PAYMENT_WEBHOOK_SECRET
(at least 32 characters) and a random MOCK_PAYMENT_TEST_TOKEN. Never commit secrets.

```powershell
./infrastructure/week4-verify.ps1
# Optional destructive-to-test-schema mutations; source is restored in finally:
./infrastructure/week4-mutation.ps1
# Always build again after mutation to restore compiled artifacts:
mvn -B -ntp -f backend/pom.xml verify
```

The compiler runs `-Xlint:unchecked,deprecation -Werror`; this is the project's
Java lint check. PostgreSQL/Testcontainers and real thread/HTTP tests need Docker.
No separate style-lint plugin is configured.

For the isolated Compose smoke (reads the configured test token without printing it):

```powershell
$env:COMPOSE_PROJECT_NAME = 'ticketrush-week4-check'
$env:COMPOSE_FILE = 'docker-compose.yml;infrastructure/compose.week4-check.yml'
$env:BACKEND_PORT = '28082'
$week4TokenLine = Get-Content .env | Where-Object { $_ -match '^MOCK_PAYMENT_TEST_TOKEN=' } | Select-Object -Last 1
$env:MOCK_PAYMENT_TEST_TOKEN = $week4TokenLine.Split('=', 2)[1]
docker compose up --build -d --wait
python infrastructure/week4-smoke.py
docker compose down
Remove-Item Env:COMPOSE_PROJECT_NAME, Env:COMPOSE_FILE, Env:BACKEND_PORT, Env:MOCK_PAYMENT_TEST_TOKEN
```

Open Swagger at `http://localhost:28082/swagger-ui/index.html` before stopping the
stack. Smoke registers a temporary account, uses real login JWTs, checks SUCCESS,
FAILURE and DUPLICATE_WEBHOOK, replays idempotent creation, checks tickets and
reconciliation, and removes only its own fixtures. Compose down keeps volumes.
