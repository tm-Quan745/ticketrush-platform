# Week 3 rough comparison

Single-machine rough comparison, not a real load test. The proper k6 load test is
planned for Week 7. This measures direct service calls, not HTTP latency or an SLA.

Run separately: `mvn -B -ntp -f backend/pom.xml -Pweek3-benchmark test`.
Normal verify excludes the `benchmark` tag.

Both scenarios use 100 real threads released by CountDownLatch, 100 distinct users,
quantity 1, and 50 total tickets: one hot tier with 50 tickets versus 50 tiers with
one ticket each. Hikari pool: 40. PostgreSQL 17-alpine via Testcontainers, default
READ COMMITTED, lock timeout 3s, optimistic maximum 20 attempts with jitter.
Setup and application/container startup are excluded; executor creation, barrier,
transaction/retry time and executor termination are included. Throughput counts
all attempts including failures. Success and each failure reason are reported.
No warmup or repeated samples: ordering, JVM JIT and Docker scheduling affect results.

## Environment

Measured on 2026-10-09: Intel Core i5-10500H @ 2.50 GHz, 6 cores / 12 logical
processors, 7.83 GiB host RAM, Windows, Java 21.0.8, Spring Boot 3.5.6.
Docker Desktop Linux Engine 29.3.1 exposed 12 CPUs and 4,013,408,256 bytes RAM
(about 3.74 GiB). PostgreSQL image resolved to PostgreSQL 17.11.
Compose smoke services were stopped before the benchmark. No CPU pinning, dedicated
host, or control of background Windows activity was used.

## Recorded results

| Strategy | Tiers | Success | SOLD_OUT | Other failures | Retries | Duration (s) | Attempts/s |
|---|---:|---:|---:|---:|---:|---:|---:|

| conditional-update | 1 | 50 | 50 | 0 | 0 | 1.111 | 90.00 |
| conditional-update | 50 | 50 | 50 | 0 | 0 | 0.233 | 428.48 |
| optimistic | 1 | 50 | 50 | 0 | 1061 | 4.212 | 23.74 |
| optimistic | 50 | 50 | 50 | 0 | 0 | 0.174 | 573.11 |
| pessimistic | 1 | 50 | 50 | 0 | 0 | 0.652 | 153.31 |
| pessimistic | 50 | 50 | 50 | 0 | 0 | 0.220 | 454.60 |

All six scenarios passed the inventory invariant. The hot-tier optimistic run
performed 1,061 retries across 100 requests, illustrating retry amplification under
contention. Pessimistic was faster than conditional-update in this single hot-tier
sample; optimistic was fastest in the 50-tier sample. These observations are not
stable rankings: there is no warmup, repeated sampling, HTTP path or latency percentile.
Conditional-update remains the default for its short atomic SQL operation and
simpler failure handling, not because this sample proves a throughput advantage.
The 50-tier distribution had no optimistic retries in this run; that is not a
promise of conflict-free operation under other schedules or higher load.

### Real command output

```text
WEEK3_BENCH strategy=conditional-update tiers=1 threads=100 attempts=100 outcomes={OK=50, SOLD_OUT=50} retries=0 duration_s=1.111 throughput_attempts_s=90.00
WEEK3_BENCH strategy=conditional-update tiers=50 threads=100 attempts=100 outcomes={OK=50, SOLD_OUT=50} retries=0 duration_s=0.233 throughput_attempts_s=428.48
WEEK3_BENCH strategy=optimistic tiers=1 threads=100 attempts=100 outcomes={OK=50, SOLD_OUT=50} retries=1061 duration_s=4.212 throughput_attempts_s=23.74
WEEK3_BENCH strategy=optimistic tiers=50 threads=100 attempts=100 outcomes={OK=50, SOLD_OUT=50} retries=0 duration_s=0.174 throughput_attempts_s=573.11
WEEK3_BENCH strategy=pessimistic tiers=1 threads=100 attempts=100 outcomes={OK=50, SOLD_OUT=50} retries=0 duration_s=0.652 throughput_attempts_s=153.31
WEEK3_BENCH strategy=pessimistic tiers=50 threads=100 attempts=100 outcomes={OK=50, SOLD_OUT=50} retries=0 duration_s=0.220 throughput_attempts_s=454.60
[INFO] Tests run: 3, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
[INFO] Total time:  31.937 s
```
