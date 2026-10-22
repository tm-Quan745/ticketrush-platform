# 0027: Connect the imported frontend to Spring Boot

## Context
The imported application has an active root `src/` React/Vite entrypoint and an
unused copy in `frontend/src/`. Its Express server previously implemented a
second in-memory booking backend with demo identities and unsigned payments.
The project roadmap mentions Next.js; migrating the imported UI is a separate task.

## Options
1. Keep the simulator: fast demos but no PostgreSQL invariants or real auth.
2. Rewrite as Next.js now: unnecessarily expands this integration task.
3. Keep the supplied Vite UI and proxy existing APIs to Spring Boot.

## Decision
Choose option 3. Express is only a same-origin development/static hosting proxy;
Spring Boot remains the source of truth. `BACKEND_URL` is server-only. No secrets
are exposed as Vite variables. Strip forwarded client identity headers; local
proxy traffic shares a backend IP rate-limit bucket. Production deployments need
reviewed reverse-proxy trust and TLS settings.

Login receives a token pair then loads `/auth/me` and maps `roles` for display.
Refresh rotates tokens; no fallback demo login. Logout revokes the refresh token.
Existing browser token storage remains; an HttpOnly cookie/BFF strategy is a
separate security change. Backend authorization is authoritative.

Public inventory uses AVAILABLE/LOW/SOLD_OUT, never fabricated stock counts.
Reservations contain only server TTL/status/quantity; display context comes from
the selected tier. Orders retain Idempotency-Key across transport retries.
Backend mock payment dispatches a signed webhook after order commit; the frontend
checks GET order status and loads tickets only after PAID. It never signs webhooks
or changes payment state. Ticket display is enriched from the parent order.

## Consequences
Run frontend and backend together. Backend outages surface as 502, without mock
fallback. Check-in, transfer, browser reseeding, and seat assignment are unsupported.
The separate `frontend/src/` copy is preserved but not built. Existing illustrative
profile/notification/architecture widgets are not backend persistence features.
Frontend contract tests use controlled HTTP responses; correctness/concurrency
remains covered by backend tests with real Testcontainers services.
