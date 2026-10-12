# TicketRush performance laboratory

The baseline does **not** meet the 5,000-user flash-sale target. Across three C runs on
`eaf4898`, median HTTP throughput was 125.2781108328662 requests/s, median HTTP failed rate
was 0.9760840998685939, and median dropped arrivals was 1,929. Median reserve p95 was
5000.96730215 ms and order p95 was 5058.1487412999995 ms. Inventory oversold was zero,
but outbox and confirmation delivery failed in every baseline run; C-3 also retained 153
overdue holds after drain. These are failed load tests, not production capacity claims.
All nine B/C/D repetitions and their ranges are in the [generated tables](tables.md),
with individual [k6](results/baseline-C-1.json) and [verifier](results/baseline-C-3-verify.json)
artifacts. Optimization measurements remain in progress.

The subsequent stress run `stress-1` preserved every checked invariant after drain, including
zero oversell, zero pending outbox records and exactly one sent confirmation for each of 5,357
paid orders. It still failed performance thresholds: 4,649 dropped arrivals, 2.4867% failed
HTTP requests, reserve p95 5,000.32 ms and order p95 2,842.43 ms. Its low-load recovery p95
was 185.18 ms. This measures an overload knee and recovery behavior, not sustainable capacity;
the [summary](results/stress-1.json), [verifier](results/stress-1-verify.json), and
[JFR summary](results/stress-1-jfr-summary.txt) are retained.

The 20-minute `soak-1` workload passed on this shared laptop VM: 24.08 HTTP RPS, zero dropped
iterations, zero unexpected responses/5xx, reserve p95 33.66 ms and order p95 45.88 ms. After
drain it retained zero oversell, no pending/failed outbox events and exactly one confirmation
for each paid order. Read this as a one-run sustained-load observation; the
[summary](results/soak-1.json) and [verifier](results/soak-1-verify.json) retain the evidence.

| Scenario C median, three runs | Baseline | Hot-row-final-write iteration |
| --- | ---: | ---: |
| HTTP RPS | 125.3 | 467.6 |
| HTTP failed rate | 97.6% | 0.08% |
| Started arrivals | 3,071 | 913 |
| Dropped iterations | 1,929 | 4,087 |
| Reserve p95 | 5,001.0 ms | 3,725.7 ms |
| Order p95 | 5,058.1 ms | 3,028.4 ms |
| Verifier after drain | failed | passed (3/3) |

The final-write experiment improved response failures and latency but started far fewer arrivals
and dropped more work. It therefore fails the configured spike objective and is not a capacity
claim. The transaction and raw run artifacts are recorded in the [experiment log](log.md).

Baseline B's approximately 50 requests/s includes rate-limited responses from a shared
load-generator IP. Inspect `browse_ok` and `browse_limited` in [aggregate.json](results/aggregate.json)
before interpreting browse throughput. The existing limiter remains enabled.

## Evidence and correctness

![Grafana overview during baseline C-1](img/baseline-C-1-overview.jpg)

The screenshot uses the stored C-1 time window. Backend scrape timeouts during saturation
create gaps: missing Hikari samples must not be interpreted as zero pending threads.
The [deep JFR profile](results/baseline-C-1-deep-profile.json) shows connection-acquisition
waits and PostgreSQL socket reads on the guarded inventory update. Its 1,302 calls took
83,438.41989299988 ms total in [pg_stat_statements](results/baseline-C-1-queries.json).

For C-1 after drain, all 205 tiers conserved inventory, 332 valid tickets matched confirmed
quantity, oversold was 0, and all 131 orders mapped to 131 distinct successful idempotency
effects. However, 4,498 outbox events remained pending and 0 of 131 paid orders had a sent
confirmation. Redis mismatches were reported before reconciliation and were 0 afterward.
See every count in the [verifier output](results/baseline-C-1-verify.json); this run failed.

The separate [build record](results/iteration1-build-tests.json) reports 98 passing Java
tests after the transaction optimization. Passing integration tests do not replace failed
end-to-end load verification. See the [experiment log](log.md) for failures and decisions.

## Environment and interpretation

- Intel Core i5-10500H, 6 physical / 12 logical cores; host RAM 8,403,070,976 bytes.
- Docker Desktop Linux VM: 12 CPUs and 4,013,400,064 bytes RAM. Generator and services share this VM.
- Java 21, Spring Boot 3.5.6, PostgreSQL 17, Redis 7.4, RabbitMQ 4.1; exact image IDs and runtime versions
  are in [environment.json](results/environment.json), [CPU](results/host-cpu.json), [RAM](results/host-ram.json).
- Hikari maximum 10, Tomcat maximum 200, platform threads, heap 256..768 MiB, conditional-update strategy.
- The isolated profile accelerates hold TTL to 60 seconds, expiry interval to 5 seconds, late grace to 5 seconds.
  It does not change the production defaults, inventory guards or durability settings.
- Default dataset: 20,000 buyers plus one admin, HOT (5,000 tickets), MIXED (three 100,000-ticket tiers),
  WARMUP (100,000 tickets), and 200 background events. JWTs last 24 hours and credentials are local/ignored.
- One minute of purchase warm-up precedes measurement, using a separate event and a separate user range.
  Warm-up purchases remain in the database; the verifier checks them too. HOT-only counts must be read
  from its tier row, not confused with aggregate counts that include warm-up.

## Reproduce

Requires Docker Compose supporting `!override`, Python 3 on the host, and enough disk for pinned images.
No host k6 or Python third-party packages are needed: tooling runs in its own image. On Windows replace
`python3` with `python`. Commands are run from the repository root.

```sh
python3 infrastructure/scripts/loadtest.py init
python3 infrastructure/scripts/loadtest.py up
python3 infrastructure/scripts/loadtest.py test
python3 infrastructure/scripts/loadtest.py environment
python3 infrastructure/scripts/loadtest.py seed --users 20000 --capacity 5000 --background 200

# Each run resets/reseeds, restarts backend counters, warms up, runs k6, and verifies automatically.
python3 infrastructure/scripts/loadtest.py run --scenario A --users 1200 --run-id smoke
python3 infrastructure/scripts/loadtest.py run --scenario B --run-id browse
python3 infrastructure/scripts/loadtest.py run --scenario C --run-id spike --jfr
python3 infrastructure/scripts/loadtest.py run --scenario D --run-id mixed
python3 infrastructure/scripts/loadtest.py run --scenario E --capacity 100000 --run-id stress --jfr
python3 infrastructure/scripts/loadtest.py run --scenario F --run-id login
python3 infrastructure/scripts/loadtest.py run --scenario G --run-id soak

# Examples of explicit workload parameters, preserved in run metadata:
python3 infrastructure/scripts/loadtest.py run --scenario C --run-id slower-spike --param SPIKE_SECONDS=30
python3 infrastructure/scripts/loadtest.py run --scenario C --run-id queued --waiting
python3 infrastructure/scripts/loadtest.py verify --drain 180
python3 infrastructure/scripts/loadtest.py queries --top 10
python3 infrastructure/scripts/loadtest.py reset
python3 infrastructure/scripts/prove-verifier.py
python3 infrastructure/scripts/loadtest.py down
```

`seed` refuses a nonempty database; `reset` stops backend workers and clears only the dedicated database,
`ticketrush:loadtest:*` Redis keys, project email queues and Mailpit. It never runs FLUSHALL. The runner
uses the fixed Compose project `ticketrush-week7`; do not run two invocations simultaneously.
The mutation proof uses a separate image and restores the standard image/constraint in `finally`.
It offers C's 5,000-user cohort with HOT capacity 100 so that guard removal is exercised
even on a host that drops arrivals; this mutation run is not a performance comparison.

A/B/F take approximately one minute of warm-up + one minute of measured traffic + startup/drain.
C/D add a 20-second spike (D has 50 seconds of background browsing). E uses five 30-second steps
and a one-minute recovery stage. G measures for 20 minutes. Verification allows up to three minutes
for asynchronous delivery; any remaining pending work fails. These are configured durations, not benchmark results.

Shortcut targets: `make loadtest-smoke`, `make loadtest-spike`, `make verify`, `make reset`.
The requested shell wrappers under `infrastructure/scripts/` invoke the same implementation.
CI runs A and verifier on each PR; B–G are explicit manual dispatches. H is optional and not yet executed.

## Observability

For an existing development stack, set independent `METRICS_PASSWORD` and `GRAFANA_PASSWORD` in `.env`:

```sh
docker compose --profile observability up --build
# Existing volumes need the extension once (new volumes create it automatically):
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements"'
```

The isolated runner exposes [Grafana](http://127.0.0.1:23007), [Prometheus](http://127.0.0.1:29097),
[API health](http://127.0.0.1:28087/actuator/health) and [Mailpit](http://127.0.0.1:28027).
Grafana uses `admin` and the generated password in `.tools/week7.env`. Do not publish that file or
`loadtest/.data`; only sanitized `docs/performance/results` files belong in artifacts.
Prometheus uses separate Basic scrape credentials; user JWTs cannot access the scrape endpoint.

Seven versioned dashboards cover HTTP, funnel, database, Redis, messaging, JVM/containers and waiting room.
HTTP histograms have route-template labels. No user/order/reservation/correlation identifier is a metric label.
Inventory uses eight stable slots (HOT first, then MIXED, then background tiers), avoiding a series per UUID.
Lettuce latency, Hikari, Tomcat, JVM and Rabbit metrics are collected; inactive waiting rooms legitimately
have no wait observations. JSON logs use ECS and HTTP correlation IDs in MDC. OpenTelemetry is explicitly
skipped for this milestone; JFR profiles provide CPU/blocking evidence without partial tracing setup.

cAdvisor 0.54.0 is required here because it supports Docker's containerd snapshotter
([upstream release](https://github.com/google/cadvisor/releases/tag/v0.54.0)). Five Prometheus alerts are
evaluated locally; no external notifier is configured. Slow SQL statements are logged at a configurable
`POSTGRES_SLOW_QUERY_MS` threshold; the dashboard's slow-fingerprint count uses mean >=250 ms and is
not a count of individual slow executions.

## Limitations

This is a single laptop-class machine with a shared load generator, synthetic users, a small dataset,
and an in-process mock gateway with a configured 500 ms delay. It does not establish production capacity,
internet latency, external payment-provider reliability, multi-node fairness or high availability.
One generator IP is subject to existing browse/login IP limits. Expected 429s must be reported separately
from useful throughput. SMTP notification rows prove committed consumer idempotency, not exactly-once
external email delivery across every possible crash window.

Future experiments require separate generators, multiple backend instances behind Nginx, a managed
database, read replicas for browse traffic, and measured horizontal scaling. No frontend is included.
