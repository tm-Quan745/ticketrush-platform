# TicketRush

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
