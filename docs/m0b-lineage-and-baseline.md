# M0b lineage and baseline repair

[Initial graph, status manifest and all 76 deleted source paths](m0b-initial-git-evidence.md).

## Initial lineage and integration decision

Initial HEAD: `ec40680` on `main`. Historical test subject: `fcb976f`;
the 111-test JSON report was committed in `b19db2b`. The performance branch
tip is `494a33d` (`feat/observability-load-testing` and its origin tracking ref).
`git branch -a --contains fcb976f` lists only those two performance refs.
Merge base with initial HEAD: `13c36d97312c410306578edca618a7da3b1bac57`.
`perf-v1` did not exist at the start of M0b.

The two lines must be joined, not have their tests copied in isolation. Preserve
the incoming production changes and M0's STAFF/check-in, migration assertions,
and VALID/USED inventory audit. Integration takes place on
`codex/m0b-integration`, leaving `main` unchanged. The merge applied without text
conflicts; runtime/security validation is still required.

## Eighteen historical tests missing from the initial branch

| Class | Method | Production behavior covered |
| --- | --- | --- |
| GlobalExceptionHandlerTest | countsApiExceptionWithNormalizedEndpoint | `api_exceptions_total`, bounded endpoint labels |
| RedisGuardTest | shortTimeoutBurstDoesNotOpenCountBasedCircuit | Count-based breaker tolerates transient timeout bursts |
| RedisGuardTest | sustainedTimeoutsOpenThenSuccessfulHalfOpenProbesCloseCircuit | Open/half-open/closed recovery with successful probes |
| RedisGuardTest | legacyLoadTestModeOpensOnFirstQualifyingFailure | Explicit legacy immediate-breaker diagnostic mode |
| ObservabilityIntegrationTest | scrapeIsAuthenticatedAndNeverLeaksIdentityLabelsOrRawRoutes | Secured Prometheus endpoint, safe metric labels |
| ObservabilityIntegrationTest | correlationHeaderIsBoundedAndThreadContextIsCleared | Bounded correlation IDs and request-context cleanup |
| ObservabilityIntegrationTest | loadtestDurabilityProbeReadsDurableSettingsThroughTheApplicationPool | Actual JDBC durability settings through the application pool |
| OrderPaymentIntegrationTest | getOrderReturnsPaymentAndItemsFromJoinedRead | Single-query owned order status/payment/items view |
| OrderSmallPoolIntegrationTest | concurrentOrdersNeedOnlyOneConnectionPerRequest | Avoid nested connection acquisition for order creation |
| OrderSmallPoolIntegrationTest | lazyExpiryCommitsEvenWhenOrderIsRejected | Expiry preparation commits outside rejected business transaction |
| OrderSmallPoolIntegrationTest | completedKeyReplaysBeforeReservationPreparation | Completed idempotency replay precedes preparation |
| OutboxDeliveryIntegrationTest | everyPurchaseEventRoutesAndConcurrentDuplicateDeliverySendsOneEmail | Durable routing and idempotent email delivery |
| Week6RedisIntegrationTest | closedQueueSeedPreservesInputOrderAndRejectsInvalidCohorts | Validated deterministic closed-queue loadtest seeding |
| Week6RedisIntegrationTest | loadtestSeedRequiresAdminAndValidInput | ADMIN-only seed authorization/input validation |
| Week6RedisIntegrationTest | warmJoinSettingsAvoidDatabasePoolFanout | Cached join settings avoid database fanout |
| Week6RedisIntegrationTest | statusUsesRedisSettingsAndPollIntervalGrowsWithQueuePosition | Redis-only status and queue-position polling advice |
| Week6RedisIntegrationTest | statusJittersLongPollIntervalsByTwentyFivePercent | Polling interval jitter |
| Week6RedisIntegrationTest | statusHttpReturnsItsJitteredPollAdvice | HTTP status and Retry-After agree |

## Production feature audit

“Initial” below means `ec40680`, before the merge.

| Feature | Initial | Incoming performance line / merged implementation |
| --- | --- | --- |
| Count-based RedisGuard (ADR 0035) | Missing; immediate breaker only | RedisGuard sliding outcomes and half-open probes; legacy mode explicit |
| Redis command timeout 1,000 ms | Compose used 300 ms | Compose default 1000 ms; application.yml fallback remains 300 ms, environment may override |
| Hikari 1.5 s fail-fast / 503 | Missing explicit setting and handler | `connection-timeout=1500`; GlobalExceptionHandler returns DATABASE_POOL_TIMEOUT / Retry-After |
| Zero-wait bulkhead / 429 | Missing | RequestBulkhead `tryAcquire`, BulkheadFilter returns 429 |
| Single-query GET /orders/{id} | Missing joined read | OrderRepository.getView and OrderService joined status read |
| JDBC durability probe | Missing | DatabaseDurabilityReporter / LoadtestDurabilityController |
| Redis-only waiting-room status and jitter | Missing optimized path | WaitingRoomService cached/Redis settings; jittered HTTP polling advice |
| Loadtest admission feed / seed | Missing | LoadtestAdmissionController, profile restricted and ADMIN guarded |
| api_exceptions_total | Missing | GlobalExceptionHandler normalized labels |
| redis_fallback_total | Present, feature label only | Preserved, extended with reason label |
| Same-tier pessimistic serialization | Missing local stripes | 256 local ReentrantLock stripes before borrowing JDBC connections; PostgreSQL row lock still provides cross-instance correctness |

## Working-tree preservation

`codex/m0b-baseline-wip` at `679f763` preserves the previously uncommitted source,
documentation and imported performance artifacts (1187 files). This is explicitly
a WIP snapshot, not a passing release. No original file was discarded.

| Initial group | Origin / disposition |
| --- | --- |
| Modified .env.example, .gitignore, AGENTS.md, docker-compose.yml | Earlier frontend integration and cleanup; preserved in WIP; relevant settings integrated after backend verification |
| Modified WaitingRoomController | Earlier OpenAPI 200 annotations; preserved on WIP; merged production controller retained without overwriting its metrics/status implementation |
| Added frontend/src, root build/proxy config, package manifests, tests, scripts | Earlier UI import/access task; preserved in WIP, canonical source remains frontend/src |
| Added docs/api, design ADRs, audit/seating diagrams | Earlier design-only review; preserved in WIP, no seating implementation |
| Added docs/performance, loadtest, infrastructure/loadtest and scripts | Previously copied performance artifacts/tools; WIP preserves exact copies; merge supplies authoritative versioned performance line |
| Added .mvn-week7-settings.xml, 25444, week7-checkout-k6-inspect.json, metadata.json, bun.lock | Local tooling/import metadata and run artifacts; WIP preserves them, no need to activate them |
| Untracked .m2-week7 and .worktrees | Dependency cache and nested Git checkout; preserved locally, ignored rather than committed recursively |
| Inaccessible tmpkz_18cce | Pre-existing runtime directory; preserved, ignored, not deleted or recursed |
| Deleted root src and dist (earlier cleanup) | User explicitly requested removal of UI outside frontend; root sources had never been tracked, so no Git deletion commit exists |

The initial `git status --short` has **no tracked D entries**. The complete
76-source deletion manifest is recovered from the pre-deletion design audit,
not fabricated from Git history. Root dist was generated build output.
See the preserved initial Git evidence for the graph, expanded added-file list
and every deleted source path.

## Frontend root cause

The three unit-test files import `../src/api/client` (api/transport tests) and
`../src/access/permissions`, `../src/access/routes` (permissions tests).
There is no deleting commit: these untracked files were removed in the explicitly
authorized cleanup before M0. `ec40680` documents the failure; it did not delete
tracked modules. Reconstruct equivalent behavior inside `frontend/src`, update
only the import paths, and preserve every existing assertion.

The root index.html serves `/frontend/src/main.tsx`. Previously its App used
`currentView='event_detail'` and a hardcoded event, independently of pathname.
Thus `/`, `/events` and `/login` all served the same event view. No current
routes.ts existed. The authored tests expect public `/events`, `/login?next=…`,
buyer `/account/*`, `/events/:id/queue`, `/events/:id/select`,
`/checkout/:reservationId`, `/orders/:id`, STAFF `/gate`, ADMIN `/admin` and
operations/results pages. A real route/permission shell and normal auth must
serve those routes; changing selectors to ignore failed behavior is not a fix.

## Completed integration and verification

- Merge commit: `519ef48`, with both M0 and performance parents. No text conflicts.
- Annotated local tag `perf-v1` points to `b19db2b7f1033729f75e3fc7e10f9708e2e0204a`.
  Nothing was pushed. The tag denotes historical COUNTER evidence, not seating.
- `mvn -B -ntp -f backend/pom.xml clean verify`: **115 passed**, zero failures,
  errors or skips, 3:51, completed 2026-10-20T12:12:37+07:00.
  [Per-class machine-readable results](m0b-backend-suite.json).
  The default suite excludes benchmark; historical 111 also excluded it.
- `npm run lint`: PASS. `npm test`: **35 passed**, no failures/skips.
- `npm run build`: PASS; 2002 modules, JavaScript 330.68 kB (104.05 kB gzip).
- `npm run docs:access`: PASS after fixing a pre-existing mismatched template
  delimiter in the generator. Matrix/page map come from canonical code.
- `npm run test:e2e`: **5 passed in 16.8 s**, against real Spring/PostgreSQL/Redis
  through the production-built frontend proxy. Global setup created real fixtures.
  The access.spec.ts Git blob is identical to the preserved WIP blob: no authored
  browser assertions changed. Unit test changes only update canonical import paths.

| Backend class | Tests | Result |
| --- | ---: | --- |
| AuthIntegrationTest | 6 | PASS |
| GlobalExceptionHandlerTest | 1 | PASS |
| RedisGuardTest | 3 | PASS |
| EventInventoryIntegrationTest | 9 | PASS |
| MigrationIntegrationTest | 1 | PASS |
| ObservabilityIntegrationTest | 3 | PASS |
| MockGatewayIntegrationTest | 1 | PASS |
| OrderPaymentIntegrationTest | 20 | PASS |
| ConditionalReservationIntegrationTest | 13 | PASS |
| OptimisticReservationIntegrationTest | 13 | PASS |
| OrderSmallPoolIntegrationTest | 3 | PASS |
| OutboxDeliveryIntegrationTest | 1 | PASS |
| OutboxIntegrationTest | 2 | PASS |
| PessimisticReservationIntegrationTest | 13 | PASS |
| ReservationStatusTest | 1 | PASS |
| Week6RedisIntegrationTest | 25 | PASS |

The five browser cases cover anonymous redirects, USER denial on admin/gate,
STAFF gate-only private access, ADMIN navigation/Results and the full COUNTER
purchase through queue, reservation TTL, Idempotency-Key, gateway payment and
two locally generated ticket QR images. Screenshots are linked from
[frontend access](frontend-access.md).

No new payment confirmation endpoint, mock business API or seating implementation
was introduced. The active app reuses Card, Button, ThemeToggle, CreateEventModal
and existing styles. The richer legacy seating components stay in source; the
pre-repair App and all imported artifacts also remain recoverable on the named
WIP branch. A later seating milestone must integrate the real seat contract.

## Environment and limitations

Docker Desktop needed restarting during the resumed session. Windows had reserved
TCP ports 15362–15461, including the old PostgreSQL host port 15433. The ignored
local test env now uses POSTGRES_PORT=25433. No volumes or database data were
removed. Backend remains on 18080, frontend on 3100; internal service ports stay
unchanged. The same isolated Compose project was rebuilt and became healthy:

```powershell
docker compose --env-file .env.frontend.local -p ticketrush-frontend -f docker-compose.yml -f infrastructure/frontend-compose.yml up -d --build --wait
npm run test:e2e
```

Raw logs: backend/m0b-merged-verify.log, m0b-frontend-lint.log,
m0b-frontend-test.log, m0b-frontend-build.log, m0b-compose-retry.log and
m0b-playwright.log (ignored). The initial build failure from a WIP-only Results
artifact was corrected to versioned finish-sellout-20-2 evidence before passing
build/browser verification. A first docs-generation syntax failure was corrected
and rerun successfully; neither initial failure is described as a passing run.

The generated API snapshot in docs/api/openapi.json is the preserved baseline
contract, not a newly captured complete performance API. Repaired adapters use
the existing Spring endpoints tested above; no new endpoint is inferred from the
proposed seating contract. Refresh tokens remain in memory (documented backend
cookie limitation). Draft-event admin listing is still unavailable. The passing
five-case suite does not claim exhaustive coverage of every legacy screen.

## Final group disposition

- `679f763` on `codex/m0b-baseline-wip`: complete named WIP preservation before
  integration; includes old source, local import metadata and copied performance
  artifacts that are not activated on the integration branch.
- `519ef48`: coherent merge of both backend lines, verified with 115 tests.
- `b013121`: canonical frontend, import-path repairs, generated baseline client,
  proxy/build/Compose configuration and tests; lint, 35 unit tests, build and
  five browser tests passed before commit.
- Review/design documents and final verification are committed separately;
  both OpenAPI JSON files parse and all 153/332 local references resolve.
  This check is not a claim that proposed seating endpoints are implemented.
- Runtime/cache directories remain ignored and intact; ignored local test
  credentials were never staged. No blanket reset, volume deletion or source
  discard was used. No branch or tag was pushed.
