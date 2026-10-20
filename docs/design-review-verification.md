# Design review verification — 2026-10-19

Scope: documentation-only hybrid seating / old-UI integration proposal. No
application code, test code, migration or frontend merge was changed in this step.
The working tree already contained implementation from earlier turns, including
V7 STAFF/check-in and an inventory audit change; those are part of the baseline,
not new work in this documentation step. No cleanup/reset of those changes occurred.

## Actual results

| Command/check | Result |
| --- | --- |
| `mvn -B -ntp -f backend/pom.xml verify` — first attempt | BUILD FAILURE; Docker daemon was stopped; Testcontainers could not initialize; 11 reported test entries, 10 startup errors, 1 pass. Not a business correctness result |
| Same command after starting installed Docker Desktop | BUILD FAILURE; **96 tests, 1 failure, 0 errors, 0 skipped** (95 passed) |
| `mvn -B -ntp -f backend/pom.xml -DskipTests package` | BUILD SUCCESS; confirms compile/package only, does not make the failed suite green |
| `npm run lint` | Passed; TypeScript noEmit |
| `npm test` | **35 passed, 0 failed**; API/auth/permissions/proxy/transport tests against the root shell |
| `npm run build` | Passed; Vite production build, 2048 transformed modules |
| `npx --yes @apidevtools/swagger-cli validate docs/api/reserved-seating-proposed.openapi.json` | Valid OpenAPI |
| Local reference/path/operation consistency check | Passed: 30 paths, 31 operations, 53 schemas, 332 resolved local references; operation IDs unique; path parameters declared |
| Playwright / seat concurrency / seat load run | Not run in this design-only step; no claim that seating implementation or browser suite passes |

Validator was invoked temporarily through npx; no application dependency was
added or changed. No new generated TypeScript client was produced from the proposed
contract, and the captured existing docs/api/openapi.json was not replaced.

## Existing failure discovered

`backend/src/test/java/com/vibe/ticketrush/event/MigrationIntegrationTest.java:29`
asserts that migrating from V2 to latest executes exactly **4** migrations. With
the prior V7 STAFF/check-in migration present, actual migrations V3–V7 total **5**.
The test fails before its later data-preservation assertions. This is not proof
that those later assertions pass, and this suite cannot be described as green.

No assertion was weakened/disabled and no test was modified in this step. Before
seating implementation, a separately approved repair should assert pending
migration versions and retain all legacy-data assertions rather than repeatedly
hardcoding the current count. Then rerun the full suite. Do not remove V7, skip
this test, or claim package success substitutes for verify.

The requested “111 existing tests” was not reproduced in this checkout: the
default Maven configuration excludes the `benchmark` tag and executed 96 tests.
At that review date the source of 111 had not been established. M0 subsequently
located the historical artifact on a different branch; see
[M0 baseline verification](m0-baseline-verification.md) for the exact command,
per-class comparison and new results. Benchmark/load profiles were not run because this
step stops before seating load work. Future additions must preserve all existing
tests and record the exact command, profile and counts.

## Per-class backend results (successful Docker attempt)

| Class | Tests | Failures |
| --- | ---: | ---: |
| AuthIntegrationTest | 6 | 0 |
| EventInventoryIntegrationTest | 9 | 0 |
| MigrationIntegrationTest | 1 | 1 |
| MockGatewayIntegrationTest | 1 | 0 |
| OrderPaymentIntegrationTest | 18 | 0 |
| ConditionalReservationIntegrationTest | 13 | 0 |
| OptimisticReservationIntegrationTest | 13 | 0 |
| OutboxIntegrationTest | 2 | 0 |
| PessimisticReservationIntegrationTest | 13 | 0 |
| ReservationStatusTest | 1 | 0 |
| Week6RedisIntegrationTest | 19 | 0 |

Local raw logs (ignored): backend/verification-design-review.log,
backend/verification-design-review-retry.log, backend/build-design-review.log.
Surefire details are under backend/target/surefire-reports. Containers started by
Testcontainers are disposable; no existing project volume was deleted. Docker
Desktop remains running after verification.

## Review gate

Review the [proposal and merge plan](frontend-backend-design-review.md),
[OpenAPI](api/reserved-seating-proposed.openapi.json),
[ADR](decisions/0029-hybrid-counter-seated-inventory.md) and
[data model](seating-data-model.md). Approve or revise the event-seat ID semantics,
single-tier holds, accessibility selection, COUNTER-only numeric capacity edits,
demo order initiation and scoped reseed behavior before implementation.
No seed/reset script or demo accounts were created/executed here. No deletions or
application merge are performed until review. The baseline failure remains an
explicit blocker to a future claim that all backend tests are green.
