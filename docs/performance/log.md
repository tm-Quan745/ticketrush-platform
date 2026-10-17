# Performance experiment log

## 2026-10-17 — RedisGuard resilience and paced join gate

The prior `checkout-V20-cpu-1` join failure remains a negative setup artifact. Under the old
breaker, the first qualifying Redis timeout opened the circuit; `circuit_open` then persisted for
the configured five seconds. The artifact records fallback counts but not the first-open timestamp,
so the old duration cannot be measured retrospectively.

Commit `256be50` adds ADR 0035 and changes only front-door Redis resilience: command timeout
1,000 ms; count-based breaker window 100, minimum calls 50, failure-rate threshold 50%, five-second
open wait, three half-open probes. It emits call/failure/transition metrics. A unit test proves
three timeouts do not open the breaker and five sustained timeouts do; reservation admission remains
fail-closed.

The timestamped `join-900-resilience-1-redis-diagnostics.json` capture has `appendfsync=everysec`,
`aof_delayed_fsync=0`, `aof_last_write_status=ok`, no latency event and no fork observation;
Redis CPU peaked at 7.24% and Lettuce EVALSHA max at 6.95 ms. This repeat has no evidence of Redis
AOF/fsync or fork stall. The initial constant-arrival implementation made an extra 901st iteration,
so `join-900-resilience-1` is invalid and excluded.

Commit `9903a63` makes a paced join exact: 90 users per second, ten per-VU rounds, no boundary
iteration. Valid runs `join-900-resilience-1b`, `-2` and `-3` each started/accepted 900/900 with
zero failed joins, zero drops, zero guard failures/transitions, verifier PASS and server p95
30.9/71.6/19.7 ms (all below 1 s). k6 p95 was 348.7/282.0/239.5 ms while backend p95 stayed low;
this difference is outside the handler. k6 peak CPU was only 0.10–0.13 of its 3-core cap.

Generated `environment.json`, `last-reset.json`, `last-seed.json`, admission captures, PIDs and
new runtime JSON are now ignored. They remain under `results/` locally but do not make source dirty;
curated small summaries must be force-added in a separate commit. New provenance now reports
`working_tree_clean=true` with this same tracked-file check.

### Fault injection after cooldown change

Commit `9374383` changes the default count-based cooldown to two seconds. Its runner-only
diagnostic flag `REDIS_BREAKER_MODE=legacy-immediate` keeps the command timeout at 1,000 ms while
restoring first-qualifying-failure opening and a five-second cooldown. `RedisGuardTest` passed 3/3,
including both modes. This is load-test-only comparison support, not a production default.

This is a small fault-injection experiment: one effective run per arm, each a 900-user join paced
at 90/s. The monitor sends `CLIENT PAUSE` only after k6 starts `scenarios.js`. All valid runs have
provenance with backend durability `on/on`, zero dropped iterations and verifier PASS. The first
`fault-new-1100` missed the workload, and its rerun did not overlap a Redis call; both are invalid
and excluded.

| run | pause | accepted / failed after retries | QueryTimeoutException | breaker result | circuit-open fallbacks | result |
| --- | --- | ---: | ---: | --- | ---: | --- |
| `fault-new-1100-effective` count-based | 1,100 ms at 14:10:22.266Z | 900 / 0 | 0 | no transition | 0 | PASS |
| `fault-legacy-1100` legacy | 1,100 ms at 14:12:06.925Z | 673 / 227 | 5 | open 14:12:08.201Z; closed 14:12:13.206Z (5.005 s) | 2,935 | FAIL: work minimum |
| `fault-new-3000` count-based | 3,000 ms at 14:14:14.018Z | 900 / 0 | 137 | open after 50/100 failures; closed after 1.998 s | 110 | FAIL: join p95 3,065.9 ms |

The count-based 1,100 ms arm saw client latency but no `QueryTimeoutException`; it is not an
effective comparison with the legacy arm. The legacy result nevertheless shows the old policy's
amplification. The 3,000 ms control shows the new policy opens only after sustained errors, returns
controlled 503s while open, then closes after three probes; 22 retryable k6 503s still led to
900/900 eventual joins. These observations do not explain the original 20 timeouts in
`checkout-V20-cpu-1`; that root cause remains unknown. The earlier passing join used a different
load shape (k6 0.10 core versus 2.85 cores in the failed setup), so it is not causal evidence.

### Fresh checkout V20

`checkout-V20-resilience-1..3` each created their own closed 900-user queue, used admission tokens
younger than five minutes, and paced 100 checkout users at 20/s. Each run has 100 started and 100
PAID, no labelled 429/503/other rejection, zero drops, verifier PASS and zero oversell. Reserve/order
p95 was 284.5/100.9, 133.8/112.0 and 36.2/30.5 ms; Docker memory max was 56.54/57.35/57.47%, below
the abort threshold. This unblocks calibration, but calibration and sell-out have not run.

## 2026-10-17 — reject empty checkout successes

The next bounded Week 7 task is repairing the checkout acceptance gate before further
503 diagnosis. Existing `checkout-V20-paced-diagnose` is **not** a successful checkout:
its summary records 100 `checkout_reservation_invalid_admission` and 100 `error`
outcomes, while its verifier records zero orders. Both processes nevertheless returned
zero. This proves an acceptance defect, not the cause of earlier 503 responses.

Previously Q/V treated terminal 403/429/503 as successful business checks and had no
minimum PAID count. Now every admitted checkout must succeed, and thresholds require
exactly the offered cohort to start and reach PAID. Q uses the admission count; V uses
integer requests/second multiplied by whole seconds. Empty or undersized admission
fixtures fail before measurement. An extra k6 duration-boundary iteration is ignored.
Bounded retries and per-response diagnosis remain enabled; an eventual successful
retry can still pass. These are calibration gates with sufficient inventory, not a
sell-out contract where SOLD_OUT is an acceptable final outcome.

The earlier checkout verifier PASS wording is retracted as acceptance evidence. `checkout-Q100`
has 30 orders in its verifier, while `checkout-Q100-retry` and `checkout-V20-fresh` have zero;
all three verifier reports only establish that their observed rows break no invariant. They do
not establish that the offered checkout cohort completed. The `100/100 PAID` control is the
isolated `checkout-contract-smoke.js` contract regression invoked by `checkout-contract.test.mjs`;
it has no HTTP/backend traffic, no 503 count and no latency, and is excluded from result tables.
Every scenario now declares minimum started/completed/PAID work in the runner. A verifier PASS
with unmet work minimum is recorded as runner `FAIL`.

The `checkout` runner command creates a closed waiting-room queue, joins its fresh cohort, opens
admission, captures exactly the required token pairs, and then runs Q or V. Its
`<run>-checkout-lifecycle.json` records queue creation, join, opening, token capture and k6 start
timestamps. The runner refuses checkout if captured tokens are older than 300 seconds at k6 start.

### 2026-10-17 — CPU-capped platform and failed fresh checkout setup

`environment.json` records the new `cpu-capped-2026-10-17` platform: Docker reports 12 vCPUs,
4,013,400,064 bytes memory, and 27.34% idle-stack memory. Compose caps backend/PostgreSQL/Redis/
RabbitMQ/k6 at 6/2/1/1/3 cores. No result under these limits is directly compared with the old
uncapped platform; every comparison arm must be rerun under the same caps. k6-side drops at high
offered rates are generator limits unless the run proves the generator achieved that offer.

The first orchestrated fresh V20 attempt, `checkout-V20-cpu-1`, is a **FAIL setup artifact**. Its
join stage started 900 users and accepted 799, with 101 failed joins, zero dropped iterations, and
join p50/p95/p99 1,039.3/2,719.4/3,503.9 ms. The orchestrator stopped before opening admission,
so no checkout k6 run, checkout PAID count, checkout 429/503 classification, or checkout latency
exists for this attempt. Its verifier was invariant-only PASS, but the runner's work minimum made
the run FAIL.

The join failure's 792 k6 5xx observations include bounded retries. Backend logs for the exact
window record 20 `rate-limit|QueryTimeoutException`, 827 `rate-limit|circuit_open`, and 2,580
`waiting-room|circuit_open` RedisGuard fallbacks; Hikari timeout logs and Hikari exception strings
both count zero. Waiting-room fallback explicitly throws `WAITING_ROOM_UNAVAILABLE` (503), so this
is a RedisGuard source, not a Hikari source. A five-second Prometheus scrape reports zero 503
increase, which is insufficient resolution for this 10.5-second request burst and does not negate
the k6/log evidence. Backend/k6 CPU peaks were 3.17/2.85 cores against 6/3 caps; Docker memory
peaked at 38.63%. Stop here: no calibration or sell-out was started.

The join provenance records commit/image revision `6d7eb5b` and durable `synchronous_commit=on`,
`fsync=on`, but `working_tree_clean=false`: `environment.json`, `last-reset.json`, and
`last-seed.json` were tracked measurement files modified before the join. This reinforces that the
artifact is a failed setup diagnosis, not a comparison datapoint.

Validation: Node contract tests 5/5; Python runner tests 6/6 after repairing a stale
metadata assertion; k6 1.3.0 successfully inspected the actual V scenario. The isolated
`checkout-contract-smoke.js` returned 99 for 100 started / zero paid, and zero for
100 started / 100 paid. This smoke checks the real k6 threshold engine, not backend
performance. Reproduce with `node --test loadtest/checkout-contract.test.mjs` and
`k6 run loadtest/checkout-contract-smoke.js` (expected failure); add `-e PAID=100`
for the passing control. No fresh checkout benchmark, calibration or sell-out is
claimed by this change. Next: generate fresh admission tokens and diagnose paced
checkout at 20/s under the corrected gate.

Backend validation: `mvn -B -ntp -s .mvn-week7-settings.xml -f backend/pom.xml verify`
completed with BUILD SUCCESS, 106 tests, zero failures/errors/skips, using real
Testcontainers services. The initial sandbox attempt could not access the Docker pipe;
the successful rerun had Docker access. Local log: `week7-checkout-verify.log`.

## Calibration: tooling and observability

The first compile passed. The first observability test failed because Spring Boot disables exporters
in test contexts; adding `@AutoConfigureObservability` made both tests pass. Eighteen real-service
seeder/verifier tests passed, including deliberate corruption for each invariant family.

The reset helper initially assumed every HTTP response was JSON. Mailpit DELETE returns plain text;
the helper now accepts successful DELETE responses without JSON decoding. Private seed files were
unreadable to k6's default UID; the isolated k6 container now reads them as the same UID as the seeder,
retaining mode 0600 instead of exposing tokens. Sanitized reports use mode 0644 for CI upload.

cAdvisor 0.52.1 could not inspect Docker 29's overlayfs/containerd snapshotter. Upgrading the measurement
agent to 0.54.0 produced real CPU/memory series. Explicit process collection added container thread counts.
This is a measurement-tool correction, not an application optimization.

## Initial smoke: failure is retained

Artifact prefix: `smoke-initial`. Source base: `13c36d9` plus the Week 7 observability/tooling changes
subsequently committed as `0d19539` and `eaf4898`. This calibration predates the baseline source commit.

| Measurement | Actual value |
| --- | ---: |
| Measured paid purchases | 61 |
| Measured HTTP requests | 249 |
| HTTP failed rate | 0 |
| Unexpected 5xx | 0 |
| Dropped iterations | 0 |
| Paid orders including warm-up | 182 |
| Valid tickets including warm-up | 452 |
| Pending outbox events after drain | 728 |
| Sent confirmations | 0 |
| Inventory/ticket/idempotency violations | 0 |
| Redis mismatches before / after reconcile | 205 / 0 |

The smoke originally asserted exactly 60 paid purchases, but k6 scheduled an additional iteration at
the duration boundary. The assertion now requires at least 60 successful purchases while retaining
zero-error and zero-dropped thresholds. C/D explicitly bound their distinct-user cohort to 5,000.
The initial failed JSON is retained; the verifier failure was independent of this assertion correction.

The outbox contains 182 rows each of reservation.created, order.created, order.paid and ticket.issued.
The first two types had no RabbitMQ binding and received mandatory returns. Aggregate ordering
then blocked `order.paid`, so payment commits and tickets existed but no confirmation reached the
consumer. This pre-existing routing defect was repaired separately in `7fd2818` after baseline
collection; it is not evidence that larger pools or more VUs would improve delivery.

## Baseline protocol

Source: `eaf4898`, conditional-update, Hikari 10, Tomcat 200, heap 256..768 MiB, 60-second test TTL,
5-second expiry interval/grace, 20,000 buyers, 200 background events, 5,000 HOT tickets. Each run resets,
seeds and warms before measurement. C first run includes a JFR capture. B/C/D repetitions and all
threshold/verifier failures are retained. All nine baseline repetitions completed before any application optimization.

## Iteration 1: avoid a second connection during order preparation

Hypothesis: nested `REQUIRES_NEW` lazy expiry contributes to pool starvation. Move expiry
after the idempotency claim but before the transaction writing the order. This preserves
independent expiry commit and atomic order/payment/outbox/key completion. Do not increase
pool size in the same iteration.

Evidence: C-1 JFR records connection waits, including order idempotency transactions, and
the guarded hot-tier update consumed 83,438.41989299988 ms over 1,302 calls. A regression
test with eight real threads and a one-connection application pool fails before the change
at `PurchaseReservationService.expireOwned`, with a 2,010 ms acquisition timeout in one trace.
The earlier test setup failed at Flyway startup; that failure is excluded from evidence.

Files: IdempotencyService, OrderService, PurchaseReservationService and
OrderSmallPoolIntegrationTest. Rationale and alternatives: [ADR 0029](../decisions/0029-measured-transaction-scope-optimization.md).
Before/after load comparison remains pending; removing one source of pool pressure does
not establish that the 5,000-user spike will meet thresholds.

Full `mvn -B -ntp -f backend/pom.xml clean verify` on the optimization source (`31e3d7e`)
passed: 98 tests, 0 failures, 0 errors, 0 skipped; BUILD SUCCESS in 04:04 min.
The compiler enables unchecked/deprecation lint with warnings as errors.
The first post-change targeted run found a test assertion counting an earlier test's
outbox row; the assertion now joins the current orders. All three new tests pass in
the full run. See [test evidence](results/iteration1-build-tests.json).

Baseline audit: C-3 has 153 overdue HELD reservations after the 180-second drain.
This expiry failure is retained alongside the common outbox/email failures. Other
baseline runs have no reported inventory, ticket, idempotency or expiry violations.

The third iteration-1 C attempt completed k6 but Docker Desktop stopped every isolated
container while the verifier container was starting. It has k6, query and telemetry artifacts
but no verifier or run artifact, so it is excluded from median tables. The runner now persists
an invalid run result if verification cannot start.

## Correctness repair: route all durable outbox events

Hypothesis: RabbitMQ's mandatory return for `order.created` and `reservation.created` is why
aggregate ordering leaves all later events pending. Add a `#` binding from `ticketrush.events`
to the durable notification queue. The existing consumer records and ACKs event types that do
not send email. Keep mandatory publishing, confirms, retries and ordering unchanged.

`OutboxDeliveryIntegrationTest` uses PostgreSQL, Redis, RabbitMQ and Mailpit Testcontainers.
It creates a paid order, races eight real threads on duplicate delivery, relays four outbox events
and asserts four published records, one SENT confirmation and one Mailpit message. It passed in
the 99-test build. ADR: [0032](../decisions/0032-route-all-outbox-events.md).

`post-outbox-smoke` passed k6 and every verifier check: 724 outbox events published, 181 PAID
orders, 181 exactly-one confirmations, 451 valid tickets, no oversell, no duplicate effects,
no overdue holds, and Redis drift healed from 205 mismatches to zero. This validates delivery
correctness at smoke load; it is not a 5,000-user capacity result.

## Mutation proof

`broken-guard` uses an image built from a copied source tree with the conditional inventory guard
removed, and drops the isolated database's nonnegative CHECK only during the proof. Scenario C
uses HOT capacity 100. The verifier failed `1_inventory_conservation` with one violation, as
required. The `finally` path reset the isolated data and restored the CHECK; a transient Docker
Desktop 500 occurred during final Compose inspection, so the runner now retries that healthcheck.
The backend was confirmed back on the normal image and a subsequent reset/reseed completed.

## Stress E: correctness survives, latency objective does not

Artifact prefix: `stress-1`. Source: the normal image after the outbox routing repair.
The HOT capacity was raised to 100,000 so sell-out did not set the limit. The five offered
stages were 10, 25, 50, 100 and 200 iterations/s, followed by a two-iterations/s recovery.

The run started 7,022 arrivals and paid 4,608 purchases, but k6 dropped 4,649 arrivals and
failed its latency/error thresholds (`reservation` p95 5,000.321385 ms; `order` p95
2,842.434966399996 ms; overall HTTP failed rate 0.02486715576889117). It is therefore a
failed performance result, not a capacity claim. The recovery-stage request p95 was
185.18293369999995 ms, which is evidence that the service recovered after offered load fell;
it does not erase the failure at the high stages.

The post-drain verifier passed every invariant: 205 tiers, 13,683 sold tickets with zero
oversell, 5,685 orders and distinct idempotency effects, 25,656 published outbox events,
5,357 paid orders with exactly one SENT confirmation each, no overdue holds, and Redis drift
reconciled from 205 mismatches to zero. Artifacts include the [k6 summary](results/stress-1.json),
[verifier output](results/stress-1-verify.json), [telemetry](results/stress-1-telemetry.json),
[top PostgreSQL queries](results/stress-1-queries.json), and the bounded-text
[JFR summary](results/stress-1-jfr-summary.txt).

## Authentication F: IP limiter is visible and correct

Artifact prefix: `auth-1`. The measured phase made 601 login requests at 10 requests/s after
the normal purchase warm-up. k6 passed: no dropped iterations, no unexpected HTTP response,
no 5xx, login p95 18.327595 ms and p99 262.536363 ms. From the single load-generator IP,
22 requests succeeded and 579 were explicitly rate-limited. Therefore this run demonstrates
the configured IP limiter rather than an authentication throughput capacity of 10 requests/s.

The verifier passed after drain: no inventory, ticket, idempotency, outbox, email, expiry or
Redis-reconciliation violation. The 121 warm-up paid orders each have exactly one confirmation.
See [k6](results/auth-1.json) and [verifier](results/auth-1-verify.json).

## Soak G: sustained workload passes on this host

Artifact prefix: `soak-1`. The 20-minute run combined 5 purchase and 5 browse workflows per
second after warm-up. k6 passed with 28,913 HTTP requests (24.07581444169738 RPS), zero dropped
iterations, zero unexpected HTTP responses/5xx, reserve p95 33.655018 ms and order p95
45.884544949999984 ms. It paid 5,083 purchases from the measured workload.

The verifier passed: 13,291 sold tickets with zero oversell; 5,520 orders, successful keys and
distinct effects; 23,282 published outbox events with no pending or failed row; 5,203 paid
orders with exactly one SENT confirmation; no overdue orders or holds; and Redis reconciled
205 mismatched tier keys to zero. This is a single-run sustained-load observation on the shared
laptop VM, not a production capacity claim. See [k6](results/soak-1.json),
[verifier](results/soak-1-verify.json), [telemetry](results/soak-1-telemetry.json), and
[PostgreSQL queries](results/soak-1-queries.json).

## Iteration 2: make the hot tier update the final write

Hypothesis: the reservation transaction held the contended `ticket_tiers` row while it inserted
the reservation and `reservation.created` outbox event. The statement order was validation,
expired-hold release, duplicate check, conditional tier UPDATE, reservation INSERT, outbox INSERT,
commit. `7eef8a6` changes only this order: reservation INSERT, outbox INSERT, conditional tier
UPDATE, commit. If the UPDATE affects zero rows, the transaction rolls back all earlier writes.

Three `final-C-*` runs used the same 5,000-user Scenario C and verified every invariant after
drain. Median HTTP throughput rose from 125.3 to 467.6 requests/s and median HTTP failed rate
fell from 97.6% to 0.08%. Median reserve p95 fell from 5,001.0 to 3,725.7 ms and order p95 from
5,058.1 to 3,028.4 ms. However, the generator began only 913 arrivals and dropped 4,087, versus
the baseline median 3,071 started and 1,929 dropped. Every run still failed k6 thresholds, so
this is not a capacity improvement claim. It is a measured reduction in request failures and
latency while correctness remained intact. Raw artifacts: [C-1](results/final-C-1.json),
[C-2](results/final-C-2.json), [C-3](results/final-C-3.json), and their verifier reports.

`pg_stat_statements` confirms the guarded UPDATE itself became shorter: baseline C-1 recorded
1,302 calls at 64.085 ms mean, while final C-1/C-2/C-3 recorded 1,024/1,034/1,089 calls at
11.210/15.909/9.807 ms mean. This is statement execution time, not a direct lock-duration
measurement; PostgreSQL lock wait sampling is not enabled in these saved runs, so it must not
be presented as exact lock-hold time.

## Commit/fsync measurement

The isolated PostgreSQL uses `fsync=on`, `synchronous_commit=on`, and `wal_sync_method=fdatasync`.
`track_wal_io_timing` is off, so the database does not provide per-commit WAL timing. A one-second
`pg_test_fsync` run inside the Docker VM measured `fdatasync` at 1.699 ms per 8 KiB write and
1.670 ms per two-write test; see [raw output](results/commit-fsync.txt). This can contribute to
the serial hot-row path, but it is materially smaller than the 3.0--5.1 s HTTP p95 values, so
it does not by itself explain the spike timeouts.

## Interleaved attribution of `7eef8a6`

The older baseline and `final-C-1..3` files have no recorded commit SHA, backend image ID, image
revision, start time, or source-state snapshot. They remain negative/indicative artifacts only.
Do not use them to claim the effect of iteration 2; baseline-to-final mixes iteration 1, the
outbox routing repair, and iteration 2.

The attribution protocol used HEAD load tooling with only the backend image changed. Before k6,
each run wrote a provenance record containing commit SHA, running image ID, OCI revision label,
run ID, UTC start time, one source-state check (`working_tree_clean`, tracked diff and untracked
list), Hikari `connectionTimeout=30000 ms`, and `preAllocatedVUs=200` / `maxVUs=1000`. The runner
aborts when the running image digest or revision label differs from the selection. Every listed
run has a k6 summary, verifier report and `verification_exit=0`; k6 exit 99 records violated
overload thresholds rather than an interrupted run. Backend `RestartCount` was zero after C-3
and C-6. Generator logs are retained beside every summary as `*-k6.log`.

The earlier conflicting `working_tree_clean=true` / `working_tree_dirty=true` fields were caused
by two different checks: the provenance check ignored untracked files while telemetry compared only
the tracked diff (empty hash). The new artifacts use one captured `source_status` object for both
fields and list untracked result artifacts; a clean tracked tree therefore remains correctly true.

| Run | backend commit | started / dropped | server PAID / SOLD_OUT | HOT taken | hot UPDATE mean | Hikari pending max | Tomcat busy max | max GC pause | k6 max VUs | verifier |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| attribution-C-1 | e29ce4f | 1,216 / 3,784 | 105 / 0 | 273 | 130.1 ms | 171 | 178 | 0.717 s | 435 | PASS |
| final-C-4 | post-7eef / 174aac3 | 921 / 4,080 | 491 / 0 | 1,259 | 68.9 ms | 192 | 200 | 0.743 s | 493 | PASS |
| attribution-C-2 | e29ce4f | 840 / 4,577 | 689 / 0 | 1,764 | 57.2 ms | 190 | 200 | 0.150 s | 558 | PASS |
| final-C-5 | HEAD / 5bda52c | 1,218 / 3,783 | 672 / 0 | 1,700 | 39.8 ms | 192 | 200 | 0.269 s | 514 | PASS |
| attribution-C-3 | e29ce4f | 1,168 / 3,832 | 988 / 0 | 2,529 | 48.0 ms | 190 | 200 | 0.163 s | 1,000 | PASS |
| final-C-6 | HEAD / 5bda52c | 1,209 / 3,790 | 1,024 / 0 | 2,616 | 9.1 ms | 188 | 200 | 0.059 s | 1,000 | PASS |

Server PAID is verifier `paid_orders - 121` warm-up orders. HOT taken is `5,000 - available`
from the HOT tier in the verifier; it is intentionally distinct from aggregate ticket totals.
The three-run medians are e29: UPDATE `57.2 ms`, Hikari pending `190`, Tomcat busy `200`, k6 max
VUs `558`; HEAD: UPDATE `39.8 ms`, Hikari pending `192`, Tomcat busy `200`, k6 max VUs `514`.
The ranges overlap substantially (for example RPS e29 `59.7–677.2`, HEAD `197.5–690.0`), so the
end-to-end difference does not exceed machine/run noise. The statement order is proven; a stable
capacity benefit is not.

The earlier six-run sequence must not be described as a monotonic wall-clock trend. The isolated
statement trace is one cold request: it establishes order only, not a load-effect magnitude.
`git diff --stat 174aac3 5bda52c -- backend` was empty, so C-4 is in the same post-`7eef8a6`
backend series.

An A/A control then ran the same HEAD image/config three times back-to-back: server PAID was
`1,017, 1,067, 551`; hot UPDATE mean `4.71, 10.05, 118.74 ms`; average WAL sync `4.75, 5.62,
12.88 ms`; reserve p95 `1,496.7, 1,805.7, 5,001.1 ms`; all verifiers passed. Across these three
points are consistent with, but do not prove, a commit-latency hypothesis; the third reserve p95 is
the five-second timeout cap. This confirms material run-to-run variance. Future comparisons require a 30–60 second low-rate pre-warm, discard the
first session run, and use counterbalanced ABBA ordering.

## Pre-registered durability diagnostic

This is DIAGNOSTIC only, never a default or headline result. In one session, with identical Scenario C,
the existing 60-second low-rate pre-warm, full provenance, pg activity and WAL artifacts, run order is
`D X X D D X`: D uses durable defaults; X uses `synchronous_commit=off` while `fsync=on`. The hypothesis
is supported only if median X PAID is at least 1.5x median D, X hot UPDATE mean is below about 5 ms, and
X PAID spread (max/min) is below 1.5. It is rejected if PAID is roughly unchanged. Restore D afterwards
and record `SHOW synchronous_commit` and `SHOW fsync`.

## Diagnostic recovery

Docker Desktop stopped during the diagnostic durability restore. `ALTER SYSTEM RESET
synchronous_commit` was applied after Docker returned. A new PostgreSQL session then reported
`synchronous_commit=on` and `fsync=on`, both from `default`; the captured recovery record is
`results/durability-recovery.json`. The leftover `log_line_prefix` and `log_statement` settings were
also reset and `pg_reload_conf()` returned true. At `2026-10-13T12:59:09.560397482Z`, the loadtest
backend's own Hikari connection reported `synchronous_commit=on` and `fsync=on`. Every future runner
provenance record captures this backend-pool probe and refuses a non-DIAGNOSTIC run unless both are on.

The diagnostic is **stopped at n=1 per arm by decision**. `synchronous_commit=off` is not an option;
the hot row is not the established end-to-end limit. No X result is a headline/default result and no
remaining diagnostic run will be started. Docker Desktop stopped once during this restore and once
earlier during attribution. The Docker VM setting recorded in `results/environment.json` is
4,013,400,064 bytes; the k6 container had reached about 1.1 GB at 1,000 VUs. This is a suspected
memory-pressure cause, not a proven root cause.

### Isolated statement order and lock interval

`log_statement=all` with `%m [%p] %x` was enabled only for one isolated successful reservation
on each selected image, then reset to `none`. In e29, the conditional `UPDATE ticket_tiers` was
logged at `04:34:52.906 UTC`; reservation select/insert and outbox insert followed, then COMMIT
at `04:34:53.008` — about **102 ms** from hot UPDATE to COMMIT. At HEAD, reservation insert and
outbox insert preceded the conditional UPDATE at `04:34:02.191`; COMMIT was at `.192` — about
**1 ms**. The captured order is in `statement-order-e29-postgres.log` and
`statement-order-head-postgres.log`. This is an isolated measured lock-hold interval, not a p95.

### Saturation evidence and limitations

The pg activity sampler recorded state, wait type/event, transaction/query age and short query text
each second for the runs after it was introduced: final-C-5 max idle-in-transaction/Lock/oldest-xact
was `8 / 6 / 0.994 s`; attribution-C-3 was `10 / 6 / 0.940 s`; final-C-6 was `9 / 2 / 1.341 s`.
Lock waiters were predominantly the conditional `UPDATE ticket_tiers`; COMMIT sessions also showed
`WalSync`. No sampled transaction remained open for multiple seconds. Earlier C-1/C-2/C-4 cannot
be retroactively sampled and are explicitly not used for this pg-activity comparison.

Code inspection finds no path in reservation/order/webhook that holds one JDBC connection while
requesting a second: reservation enters `ReservationTransactions` in one `REQUIRES_NEW` transaction;
order preparation is `NOT_SUPPORTED` before the order transaction (iteration 1); webhook handling
has its own transaction. This is a code-path finding, not a substitute for a connection trace.

Tomcat reached its configured 200 busy threads on five of six runs, while Hikari pending reached
171–192. The primary bottleneck evidence is therefore request/connection queueing plus hot-tier
lock contention, not a measured external call inside a JDBC transaction. The generator log shows
`Insufficient VUs` once it reached 1,000 in C-3/C-6. A lower instantaneous VU gauge in earlier
runs does not prove spare capacity: constant-arrival-rate drops an arrival when no VU is free at
that scheduling instant, and the visible gauge is sampled later. The remaining missing evidence is
a per-second started/dropped counter; the saved k6 progress log records VU and completed counts but
not that counter, so no timeline has been fabricated.

`Redis mismatch before reconcile` is expected under `conditional-update`: Redis counters are not
maintained and verifier `observed=null` means Redis was unused. Reconciliation returns the mismatch
count to zero; it is not a correctness failure for this strategy.

`final-C-4` verifier recorded 612 PAID orders, so 491 measured PAID after subtracting 121 warm-up
orders; k6 recorded 383 `paid`, a difference of 108. Its aggregate k6 summary has no per-order
identifier, outcome trace, or last-endpoint field, and later resets removed those C-4 rows.
Accordingly the 108 orders cannot truthfully be listed or assigned a final client endpoint after
the fact. This is a measurement gap, not evidence of a server-side failure; future runs need
per-iteration sanitized terminal-outcome capture before claiming that attribution.

## 2026-10-14 — controlled-admission reframe, Step 0

Decision: the next target is 5,000 concurrent **queue entries** plus controlled admission, not
5,000 concurrent purchase transactions. A queued client will join once and end; status polling
and checkout are separate workloads. Future documentation must never say “5,000 concurrent
purchases.”

### Tooling preflight

Commit `221c66c` added a fail-closed preflight to `loadtest.py`: Prometheus/cAdvisor must be
running, Prometheus ready, the cAdvisor target healthy, and a tagged k6 remote-write probe must be
queryable before k6 starts. Follow-up commits fixed Compose multi-line JSON parsing (`ac97df6`),
the cAdvisor target label (`89e7686`), and k6's exit stale-marker behavior for the probe
(`148bd04`). The actual load run retains its normal k6 configuration; only the disposable probe
disables stale markers so Prometheus can query it after exit.

- `week7-legacy-A1-rerun1`: **invalid before k6** — Compose emitted JSON objects on separate
  lines and the new parser attempted one JSON document (`Extra data`).
- `week7-legacy-A1-rerun2`: **invalid before k6** — cAdvisor target check was false and the probe
  series was immediately marked stale, so Prometheus could not observe it.
- `week7-legacy-A1-rerun3`: valid. Its preflight record has every check true and `verification_exit=0`.

### Backend suite

The full `mvn test` suite was rerun with Docker/Testcontainers available and `HIKARI_CONNECTION_TIMEOUT_MS=30000`; this value is supplied only by `application-test.yml`. Result: **102 tests, 0 failures, 0 errors, 0 skipped**. `PessimisticReservationIntegrationTest` is 13/13 in 9.045 s. Production remains at `HIKARI_CONNECTION_TIMEOUT_MS=1500`.

Before the fix, direct errors were `CannotCreateTransactionException: Could not open JPA EntityManager for transaction`, caused by `HikariPool-1 - Connection is not available, request timed out after 30015ms (total=40, active=40, idle=0, waiting=10)` and another run with `waiting=77`; the companion assertion was `Expecting value to be true but was false` when the concurrent fixture deadline elapsed. Commit `ed889ab` adds 256 local tier stripes before transaction entry; PostgreSQL `SELECT FOR UPDATE` remains the cross-instance lock. ADR 0033 records this.

### Valid legacy A-1 control

Run: `week7-legacy-A1-rerun3`, start `2026-10-14T06:45:31Z`, commit/image revision
`148bd04a5f898c4d11a24544e1205476ef17bcc5`, image
`sha256:6d5c62a43c9f3edef6c2c7cca7d69a5882b484e95d799073d475ce156c08ad6c`.
The record captured backend-pool durability `synchronous_commit=on`, `fsync=on`; the Hikari
connection timeout was 30,000 ms; preallocated/max k6 VUs were 200/1,000. The source snapshot was
dirty only because reset/seed and prior result artifacts were present; that fact is recorded in
provenance rather than hidden.

| offered | started | dropped | measured server PAID | SOLD_OUT | served / offered | purchase RPS | reserve p95 | order p95 | verifier |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 5,000 | 1,858 | 3,142 | 1,573 | 0 | 31.5% | 56.2 | 1,013.9 ms | 905.6 ms | PASS |

Server PAID is verifier paid orders (1,694) minus 121 warm-up orders. k6 saw exactly 1,573 paid,
99 payment-failed and 186 abandoned outcomes across 1,858 started iterations; no HTTP failure,
5xx, 429 or SOLD_OUT was recorded. It returned exit 99 solely because `dropped_iterations=3,142`
and reserve p95 exceeded its 1,000 ms threshold. This is an overload control measurement, not a
capacity pass. The verifier found zero oversell, no inventory/idempotency violation, no overdue
hold/order and no pending/failed outbox event; HOT availability was 981, so HOT taken was 4,019.

The guarded HOT UPDATE had 1,979 calls at 5.18 ms mean. Telemetry sampled Hikari pending max 129,
Tomcat busy max 142, backend JVM `process_cpu_usage` max 0.54 (about 6.5 of 12 CPU cores), PostgreSQL container CPU sample 1.78 cores,
lock waiter sample max 1 and GC pause max 28 ms. WAL recorded 6,961 syncs totaling 18,878.379 ms
(2.712 ms average). Artifacts: `week7-legacy-A1-rerun3-{preflight,provenance,run,verify,wal,telemetry,queries,json}`.

Next: implement and measure the short-iteration front door only after this Step 0 record is
committed. No strategy comparison, sell-out or calibration has started.



### Status endpoint diagnosis before P=2,500 / checkout / calibration (2026-10-14)

No P=2,500, checkout, admission calibration, sell-out or strategy comparison was started. `status-window-setup-J` is a negative setup artifact: 5,000 joins started, 4,999 accepted and one 5xx, so it was excluded. `status-window-setup-J100` established 5,000 distinct contiguous positions. Final P runs record `644fa8e` / `sha256:c20b56e...`, backend `synchronous_commit=on`, `fsync=on`, verifier PASS.

| run | duration / steady window | req/s | k6 steady p50 / p95 / p99 | server p95 | Hikari active/pending | Tomcat busy | verifier |
| --- | --- | ---: | --- | ---: | ---: | ---: | --- |
| P500 | 61.1 s / 46.1 s | 49.1 | 4.6 / 19.3 / 32.8 ms | 15.1 ms | 0 / 0 | 1 | PASS |
| P1000 | 62.5 s / 47.5 s | 95.9 | 5.9 / 59.5 / 83.8 ms | 38.2 ms | 0 / 0 | 1 | PASS |

Prometheus uses the k6-derived window, not Docker overhead. Status has two atomic Redis Lua calls (limiter plus heartbeat/rank/size/estimate), no Hikari connection. P95 JWT/limiter/settings/script/controller is 1.0/5.0/2.5/4.1/6.9 ms at 500 and 1.0/16.1/6.4/19.1/23.9 ms at 1,000. Lettuce max was 77.1/77.7 ms. Same `Retry-After` synchronizes closed-loop clients; this is not a DB-pool limit.

Three S runs/rate used 200 identities, 45 s and excluded 15 s: median p50/p95/p99 ms (server p95) is 50/s 2.53/8.97/10.02 (7.67), 100/s 2.17/3.54/8.56 (3.12), 200/s 1.81/3.06/4.99 (2.68), 400/s 1.61/2.98/4.66 (2.62). Zero drops, 5xx and verifier violations. This is not linear p95 growth, so the JFR condition is false. Direct Docker stats: all-container average/peak CPU 0.87/2.43, 0.81/2.32, 1.06/2.36, 1.46/2.67 cores of 12; backend CPU/request 8.87, 2.86, 1.64, 1.49 ms. Raw `status-cpu-S*-docker-stats.json` retains every container.

`frontdoor-J-5000-final`: 5,000 joins, 565.2/s, 10.524 s, p50/p95/p99 153.4/371.9/503.7 ms; `process_cpu_usage=0.734` is about 8.8 of 12 cores. Legacy A-1 rerun uses current poll backoff/jitter and is not comparable with older legacy tables.

### 2026-10-15 — front-door status, jitter, and test-timeout gate

Recorded the old whole-window synchronized polling results as artifacts: P500 k6 p50/p95/p99
`4.1/265.4/412.3 ms` at 48.7 req/s and P1000 `2.8/518.5/669.3 ms` at 95.9 req/s. They include
the synchronized start and are not overwritten by later steady-state measurements.

Added server poll-interval jitter (+/-25%, random per response) and an initial 0–2 s random delay
for closed-loop users. The 5,000-token constant-arrival front door completed three runs each at
500 and 1,000 req/s in ABABAB order with 400 preallocated and 1,000 maximum VUs: all six had zero
drops, 5xx, memory aborts, and verifier violations. Median k6/server p95 was 3.63/3.20 ms at 500,
and 4.23/3.55 ms at 1,000. Docker VM memory was 45.5–47.0% and 46.4–46.8%, respectively.

`frontdoor-vu400-setup-J` accepted 5,000/5,000 joins, with zero join 5xx/retries; queue audit
found positions 1–5,000, distinct and contiguous. The previous one 5xx was traced to concurrent
cold-cache joins each executing PostgreSQL configuration/status reads. The backend coalesces the
cold fill, while k6 now retries transient join 5xx at most three times and reports its metrics.

The attempted 2,500 req/s status burst is negative: even with 1,000 preallocated VUs k6 emitted
`Insufficient VUs`, dropped 2,294 arrivals and observed 2,837 HTTP 5xx. RedisGuard logged waiting-room
and limiter fallbacks; status fails closed as 503 and remains Redis-only. Docker memory stayed 61.3%,
so neither a Docker memory abort nor a database connection was involved. The verifier passed. This
does not establish a 2,500 req/s front-door capacity.

Focused `PessimisticReservationIntegrationTest` passed 13/13 twice at the production 1,500 ms
timeout, then the 30,000 ms test-profile override was removed and the no-override run also passed.

### 2026-10-15 — first-poll spread, burst replacement, checkout negative result

Commit `59db266` changes the first client poll from a fixed 0–2 seconds to uniform `[0, Retry-After]`; the current 5,000-user advice is 10 seconds. It also adds controlled queue-unavailable `503` responses with jittered Retry-After, derives bulkhead capacity as admission rate x bounded hold x safety factor (20 x 1 x 1.5 = 30), and adds bounded 429/503 checkout retries. `Week6RedisIntegrationTest` passed after the change.

`frontdoor-firstpoll-S500` is valid: 5,001 scheduled status requests over 10 seconds, zero drops/5xx, max 8/600 VUs, k6 3.76/13.85/31.53 ms p50/p95/p99 and verifier PASS. It is a constant-arrival proxy for the uniform first-poll distribution, not a test with 5,000 retained VUs.

The historical 2,500/s burst had 2,837 unlabeled 5xx and 2,294 drops. Its old client artifact cannot distinguish 500 from 503. Evidence available from logs/telemetry is RedisGuard fallback, 300 ms Redis command timeout, EVALSHA max 1,192.7 ms, GET max 1,106.5 ms, Tomcat 200 busy, backend JVM 0.576 x 12 = 6.9 cores, Docker peak backend/k6/postgres/redis 7.94/6.96/1.97/0.46 cores. The k6 generator reached 996/1,000 VUs because burst latency consumed VUs; five-second observed response peak was ~883/s, far under the 2,500/s offer. This remains a negative result.

The burst is consistent with Docker VM CPU oversubscription: backend and k6 alone used about 15 cores
on the 12-vCPU VM. Its Lettuce latency may include JVM thread scheduling delay; this is a hypothesis,
not proven causality. Future load-test composition caps backend/k6/postgres/redis/rabbitmq at
6/3/2/1/1 cores and records the applied `NanoCpus` limits in `environment.json`.

`frontdoor-T1500-burst` is valid and replaces it as a generator-drivable burst: 27,490 responses, zero HTTP failures/drops, max 9/600 VUs, memory 44.9%, verifier PASS and k6 p50/p95/p99 2.44/11.48/53.95 ms. It scheduled 1,500/s for two seconds; five-second scrape averaging reports ~800/s and is not an exact plateau measurement.

Checkout is blocked. The prior Q100's 70 errors matched the 30-permit bulkhead arithmetic but were not status/code-tagged, so that classification is inference only. Retry-enabled simultaneous Q100 ended in controlled 503 and reserve p95 1,876.4 ms. The first paced V20 used expired 10-minute admission tokens and returned 100 `INVALID_ADMISSION_TOKEN`; a fresh closed-queue setup removed that timing defect, but `checkout-V20-fresh` still had 67 controlled 503 outcomes and 34 dropped iterations. Its verifier PASS is invariant-only and does not meet the work gate. Do not start calibration or sell-out until the server-side 503 code/path is instrumented and this test passes.
