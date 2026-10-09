# TicketRush API — Week 2

Base path: `/api/v1`. JSON uses camelCase. Times are ISO-8601 UTC instants
(e.g. `2026-12-01T18:00:00Z`). UUID identifiers. Never return JPA entities.
Interactive documentation: `/swagger-ui.html`; schema: `/v3/api-docs` (non-prod).

## Authentication

Week 1 endpoints remain `/auth/register`, `/auth/login`, `/auth/refresh`,
`/auth/logout`, `/auth/me`. Log in and use `Authorization: Bearer <accessToken>`.
All `/admin/**` routes require the ADMIN role. Registration only grants USER.
Provision ADMIN using an operator-controlled database role assignment; no public
role-escalation endpoint or seeded privileged account exists.

## Public endpoints

| Method | Path | Result |
| --- | --- | --- |
| GET | `/events` | 200: paginated PUBLISHED events only |
| GET | `/events/{id}` | 200: `{event, tiers}`; missing or non-PUBLISHED is 404 |

List parameters: `page` (default 0, nonnegative), `size` (default 20, range 1..50),
`keyword` (case-insensitive literal substring of title; `%` and `_` are escaped),
`from` and `to` (inclusive ISO instant bounds on startTime), `onSale` (default false).
`onSale=true` requires `saleStartTime <= now < saleEndTime`; it does not promise
stock. Invalid filters return 400. Sort is startTime ASC, id ASC for stable ties.
Response: `{content: [...], page, size, totalElements, totalPages}`.
A page beyond the last page has empty content. No client-defined sort is supported.

A public tier contains `id`, `name`, `description`, `price`, `currency`,
`maxPerOrder`, `availability`. Price is an integer in the currency's minor units:
USD 1250 = USD 12.50; VND 1250 = VND 1250. Fractional JSON prices are rejected.
No exact total, available, committed, version, or creator fields are public.
Availability: SOLD_OUT when available=0 (including zero capacity), LOW when
`available * 10 < total`, otherwise AVAILABLE (exactly 10% is AVAILABLE).

## ADMIN endpoints

| Method | Path | Success | Rules |
| --- | --- | --- | --- |
| POST | `/admin/events` | 201 EventView | Creates DRAFT, records JWT subject as creator |
| PUT | `/admin/events/{id}` | 200 EventView | Replaces editable details; status is not writable here |
| POST | `/admin/events/{id}/publish` | 200 EventView | DRAFT -> PUBLISHED only |
| POST | `/admin/events/{id}/cancel` | 200 EventView | PUBLISHED -> CANCELLED only |
| POST | `/admin/events/{id}/tiers` | 201 InventoryView | Initial available=total |
| PUT | `/admin/tiers/{id}` | 200 InventoryView | Conditional atomic capacity update |
| GET | `/admin/events/{id}/inventory` | 200 InventoryView[] | Exact tier quantities; missing event is 404 |

Event write body (POST and PUT):

```json
{
  "title": "TicketRush Live",
  "description": "An evening concert",
  "venueName": "Main Hall",
  "venueAddress": "123 Example Street",
  "imageUrl": "https://example.com/concert.jpg",
  "startTime": "2027-12-01T18:00:00Z",
  "endTime": "2027-12-01T21:00:00Z",
  "saleStartTime": "2026-10-01T00:00:00Z",
  "saleEndTime": "2027-12-01T17:00:00Z"
}
```

Required: nonblank title (<=200), all four times. Optional: description (<=10000),
venueName (<=200), venueAddress (<=500), imageUrl (<=2048). Rules:
`endTime > startTime`, `saleStartTime < saleEndTime <= startTime`.
After published sales start, saleStartTime cannot be moved: otherwise an admin
could reopen the price-edit window. Other event details remain editable.

Tier write body (POST and PUT):

```json
{
  "name": "Standard",
  "description": "General admission",
  "price": 1250,
  "currency": "USD",
  "totalQuantity": 1000,
  "maxPerOrder": 5
}
```

Required: nonblank name (<=100), nonnegative integer price (signed BIGINT range),
uppercase ISO 4217 currency code, nonnegative totalQuantity (signed INTEGER),
maxPerOrder >=1. Description optional (<=10000). Names are trimmed, case-sensitive,
unique per event. availableQuantity and version are server-managed.
After an event is PUBLISHED and sale has started, creating tiers and changing
price or currency returns 409; capacity/name/description/order-limit edits remain
allowed. maxPerOrder can exceed current stock; it is a per-order ceiling only.
PUT supplies an absolute total. Each accepted write increases version once;
available changes by the same delta as total. Total below sold+held returns 409
without changing any fields. Duplicate name changes roll back the entire update.

InventoryView includes id, eventId, name, description, price, currency,
totalQuantity, availableQuantity, maxPerOrder, version, createdAt, updatedAt.
EventView includes event details, status, id, createdAt, updatedAt.
The domain also supports PUBLISHED -> ENDED; no end endpoint or scheduler is
introduced in Week 2. CANCELLED and ENDED are terminal states.

## Errors

Week 1 envelope remains `{timestamp, status, code, message, path, fieldErrors}`.
400: malformed JSON, invalid UUID/query parameters, validation/date/currency errors.
401: missing/invalid authentication on protected routes (or invalid supplied JWT).
403: authenticated USER accessing admin routes. 404: missing/hidden resource.
409: invalid lifecycle transition, duplicate tier name, capacity below committed
stock, or restricted sale change. Errors do not expose SQL or stack traces.

## Development data

Only profile `dev` without `prod` or `test` can run the seeder. Defaults:
`DEV_SEED_ENABLED=true`, `DEV_SEED_EVENTS=50`, `DEV_SEED_TIERS_PER_EVENT=3`.
Deterministic UUIDs and INSERT ON CONFLICT make restarts idempotent; existing rows,
stock and times are not reset. Increasing counts adds fixtures; decreasing counts
does not delete data. Batches are bounded at 500 rows; JDBC batch rewriting is
active in dev. All seed batches share one transaction. Fixture events are public,
with an open sale window, USD prices, and 1000 tickets per tier.
No passwords or ADMIN account are seeded. These trusted fixtures bypass lifecycle
creation rules; no production endpoint can invoke the seeder.


## Week 3: reservations (USER)

All reservation routes require a JWT with role USER. ADMIN alone does not grant USER.

| Method | Path | Result |
|---|---|---|
| POST | `/api/v1/reservations` | 201: create a hold |
| GET | `/api/v1/reservations/me?page=0&size=20&status=HELD` | 200: own reservations; optional status; size 1..100 |
| GET | `/api/v1/reservations/{id}` | 200: owner detail; 403 for another owner; 404 if missing |
| DELETE | `/api/v1/reservations/{id}` | 204: cancel HELD; 409 if terminal or expired |
| GET | `/api/v1/admin/events/{id}/inventory/reconcile` | ADMIN only; 200: array of violating tiers, empty when consistent; 404 for missing event |

Create body: `{"tierId":"<UUID>","quantity":2}`.
Response: `{"id":"<UUID>","status":"HELD","quantity":2,"expires_at":"2030-01-01T00:10:00Z","seconds_remaining":600}`.
Terminal reservations report zero seconds remaining. Pagination returns `content`,
`page`, `size`, `totalElements`, `totalPages`, sorted by created time and ID descending.
Reads persist lazy expiry before applying a status filter. An expired cancellation
returns 409 after committing the expiry and inventory restoration.

Creation requires a PUBLISHED event, inclusive sale window `[start,end]`, and
quantity 1..max_per_order. 409 codes: `SALE_NOT_OPEN`, `ALREADY_HELD`, `SOLD_OUT`.
No exact stock is disclosed in sold-out errors. Invalid quantities are 400.
Optimistic retry exhaustion or inventory lock timeout returns 503 `INVENTORY_BUSY`.
There is no confirm endpoint; confirmation is an internal transition for Week 4.

Reconciliation rows: `tierId`, `available`, `held`, `confirmed`, `total`.
The query uses one PostgreSQL statement snapshot and only reports inconsistencies;
it does not change inventory.

### Run the Week 3 checks

```powershell
mvn -B -ntp -f backend/pom.xml verify
1..5 | ForEach-Object {
    mvn -B -ntp -f backend/pom.xml '-Dtest=*ReservationIntegrationTest' '-Dgroups=concurrency' test
    if ($LASTEXITCODE -ne 0) { throw "Concurrency run failed" }
}
mvn -B -ntp -f backend/pom.xml -Pweek3-benchmark test
python infrastructure/week3-smoke.py
```

The smoke script requires a running Compose backend and an initialized `.env`.
It registers a temporary account, logs in, grants ADMIN to that account through
local development database access, creates event/tier, reserves, lists, cancels,
checks restored inventory, checks OpenAPI and Swagger UI, then removes its fixtures.
For an isolated Compose project, set `COMPOSE_PROJECT_NAME` and `COMPOSE_FILE`
for both Compose startup and the smoke script. See `docs/verification.md`.
