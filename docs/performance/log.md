# Performance experiment log

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
