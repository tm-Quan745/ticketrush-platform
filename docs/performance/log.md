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
