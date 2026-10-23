# M2 read micro-measurement: work minimum FAILED

2026-10-22. Backend source 567d7ff; image built at 3aef4ee; runner a8fecf73f7ba614dd43b1ad0e0dc42d7a85dfc64.
Host: Docker Desktop/WSL, 12 logical CPUs, 4,013,408,256 bytes Docker memory.
300 synthetic authenticated users, Stand A (800 seats), six alternating 60s runs.
20 warm-up reads; no steady-state warm-up claim. No configuration changes between runs.

| Run | HTTP 200 / offered | Dropped | k6 p95 ms | Server histogram p95 ms | 5xx | Cache hit | Work minimum |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| m2-read-200-1 | 3070/12000 | 5540 | 5000.3 | 4637.3 | 260 | 98.95% | FAIL |
| m2-read-400-1 | 6823/24000 | 16838 | 3581.3 | 2716.2 | 66 | 99.34% | FAIL |
| m2-read-200-2 | 7554/12000 | 4446 | 3285.5 | 2451.9 | 0 | 99.41% | FAIL |
| m2-read-400-2 | 8428/24000 | 15572 | 3000.7 | 2269.8 | 0 | 99.45% | FAIL |
| m2-read-200-3 | 9850/12000 | 2150 | 2501.6 | 1969.9 | 0 | 99.49% | FAIL |
| m2-read-400-3 | 10726/24000 | 13274 | 2383.5 | 1806.6 | 0 | 99.52% | FAIL |

Work minimum: >=99% scheduled requests return 200 and zero dropped iterations.
Each k6 exited 99. The initial orchestration completed with exit 0 (not a workload
PASS); runner 3b885cf now exits 2 on these same results, verified with report mode.

## Container resources

Docker CPU 100% represents one CPU. Values below are maxima of raw docker stats
samples across the six runs, not steady-state CPU averages. Quotas are from inspect.
Some instantaneous samples exceed the percentage corresponding to their quota;
we retain those observations and do not claim all samples stayed below caps.

| Container | Sample max CPU % | CPU quota % | Sample max memory MiB | Memory cap MiB |
| --- | ---: | ---: | ---: | ---: |
| ticketrush-m2-read-backend-1 | 232.02 | 200 | 701.90 | 1024 |
| ticketrush-m2-read-rabbitmq-1 | 125.19 | 100 | 179.10 | 512 |
| ticketrush-m2-read-redis-1 | 40.47 | 100 | 49.08 | 256 |
| ticketrush-m2-read-postgres-1 | 246.34 | 200 | 91.87 | 1024 |
| ticketrush-m2-read-mailpit-1 | 61.94 | 50 | 13.02 | 128 |
| ticketrush-m2-read-k6-run | 97.13 | 200 | 204.30 | 512 |

5 stats sampling failures (container teardown boundaries); raw samples include errors.
The frontend was not running during this measurement.

## Interpretation and provenance

High cache hit ratio did not establish sufficient throughput. These runs do not
support a 200 or 400 requests/s capacity claim. Reported p95 covers observed work;
dropped iterations are explicitly included in acceptance. Server histogram deltas
exclude client/network/dispatch queue timing; k6 measures client HTTP duration.
Exact attribution or tuning is not established by this micro-measurement.

[Summary, per-run resources and SHA-256 manifest](summary.json), [original run metadata](measurement.json).
Per-run k6 summaries, before/after Prometheus snapshots and docker stats are retained
in this directory. Private env and JWT fixture are excluded. Raw metadata dirty paths
were documentation-only; backend code was committed and unchanged during all runs.
