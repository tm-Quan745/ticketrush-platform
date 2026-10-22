# M2b: shared seat status, merge and repository audit

## Scope and Git

Main now contains the explicitly approved `--no-ff` merges:
1. `2046caa`: codex/m0b-integration.
2. `6d532dc`: codex/m1-seated-inventory.

No push. M2/M2b remain on codex/m2-seat-read-apis, unmerged.
perf-v1 remains b19db2b7f1033729f75e3fc7e10f9708e2e0204a.

## Correctness and contract

Static geometry is public, immutable and versioned; dynamic status is a shared
A/H/S/B string with a stored ETag. The request path has no ownership query or JSON
hash. Clients obtain their own event-seat IDs from POST/GET reservations `seatIds`
(and the existing `seats[].id`) and overlay them locally. See ADR 0029 for cache
TTL, refresh activity, authorization, cancellation visibility and tradeoffs.

Real clean verify: **188 tests, zero failures/errors/skips**, 2026-10-22 19:33:25
+07:00, 4m16s. All 184 prior tests retained; assertions for the deliberately removed
mine contract now check shared responses plus owner-only reservation seat IDs.
Four new tests cover immutable geometry/payload, background refresh, publication
prewarm and stale snapshot rejection. Counts per class: m2b-backend-suite.json.

Measured UTF-8 response body sizes (without HTTP headers/compression):

| Section seats | Static geometry bytes | Dynamic status bytes |
| ---: | ---: | ---: |
| 30 | 3,441 | 128 |
| 800 (stadium Stand A) | 94,817 | 898 |

Client regenerated after contract changes. Lint passed, SPA unit tests **35/35**,
production build passed. No frontend components changed.

## Repository size and secrets

`git count-objects -vH` after evidence commit 577f9e0:

```text
count: 4797
size: 62.85 MiB
in-pack: 113
packs: 1
size-pack: 197.74 KiB
prune-packable: 0
garbage: 6
size-garbage: 2.00 MiB
```

The six existing temporary object files were retained; no prune/history rewrite.
Largest tracked HEAD file: docs/performance/results/soak-1-telemetry.json, 870,226
bytes. Twelve M2 Prometheus evidence files range from 240,101 to 305,389 bytes.
Next JSON evidence files: finish-sellout-20-2-audit.json 236,024 bytes and
finish-sellout-20-1-audit.json 233,658 bytes.

Historical blobs include stress-1.jfr (34,572,934 bytes), final-C-1.jfr
(11,976,633), iteration1-C-1.jfr (5,751,640), loadtest/.data/users.json
(2,448,890), baseline-C-1.jfr (1,772,946). Removing them from HEAD did not remove
history content or reduce the historical credential exposure.

Gitleaks default full-history Git mode exhausted memory, including a bounded retry
and per-commit diff attempt. The equivalent content scan enumerated every unique
blob reachable from all refs, exported its contents and scanned with gitleaks
8.24.3 Docker directory mode, default rules, redact and ignore-gitleaks-allow.
No size filter or custom secret allowlist was added. Exact image, coverage and
redacted aggregate counts are in m2b-secret-scan.json. Raw reports stay ignored.

Findings are concentrated in historical loadtest/.data/users.json,
loadtest/.data/admissions.json and loadtest/.data/admin.json: JWT and generic API
key detections. These files are absent from HEAD, but the history is **not clean**.
Before a first push: assess/revoke relevant credentials and explicitly authorize
history cleanup if desired; a private repository does not erase this exposure.
Final incremental scan covered all 39 new blob versions through 577f9e0: no
additional findings (gitleaks exit 0). Combined coverage: 2,397 unique historical
blobs across 131 reachable commits. The 10,083 original historical findings remain;
this incremental result does not make the history clean.
No secret values are included in this report. Detector output is not a guarantee
that every possible secret type is detectable.

## Measurement and browser gates

One campaign only: backend 6 CPU, k6 3 CPU; 60s warm-up excluded, then alternating
200/400 requests/s, three runs each, 60s each, 300 users. Memory caps retained:
backend/PostgreSQL 1GiB, Redis 256MiB, RabbitMQ/k6 512MiB, Mailpit 128MiB.
These CPU caps differ from M2's backend 2/k6 2; no direct performance comparison.

Initial stack startup used new credentials against retained PostgreSQL volumes
and failed before any measurement. Reusing the existing private credentials fixed
startup without deleting volumes. No failed startup is a performance run.

**Campaign FAIL: 5/6 runs passed; m2b-read-400-1 dropped 2 iterations.**
All runs had zero 5xx and 100% hot request-cache hits. k6 p95 ranged 3.14-9.49ms;
server histogram p95 2.69-8.59ms. These observations do not establish readiness
at 200/400 req/s because the defined campaign work minimum was not met.
No tuning or second campaign followed. Full per-run table, CPU/memory and raw
provenance: [M2b micro-measurement](performance/m2b-read/README.md).
RabbitMQ had one sample maximum 100.97% against a 100% quota; do not claim every
instantaneous CPU sample was under quota. Four sampling errors are retained.

Image: sha256:4e0cc26f9d9eeda69338e8ecb35c6dd9c826ffdd202357c090f88ddc0f7b8436.
Image/runner revision: b0df20d8cf15a86adc17444357287ccb5bb2d39c.
Backend implementation: e5d6bde; it did not change during or after measurement.
A final contract-only repair copied the existing COUNTER/SEATED reservation shapes
into the main OpenAPI before final client regeneration; it did not change runtime
Java or the measured path. Frontend production JS content hash stayed unchanged.

Final client generation, lint, SPA tests **35/35**, build: PASS.
Playwright on production frontend + real Spring/Compose: **5/5 PASS, 20.1s**.
Teardown used the ADMIN API; DB verification found 2 historical/current CANCELLED
E2E events and zero published E2E events. Credential journal was removed.
Task Compose containers stopped afterward; volumes retained.
Screenshots: [public](screenshots/m2b/public.png), [USER](screenshots/m2b/user.png),
[STAFF](screenshots/m2b/staff.png), [ADMIN](screenshots/m2b/admin.png),
[purchase](screenshots/m2b/purchase.png).

## Commands and per-class results

- Backend: `mvn -B -ntp -f backend/pom.xml clean verify`.
- Client/SPA: `npm run api:generate`, `npm run lint`, `npm test`, `npm run build`.
- E2E: `npx playwright test`, E2E_BASE_URL=http://127.0.0.1:31882,
  E2E_DB_CONTAINER=ticketrush-m2-read-postgres-1, E2E_DB_NAME=ticketrush_m2_read,
  E2E_DB_USER=ticketrush. The stack must be running first.
- Measurement runner: `node infrastructure/scripts/seat_read_measurement.mjs`
  with up / fixture / measure / report / down. Do not rerun measure without a new
  authorization: the one campaign for this task is complete.

| Class | Tests | Failures / errors / skipped |
| --- | ---: | --- |

| AuthIntegrationTest | 6 | 0 / 0 / 0 |
| GlobalExceptionHandlerTest | 1 | 0 / 0 / 0 |
| RedisGuardTest | 3 | 0 / 0 / 0 |
| EventInventoryIntegrationTest | 9 | 0 / 0 / 0 |
| MigrationIntegrationTest | 1 | 0 / 0 / 0 |
| SeatedInventoryIntegrationTest | 73 | 0 / 0 / 0 |
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

M2/M2b remain unmerged, no push, no M3. Stop for review.
