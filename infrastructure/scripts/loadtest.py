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


def request_json(url):
    with urllib.request.urlopen(url, timeout=20) as response:
        return json.load(response)


def collect(run_id, start, end, params):
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
    result["git_sha"] = run(["git", "rev-parse", "HEAD"], capture=True).stdout.strip()
    diff = run(["git", "diff", "--binary"], capture=True).stdout
    result["tracked_diff_sha256"] = hashlib.sha256(diff.encode()).hexdigest()
    result["working_tree_dirty"] = bool(run(["git", "status", "--porcelain"], capture=True).stdout)
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
    outcome = compose(*command, "k6", "run", "--out", "experimental-prometheus-rw", "scenarios.js", check=False)
    end = time.time()
    collection_error = None
    try:
        if args.jfr:
            export_profile(args.run_id)
        collect(args.run_id, start, end, parameters)
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
    args = p.parse_args()
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
