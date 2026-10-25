# M1: seated inventory backend

Date: 2026-10-21. Scope: housekeeping and M1 only.
Branch: `codex/m1-seated-inventory`, based on the accepted M0b integration line.

## Implemented

- E2E fixture setup journals its event immediately; teardown cancels it through the
  ADMIN API and verifies public detail returns 404. Setup also cleans a journal
  left by an interrupted run. Housekeeping commit: `4dc45de`.
- V8 only: venue/section/seat topology, COUNTER/SEATED tier mode, event mappings,
  event-scoped seat inventory, reservation history and current claims, ticket seat
  snapshots, composite foreign keys, state checks, and unique live seat tickets.
  V1-V7 have not changed. The current-claim membership FK is deferred to commit.
- Versioned JSON stadium loader: VIP Pit GA; A/B/C/Upper SEATED with 3,200 seats.
  Coordinates follow the old SPA polygons; row rank, aisle segments and accessibility
  flags are generated server-side. Templates freeze when referenced by a published
  event. No user accounts or demo events are seeded by this loader.
- ADMIN venue selection, complete section-to-tier mapping, atomic publication and
  versioned block/unblock. COUNTER capacity PATCH checks expected version and
  refuses shrinking below committed stock. SEATED capacity derives from seat rows.
- Mutually exclusive reservation requests: `{tierId, quantity}` or `{seatIds}`.
  Seat IDs are event-scoped; one tier per hold; max-per-order defaults to six only
  for SEATED. Waiting-room admission still applies. All selected seats, reservation,
  historical membership, current claim and outbox commit together or all roll back.
- Reservation TTL remains authoritative. Cancel/expiry/failure release the current
  claim once. Signed payment success sells the claim and issues snapshot-bearing
  tickets. Late payment reacquires only the same available seats within existing
  grace; otherwise it requests the existing gateway refund path.
- Refund and check-in use the same order lock. USED refuses refund and remains
  SOLD. Refunded ticket history remains; a new sale can issue a new live ticket.
- Shared SQL verifier checks SOLD ticket/order ownership, active membership,
  HELD reservation/TTL, section capacity and live/USED ticket state. It is consumed
  by Spring reconciliation and the loadtest verifier, both with repeatable-read
  snapshots. Redis inventory reconciliation enumerates COUNTER tiers only.

## API surface and compatibility

| API | M1 behavior |
| --- | --- |
| GET `/api/v1/admin/venues` and `/{id}` | Versioned templates and sections |
| POST `/api/v1/admin/events` | Optional `venueId`; old COUNTER creation remains valid |
| POST `/api/v1/admin/events/{id}/tiers` | `inventoryMode`; SEATED uses zero numeric capacity at creation |
| PUT `/api/v1/admin/events/{id}/section-tiers` | Complete draft mapping; validates event, venue and mode |
| POST `/api/v1/admin/events/{id}/publish` | Materializes all mapped physical seats atomically |
| POST `/api/v1/admin/events/{id}/seats/block` | Versioned atomic AVAILABLE/BLOCKED transition |
| PATCH `/api/v1/admin/tiers/{id}/capacity` | COUNTER only, version checked |
| POST `/api/v1/reservations` | Existing COUNTER body or event-scoped `seatIds` |
| GET reservation/detail and order tickets | Enriched reservation assignments and immutable ticket seat labels |
| GET `/api/v1/admin/events/{id}/inventory` | Derived SEATED total/available/held/sold and section counts |
| GET `/api/v1/admin/events/{id}/inventory/reconcile` | Keeps existing list response; adds coded seating violations |

Existing event/tier fields and COUNTER reservation strategies remain. Full tier PUT
keeps its COUNTER behavior; SEATED numeric edits must use block/unblock. Tier mode
is immutable through update; use a new draft tier if the mode needs to change.
The inventory response retains legacy timestamps alongside the new fields.
No endpoint can mark a payment paid; existing signature validation remains in use.

## Verification

Final clean Maven verify: **BUILD SUCCESS**, 173 tests, zero failures/errors/skips,
finished 2026-10-21 19:44:38 +07:00 (3m10s). All 115 baseline tests remain, plus
58 seating tests. No benchmark profile was included. Machine-readable evidence:
[m1-backend-suite.json](m1-backend-suite.json).

| Test class | Tests | Failures / errors / skipped |
| --- | ---: | --- |
| AuthIntegrationTest | 6 | 0 / 0 / 0 |
| GlobalExceptionHandlerTest | 1 | 0 / 0 / 0 |
| RedisGuardTest | 3 | 0 / 0 / 0 |
| EventInventoryIntegrationTest | 9 | 0 / 0 / 0 |
| MigrationIntegrationTest | 1 | 0 / 0 / 0 |
| SeatedInventoryIntegrationTest | 58 | 0 / 0 / 0 |
| ObservabilityIntegrationTest | 3 | 0 / 0 / 0 |
| MockGatewayIntegrationTest | 1 | 0 / 0 / 0 |
| OrderPaymentIntegrationTest | 20 | 0 / 0 / 0 |
| ConditionalReservationIntegrationTest | 13 | 0 / 0 / 0 |
| OptimisticReservationIntegrationTest | 13 | 0 / 0 / 0 |
| OrderSmallPoolIntegrationTest | 3 | 0 / 0 / 0 |
| OutboxDeliveryIntegrationTest | 1 | 0 / 0 / 0 |
| OutboxIntegrationTest | 2 | 0 / 0 / 0 |
| PessimisticReservationIntegrationTest | 13 | 0 / 0 / 0 |
| ReservationStatusTest | 1 | 0 / 0 / 0 |
| Week6RedisIntegrationTest | 25 | 0 / 0 / 0 |
| **Total** | **173** | **0 / 0 / 0** |

Additional actual runs: Python verifier **19/19**; housekeeping Playwright **5/5**.
The latter ran against the real Compose/Spring stack before M1 backend edits.

The new integration class tests 200 real concurrent reservation threads against
PostgreSQL and Redis containers, then concurrently settles accepted orders through
signed HTTP webhooks. It checks rollback, no duplicate claims/sales, exact counts,
TTL, payment/expiry and payment/cancel races, refund/check-in serialization, resale,
admin authorization, topology validation and direct database constraint rejection.
Seven crafted-data cases prove each seating verifier rule can fail.

Earlier attempts are not counted as passes: Docker was unavailable during one
migration attempt and a later full-suite attempt; a COUNTER validation regression
was caught by the existing suite and fixed without weakening its assertions.
The isolated Python verifier run also exposed a read-only child mount issue; its
SQL mount is now at `/verify-seating.sql` and its 19 tests passed after the fix.

## Reproduction

With Docker Desktop running and Java 21/Maven available:

```powershell
mvn -B -ntp -f backend/pom.xml clean verify
mvn -B -ntp -f backend/pom.xml -Dtest=SeatedInventoryIntegrationTest test
```

The Python verifier tests run as `python -m unittest -v test_tool` in the existing
`ticketrush-week7-tools` image, with a fresh isolated PostgreSQL/Redis network,
V1-V8 applied, and the shared SQL file mounted at `/verify-seating.sql`. They use
the guarded `ticketrush_loadtest` database and `loadtest` profile. The temporary
containers/network are removed afterward. No existing performance dataset was reset.
The repository's loadtest tooling also exposes these tests via
`python infrastructure/scripts/loadtest.py test` in its dedicated test stack.

Housekeeping was checked with `npm run test:e2e` against the real local Compose
stack: 5/5 tests, including the purchase flow; global teardown completed.
No SPA component changed in M1, and no frontend gate result is inferred from backend tests.

## Boundaries and next milestone

No seatmap/status/suggest endpoints (M2), SPA integration (M3), demo controls (M4),
or seat-mode load/performance study (M5). The 200-thread test establishes correctness,
not capacity or latency claims. Earlier 5,000-ticket sell-out evidence is COUNTER only.

`main` remains `ec40680b30fbfc72d1cc6267bf8bf09e31ef7e2d`.
`perf-v1` remains `b19db2b7f1033729f75e3fc7e10f9708e2e0204a`.
No merge into main and no push were performed. Stop after M1 for review.

## Commits

- `4dc45de`: E2E fixture teardown (housekeeping).
- `da7b59e`: V8 schema and immutable stadium template.
- `f2e73d3`: seated lifecycle, admin operations and 58 integration tests.
- `6225687`: shared verifier integration in Python tooling.
