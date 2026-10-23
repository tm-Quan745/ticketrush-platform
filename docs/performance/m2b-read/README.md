# M2b seat read micro-measurement: 5/6 work minima passed

One campaign on 2026-10-22. Commit b0df20d8cf15a86adc17444357287ccb5bb2d39c. 300 distinct synthetic users,
800-seat Stand A; 60s constant-arrival warm-up at 200 req/s excluded from counters,
then six alternating 200/400 req/s runs of 60s. No tuning or repeated campaign.
Host: Docker Desktop (containerized), 12 CPUs, 4013408256 memory bytes.
Backend 6 CPU / 1GiB; k6 3 CPU / 512MiB (Week 7 CPU caps). Other caps below.
M2 used different CPU caps: no direct before/after performance comparison.

| Run | HTTP 200 / offered | Drops | k6 p95 ms | Server p95 ms | 5xx | Cache hit | Minimum |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| m2b-read-200-1 | 12000/12000 | 0 | 3.14 | 2.69 | 0 | 100.000% | PASS |
| m2b-read-400-1 | 23999/24000 | 2 | 3.70 | 3.18 | 0 | 100.000% | FAIL |
| m2b-read-200-2 | 12000/12000 | 0 | 3.85 | 3.27 | 0 | 100.000% | PASS |
| m2b-read-400-2 | 24000/24000 | 0 | 7.59 | 6.84 | 0 | 100.000% | PASS |
| m2b-read-200-3 | 12001/12000 | 0 | 8.78 | 7.89 | 0 | 100.000% | PASS |
| m2b-read-400-3 | 24001/24000 | 0 | 9.49 | 8.59 | 0 | 100.000% | PASS |

Work minimum requires >=99% scheduled requests returning HTTP 200 and zero drops.
Server p95 is interpolated from histogram deltas; k6 p95 includes transport timing.
Cache hit ratio is request hits / (hits + cold rebuilds); scheduled refresh work
is separately counted in seat_read_refresh_total. No conditional 304s are used
in this campaign; every successful request transfers the compact 898-byte body.

## Resources

CPU 100% is one CPU; maxima of samples, not averages. Any quota overshoot is kept
as observed rather than silently capped. Memory is Docker stats working-set usage.
Frontend and secret scanners were not running during measurement.

| Container | Max CPU % | Quota % | Max memory MiB | Cap MiB |
| --- | ---: | ---: | ---: | ---: |
| ticketrush-m2-read-backend-1 | 192.99 | 600 | 477.50 | 1024 |
| ticketrush-m2-read-rabbitmq-1 | 100.97 | 100 | 173.80 | 512 |
| ticketrush-m2-read-postgres-1 | 7.74 | 200 | 59.24 | 1024 |
| ticketrush-m2-read-redis-1 | 32.72 | 100 | 14.06 | 256 |
| ticketrush-m2-read-mailpit-1 | 6.97 | 50 | 10.13 | 128 |
| ticketrush-m2-read-k6-run | 69.79 | 300 | 67.52 | 512 |

Stats sampling errors: 4; preserved in raw samples.

The campaign did not meet its work minimum. No tuning or repeat measurement
was performed, and no throughput readiness claim is supported.

[Provenance, per-run resources and SHA-256 manifest](summary.json). Raw Prometheus,
k6 and stats evidence is preserved; credentials/private env are excluded.

Image SHA: `4e0cc26f9d9eeda69338e8ecb35c6dd9c826ffdd202357c090f88ddc0f7b8436`.
Backend source e5d6bde; image revision b0df20d. At measurement start only the
report draft was untracked. During the campaign only contract/report files were
edited; neither the immutable running image nor measurement settings changed.
Occasional +1 completed requests reflect the k6 scheduling boundary; the nominal
offered count is rate x 60s and raw counters are retained unadjusted.
