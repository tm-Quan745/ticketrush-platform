"""Run C with a broken guard in an isolated image, then restore even on failure."""
import argparse
import json
import subprocess
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import loadtest as runner

runner.init()
# Small stock ensures the mutation is exercised even when the host drops spike arrivals.
# The offered cohort remains scenario C's 5,000 distinct users.
args = argparse.Namespace(users=20000, background=200, capacity=100, waiting=False)
runner.reset(args)
broken = runner.COMPOSE + ["-f", str(runner.ROOT / "infrastructure/compose.loadtest-broken.yml")]
constraint_dropped = False
try:
    runner.run(broken + ["build", "backend"])
    runner.compose("stop", "backend")
    # PostgreSQL's CHECK still prevents negative stock if only the UPDATE guard is removed.
    # Removing both protections is intentional, confined to this disposable database.
    runner.compose("exec", "-T", "postgres", "psql", "-U", "ticketrush", "-d", "ticketrush_loadtest", "-v", "ON_ERROR_STOP=1",
                   "-c", "ALTER TABLE ticket_tiers DROP CONSTRAINT ticket_tiers_available_quantity_check")
    constraint_dropped = True
    runner.run(broken + ["up", "-d", "--no-build", "--wait", "backend"])
    result = runner.run([sys.executable, "infrastructure/scripts/loadtest.py", "run", "--scenario", "C", "--run-id", "broken-guard",
                         "--capacity", "100", "--no-reset", "--no-warmup"], check=False)
    report = json.loads((runner.RESULTS / "broken-guard-verify.json").read_text())
    if report["checks"]["1_inventory_conservation"]["passed"]:
        raise RuntimeError("Mutation survived: inventory verifier did not detect the broken guard")
    print("Mutation detected: inventory verifier failed as required")
finally:
    runner.compose("stop", "backend")
    runner.compose("run", "--rm", "-T", "-e", "BACKEND_STOPPED=true", "tools", "reset")
    if constraint_dropped:
        runner.compose("exec", "-T", "postgres", "psql", "-U", "ticketrush", "-d", "ticketrush_loadtest", "-v", "ON_ERROR_STOP=1",
                       "-c", "ALTER TABLE ticket_tiers ADD CONSTRAINT ticket_tiers_available_quantity_check CHECK (available_quantity>=0)")
    for attempt in range(3):
        try:
            runner.compose("up", "-d", "--no-build", "--wait", "backend")
            break
        except subprocess.CalledProcessError:
            if attempt == 2:
                raise
            time.sleep(2)
    runner.tool("seed", "--output", "restored-seed.json")
