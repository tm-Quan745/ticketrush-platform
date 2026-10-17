"""Cross-platform entry point. All mutations target the isolated Week 7 Compose project."""
import argparse
import base64
import copy
import hashlib
import json
import os
from pathlib import Path
import platform
import secrets
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = ROOT / ".tools/week7.env"
RESULTS = ROOT / "docs/performance/results"
COMPOSE = ["docker", "compose", "--env-file", str(ENV_FILE), "-p", "ticketrush-week7",
           "-f", str(ROOT / "docker-compose.yml"), "-f", str(ROOT / "infrastructure/compose.loadtest.yml"),
           "--profile", "observability", "--profile", "loadtest"]


def run(args, check=True, capture=False):
    return subprocess.run(args, cwd=ROOT, check=check, text=True, capture_output=capture)


def compose(*args, **kwargs):
    return run(COMPOSE + list(args), **kwargs)


def tool(*args, **kwargs):
    return compose("run", "--rm", "-T", "tools", *args, **kwargs)


def init():
    if ENV_FILE.exists():
        print("Preserving existing isolated loadtest environment")
        return
    ENV_FILE.parent.mkdir(exist_ok=True)
    (ROOT / "loadtest/.data").mkdir(exist_ok=True)
    values = {key: base64.b64encode(secrets.token_bytes(32)).decode() for key in (
        "POSTGRES_PASSWORD", "REDIS_PASSWORD", "RABBITMQ_PASSWORD", "JWT_SECRET", "PAYMENT_WEBHOOK_SECRET",
        "MOCK_PAYMENT_TEST_TOKEN", "METRICS_PASSWORD", "GRAFANA_PASSWORD", "LOADTEST_PASSWORD")}
    values.update(POSTGRES_DB="ticketrush_loadtest", POSTGRES_USER="ticketrush", RABBITMQ_USER="ticketrush",
                  REDIS_ENV="loadtest", DEV_SEED_ENABLED="false", SPRING_PROFILES_ACTIVE="dev,loadtest",
                  PROMETHEUS_PORT="29097", GRAFANA_PORT="23007", RESERVATION_HOLD_DURATION="60s",
                  RESERVATION_JOB_INTERVAL="5s", PAYMENT_LATE_GRACE="5s")
    os.umask(0o077)
    ENV_FILE.write_text("\n".join(f"{k}={v}" for k, v in values.items()) + "\n")
    print("Created private .tools/week7.env; no credentials printed")


def settings():
    return dict(line.split("=", 1) for line in ENV_FILE.read_text().splitlines() if line and not line.startswith("#"))


def seed_args(args):
    return ["--users", str(args.users), "--background", str(args.background), "--capacity", str(args.capacity)] + (["--waiting"] if args.waiting else []) + (["--queue-closed"] if args.queue_closed else [])


def reset(args):
    compose("stop", "backend")
    compose("run", "--rm", "-T", "-e", "BACKEND_STOPPED=true", "tools", "reset", "--output", "last-reset.json")
    tool("seed", *seed_args(args), "--output", "last-seed.json")
    compose("up", "-d", "--wait", "--wait-timeout", "180", "backend")


def source_status():
    tracked = run(["git", "status", "--porcelain", "--untracked-files=no"], capture=True).stdout
    untracked = run(["git", "status", "--porcelain", "--untracked-files=all"], capture=True).stdout.splitlines()
    return {"working_tree_clean": not bool(tracked), "tracked_status": tracked.splitlines(),
            "untracked_files": [line[3:] for line in untracked if line.startswith("?? ")]}


def k6_vu_parameters(args):
    selected={"preAllocatedVUs": 200, "maxVUs": 1000}
    for item in args.param:
        key, separator, value=item.partition("=")
        if separator=="=" and key in {"PRE_VUS","MAX_VUS"} and value.isdecimal() and int(value)>0:
            selected["preAllocatedVUs" if key=="PRE_VUS" else "maxVUs"]=int(value)
    if selected["preAllocatedVUs"]>selected["maxVUs"]: raise ValueError("PRE_VUS must not exceed MAX_VUS")
    return selected


def backend_provenance(args):
    inspected = json.loads(run(["docker", "inspect", "ticketrush-week7-backend-1"], capture=True).stdout)[0]
    selected = args.backend_image or os.environ.get("BACKEND_IMAGE")
    if selected and inspected["Image"] != selected:
        raise RuntimeError(f"Backend image mismatch: selected {selected}, running {inspected['Image']}")
    image = json.loads(run(["docker", "image", "inspect", inspected["Image"]], capture=True).stdout)[0]
    commit = args.backend_commit or run(["git", "rev-parse", "HEAD"], capture=True).stdout.strip()
    revision = image.get("Config", {}).get("Labels", {}).get("org.opencontainers.image.revision")
    if revision != commit:
        raise RuntimeError(f"Backend revision mismatch: expected {commit}, image label is {revision}")
    durability = request_json("http://127.0.0.1:28087/internal/loadtest/durability")
    sync, fsync = durability.get("synchronousCommit"), durability.get("fsync")
    if not sync or not fsync or not durability.get("observedAt"):
        raise RuntimeError("Backend Hikari durability response is incomplete")
    if not args.run_id.startswith("diagnostic-") and (sync != "on" or fsync != "on"):
        raise RuntimeError(f"Refusing non-DIAGNOSTIC run with backend durability {sync}/{fsync}")
    return {"commit_sha": commit,
            "backend_image_id": inspected["Image"],
            "image_revision_label": revision,
            "run_id": args.run_id, "utc_start": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            **source_status(),
            "hikari_connection_timeout_ms": int(os.environ.get("HIKARI_CONNECTION_TIMEOUT_MS", "1500")),
            "backend_connection_durability": {
                "synchronous_commit": sync,
                "fsync": fsync,
                "observed_at_utc": durability["observedAt"]
            },
            "k6_vus": k6_vu_parameters(args),
            "measurement_platform": "cpu-capped-2026-10-17"}


def backend_build_revision(args):
    return args.backend_commit or run(["git", "rev-parse", "HEAD"], capture=True).stdout.strip()


def k6_poll_parameters(args):
    defaults = {"PAYMENT_POLL_BASE_MS": 1000, "PAYMENT_POLL_MAX_MS": 2000,
                "PAYMENT_POLL_JITTER_MS": 250, "PAYMENT_MAX_POLLS": 20}
    selected = dict(defaults)
    for item in args.param:
        name, separator, value = item.partition("=")
        if name in selected and separator == "=" and value.isdecimal() and int(value) > 0:
            selected[name] = int(value)
    return selected


def k6_queue_parameters(args):
    defaults = {"QUEUE_USERS": 5000, "QUEUE_JOIN_VUS": 300, "QUEUE_JOIN_MAX_ATTEMPTS": 3, "QUEUE_JOIN_RATE": 0,
                "QUEUE_JOIN_DURATION": "10s", "QUEUE_POLLERS": 500,
                "QUEUE_POLL_DURATION": "60s", "CHECKOUT_VUS": 100, "STATUS_RATE": 50,
                "STATUS_DURATION": "45s", "STATUS_DISTINCT_USERS": 200,
                "QUEUE_FIRST_POLL_ADVICE_SECONDS": 10, "CHECKOUT_RATE": 20, "CHECKOUT_DURATION": "5s", "CHECKOUT_COUNT": 100, "CHECKOUT_KEY_OFFSET": 0,
                "CHECKOUT_MAX_RETRIES": 3, "STATUS_TOKEN_POOL": 200,
                "STATUS_BURST_AFTER_SECONDS": 15, "STATUS_BURST_RAMP_SECONDS": 1, "STATUS_BURST_DURATION_SECONDS": 2,
                "STATUS_BURST_STEADY_RATE": 500, "STATUS_BURST_RATE": 2500,
                "STATUS_POST_BURST_DURATION": "30s"}
    selected = dict(defaults)
    for item in args.param:
        name, separator, value = item.partition("=")
        if name not in selected or separator != "=" or not value:
            continue
        if name in {"QUEUE_JOIN_DURATION", "QUEUE_POLL_DURATION", "STATUS_DURATION", "STATUS_POST_BURST_DURATION", "CHECKOUT_DURATION"} and value.endswith("s") and value[:-1].isdecimal():
            selected[name] = value
        elif name == "QUEUE_JOIN_RATE" and value.isdecimal() and int(value) >= 0:
            selected[name] = int(value)
        elif name not in {"QUEUE_JOIN_DURATION", "QUEUE_POLL_DURATION", "STATUS_DURATION", "STATUS_POST_BURST_DURATION", "CHECKOUT_DURATION"} and value.isdecimal() and int(value) > 0:
            selected[name] = int(value)
    selected["steady_state_warmup_seconds"] = 15
    return selected


def parameter(args, name, default):
    """Return a non-secret run parameter without interpreting unrelated flags."""
    for item in args.param:
        key, separator, value = item.partition("=")
        if key == name and separator == "=" and value:
            return value
    return default


def seconds(value):
    if not isinstance(value, str) or not value.endswith("s") or not value[:-1].isdecimal():
        raise ValueError(f"Expected whole seconds, got {value!r}")
    return int(value[:-1])


def metric_count(summary, metric):
    values = summary.get("metrics", {}).get(metric, {}).get("values", {})
    return int(values.get("count", 0))


def admission_count():
    path = ROOT / "loadtest/.data/admissions.json"
    try:
        loaded = json.loads(path.read_text())
        return len(loaded) if isinstance(loaded, list) else 0
    except (OSError, json.JSONDecodeError):
        return 0


def work_minimum(args):
    """Declare the smallest useful work unit for every scenario.

    `paid=0` is intentional for non-purchase scenarios. The runner records all
    three dimensions so a passing invariant report cannot make an empty run look
    successful.
    """
    scenario = args.scenario
    queue_users = int(parameter(args, "QUEUE_USERS", str(args.users)))
    rejoin_users = int(parameter(args, "QUEUE_REJOIN_USERS", "100"))
    checkout_rate = int(parameter(args, "CHECKOUT_RATE", "20"))
    checkout_duration = seconds(parameter(args, "CHECKOUT_DURATION", "5s"))
    checkout_admissions = admission_count()
    checkout_target = checkout_admissions if scenario == "Q" else checkout_rate * checkout_duration
    declarations = {
        "A": ({"started": 1, "completed": 1, "paid": 1}, {"started": "arrivals_started", "completed": "purchases_paid", "paid": "purchases_paid"}),
        "B": ({"started": 1, "completed": 1, "paid": 0}, {"started": "http_reqs", "completed": "http_reqs", "paid": "purchases_paid"}),
        "C": ({"started": 1, "completed": 1, "paid": 1}, {"started": "arrivals_started", "completed": "purchases_paid", "paid": "purchases_paid"}),
        "D": ({"started": 1, "completed": 1, "paid": 1}, {"started": "arrivals_started", "completed": "purchases_paid", "paid": "purchases_paid"}),
        "E": ({"started": 1, "completed": 1, "paid": 1}, {"started": "arrivals_started", "completed": "purchases_paid", "paid": "purchases_paid"}),
        "F": ({"started": 1, "completed": 1, "paid": 0}, {"started": "http_reqs", "completed": "http_reqs", "paid": "purchases_paid"}),
        "G": ({"started": 1, "completed": 1, "paid": 1}, {"started": "arrivals_started", "completed": "purchases_paid", "paid": "purchases_paid"}),
        "H": ({"started": 1, "completed": 1, "paid": 1}, {"started": "arrivals_started", "completed": "purchases_paid", "paid": "purchases_paid"}),
        "W": ({"started": 1, "completed": 1, "paid": 1}, {"started": "arrivals_started", "completed": "purchases_paid", "paid": "purchases_paid"}),
        "J": ({"started": queue_users, "completed": queue_users, "paid": 0}, {"started": "queue_joins_started", "completed": "queue_joins_accepted", "paid": "purchases_paid"}),
        "R": ({"started": rejoin_users, "completed": rejoin_users, "paid": 0}, {"started": "http_reqs", "completed": "queue_rejoin_preserved", "paid": "purchases_paid"}),
        "P": ({"started": 1, "completed": 1, "paid": 0}, {"started": "queue_status_responses", "completed": "queue_status_responses", "paid": "purchases_paid"}),
        "S": ({"started": 1, "completed": 1, "paid": 0}, {"started": "queue_status_responses", "completed": "queue_status_responses", "paid": "purchases_paid"}),
        "T": ({"started": 1, "completed": 1, "paid": 0}, {"started": "queue_status_responses", "completed": "queue_status_responses", "paid": "purchases_paid"}),
        "Q": ({"started": max(1, checkout_target), "completed": max(1, checkout_target), "paid": max(1, checkout_target)}, {"started": "checkout_started", "completed": "purchases_paid", "paid": "purchases_paid"}),
        "V": ({"started": checkout_target, "completed": checkout_target, "paid": checkout_target}, {"started": "checkout_started", "completed": "purchases_paid", "paid": "purchases_paid"}),
    }
    try:
        minimums, metrics = declarations[scenario]
    except KeyError as error:
        raise ValueError(f"No work minimum declared for scenario {scenario}") from error
    return {"scenario": scenario, "minimums": minimums, "metrics": metrics}


def evaluate_work_minimum(summary, declaration):
    actual = {dimension: metric_count(summary, metric) for dimension, metric in declaration["metrics"].items()}
    passed = all(actual[dimension] >= expected for dimension, expected in declaration["minimums"].items())
    return {**declaration, "actual": actual, "passed": passed}


def prometheus_scalar(response):
    try:
        result = response["data"]["result"]
        return float(result[0]["value"][1]) if result else None
    except (KeyError, IndexError, TypeError, ValueError):
        return None


def join_server_latency_requirement(run_id):
    """The paced front-door join stage has a server-side p95 SLO of one second."""
    try:
        telemetry = json.loads((RESULTS / f"{run_id}-telemetry.json").read_text())
        response = telemetry["route_server_quantiles"]["join"]["p95"]
        p95 = prometheus_scalar(response)
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        return {"required": True, "passed": False, "error": str(error)}
    return {"required": True, "p95_seconds": p95, "limit_seconds": 1.0,
            "passed": p95 is not None and p95 < 1.0}


def utc_timestamp(epoch=None):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() if epoch is None else epoch))


def checkout_target(args):
    if args.scenario == "Q":
        return int(parameter(args, "CHECKOUT_COUNT", "100"))
    return int(parameter(args, "CHECKOUT_RATE", "20")) * seconds(parameter(args, "CHECKOUT_DURATION", "5s"))


def checkout_lifecycle_path(run_id):
    return RESULTS / f"{run_id}-checkout-lifecycle.json"


def write_checkout_lifecycle(run_id, lifecycle):
    checkout_lifecycle_path(run_id).write_text(json.dumps(lifecycle, indent=2))


def admission_freshness(args, now=None):
    """Read the orchestrated token capture time and reject stale checkout input."""
    path = checkout_lifecycle_path(args.run_id)
    try:
        lifecycle = json.loads(path.read_text())
        captured = float(lifecycle["admission_tokens_captured_epoch"])
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise RuntimeError("Checkout must be started with the checkout command and fresh admission tokens") from error
    observed = time.time() if now is None else now
    record = validate_admission_age(captured, observed)
    age = record["age_seconds"]
    record["captured_at_utc"] = lifecycle.get("admission_tokens_captured_at_utc")
    lifecycle["checkout_k6_started_at_utc"] = record["checkout_start_at_utc"]
    lifecycle["checkout_k6_started_epoch"] = observed
    lifecycle["admission_token_age_seconds_at_checkout"] = age
    write_checkout_lifecycle(args.run_id, lifecycle)
    return record


def validate_admission_age(captured, observed):
    age = observed - captured
    record = {"checkout_start_at_utc": utc_timestamp(observed), "age_seconds": age, "max_age_seconds": 300}
    if age < 0 or age > 300:
        raise RuntimeError(f"Admission tokens are {age:.1f}s old; refusing checkout older than five minutes")
    return record


def fresh_checkout(args):
    """Create, join, open and consume one queue cohort without reusable tokens."""
    if args.scenario not in {"Q", "V"}:
        raise ValueError("checkout requires scenario Q or V")
    args.waiting, args.queue_closed = True, True
    target = checkout_target(args)
    if target < 1 or target > args.users:
        raise ValueError(f"Checkout target {target} must be between 1 and the {args.users} fresh queue users")
    lifecycle = {"run_id": args.run_id, "scenario": args.scenario, "queue_users": args.users,
                 "checkout_target": target, "queue_created_at_utc": utc_timestamp(), "stages": {}}
    write_checkout_lifecycle(args.run_id, lifecycle)
    reset(args)
    join_args = copy.copy(args)
    join_args.scenario, join_args.run_id = "J", args.run_id + "-join"
    join_args.no_reset, join_args.no_warmup = True, True
    lifecycle["stages"]["join_started_at_utc"] = utc_timestamp()
    write_checkout_lifecycle(args.run_id, lifecycle)
    join_exit = measure(join_args)
    lifecycle["stages"]["join_finished_at_utc"] = utc_timestamp()
    lifecycle["stages"]["join_exit"] = join_exit
    write_checkout_lifecycle(args.run_id, lifecycle)
    if join_exit:
        lifecycle["result"] = "FAIL"
        write_checkout_lifecycle(args.run_id, lifecycle)
        return join_exit
    lifecycle["queue_opened_at_utc"] = utc_timestamp()
    tool("queue-open", "--output", f"{args.run_id}-queue-open.json")
    tool("admission-pairs", "--count", str(target), "--timeout", "120", "--output", "admissions.json")
    captured = time.time()
    lifecycle["admission_tokens_captured_epoch"] = captured
    lifecycle["admission_tokens_captured_at_utc"] = utc_timestamp(captured)
    write_checkout_lifecycle(args.run_id, lifecycle)
    args.no_reset, args.no_warmup = True, True
    exit_code = measure(args)
    lifecycle = json.loads(checkout_lifecycle_path(args.run_id).read_text())
    lifecycle["result"] = "PASS" if exit_code == 0 else "FAIL"
    lifecycle["finished_at_utc"] = utc_timestamp()
    write_checkout_lifecycle(args.run_id, lifecycle)
    return exit_code


def request_json(url):
    with urllib.request.urlopen(url, timeout=20) as response:
        return json.load(response)


def compose_service_rows(output):
    """Normalise `docker compose ps --format json` across Compose versions."""
    try:
        decoded = json.loads(output)
        return decoded if isinstance(decoded, list) else [decoded]
    except json.JSONDecodeError:
        return [json.loads(line) for line in output.splitlines() if line.strip()]


def remote_write_failed(output):
    markers = ("failed to send the time series data", "stopping output", "remote write receiver")
    return any(marker in output.lower() for marker in markers)


def output_tail(output, lines=20):
    return output.splitlines()[-lines:]


def healthy_cadvisor_target(target):
    labels = target.get("labels", {})
    return (target.get("health") == "up" and labels.get("job") == "containers"
            and labels.get("instance", "").startswith("cadvisor:"))


def k6_preflight_command(probe_id):
    return ["run", "--rm", "--no-deps", "-T",
            "-e", "K6_PROMETHEUS_RW_STALE_MARKERS=false",
            "k6", "run", "--quiet", "--tag", f"preflight_id={probe_id}",
            "--out", "experimental-prometheus-rw", "preflight.js"]


def observability_preflight(args):
    """Fail closed before warm-up when telemetry cannot be collected."""
    report = {"run_id": args.run_id,
              "checked_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
              "checks": {}, "valid": False}
    errors = []
    try:
        rows = compose_service_rows(compose("ps", "--format", "json", capture=True).stdout)
        by_service = {row.get("Service"): row for row in rows}
        for service in ("prometheus", "cadvisor"):
            row = by_service.get(service)
            running = bool(row) and row.get("State") == "running"
            report["checks"][f"{service}_container"] = {"running": running}
            if not running:
                errors.append(f"{service} container is not running")

        with urllib.request.urlopen("http://127.0.0.1:29097/-/ready", timeout=10) as response:
            report["checks"]["prometheus_ready"] = {"status": response.status}
            if response.status != 200:
                errors.append("Prometheus readiness endpoint is not 200")

        targets = request_json("http://127.0.0.1:29097/api/v1/targets")
        cadvisor_targets = [target for target in targets.get("data", {}).get("activeTargets", [])
                            if target.get("labels", {}).get("instance", "").startswith("cadvisor:")]
        cadvisor_up = any(healthy_cadvisor_target(target) for target in cadvisor_targets)
        report["checks"]["cadvisor_scrape"] = {"up": cadvisor_up, "targets": len(cadvisor_targets)}
        if not cadvisor_up:
            errors.append("Prometheus has no healthy cAdvisor scrape target")

        probe_id = f"preflight-{args.run_id}-{int(time.time())}"
        probe = compose(*k6_preflight_command(probe_id), capture=True, check=False)
        probe_output = probe.stdout + "\n" + probe.stderr
        probe_ok = probe.returncode == 0 and not remote_write_failed(probe_output)
        received = False
        for _ in range(5):
            query = urllib.parse.urlencode({"query": f'k6_http_reqs_total{{preflight_id="{probe_id}"}}'})
            received = bool(request_json("http://127.0.0.1:29097/api/v1/query?" + query)
                            .get("data", {}).get("result", []))
            if received:
                break
            time.sleep(1)
        probe_ok = probe_ok and received
        report["checks"]["k6_remote_write"] = {
            "exit_code": probe.returncode, "received_by_prometheus": received, "ok": probe_ok,
            "output_tail": output_tail(probe_output)
        }
        if not probe_ok:
            errors.append("k6 remote-write probe failed")
    except Exception as error:
        errors.append(str(error))
    report["errors"] = errors
    report["valid"] = not errors
    (RESULTS / f"{args.run_id}-preflight.json").write_text(json.dumps(report, indent=2))
    if errors:
        raise RuntimeError("Observability preflight failed: " + "; ".join(errors))
    return report


def wal_snapshot():
    query = "SELECT row_to_json(w) FROM (SELECT wal_records,wal_fpi,wal_bytes,wal_buffers_full,wal_write,wal_sync,wal_write_time,wal_sync_time FROM pg_stat_wal) w"
    output = compose("exec", "-T", "postgres", "psql", "-U", "ticketrush", "-d", "ticketrush_loadtest", "-Atc", query, capture=True).stdout.strip()
    return json.loads(output)


def wal_delta(before, after):
    result = {key: after[key] - before[key] for key in before}
    result["avg_wal_sync_ms"] = result["wal_sync_time"] / result["wal_sync"] if result["wal_sync"] else None
    result["avg_wal_write_ms"] = result["wal_write_time"] / result["wal_write"] if result["wal_write"] else None
    return result


class PgActivitySampler:
    query = """SELECT json_build_object('at',clock_timestamp(),'sessions',coalesce(json_agg(json_build_object(
      'state',state,'wait_event_type',wait_event_type,'wait_event',wait_event,
      'xact_age_s',extract(epoch from clock_timestamp()-xact_start),
      'query_age_s',extract(epoch from clock_timestamp()-query_start),'query',left(query,240))
      ORDER BY xact_start NULLS LAST),'[]'::json)) FROM pg_stat_activity
      WHERE datname=current_database() AND pid<>pg_backend_pid()"""
    def __init__(self, run_id): self.run_id, self.samples, self.stop = run_id, [], threading.Event()
    def start(self):
        self.thread = threading.Thread(target=self.collect, daemon=True); self.thread.start()
    def collect(self):
        while not self.stop.is_set():
            result = run(["docker", "exec", "ticketrush-week7-postgres-1", "psql", "-U", "ticketrush",
                          "-d", "ticketrush_loadtest", "-Atc", self.query], capture=True, check=False)
            try:
                session = json.loads(result.stdout); rows = session["sessions"]
                self.samples.append({"at": session["at"], "sessions": rows,
                    "idle_in_transaction": sum(x["state"] == "idle in transaction" for x in rows),
                    "waiting_on_lock": sum(x["wait_event_type"] == "Lock" for x in rows),
                    "oldest_xact_age_s": max((x["xact_age_s"] or 0 for x in rows), default=0)})
            except (json.JSONDecodeError, KeyError): self.samples.append({"error": result.stderr.strip()})
            self.stop.wait(1)
    def finish(self):
        self.stop.set(); self.thread.join(timeout=5)
        (RESULTS / f"{self.run_id}-pgactivity.json").write_text(json.dumps(self.samples, indent=2))


class DockerStatsSampler:
    """Keep a direct CPU/memory record when cAdvisor misses short-lived k6 containers."""
    def __init__(self, run_id):
        self.run_id, self.samples, self.stop = run_id, [], threading.Event()
        self.memory_abort, self.max_memory_percent = threading.Event(), 0.0
    def start(self):
        self.thread = threading.Thread(target=self.collect, daemon=True); self.thread.start()
    def collect(self):
        while not self.stop.is_set():
            result = run(["docker", "stats", "--no-stream", "--format", "{{json .}}"],
                         capture=True, check=False)
            rows = []
            for line in result.stdout.splitlines():
                try:
                    row = json.loads(line)
                    percent = row.get("CPUPerc", "0%").rstrip("%")
                    memory_percent = float(row.get("MemPerc", "0%").rstrip("%"))
                    rows.append({"name": row.get("Name"), "cpu_percent": float(percent),
                                 "cpu_cores": float(percent) / 100,
                                 "memory_usage": row.get("MemUsage"), "memory_percent": memory_percent})
                except (json.JSONDecodeError, TypeError, ValueError):
                    continue
            total_memory_percent=sum(row["memory_percent"] for row in rows)
            self.max_memory_percent=max(self.max_memory_percent,total_memory_percent)
            self.samples.append({"at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                                 "total_memory_percent": total_memory_percent, "containers": rows})
            if self.max_memory_percent>85 and not self.memory_abort.is_set():
                self.memory_abort.set()
                ids=run(["docker", "ps", "--filter", "name=ticketrush-week7-k6-run", "--quiet"],
                        capture=True, check=False).stdout.split()
                if ids: run(["docker", "stop", *ids], check=False)
            self.stop.wait(2)
    def finish(self):
        self.stop.set(); self.thread.join(timeout=5)
        (RESULTS / f"{self.run_id}-docker-stats.json").write_text(json.dumps({
            "memory_abort": self.memory_abort.is_set(), "max_memory_percent": self.max_memory_percent,
            "samples": self.samples}, indent=2))


def k6_measurement_window(run_id, process_end):
    """Use k6's own duration so Prometheus and k6 exclude the same warm-up."""
    summary = json.loads((RESULTS / f"{run_id}.json").read_text())
    duration = summary["state"]["testRunDurationMs"] / 1000
    k6_end = process_end
    k6_start = k6_end - duration
    return {"k6_start": k6_start, "k6_end": k6_end, "duration_seconds": duration,
            "steady_start": k6_start + 15, "steady_end": k6_end,
            "steady_duration_seconds": max(1, duration - 15)}


def collect(run_id, start, end, params, source, window):
    queries = {
        "request_rate": 'sum(rate(http_server_requests_seconds_count[15s]))',
        "k6_request_rate": 'sum(rate(k6_http_reqs_total[15s]))',
        "hikari_pending": 'hikaricp_connections_pending',
        "hikari_active": 'hikaricp_connections_active',
        "db_lock_waits": 'ticketrush_database_lock_waits',
        "backend_cpu": 'process_cpu_usage', "heap": 'sum(jvm_memory_used_bytes{area="heap"})',
        "gc_pause": 'jvm_gc_pause_seconds_max', "tomcat_busy": 'tomcat_threads_busy_threads',
        "outbox_pending": 'outbox_pending_count', "outbox_age": 'outbox_oldest_pending_age_seconds',
        "redis_memory": 'redis_memory_used_bytes', "redis_latency": 'lettuce_command_completion_seconds_max',
        "container_memory": 'container_memory_working_set_bytes{image!=""}',
        "container_cpu": 'sum by(name)(rate(container_cpu_usage_seconds_total{image!=""}[15s]))',
        "backend_container_cpu_cores": 'sum(rate(container_cpu_usage_seconds_total{name=~".*backend.*"}[15s]))',
        "error_rate": 'sum(rate(http_server_requests_seconds_count{status=~"5.."}[15s]))',
        "reservation_results": 'reservation_attempts_total',
        "waiting_size": 'waiting_room_size', "paid": 'ticketrush_funnel_orders_paid',
        "queue_join_rate": 'sum(rate(waiting_room_requests_total{operation="join"}[15s]))',
        "queue_status_rate": 'sum(rate(waiting_room_requests_total{operation="status"}[15s]))',
        "queue_redis_command_rate": 'sum(rate(waiting_room_redis_commands_total[15s]))',
        "queue_status_limiter_redis_rate": 'sum(rate(rate_limit_redis_commands_total{policy="queue-status"}[15s]))',
        "status_server_latency": 'histogram_quantile(0.95,sum by (le) (rate(http_server_requests_seconds_bucket{uri="/api/v1/events/{id}/waiting-room/status"}[15s])))',
        "jwt_validation": 'histogram_quantile(0.95,sum by (le) (rate(jwt_validation_seconds_bucket[15s])))',
        "status_limiter": 'histogram_quantile(0.95,sum by (le) (rate(rate_limit_redis_seconds_bucket{policy="queue-status"}[15s])))',
        "status_settings": 'histogram_quantile(0.95,sum by (le) (rate(waiting_room_status_settings_seconds_bucket[15s])))',
        "status_script": 'histogram_quantile(0.95,sum by (le) (rate(waiting_room_status_script_seconds_bucket[15s])))',
        "status_response": 'histogram_quantile(0.95,sum by (le) (rate(waiting_room_status_response_seconds_bucket[15s])))',
    }
    result = {"start": start, "end": end, "parameters": params, "series": {}}
    inspected = json.loads(run(["docker", "inspect", "ticketrush-week7-backend-1"], capture=True).stdout)[0]
    allowed = {"RESERVATION_STRATEGY", "HIKARI_MAX_POOL_SIZE", "TOMCAT_MAX_THREADS", "JAVA_TOOL_OPTIONS",
               "SPRING_THREADS_VIRTUAL_ENABLED", "RESERVATION_HOLD_DURATION", "RESERVATION_JOB_INTERVAL",
               "RESERVATION_BATCH_SIZE", "PAYMENT_LATE_GRACE", "MOCK_PAYMENT_DELAY", "WAITING_ROOM_RATE",
               "WAITING_ROOM_DEFAULT", "OUTBOX_BATCH_SIZE", "OUTBOX_RELAY_INTERVAL"}
    result["runtime_configuration"] = {key: value for item in inspected["Config"]["Env"]
                                       for key, _, value in [item.partition("=")] if key in allowed}
    result["backend_image_id"] = inspected["Image"]
    for name, query in queries.items():
        url = "http://127.0.0.1:29097/api/v1/query_range?" + urllib.parse.urlencode(
            {"query": query, "start": start, "end": end, "step": 5})
        try:
            result["series"][name] = request_json(url)
        except Exception as error:
            result["series"][name] = {"error": str(error)}
    # A full-window histogram is needed for an apples-to-apples server p95. The
    # timestamps come from k6's own duration, not Docker process overhead.
    steady_seconds = max(1, int(window["steady_duration_seconds"]))
    def route_quantiles(uri, seconds, observed_at):
        result = {}
        for label, quantile in (("p50", "0.50"), ("p95", "0.95"), ("p99", "0.99")):
            query = 'histogram_quantile(%s,sum by (le) (increase(http_server_requests_seconds_bucket{uri="%s"}[%ss])))' % (quantile, uri, seconds)
            try:
                url = "http://127.0.0.1:29097/api/v1/query?" + urllib.parse.urlencode({"query": query, "time": observed_at})
                result[label] = request_json(url)
            except Exception as error:
                result[label] = {"error": str(error)}
        return result

    steady = {
        "status_server_p95_seconds": 'histogram_quantile(0.95,sum by (le) (increase(http_server_requests_seconds_bucket{uri="/api/v1/events/{id}/waiting-room/status"}[%ss])))' % steady_seconds,
        "jwt_validation_p95_seconds": 'histogram_quantile(0.95,sum by (le) (increase(jwt_validation_seconds_bucket[%ss])))' % steady_seconds,
        "limiter_p95_seconds": 'histogram_quantile(0.95,sum by (le) (increase(rate_limit_redis_seconds_bucket{policy="queue-status"}[%ss])))' % steady_seconds,
        "settings_p95_seconds": 'histogram_quantile(0.95,sum by (le) (increase(waiting_room_status_settings_seconds_bucket[%ss])))' % steady_seconds,
        "script_p95_seconds": 'histogram_quantile(0.95,sum by (le) (increase(waiting_room_status_script_seconds_bucket[%ss])))' % steady_seconds,
        "response_p95_seconds": 'histogram_quantile(0.95,sum by (le) (increase(waiting_room_status_response_seconds_bucket[%ss])))' % steady_seconds,
    }
    result["steady_state"] = {"excluded_warmup_seconds": 15, "duration_seconds": steady_seconds,
                              "window": window, "queries": {}}
    for name, query in steady.items():
        try:
            url = "http://127.0.0.1:29097/api/v1/query?" + urllib.parse.urlencode({"query": query, "time": window["steady_end"]})
            result["steady_state"]["queries"][name] = request_json(url)
        except Exception as error:
            result["steady_state"]["queries"][name] = {"error": str(error)}
    result["steady_state"]["server_status_quantiles"] = route_quantiles("/api/v1/events/{id}/waiting-room/status", steady_seconds, window["steady_end"])
    full_seconds = max(1, int(window["duration_seconds"]))
    result["route_server_quantiles"] = {
        "join": route_quantiles("/api/v1/events/{id}/waiting-room/join", full_seconds, window["k6_end"]),
        "status": route_quantiles("/api/v1/events/{id}/waiting-room/status", full_seconds, window["k6_end"]),
    }
    if any(item == "SCENARIO=T" for item in params):
        queue = source["k6_queue"]
        burst_start = window["k6_start"] + queue["STATUS_BURST_AFTER_SECONDS"] + queue["STATUS_BURST_RAMP_SECONDS"]
        burst_end = burst_start + queue["STATUS_BURST_DURATION_SECONDS"]
        # Prometheus scrapes the backend every five seconds. A five-second
        # server observation window encloses the exact two-second k6 burst;
        # k6 reports the exact burst interval separately.
        server_seconds = 5
        result["burst_windows"] = {
            "burst_k6_window": {"start": burst_start, "end": burst_end,
                                "duration_seconds": queue["STATUS_BURST_DURATION_SECONDS"]},
            "server_burst_observation": {"end": burst_end + 3, "duration_seconds": server_seconds,
                                           "note": "five-second scrape-resolution window enclosing the k6 burst"},
            "server_burst_quantiles": route_quantiles("/api/v1/events/{id}/waiting-room/status", server_seconds, burst_end + 3),
            "post_burst_k6_window": {"start": burst_end + 1, "end": window["k6_end"],
                                       "duration_seconds": max(1, window["k6_end"] - burst_end - 1)},
            "server_post_burst_quantiles": route_quantiles("/api/v1/events/{id}/waiting-room/status", max(1, int(window["k6_end"] - burst_end - 1)), window["k6_end"])
        }
    result["targets"] = request_json("http://127.0.0.1:29097/api/v1/targets")
    # No credentials, container environment, raw headers or user files are included in artifacts.
    result["git_sha"] = source["commit_sha"]
    diff = run(["git", "diff", "--binary"], capture=True).stdout
    result["tracked_diff_sha256"] = hashlib.sha256(diff.encode()).hexdigest()
    result["working_tree_dirty"] = not source["working_tree_clean"]
    result["source_status"] = source
    result["metric_units"] = {"process_cpu_usage": "CPU cores", "jvm_gc_pause_seconds_max": "seconds"}
    (RESULTS / f"{run_id}-telemetry.json").write_text(json.dumps(result, indent=2))


def export_profile(run_id):
    compose("exec", "-T", "backend", "jcmd", "1", "JFR.stop", "name=week7")
    compose("cp", "backend:/tmp/week7.jfr", str(RESULTS / f"{run_id}.jfr"))
    profile = compose("exec", "-T", "backend", "jfr", "summary", "/tmp/week7.jfr", capture=True)
    (RESULTS / f"{run_id}-jfr-summary.txt").write_text(profile.stdout)
    # Stream text: long stress recordings can expand to gigabytes of JSON.
    from collections import Counter
    stacks = Counter()
    command = COMPOSE + ["exec", "-T", "backend", "jfr", "print", "--stack-depth", "32", "--events",
                         "jdk.ExecutionSample,jdk.JavaMonitorEnter,jdk.ThreadPark,jdk.SocketRead", "/tmp/week7.jfr"]
    with subprocess.Popen(command, cwd=ROOT, text=True, stdout=subprocess.PIPE, encoding="utf-8", errors="replace") as process:
        event_type, frames, reading_stack = None, [], False
        for line in process.stdout:
            line = line.strip()
            if line.startswith("jdk.") and line.endswith(" {"):
                event_type, frames = line.split()[0], []
            elif line == "stackTrace = [":
                reading_stack = True
            elif reading_stack and line == "]":
                reading_stack = False
            elif reading_stack and "(" in line:
                frames.append(line.split("(", 1)[0])
            elif line == "}" and event_type:
                stacks[(event_type, tuple(frames))] += 1
                event_type = None
        if process.wait():
            raise RuntimeError("JFR text export failed")
    compact = [{"event": k[0], "stack": list(k[1]), "samples": v} for k, v in stacks.most_common(50)]
    (RESULTS / f"{run_id}-profile.json").write_text(json.dumps(compact, indent=2))


def measure(args):
    if (RESULTS / f"{args.run_id}.json").exists():
        raise ValueError("Run ID already exists; choose a new ID to preserve all results")
    if not args.no_reset:
        reset(args)
    preflight = observability_preflight(args)
    provenance = backend_provenance(args)
    provenance["observability_preflight"] = {
        "valid": preflight["valid"], "checked_at_utc": preflight["checked_at_utc"],
        "artifact": f"{args.run_id}-preflight.json"
    }
    provenance["k6_order_poll"] = k6_poll_parameters(args)
    provenance["k6_queue"] = k6_queue_parameters(args)
    (RESULTS / f"{args.run_id}-provenance.json").write_text(json.dumps(provenance, indent=2))
    if args.scenario in set("ACDEGHQ") and not args.no_warmup:
        warm_id = args.run_id + "-warmup"
        warm = compose("run", "--rm", "-T", "-e", "SCENARIO=W", "-e", f"RUN_ID={warm_id}",
                       "k6", "run", "--out", "experimental-prometheus-rw", "scenarios.js", check=False)
        if warm.returncode:
            raise RuntimeError("Warm-up failed; refusing to silently measure an unhealthy stack")
    if args.scenario in {"Q", "V"}:
        provenance["admission_token_freshness"] = admission_freshness(args)
        (RESULTS / f"{args.run_id}-provenance.json").write_text(json.dumps(provenance, indent=2))
    start = time.time()
    parameters = ["SCENARIO=" + args.scenario, "RUN_ID=" + args.run_id,
                  "QUEUE_USERS=" + str(args.users)] + args.param
    command = ["run", "--rm", "-T"]
    for param in parameters:
        name, _, value = param.partition("=")
        if not name.isupper() or not value or name in {"JWT_SECRET", "MOCK_PAYMENT_TEST_TOKEN"}:
            raise ValueError("Parameters must be non-secret uppercase NAME=value")
        command.extend(["-e", param])
    if args.jfr:
        compose("exec", "-T", "backend", "jcmd", "1", "JFR.start", "name=week7", "settings=profile", "filename=/tmp/week7.jfr")
    wal_before = wal_snapshot()
    sampler = PgActivitySampler(args.run_id); sampler.start()
    docker_stats = DockerStatsSampler(args.run_id); docker_stats.start()
    try:
        outcome = compose(*command, "k6", "run", "--out", "experimental-prometheus-rw", "scenarios.js", check=False)
    finally:
        sampler.finish()
        docker_stats.finish()
    end = time.time()
    queue_audit_exit = None
    if args.scenario in {"J", "R", "P"}:
        audit = tool("queue-audit", "--output", f"{args.run_id}-queue-audit.json", check=False)
        queue_audit_exit = audit.returncode
    wal_after = wal_snapshot()
    (RESULTS / f"{args.run_id}-wal.json").write_text(json.dumps({"before": wal_before, "after": wal_after,
        "delta": wal_delta(wal_before, wal_after)}, indent=2))
    collection_error = None
    try:
        if args.jfr:
            export_profile(args.run_id)
        window = k6_measurement_window(args.run_id, end)
        collect(args.run_id, start, end, parameters, provenance, window)
        tool("top-queries", "--output", f"{args.run_id}-queries.json")
    except Exception as error:
        collection_error = str(error)
        print("Telemetry collection failed; correctness verification still runs")
    verification_error = None
    try:
        verified = tool("verify", "--drain", str(args.drain), "--output", f"{args.run_id}-verify.json", check=False)
        verification_exit = verified.returncode
    except Exception as error:
        verification_error = str(error)
        verification_exit = 1
        print("Correctness verification could not run; the run is invalid")
    try:
        work = evaluate_work_minimum(json.loads((RESULTS / f"{args.run_id}.json").read_text()), work_minimum(args))
    except Exception as error:
        work = {"passed": False, "error": str(error)}
    if not work["passed"]:
        print("Work minimum was not met; verifier invariants do not make this run pass")
    join_latency = {"required": False, "passed": True}
    if args.scenario == "J" and int(parameter(args, "QUEUE_JOIN_RATE", "0")) > 0:
        join_latency = join_server_latency_requirement(args.run_id)
        if not join_latency["passed"]:
            print("Paced join server p95 was unavailable or exceeded one second")
    recovery = {"start": end, "end": time.time(), "series": {}}
    for name, query in {
        "hikari_pending": "hikaricp_connections_pending",
        "heap": 'sum(jvm_memory_used_bytes{area="heap"})',
        "outbox_pending": "outbox_pending_count",
        "backend_up": 'up{job="backend"}',
        "redis_memory": "redis_memory_used_bytes",
    }.items():
        encoded = urllib.parse.urlencode({"query": query, "start": end, "end": recovery["end"], "step": 5})
        try:
            recovery["series"][name] = request_json("http://127.0.0.1:29097/api/v1/query_range?" + encoded)
        except Exception as error:
            recovery["series"][name] = {"error": str(error)}
    (RESULTS / f"{args.run_id}-recovery.json").write_text(json.dumps(recovery, indent=2))
    run_result = {"scenario": args.scenario, "k6_exit": outcome.returncode, "verification_exit": verification_exit,
                  "verification_error": verification_error, "start": start, "end": end, "parameters": parameters,
                  "collection_error": collection_error, "queue_audit_exit": queue_audit_exit,
                  "memory_abort": docker_stats.memory_abort.is_set(), "max_memory_percent": docker_stats.max_memory_percent,
                  "work_minimum": work, "join_server_latency": join_latency,
                  "result": "PASS" if not (outcome.returncode or verification_exit or collection_error or docker_stats.memory_abort.is_set() or not work["passed"] or not join_latency["passed"]) else "FAIL"}
    (RESULTS / f"{args.run_id}-run.json").write_text(json.dumps(run_result, indent=2))
    return outcome.returncode or verification_exit or int(collection_error is not None) or int(docker_stats.memory_abort.is_set()) or int(not work["passed"])


def environment():
    docker_info = json.loads(run(["docker", "info", "--format", "{{json .}}"], capture=True).stdout)
    if not docker_info.get("ServerVersion") or not docker_info.get("NCPU") or not docker_info.get("MemTotal"):
        raise RuntimeError("Docker daemon is unavailable; refusing to record a zero-value environment")
    data = {"host": platform.platform(), "processor": platform.processor(), "logical_cpus": os.cpu_count(),
            "git_sha": run(["git", "rev-parse", "HEAD"], capture=True).stdout.strip(),
            "recorded_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "docker": docker_info,
            "measurement_platform": "cpu-capped-2026-10-17"}
    # Store only useful environment fields, never daemon credentials/configuration.
    data["docker"] = {k: data["docker"][k] for k in ("ServerVersion", "NCPU", "MemTotal", "KernelVersion", "OperatingSystem", "Architecture")}
    data["java"] = compose("exec", "-T", "backend", "java", "-version", capture=True).stderr
    data["k6"] = compose("run", "--rm", "-T", "k6", "version", capture=True).stdout
    data["images"] = compose("images", "--format", "json", capture=True).stdout
    idle_rows = []
    for line in run(["docker", "stats", "--no-stream", "--format", "{{json .}}"], capture=True).stdout.splitlines():
        try:
            row = json.loads(line)
            idle_rows.append({"name": row.get("Name"), "memory_usage": row.get("MemUsage"),
                              "memory_percent": float(row.get("MemPerc", "0%").rstrip("%"))})
        except (json.JSONDecodeError, TypeError, ValueError):
            continue
    data["idle_container_memory"] = {"sampled_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                                      "total_memory_percent": sum(row["memory_percent"] for row in idle_rows),
                                      "containers": idle_rows}
    container_ids = compose("ps", "-q", capture=True).stdout.split()
    if container_ids:
        limits = run(["docker", "inspect", "--format", "{{.Name}}={{.HostConfig.NanoCpus}}", *container_ids], capture=True).stdout
        data["container_cpu_limits_cores"] = {line.split("=", 1)[0].lstrip("/"): int(line.split("=", 1)[1]) / 1_000_000_000
                                              for line in limits.splitlines() if "=" in line}
    data["config"] = {k: v for k, v in settings().items() if k in ("RESERVATION_STRATEGY", "RESERVATION_HOLD_DURATION", "RESERVATION_JOB_INTERVAL", "PAYMENT_LATE_GRACE", "HIKARI_MAX_POOL_SIZE", "TOMCAT_MAX_THREADS", "JAVA_TOOL_OPTIONS", "WAITING_ROOM_RATE")}
    data["defaults"] = {"hikari": 10, "tomcat": 200, "heap": "-Xms256m -Xmx768m", "strategy": "conditional-update",
                        "virtual_threads": False, "outbox_batch": 100, "outbox_interval": "1s", "mock_delay": "500ms"}
    (RESULTS / "environment.json").write_text(json.dumps(data, indent=2))
    print(json.dumps({"NCPU": data["docker"]["NCPU"], "MemTotal": data["docker"]["MemTotal"],
                      "idle_container_memory": data["idle_container_memory"]}, indent=2))
    print("Saved environment.json")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("command", choices=["init", "up", "seed", "reset", "run", "checkout", "verify", "queries", "test", "environment", "down"])
    p.add_argument("--scenario", choices=list("ABCDEFGHWJRPQSTV"), default="A")
    p.add_argument("--run-id", default=None)
    p.add_argument("--users", type=int, default=20000)
    p.add_argument("--background", type=int, default=200)
    p.add_argument("--capacity", type=int, default=5000)
    p.add_argument("--waiting", action="store_true")
    p.add_argument("--queue-closed", action="store_true")
    p.add_argument("--param", action="append", default=[])
    p.add_argument("--no-reset", action="store_true")
    p.add_argument("--no-warmup", action="store_true")
    p.add_argument("--jfr", action="store_true")
    p.add_argument("--drain", type=int, default=180)
    p.add_argument("--top", type=int, default=10)
    p.add_argument("--backend-image")
    p.add_argument("--backend-commit")
    p.add_argument("--backend-env", action="append", default=[])
    args = p.parse_args()
    if args.backend_image:
        os.environ["BACKEND_IMAGE"] = args.backend_image
    else:
        os.environ["BACKEND_VCS_REF"] = backend_build_revision(args)
    allowed_backend_env = {"HIKARI_MAX_POOL_SIZE", "HIKARI_CONNECTION_TIMEOUT_MS", "BULKHEAD_ENABLED",
                           "BULKHEAD_MAX_CONCURRENT", "BULKHEAD_POOL_MULTIPLIER", "ORDER_STATUS_JOINED_READ"}
    for item in args.backend_env:
        key, separator, value = item.partition("=")
        if separator != "=" or key not in allowed_backend_env:
            p.error("--backend-env accepts only documented load-test backend flags")
        if key in {"BULKHEAD_ENABLED", "ORDER_STATUS_JOINED_READ"}:
            if value not in {"true", "false"}:
                p.error(key + " must be true or false")
        elif not value.isdecimal() or (key != "BULKHEAD_MAX_CONCURRENT" and int(value) < 1):
            p.error(key + " must be a positive integer (or zero for derived bulkhead capacity)")
        os.environ[key] = value
    args.run_id = args.run_id or args.scenario + "-" + time.strftime("%Y%m%d-%H%M%S", time.gmtime())
    if not all(c.isalnum() or c in "-_" for c in args.run_id):
        p.error("run-id must contain only letters, digits, hyphen or underscore")
    RESULTS.mkdir(exist_ok=True)
    if args.command == "init":
        init()
        return
    if not ENV_FILE.exists():
        p.error("Run init first")
    if args.command == "up":
        compose("build", "backend", "tools")
        compose("up", "-d", "--wait", "--wait-timeout", "240", "backend", "prometheus", "grafana",
                "postgres-exporter", "redis-exporter", "cadvisor")
        # Existing volumes also need the extension; no Flyway migration is edited.
        compose("exec", "-T", "postgres", "psql", "-U", "ticketrush", "-d", "ticketrush_loadtest", "-v", "ON_ERROR_STOP=1",
                "-c", "CREATE EXTENSION IF NOT EXISTS pg_stat_statements")
    elif args.command == "seed":
        tool("seed", *seed_args(args), "--output", "last-seed.json")
    elif args.command == "reset":
        reset(args)
    elif args.command == "run":
        raise SystemExit(measure(args))
    elif args.command == "checkout":
        raise SystemExit(fresh_checkout(args))
    elif args.command == "verify":
        raise SystemExit(tool("verify", "--drain", str(args.drain), "--output", args.run_id + "-verify.json", check=False).returncode)
    elif args.command == "queries":
        tool("top-queries", "--top", str(args.top), "--output", args.run_id + "-queries.json")
    elif args.command == "test":
        compose("stop", "backend")
        try:
            tool("test")
        finally:
            compose("up", "-d", "--wait", "backend")
    elif args.command == "environment":
        environment()
    elif args.command == "down":
        compose("down")  # Preserve volumes and measurements; no implicit destructive cleanup.


if __name__ == "__main__":
    main()
