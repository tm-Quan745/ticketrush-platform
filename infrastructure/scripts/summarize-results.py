"""Create auditable per-run and repetition tables from saved k6 summaries only."""
import json
from pathlib import Path
import statistics

ROOT = Path(__file__).resolve().parents[2]
DIRECTORY = ROOT / "docs/performance/results"


def value(metrics, name, field, default=None):
    return metrics.get(name, {}).get("values", {}).get(field, default)


rows = []
for path in sorted(DIRECTORY.glob("*-run.json")):
    run = json.loads(path.read_text())
    run_id = path.stem.removesuffix("-run")
    summary = DIRECTORY / f"{run_id}.json"
    verify_path = DIRECTORY / f"{run_id}-verify.json"
    if not summary.exists():
        continue
    metrics = json.loads(summary.read_text())["metrics"]
    verify = json.loads(verify_path.read_text()) if verify_path.exists() else None
    row = {"run": run_id, "scenario": run["scenario"], "k6_exit": run["k6_exit"],
           "verification_passed": verify["passed"] if verify else False,
           "arrivals": value(metrics, "arrivals_started", "count"),
           "requests": value(metrics, "http_reqs", "count"), "rps": value(metrics, "http_reqs", "rate"),
           "failed_rate": value(metrics, "http_req_failed", "rate"),
           "dropped": value(metrics, "dropped_iterations", "count", 0),
           "client_paid": value(metrics, "purchases_paid", "count", 0),
           "sold_out": value(metrics, "business_outcomes{result:sold_out}", "count", 0),
           "browse_ok": value(metrics, "business_outcomes{result:browse_ok}", "count", 0),
           "browse_limited": value(metrics, "business_outcomes{result:browse_rate_limited}", "count", 0),
           "login_ok": value(metrics, "business_outcomes{result:login_ok}", "count", 0),
           "login_limited": value(metrics, "business_outcomes{result:login_rate_limited}", "count", 0),
           "reserve_p95_ms": value(metrics, "http_req_duration{name:POST /api/v1/reservations}", "p(95)"),
           "reserve_p99_ms": value(metrics, "http_req_duration{name:POST /api/v1/reservations}", "p(99)"),
           "order_p95_ms": value(metrics, "http_req_duration{name:POST /api/v1/orders}", "p(95)"),
           "order_p99_ms": value(metrics, "http_req_duration{name:POST /api/v1/orders}", "p(99)"),
           "oversold": verify["checks"]["2_ticket_conservation"]["oversold"] if verify else None,
           "pending_outbox": verify["checks"]["5_outbox"]["pending"] if verify else None}
    rows.append(row)

repetitions = {}
for prefix in ("baseline", "iteration1", "final"):
    for scenario in (("C",) if prefix == "iteration1" else ("B", "C", "D")):
        selected = [r for r in rows if r["run"] in {f"{prefix}-{scenario}-{i}" for i in range(1, 4)}]
        item = {"repetitions": len(selected), "complete": len(selected) == 3, "runs": [r["run"] for r in selected]}
        for metric in ("rps", "failed_rate", "dropped", "reserve_p95_ms", "reserve_p99_ms", "order_p95_ms", "order_p99_ms"):
            values = [r[metric] for r in selected if r[metric] is not None]
            if values:
                item[metric] = {"median": statistics.median(values), "min": min(values), "max": max(values)}
        repetitions[f"{prefix}-{scenario}"] = item

(DIRECTORY / "aggregate.json").write_text(json.dumps({"runs": rows, "repetitions": repetitions}, indent=2))
lines = ["# Generated measurement tables", "", "Source: individual JSON summaries; latency is milliseconds.", "",
         "| Run | HTTP requests | Avg RPS | Failed rate | Dropped | Reserve p95 / p99 | Order p95 / p99 | k6 / verifier |",
         "| --- | ---: | ---: | ---: | ---: | --- | --- | --- |"]


def fmt(n):
    return "N/A" if n is None else str(n)


for r in rows:
    lines.append(f"| [{r['run']}](results/{r['run']}.json) | {r['requests']} | {r['rps']} | {r['failed_rate']} | {r['dropped']} | "
                 f"{fmt(r['reserve_p95_ms'])} / {fmt(r['reserve_p99_ms'])} | {fmt(r['order_p95_ms'])} / {fmt(r['order_p99_ms'])} | "
                 f"{'PASS' if r['k6_exit'] == 0 else 'FAIL'} / {'PASS' if r['verification_passed'] else 'FAIL'} |")
lines += ["", "## Repetitions", "", "Values below are median [minimum, maximum]. An incomplete group is not a baseline.", "",
          "| Group | n | RPS | HTTP failed rate | Dropped iterations | Reserve p95 | Order p95 |",
          "| --- | ---: | --- | --- | --- | --- | --- |"]
for group, item in repetitions.items():
    def interval(key):
        d = item.get(key)
        return "N/A" if d is None else f"{d['median']} [{d['min']}, {d['max']}]"
    lines.append(f"| {group} | {item['repetitions']} | {interval('rps')} | {interval('failed_rate')} | {interval('dropped')} | "
                 f"{interval('reserve_p95_ms')} | {interval('order_p95_ms')} |")
(ROOT / "docs/performance/tables.md").write_text("\n".join(lines) + "\n")
checks = ["# Correctness counts after drain", "",
          "Counts include the separate warm-up event. Redis reports mismatched tiers before / after reconciliation.", "",
          "| Run | Tiers | Sold / oversold | Orders / keys / effects | Paid without tickets / confirmed without paid | Outbox pending / failed | Paid / exactly one email | Redis before / after | Overdue orders / holds | Result |",
          "| --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- |"]
for row in rows:
    path = DIRECTORY / (row["run"] + "-verify.json")
    if not path.exists():
        continue
    report = json.loads(path.read_text())
    c = report["checks"]
    inventory, tickets, keys = c["1_inventory_conservation"], c["2_ticket_conservation"], c["3_idempotency"]
    paid, outbox, emails = c["4_paid_consistency"], c["5_outbox"], c["6_emails"]
    redis, expiry = c["7_redis_drift"], c["8_expiry"]
    checks.append(f"| [{row['run']}](results/{path.name}) | {inventory['tiers_checked']} | {tickets['sold']} / {tickets['oversold']} | "
                  f"{keys['orders']} / {keys['successful_keys']} / {keys['distinct_effects']} | "
                  f"{paid['paid_without_tickets']} / {paid['confirmed_without_paid']} | {outbox['pending']} / {outbox['failed']} | "
                  f"{emails['paid_orders']} / {emails['exactly_one']} | {redis.get('before_mismatches', 'N/A')} / {redis.get('after_mismatches', 'N/A')} | "
                  f"{expiry['overdue_orders']} / {expiry['overdue_holds']} | {'PASS' if report['passed'] else 'FAIL'} |")
(ROOT / "docs/performance/correctness.md").write_text("\n".join(checks) + "\n")
print(f"Summarized {len(rows)} measured runs")
