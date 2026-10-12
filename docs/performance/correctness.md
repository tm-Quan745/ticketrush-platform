# Correctness counts after drain

Counts include the separate warm-up event. Redis reports mismatched tiers before / after reconciliation.

| Run | Tiers | Sold / oversold | Orders / keys / effects | Paid without tickets / confirmed without paid | Outbox pending / failed | Paid / exactly one email | Redis before / after | Overdue orders / holds | Result |
| --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| [auth-1](results/auth-1-verify.json) | 205 | 301 / 0 | 121 / 121 / 121 | 0 / 0 | 0 / 0 | 121 / 121 | 205 / 0 | 0 / 0 | PASS |
| [baseline-B-1](results/baseline-B-1-verify.json) | 205 | 300 / 0 | 120 / 120 / 120 | 0 / 0 | 480 / 0 | 120 / 0 | 205 / 0 | 0 / 0 | FAIL |
| [baseline-B-2](results/baseline-B-2-verify.json) | 205 | 301 / 0 | 121 / 121 / 121 | 0 / 0 | 484 / 0 | 121 / 0 | 205 / 0 | 0 / 0 | FAIL |
| [baseline-B-3](results/baseline-B-3-verify.json) | 205 | 301 / 0 | 121 / 121 / 121 | 0 / 0 | 484 / 0 | 121 / 0 | 205 / 0 | 0 / 0 | FAIL |
| [baseline-C-1](results/baseline-C-1-verify.json) | 205 | 332 / 0 | 131 / 131 / 131 | 0 / 0 | 4498 / 0 | 131 / 0 | 205 / 0 | 0 / 0 | FAIL |
| [baseline-C-2](results/baseline-C-2-verify.json) | 205 | 367 / 0 | 148 / 148 / 148 | 0 / 0 | 4550 / 0 | 147 / 0 | 205 / 0 | 0 / 0 | FAIL |
| [baseline-C-3](results/baseline-C-3-verify.json) | 205 | 315 / 0 | 136 / 136 / 136 | 0 / 0 | 4551 / 0 | 128 / 0 | 205 / 0 | 0 / 153 | FAIL |
| [baseline-D-1](results/baseline-D-1-verify.json) | 205 | 316 / 0 | 126 / 126 / 126 | 0 / 0 | 4492 / 0 | 126 / 0 | 205 / 0 | 0 / 0 | FAIL |
| [baseline-D-2](results/baseline-D-2-verify.json) | 205 | 312 / 0 | 139 / 139 / 139 | 0 / 0 | 4758 / 0 | 124 / 0 | 205 / 0 | 0 / 0 | FAIL |
| [baseline-D-3](results/baseline-D-3-verify.json) | 205 | 309 / 0 | 142 / 142 / 142 | 0 / 0 | 4698 / 0 | 124 / 0 | 205 / 0 | 0 / 0 | FAIL |
| [broken-guard](results/broken-guard-verify.json) | 205 | 2705 / 2605 | 1124 / 1124 / 1124 | 0 / 0 | 0 / 0 | 1058 / 1058 | 205 / 0 | 0 / 0 | FAIL |
| [iteration1-C-1](results/iteration1-C-1-verify.json) | 205 | 327 / 0 | 174 / 174 / 174 | 0 / 0 | 3396 / 0 | 130 / 0 | 205 / 0 | 0 / 0 | FAIL |
| [iteration1-C-2](results/iteration1-C-2-verify.json) | 205 | 2386 / 0 | 985 / 985 / 985 | 0 / 0 | 4142 / 0 | 936 / 0 | 205 / 0 | 0 / 0 | FAIL |
| [post-outbox-smoke](results/post-outbox-smoke-verify.json) | 205 | 451 / 0 | 181 / 181 / 181 | 0 / 0 | 0 / 0 | 181 / 181 | 205 / 0 | 0 / 0 | PASS |
| [smoke-initial](results/smoke-initial-verify.json) | 205 | 452 / 0 | 182 / 182 / 182 | 0 / 0 | 728 / 0 | 182 / 0 | 205 / 0 | 0 / 0 | FAIL |
| [stress-1](results/stress-1-verify.json) | 205 | 13683 / 0 | 5685 / 5685 / 5685 | 0 / 0 | 0 / 0 | 5357 / 5357 | 205 / 0 | 0 / 0 | PASS |
