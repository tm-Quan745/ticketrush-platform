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
