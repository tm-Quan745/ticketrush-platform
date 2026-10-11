# Week 6 verification record

Initial runs: 2026-10-10; recovery fix and final verification continued 2026-10-11
(Asia/Bangkok). Java 21.0.8, Maven 3.10.0, Docker 29.3.1.
PostgreSQL and Redis logic runs against real Testcontainers services; concurrency
tests use platform threads, CountDownLatch/CyclicBarrier, timed futures and Awaitility.
The 1,000-thread stress fixture uses a 2 s Redis command timeout (connection timeout
remains 300 ms). A 300 ms run overlapped the Compose image build and exhausted the
command deadline, correctly producing WAITING_ROOM_UNAVAILABLE rather than hanging.
The application default is still 300 ms; the stress budget is explicit, not an
assertion that this host can serve 1,000 simultaneous calls within 300 ms.
The stress fixture uses a 5 s pending-attempt lease and 200 ms circuit cooldown to
test recovery without a minute-long wait; production defaults are 1 minute and 5 s.
An earlier stop-during-traffic test exposed stranded pending attempts blocking
healing. Separating this
lease from 24 h refund retention fixes that failure, and a dedicated test verifies
that a late duplicate compensation cannot refund into the newly healed generation.
No mocked Redis or database is used. Normal builds exclude the benchmark tag.

## Commands

```powershell
mvn -B -ntp -f backend/pom.xml verify
mvn -B -ntp -f backend/pom.xml -Dtest=Week6RedisIntegrationTest test
mvn -B -ntp -f backend/pom.xml -Pweek6-benchmark test
./infrastructure/week6-mutations.ps1
./infrastructure/week6-smoke.ps1
git diff --check
```

Compiler lint is the project's existing `-Xlint:unchecked,deprecation -Werror`.
No separate formatter/linter is configured. The first full regression run passed
89 tests; after additional HTTP/proxy/cache checks the isolated Week 6 suite passed
18 tests. The recovery regression brings the final Week 6 suite to 19 tests.

## Five consecutive final-source repetitions

Final full regression/build command: `mvn -B -ntp -f backend/pom.xml verify`.
Actual output in `week6-verify-final.log`:

```text
[INFO] Tests run: 93, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
[INFO] Total time: 02:13 min
```

The JAR was packaged successfully, compiler lint passed, and `git diff --check`
reported no whitespace errors. Maven emitted a nonfatal 401 for optional Flyway
repository metadata on some runs; dependencies resolved and builds completed.

The final source was held unchanged for runs 5–9 (earlier runs were diagnostic).
Each invocation used `mvn -B -ntp -f backend/pom.xml -Dtest=Week6RedisIntegrationTest test`.
All 19 tests, including concurrency, failure injection, Redis stop/start and lease
recovery, ran each time: 95 test executions, no skips or failures.

| Local log | Test summary | Maven elapsed |
|---|---|---|
| week6-repeat-5.log | 19 / 0 failures / 0 errors / 0 skipped | 1:14 min |
| week6-repeat-6.log | 19 / 0 failures / 0 errors / 0 skipped | 1:10 min |
| week6-repeat-7.log | 19 / 0 failures / 0 errors / 0 skipped | 1:06 min |
| week6-repeat-8.log | 19 / 0 failures / 0 errors / 0 skipped | 55.659 s |
| week6-repeat-9.log | 19 / 0 failures / 0 errors / 0 skipped | 49.465 s |

Actual summary from each run:

```text
REPEAT 5 PASS
[INFO] Tests run: 19, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
REPEAT 6 PASS
[INFO] Tests run: 19, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
REPEAT 7 PASS
[INFO] Tests run: 19, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
REPEAT 8 PASS
[INFO] Tests run: 19, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
REPEAT 9 PASS
[INFO] Tests run: 19, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

## Mutation sanity checks (actual runs, source restored)

All three mutants were killed by assertion failures, not compile failures.
`week6-mutations.ps1` saves original file bytes and restores them in `finally`.

| Mutation | Test | Observed failure |
|---|---|---|
| Replace Lua decrement with separate client GET and SET, retaining attempt tracking | fiveHundredThreadsForOneHundredTickets | Redis 499, PostgreSQL expected 0 |
| Remove SQL `available_quantity >= quantity` predicate | wrongRedisValueStillUsesDatabaseGuard | DataIntegrityViolationException instead of controlled SOLD_OUT |
| Skip refund on failed attempts | rollbackAndDuplicateCompensation | Redis 47, PostgreSQL expected 50 |

The SQL mutant still hits the PostgreSQL nonnegative CHECK constraint, another
defense against overselling. The test detects loss of the intended guarded-update
behavior; it does not claim that removing just the predicate bypasses every DB
constraint. Also, GET then SET *inside the same Lua invocation* remains atomic;
the meaningful atomicity mutant uses separate Redis commands with a small delay
to expose the race.

Actual output:

```text
MUTATION get-set: KILLED (assertion failed, exit=1)
Tests run: 1, Failures: 1, Errors: 0, Skipped: 0
MUTATION db-guard: KILLED (assertion failed, exit=1)
Tests run: 1, Failures: 1, Errors: 0, Skipped: 0
MUTATION compensation: KILLED (assertion failed, exit=1)
Tests run: 1, Failures: 1, Errors: 0, Skipped: 0
```

## Isolated Compose smoke (actual HTTP flow)

The final source was rebuilt and the smoke flow rerun successfully on 2026-10-11;
the complete local output is in `week6-smoke-final.log` (exit code 0).

The script built the backend image and brought up PostgreSQL, Redis, RabbitMQ,
Mailpit and the application in a unique `ticketrush-week6-check-*` project. It used
fresh generated secrets, asserted HTTP responses, and removed only that project's
containers/volumes afterwards. Redis AOF/noeviction configuration came from the
main Compose file. Actual output:

```text
SMOKE gate create/cancel: PASS
SMOKE waiting room / user binding: PASS
SMOKE Redis stopped / SQL fallback sale: PASS
SMOKE recovery / login 429: PASS (12 throttled)
```

Waiting-room mode was explicitly disabled before the outage sale, matching its
documented fail-closed token policy. Global admission rate is verified separately
against Redis with three admitter instances in the integration suite.

## Coverage and limits

- 500 threads / 100 tickets, mixed quantities, zero SQL reservation attempts for
  sold-out gate traffic; benchmark additionally counts all JDBC executions.
- Actual foreign-key insert failure after Redis deduction, duplicate compensation,
  duplicate hold rollback, corrupted Redis overcount against the real DB guard.
- Simulated lost after-commit inventory return; active pending attempt blocks heal.
  FLUSHALL during traffic; concurrent single-flight warm-up.
- Stop/restart Redis with a stable host port during traffic; SQL fallback, recovery,
  local outage limiter. Testcontainers' randomly rebound restart port caused the
  first recovery test failure; the fixture now reserves a stable random host port.
- Cancel, expiry, capacity edit, payment failure, late success reacquisition and
  refund assertions compare both stores.
- 1,000 concurrent joins, stable duplicate positions, three separate admitter
  objects sharing Redis, owner-bound tokens, expiry, stale removal, FIFO/lottery,
  sold-out admission pause and HTTP role checks.
- 200 concurrent limiter operations and HTTP requests / capacity 10; token refill;
  identity separation, forwarded-IP trust, webhook exclusion, bounded fallback.
- 100 concurrent cache readers after real TTL expiry, hit/invalidation/rebuild, no
  exact inventory in cached public DTOs, admin cancellation invalidation, and distinct
  first-page cache keys for an absent filter versus the literal keyword `null`.

This is correctness verification and a rough benchmark, not a production capacity
claim. Cross-store drift windows, abandoned-attempt leases, queue loss after flush,
single-primary Redis scope, and cache wait/lease limits are explicit in
[Redis operations](redis.md). No k6, dashboards or frontend were added.
