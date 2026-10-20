# M0 baseline verification — 2026-10-20

Scope: baseline repair and verification only. No seating implementation, new
frontend integration, demo payment endpoint or reseed behavior is introduced.

## Why 111 differs from 96

The historical artifact is **docs/performance/results/minimum-finish-backend-suite.json**,
not a root `results/` file. It is present at commit `b19db2b` on
`feat/observability-load-testing` and records the tested commit
`fcb976f3bed21efdb3808084290a35ebe3daba4d`.

Historical command:

```powershell
.tools/apache-maven-3.9.9/bin/mvn.cmd -B -ntp -s .mvn-week7-settings.xml -f backend/pom.xml verify
```

The artifact records exit 0, 111 tests, zero failures/errors/skips, 206 seconds,
finished 2026-10-18T13:32:09+07:00, and explicitly
`benchmark_profiles_included: false`. It references
`.tools/minimum-finish-final-verify.log`. This is historical evidence, not a new
execution of that branch.

The tested historical commit is **not an ancestor of current HEAD**. Inspection
of the current branch's test history found no test deletion. The additional
tests were introduced on the other branch alongside features absent here:
observability, durable outbox delivery, small-pool order handling and Redis
breaker/recovery changes. In particular, historical `RedisGuardTest` constructs
a ten-argument `RedisProperties`; this checkout has four arguments.
`GlobalExceptionHandlerTest` expects a meter-registry constructor absent here.
Copying those tests alone would not compile; importing their features is not a
baseline restoration. No tests were restored, disabled or excluded.

| Test class | Historical 111 | Before M0 | After M0 |
| --- | ---: | ---: | ---: |
| AuthIntegrationTest | 6 | 6 | 6 |
| GlobalExceptionHandlerTest | 1 | absent | absent |
| RedisGuardTest | 3 | absent | absent |
| EventInventoryIntegrationTest | 9 | 9 | 9 |
| MigrationIntegrationTest | 1 | 1 | 1 |
| ObservabilityIntegrationTest | 3 | absent | absent |
| MockGatewayIntegrationTest | 1 | 1 | 1 |
| OrderPaymentIntegrationTest | 16 | 18 | 19 |
| ConditionalReservationIntegrationTest | 13 | 13 | 13 |
| OptimisticReservationIntegrationTest | 13 | 13 | 13 |
| PessimisticReservationIntegrationTest | 13 | 13 | 13 |
| OrderSmallPoolIntegrationTest | 3 | absent | absent |
| OutboxDeliveryIntegrationTest | 1 | absent | absent |
| OutboxIntegrationTest | 2 | 2 | 2 |
| ReservationStatusTest | 1 | 1 | 1 |
| Week6RedisIntegrationTest | 25 | 19 | 19 |
| **Total** | **111** | **96** | **97** |

Historical per-class counts were reconstructed from the source at `fcb976f`,
including the 13 inherited tests in each reservation strategy class. The JSON
artifact itself supplies only the total and the Week6Redis count.
The delta is 18 tests present only on the historical branch, offset by the three
current gate tests: **111 - 18 + 3 = 96**. M0 adds one inventory regression.

Both revisions use Surefire with `benchmark` excluded by default; neither configures
Failsafe. Integration tests end in `Test` and run in Surefire. There is no hidden
Failsafe count. `week3-benchmark` selects the benchmark tag; `week6-benchmark`
additionally restricts names to `Week6*BenchmarkTest`. The five benchmark classes
(Conditional, Optimistic, Pessimistic, Week6Conditional, Week6Gate) each inherit
one benchmark test. They were not part of the historical 111 and are not run in
M0; they are not counted as passed or skipped in the default suite.

## Changes and commits

- `1975dd7`: migration test asserts pending versions `3,4,5,6,7`, verifies the
  executed version list and no remaining pending migration, then runs all
  unchanged legacy-data assertions. Targeted migration + order/payment run:
  **19 passed**, zero failures/errors/skips.
- Existing `7f288c5`: V7 STAFF/check-in already committed before M0. Revalidated:
  anonymous 401; USER 403 on both gate endpoints and representative admin
  endpoints; STAFF 403 on admin; 16 real HTTP check-in threads with exactly one
  200 and fifteen 409, unchanged `used_at` on retries and recorded `used_by`.
- `fae5e02`: inventory audit diff, reported before committing: `validTicketCounts` changes
  its predicate from `status='VALID'` to `status IN ('VALID','USED')`. Checked-in
  tickets still consume sold inventory. Added a real PostgreSQL regression that
  pays for two tickets, checks one in, requires clean reconciliation, deletes
  that USED ticket and requires reconciliation to detect the missing ticket.

## Current commands and results

`mvn -B -ntp -f backend/pom.xml verify`: **BUILD SUCCESS, 97 tests, zero
failures/errors/skips**, default profile, finished 2026-10-20T11:57:41+07:00
in 5:01. Every current class in the table above passed. Docker Desktop was running;
tests used actual Testcontainers services. [Machine-readable current results](m0-backend-suite.json)
were extracted from this run's log, not by summing stale Surefire XML files.
Old XMLs for the five absent classes remain from October 18 and must not be
counted as current executions.

[Historical artifact copy](m0-historical-backend-suite.json) preserves the original
111-test record without rewriting its command or result.

The tested working tree also contained the pre-existing, uncommitted
`WaitingRoomController` OpenAPI response annotations. These do not alter runtime
behavior and were not bundled into the migration or inventory commits.
No new Maven exclusions, skips or build dependencies were introduced.

Frontend gates executed:

- `npm run lint`: PASS.
- `npm test`: FAIL; proxy test passes; api, permissions and transport test files
  fail to load the deliberately removed root `src/api/client` / `src/access`.
  This is one passing test and three failed test files, not 35 passing tests.
- `npm run build`: PASS, 2089 modules; output `frontend/dist`; warning for a
  711.19 kB JavaScript chunk. The retained old UI's build is not proof that its
  auth, routes or payment flow match Spring.
- `npm run test:e2e`: **FAIL, all five authored Playwright tests executed and
  failed**, exit 1, against the healthy real Compose stack. Global setup
  completed; failures were browser assertions/timeouts, not missing fixtures.

| Authored browser test | Actual result |
| --- | --- |
| Anonymous public catalog / private redirect | FAIL: `/events` does not show the expected catalog heading; private redirect assertions were not reached |
| USER account / admin and gate 403 | FAIL: `/login` renders the old event UI; Email field missing, 90-second timeout before role assertions |
| STAFF landing / buyer and admin denial | FAIL: same login field timeout; access assertions not reached |
| ADMIN landing / operations / results | FAIL: same login field timeout; access assertions not reached |
| Full purchase / QR | FAIL: same login field timeout; queue, reservation, payment and QR steps not reached |

The retained app uses local view state rather than the tested URL router. A
backend authorization test passing does not make these SPA guards pass. This
baseline is **backend-green, frontend-red**; M0 verification is reported, but the
overall product definition of done is not met.

The deleted root app is not recreated and the authored access assertions are
not weakened to fit the old UI. Frontend integration remains a subsequent scope.

## Reproduce the live-stack browser check

This machine already had an ignored `.env.frontend.local` with independently
generated secrets. No secrets were copied into this report. Existing volumes were
preserved. Build/start command (exit 0, services healthy):

```powershell
docker compose --env-file .env.frontend.local -p ticketrush-frontend -f docker-compose.yml -f infrastructure/frontend-compose.yml up -d --build --wait
npm run test:e2e
```

Frontend is `http://127.0.0.1:3100`, Spring is `http://127.0.0.1:18080`.
The browser setup registers random accounts through the real API, assigns roles
through local PostgreSQL fixture administration, and creates a test event/tier/
waiting room through Spring. No HTTP mock or intercepted fake API is used.
Fresh machines must supply their own secrets; the local env file is not committed.
The stack remains running for review; no volume cleanup was performed.

Raw execution logs: `backend/m0-baseline-targeted.log`, `backend/m0-verify.log`,
`backend/m0-compose.log`, `backend/m0-playwright.log` (ignored).
Browser failures have screenshots and snapshots under `test-results/`, with the
HTML report under `playwright-report/` (ignored).
