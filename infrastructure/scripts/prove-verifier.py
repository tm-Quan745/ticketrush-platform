"""Run C with a broken guard in an isolated image, then restore even on failure."""
import argparse
import json
import subprocess
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import loadtest as runner

runner.init()
args = argparse.Namespace(users=20000, background=200, capacity=5000, waiting=False)
runner.reset(args)
broken = runner.COMPOSE + ["-f", str(runner.ROOT / "infrastructure/compose.loadtest-broken.yml")]
try:
    runner.run(broken + ["build", "backend"])
    runner.compose("stop", "backend")
    # PostgreSQL's CHECK still prevents negative stock if only the UPDATE guard is removed.
    # Removing both protections is intentional, confined to this disposable database.
    runner.compose("exec", "-T", "postgres", "psql", "-U", "ticketrush", "-d", "ticketrush_loadtest", "-v", "ON_ERROR_STOP=1",
                   "-c", "ALTER TABLE ticket_tiers DROP CONSTRAINT ticket_tiers_available_quantity_check")
    runner.run(broken + ["up", "-d", "--no-build", "--wait", "backend"])
    result = runner.run([sys.executable, "infrastructure/scripts/loadtest.py", "run", "--scenario", "C", "--run-id", "broken-guard",
                         "--no-reset", "--no-warmup"], check=False)
    report = json.loads((runner.RESULTS / "broken-guard-verify.json").read_text())
    if report["checks"]["1_inventory_conservation"]["passed"]:
        raise RuntimeError("Mutation survived: inventory verifier did not detect the broken guard")
    print("Mutation detected: inventory verifier failed as required")
finally:
    runner.compose("stop", "backend")
    runner.compose("run", "--rm", "-T", "-e", "BACKEND_STOPPED=true", "tools", "reset")
    runner.compose("exec", "-T", "postgres", "psql", "-U", "ticketrush", "-d", "ticketrush_loadtest", "-v", "ON_ERROR_STOP=1",
                   "-c", "ALTER TABLE ticket_tiers ADD CONSTRAINT ticket_tiers_available_quantity_check CHECK (available_quantity>=0)")
    runner.compose("up", "-d", "--no-build", "--wait", "backend")
    runner.tool("seed", "--output", "restored-seed.json")
