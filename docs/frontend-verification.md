# Frontend integration verification — 2026-10-19

## Results
- `mvn -B -ntp -f backend/pom.xml verify`: BUILD SUCCESS; 93 tests, 0 failures,
  0 errors, 0 skipped. Includes real Testcontainers PostgreSQL/Redis/RabbitMQ tests.
- `npm run lint`: passed (TypeScript noEmit).
- `npm test`: 9 passed. Covers auth DTO mapping, refresh/retry, logout, reservation
  admission headers, payment status reads, ticket enrichment, capacity payload,
  and a real HTTP proxy check (including 502 on upstream outage).
- `npm run build`: passed. Vite warns that the main bundle exceeds 500 kB;
  optimizing bundle splitting is outside this integration task.
- `npm run test:smoke`: passed through localhost:3000 to the isolated Spring Boot
  stack. Register/login/me -> public events -> hold one ticket -> order creation
  and idempotent replay -> signed backend mock webhook -> issued ticket -> logout.
- Opened the frontend in the browser and confirmed the event catalog renders.

## Local environment
Docker Desktop was started. The original Compose stack could not boot because
port 5432 was unavailable and its PostgreSQL volume password differs from `.env`.
The local host PostgreSQL mapping was changed to 15432; the missing payment webhook
secret was generated. No existing volume was deleted and no database password was
changed. Original stack credentials still need operator reconciliation.

For verification, independent random secrets are stored in ignored
`.env.frontend.local`. The `ticketrush-frontend` Compose project has its own volumes
and backend port 18080. `npm run dev:isolated` serves frontend port 3000. See README
for start/stop instructions. The smoke test created one USER and purchased one dev
ticket (order 319ee658-9bb9-4b19-8fb4-24156a22e5a9).

## Limits
No backend Java business logic was changed. No real payment provider, gate check-in,
seat assignment, transfer, profile persistence or browser reseeding was added.
The unused `frontend/src/` import copy is preserved. Existing decorative profile,
notification and architecture screens are not backend functionality. Frontend API
contract tests do not replace the real-service backend concurrency tests.
