# ADR 0027: Open-model load generation

## Context
Flash-sale users arrive independently. A closed VU loop reduces offered traffic when requests slow down,
creating coordinated omission and disguising overload.

## Options
Closed loops are cheap but cannot hold arrival pressure constant. Open arrival-rate executors need spare
VUs and an explicit dropped-iteration failure condition. A distributed generator is more realistic but
outside this single-host milestone.

## Decision
Use constant-arrival-rate for A/B/C/D/F/G and ramping-arrival-rate with brief ramps and plateaus for E.
C schedules exactly 5,000 distinct users over 20 seconds by default (250 arrivals/s); quantities cycle
through 1..4 with 5,000 tickets. E uses increasing offered rates followed by a 2/s recovery stage.
Fail on any dropped iteration or unexpected 5xx. Preserve failures and expected SOLD_OUT/429 counts.
Endpoint latency thresholds are fixed before baseline measurement.

Pre-generated JWTs avoid BCrypt dominating C. F measures login and its existing IP limiter separately.
One generator IP deliberately exercises the public/login IP limits; do not silently raise limits to
make throughput look better. Report accepted traffic and rejected traffic separately.

## Consequences
A saturated generator invalidates achieved arrival-rate claims. Retrying a timeout does not erase the
original error. Reserve currently has no idempotency-key contract: retries reuse a key, but recovery
uses the existing unique active hold and owned listing. Only order creation has key replay guarantees.
The loadtest profile uses a documented 60-second hold and 5-second expiry interval/grace to observe
abandonment without ten-minute drains per repetition. This is an accelerated test configuration.

References: [k6 arrival rate](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/arrival-rate-vu-allocation/),
[Prometheus remote write](https://grafana.com/docs/k6/latest/results-output/real-time/prometheus-remote-write/).
