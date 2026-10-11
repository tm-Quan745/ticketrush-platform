# Week 6: Redis gate rough single-machine benchmark

Measured 2026-10-10, Asia/Bangkok. This is not the Week 7 k6 exercise.

## Environment and method

- Windows host, Intel Core i5-10500H (6 cores / 12 logical processors).
- Docker Desktop Linux engine 29.3.1, 12 CPUs visible, 4,013,400,064 bytes memory.
- Java 21.0.8, Spring Boot 3.5.6, Maven 3.10.0, PostgreSQL 17-alpine,
  Redis 7.4-alpine, Testcontainers 1.21.4; Hikari maximum 40 connections.
- 500 actual platform threads, simultaneous CountDownLatch start; quantity 1.
  One hot tier has 50 tickets; 50 tiers have one ticket each; sold-out has zero.
  Thus the first two cases have ten requests per ticket.
- Redis counters are warmed before timing; users/tiers are seeded before timing.
  Each strategy uses fresh containers. Durations include thread startup/join.
  Latencies measure the service invocation only. No HTTP/JWT overhead is included.
- A JDBC proxy counts actual Statement/PreparedStatement `execute*` calls, including
  ORM and JdbcTemplate SQL. Setup/warm-up/assertion queries are outside the sample.
  `db_attempts` separately counts reservation transaction invocations.
- One sequential sample per scenario, conditional first and Redis second. JVM JIT,
  container startup, Windows scheduling and shared host contention are not controlled.
  No confidence interval or claim of production capacity is appropriate.

## Results

| Strategy | Scenario | OK / SOLD_OUT | DB attempts | SQL statements | Seconds | Attempts/s | p50 ms | p95 ms | p99 ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| conditional-update | hot | 50 / 450 | 500 | 4150 | 2.861 | 174.76 | 2142.708 | 2665.034 | 2682.515 |
| redis-gate | hot | 50 / 450 | 50 | 550 | 1.875 | 266.71 | 537.579 | 1272.532 | 1657.195 |
| conditional-update | 50 tiers | 50 / 450 | 500 | 4150 | 1.376 | 363.29 | 786.402 | 1277.022 | 1304.454 |
| redis-gate | 50 tiers | 50 / 450 | 50 | 550 | 0.287 | 1742.53 | 168.719 | 193.949 | 196.239 |
| conditional-update | sold out | 0 / 500 | 500 | 4000 | 1.010 | 494.99 | 550.874 | 900.974 | 928.507 |
| redis-gate | sold out | 0 / 500 | 0 | 0 | 0.145 | 3454.80 | 47.651 | 83.819 | 87.270 |

No other failure reason occurred. PostgreSQL invariants were asserted after each
scenario. Redis was faster in all three samples, with the clearest mechanism being
elimination of SQL for rejected requests. Hot-tier speedup is smaller: successful
reservations still contend on a PostgreSQL row and pay additional Redis round trips.
These oversubscribed scenarios favor the gate. They do not establish that Redis is
faster when almost every request succeeds, when its network latency is higher, or
while counters are cold. Default remains conditional-update.

## Reproduce

```powershell
cd backend
./mvnw.cmd -B -ntp -Pweek6-benchmark test
```

The benchmark tag is excluded from normal `verify`. Raw output is in
`week6-benchmark.log` (ignored local log). Relevant actual summary:

```text
Tests run: 2, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
Total time: 48.020 s
```
