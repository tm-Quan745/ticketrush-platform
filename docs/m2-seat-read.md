# M2 seat read APIs and M1 evidence follow-up

Scope: Spring read APIs, generated client, dev event seed, correctness tests and
one bounded read micro-measurement. No SPA component changes or M3/M4 work.
Branch: `codex/m2-seat-read-apis`; main and perf-v1 remain unchanged.

## 0a: actual concurrency evidence

Selected test run finished 2026-10-21 21:31:29 +07:00, 2/2 pass.
Command: `mvn -B -ntp -f backend/pom.xml -Dtest=SeatedInventoryIntegrationTest#twoHundredOverlappingHoldsAreAtomicAndNeverDuplicate+lockedSeatIsSkippedImmediatelyWithConflict test`.

| Parameter / actual result | Value |
| --- | --- |
| Real threads / distinct users | 200 / 200 |
| Target block | 30 event-seat IDs; second section has 30 untouched seats |
| Requests | quantity=2+i%5, start=i%25 in sorted UUID list; 40 each of sizes 2..6 |
| Accepted / conflicts | 7 / 193 SEATS_UNAVAILABLE |
| Accepted seats / valid tickets | 26 / 26, settled through concurrent signed HTTP webhooks |
| Target final states | AVAILABLE 4, HELD 0, SOLD 26, BLOCKED 0 |
| Event final states | AVAILABLE 34, HELD 0, SOLD 26, BLOCKED 0 |
| Elapsed | 1,796ms, holds through final verifier, excluding fixture/user creation |
| Timeouts | JUnit 90s, barrier 15s, each future 60s, termination 10s, HTTP 40s |
| SQL limits | lock_timeout 100ms, statement_timeout 5s |

Hold requests invoke the real service in real threads; the 193 conflicts are service
exceptions mapped to HTTP 409, not 193 HTTP requests. Accepted counts depend on
scheduling, not fixed expectations. Atomicity and verifier checks are the criteria.

## 0b: mutation sanity

Mutations ran individually against disposable Testcontainers; source restored in
finally. Production data and V8 migration were not changed.

| Mutation | Test | Actual result |
| --- | --- | --- |
| Remove SKIP LOCKED | lockedSeatIsSkippedImmediatelyWithConflict | FAIL: lock timeout instead of SEATS_UNAVAILABLE |
| Drop uq_live_ticket_seat | signedPaymentIssuesSnapshotAndDuplicateLiveSeatIsRejected | FAIL: duplicate INSERT succeeded; expected exception absent |
| Drop fk_event_seat_current_claim | deferredClaimRequiresMembershipAtCommitAndHistoricalMembershipIsRetained | FAIL: claim without membership committed; expected exception absent |

Each run: 1 test, 1 assertion failure, zero errors/skips. No hang was necessary.
The deterministic lock-owner test holds a row in another transaction until the
contender returns; random overlap alone cannot guarantee killing this mutation.
After restoration and 0c tests, full clean verify finished 21:38:29 +07:00:
**176 tests, zero failures/errors/skips**, before M2 implementation.

## 0c: waiting room and public buckets

M1 already derives SEATED buckets from event-seat rows; admission uses these
independently of the public catalog cache. New tests cover AVAILABLE -> LOW ->
SOLD_OUT without public exact quantities/identities; ADMIN loadtest queue seed;
empty admission/feed when all seats are blocked; unblock/admit/consume a real token;
hold the last seat and stop admission/feed; cancel and regain sellable stock.
No production fix was needed for 0c. Catalog retains its existing cache policy.

## 0d: merge preview and tracked-file audit

Executed only in `.tmp/m2-merge-preview`, branch `codex/m2-merge-preview`, from
main ea95e0c: `git merge --no-ff codex/m0b-integration`, then
`git merge --no-ff codex/m1-seated-inventory`. Both conflict-free; preview tree
equals M1 exactly. Main was not merged and nothing was pushed. Approval required.

```text
*   30e4f34 merge: preview M1 seated inventory after M0b
|\
| * e67efa2 docs(inventory): record M1 implementation and verified test results
| * 831b927 feat(verifier): validate seated claims and ticket conservation
| * 0b15c5f feat(inventory): implement atomic seated reservation lifecycle
| * cf0c736 feat(inventory): add seated schema and immutable stadium template
* | 9af6d8e merge: preview M0b integration into main
|\|
| * b7e3e85 test(e2e): cancel fixture events during teardown
| * 46e2ee6 docs(baseline): record M0b lineage preservation and passing gates
| * 9845660 fix(frontend): restore canonical auth routes and purchase flow
```

`git ls-files | Select-String -Pattern '\.env|secret|token'` matches .env.example,
RefreshToken.java, RefreshTokenRepository.java, TokenService.java, token-bucket.lua,
ADR 0026. Env secret placeholders are empty. No actual .env/private token fixture
is tracked. Filename inspection is not a proof about all historical file contents.
`git ls-files -ci --exclude-standard` finds 364 historical performance artifacts:
the existing policy explicitly force-adds curated evidence. This existing exception
is retained, not silently discarded or reported as zero ignored tracked files.

An additional content scan of tracked files for JWT-shaped strings, private-key
headers, GitHub token prefixes and AWS access-key IDs returned no matches. It is
a targeted sanity scan, not a comprehensive secret-history audit.

## Read policy

Seatmap: PUBLIC. Seats: USER/STAFF/ADMIN. Suggest: USER with existing admission rule.
Redis stores identity-free snapshots; mine is a private PostgreSQL owner/TTL overlay.
ETag hashes the effective representation, with private no-cache and Vary Authorization.
No user/reservation IDs are returned. Safe geometry is bounded numeric coordinates
and hex colour, never SVG/HTML; COUNTER sections return no exact stock.

Redis TTL is 1,000ms after publication, with no stale fallback entry: staleness is
rebuild duration + 1,000ms. Distributed single-flight lease 5s, owner-checked writes,
waiter deadline 2s (503 instead of another rebuild). DB work is capped at 8 reads,
1s maximum admission wait, then 503 SEAT_READ_BUSY / Retry-After: 1. Redis failure
falls back to PostgreSQL through that gate. Stale AVAILABLE still conflicts at hold.
No write invalidation is required for correctness. Per-user limit 120/minute;
shared-IP ceiling 30,000/minute; conservative local fallback 10/300 per minute.

Dev seed: tagged [dev-seated-v1], one published 3,200-seat stadium, no accounts,
transactional/advisory-lock idempotency; absent in prod/demo/loadtest even with dev.
DEV_SEED_ENABLED=false disables the pre-existing generic dev seeder separately.

## Verification and measurement

Full clean verify: **184/184 pass**, zero failures/errors/skips, finished
2026-10-22 13:52:45 +07:00, 4m16s. All 173 M1 tests remain plus 11 tests.
See [machine-readable suite evidence](m2-backend-suite.json) and
[preflight/mutation evidence](m2-preflight-evidence.json).

| Class | Tests | Failures/errors/skips |
| --- | ---: | --- |
| AuthIntegrationTest | 6 | 0/0/0 |
| GlobalExceptionHandlerTest | 1 | 0/0/0 |
| RedisGuardTest | 3 | 0/0/0 |
| EventInventoryIntegrationTest | 9 | 0/0/0 |
| MigrationIntegrationTest | 1 | 0/0/0 |
| SeatedInventoryIntegrationTest | 69 | 0/0/0 |
| ObservabilityIntegrationTest | 3 | 0/0/0 |
| MockGatewayIntegrationTest | 1 | 0/0/0 |
| OrderPaymentIntegrationTest | 20 | 0/0/0 |
| ConditionalReservationIntegrationTest | 13 | 0/0/0 |
| OptimisticReservationIntegrationTest | 13 | 0/0/0 |
| OrderSmallPoolIntegrationTest | 3 | 0/0/0 |
| OutboxDeliveryIntegrationTest | 1 | 0/0/0 |
| OutboxIntegrationTest | 2 | 0/0/0 |
| PessimisticReservationIntegrationTest | 13 | 0/0/0 |
| ReservationStatusTest | 1 | 0/0/0 |
| Week6RedisIntegrationTest | 25 | 0/0/0 |

Client generation succeeded (3 new read operations); lint, **35/35 SPA unit tests**
and production build passed on 2026-10-22. Only the generated frontend API file
changed. All six read runs FAILED the work minimum; measured results are below.
Initial 100-request test failed on premature 503s; kept its assertions and repaired
the gate. Node tests first hit sandbox spawn EPERM, then passed on an authorized run.

Backend: `mvn -B -ntp -f backend/pom.xml clean verify`.
Client/SPA: `npm run api:generate`, `npm run lint`, `npm test`, `npm run build`.
Read measurement: `node infrastructure/scripts/seat_read_measurement.mjs up`, then
fixture, measure, down. Separate project ticketrush-m2-read, port 28882; private env
and credentials live under ignored .tmp/m2-measure.

Six runs alternate 200/400 req/s, 60s each, 300 distinct synthetic JWT users. Work
minimum is >=99% scheduled requests returning 200 and zero dropped iterations.
Server p95 interpolates per-run histogram deltas; k6 measures client HTTP duration.
This is a read micro-measurement, not seating checkout/sell-out performance evidence.

The 2026-10-22 first test attempt stalled with an unresponsive Docker daemon and
was stopped. Docker Desktop was restarted without deleting volumes; the clean
184-test run above completed afterward. Earlier full run had one burst-read 503;
the bounded wait was raised to 1s without changing its 100-success/one-rebuild
assertions. No failed or interrupted run is counted as passing.

## Final read measurement and SPA gates

All six 60s runs completed in alternating order 200/400 requests/s with 300 users.
**0/6 met the work minimum.** Under the recorded backend 2-CPU cap, successful
responses were 3,070/12,000; 6,823/24,000; 7,554/12,000; 8,428/24,000;
9,850/12,000; and 10,726/24,000. First two runs had 260 and 66 observed 5xx;
remaining runs had zero, but dropped iterations still made every run FAIL.
No seating throughput or 200/400 requests/s readiness claim is supported.

[Full six-run table, server/k6 p95, CPU/memory against caps and provenance](performance/m2-read/README.md).
[Raw summaries, resources and SHA-256 manifest](performance/m2-read/summary.json).
Image: sha256:10edca7ee92cddd8de598b32fe9f56a05472981c65d3b1b7e06bc2b2edaebcc6;
image build revision 3aef4eef562b841ca9d593a4f81fcdc3040c1375, backend source 567d7ff.
The runner now reports exit 2 on unmet work minimum; verified on these six results.

Client generation, lint, 35/35 SPA unit tests and production build passed.
Playwright: **5/5 passed in 14.4s** against the production frontend container and
Spring M2, at localhost:31882 after measurement had ended. The ADMIN teardown
cancelled its event; database verification found one CANCELLED E2E event and no
published E2E event. The fixture credentials journal was removed.
Role/purchase screenshots: [public](screenshots/m2/public.png), [USER](screenshots/m2/user.png),
[STAFF](screenshots/m2/staff.png), [ADMIN](screenshots/m2/admin.png), [purchase](screenshots/m2/purchase.png).

No frontend components were changed, only generated API types. No merge into main,
no push, no perf-v1 movement, no M3 implementation. Read-load shortfall remains for
review; do not infer performance acceptance from the passing correctness suite.
