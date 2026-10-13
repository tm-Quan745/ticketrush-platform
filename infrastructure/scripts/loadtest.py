"""Cross-platform entry point. All mutations target the isolated Week 7 Compose project."""
import argparse
import base64
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
    return ["--users", str(args.users), "--background", str(args.background), "--capacity", str(args.capacity)] + (["--waiting"] if args.waiting else [])


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
            "hikari_connection_timeout_ms": 30000,
            "backend_connection_durability": {
                "synchronous_commit": sync,
                "fsync": fsync,
                "observed_at_utc": durability["observedAt"]
            },
            "k6_vus": {"preAllocatedVUs": int(os.environ.get("PRE_VUS", "200")), "maxVUs": int(os.environ.get("MAX_VUS", "1000"))}}


def k6_poll_parameters(args):
    defaults = {"PAYMENT_POLL_BASE_MS": 1000, "PAYMENT_POLL_MAX_MS": 2000,
                "PAYMENT_POLL_JITTER_MS": 250, "PAYMENT_MAX_POLLS": 20}
    selected = dict(defaults)
    for item in args.param:
        name, separator, value = item.partition("=")
        if name in selected and separator == "=" and value.isdecimal() and int(value) > 0:
            selected[name] = int(value)
    return selected


def request_json(url):
    with urllib.request.urlopen(url, timeout=20) as response:
        return json.load(response)


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


def collect(run_id, start, end, params, source):
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
    provenance = backend_provenance(args)
    provenance["k6_order_poll"] = k6_poll_parameters(args)
    (RESULTS / f"{args.run_id}-provenance.json").write_text(json.dumps(provenance, indent=2))
    if args.scenario != "W" and not args.no_warmup:
        warm_id = args.run_id + "-warmup"
        warm = compose("run", "--rm", "-T", "-e", "SCENARIO=W", "-e", f"RUN_ID={warm_id}",
                       "k6", "run", "--out", "experimental-prometheus-rw", "scenarios.js", check=False)
        if warm.returncode:
            raise RuntimeError("Warm-up failed; refusing to silently measure an unhealthy stack")
    start = time.time()
    parameters = ["SCENARIO=" + args.scenario, "RUN_ID=" + args.run_id] + args.param
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
    try:
        outcome = compose(*command, "k6", "run", "--out", "experimental-prometheus-rw", "scenarios.js", check=False)
    finally:
        sampler.finish()
    end = time.time()
    wal_after = wal_snapshot()
    (RESULTS / f"{args.run_id}-wal.json").write_text(json.dumps({"before": wal_before, "after": wal_after,
        "delta": wal_delta(wal_before, wal_after)}, indent=2))
    collection_error = None
    try:
        if args.jfr:
            export_profile(args.run_id)
        collect(args.run_id, start, end, parameters, provenance)
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
                  "collection_error": collection_error}
    (RESULTS / f"{args.run_id}-run.json").write_text(json.dumps(run_result, indent=2))
    return outcome.returncode or verification_exit or int(collection_error is not None)


def environment():
    data = {"host": platform.platform(), "processor": platform.processor(), "logical_cpus": os.cpu_count(),
            "git_sha": run(["git", "rev-parse", "HEAD"], capture=True).stdout.strip(),
            "docker": json.loads(run(["docker", "info", "--format", "{{json .}}"], capture=True).stdout)}
    # Store only useful environment fields, never daemon credentials/configuration.
    data["docker"] = {k: data["docker"][k] for k in ("ServerVersion", "NCPU", "MemTotal", "KernelVersion", "OperatingSystem", "Architecture")}
    data["java"] = compose("exec", "-T", "backend", "java", "-version", capture=True).stderr
    data["k6"] = compose("run", "--rm", "-T", "k6", "version", capture=True).stdout
    data["images"] = compose("images", "--format", "json", capture=True).stdout
    data["config"] = {k: v for k, v in settings().items() if k in ("RESERVATION_STRATEGY", "RESERVATION_HOLD_DURATION", "RESERVATION_JOB_INTERVAL", "PAYMENT_LATE_GRACE", "HIKARI_MAX_POOL_SIZE", "TOMCAT_MAX_THREADS", "JAVA_TOOL_OPTIONS", "WAITING_ROOM_RATE")}
    data["defaults"] = {"hikari": 10, "tomcat": 200, "heap": "-Xms256m -Xmx768m", "strategy": "conditional-update",
                        "virtual_threads": False, "outbox_batch": 100, "outbox_interval": "1s", "mock_delay": "500ms"}
    (RESULTS / "environment.json").write_text(json.dumps(data, indent=2))
    print("Saved environment.json")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("command", choices=["init", "up", "seed", "reset", "run", "verify", "queries", "test", "environment", "down"])
    p.add_argument("--scenario", choices=list("ABCDEFGHW"), default="A")
    p.add_argument("--run-id", default=None)
    p.add_argument("--users", type=int, default=20000)
    p.add_argument("--background", type=int, default=200)
    p.add_argument("--capacity", type=int, default=5000)
    p.add_argument("--waiting", action="store_true")
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
    for item in args.backend_env:
        key, separator, value = item.partition("=")
        if separator != "=" or key != "HIKARI_MAX_POOL_SIZE" or not value.isdecimal() or int(value) < 1:
            p.error("--backend-env only accepts HIKARI_MAX_POOL_SIZE=<positive integer>")
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
