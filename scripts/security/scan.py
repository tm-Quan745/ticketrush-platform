"""Scan all reachable blob versions, or complete staged files, with pinned defaults."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess
import tempfile
import time

IMAGE = "zricethezav/gitleaks@sha256:e1b35e12a8c6fa8901f060459cfb6b2fc4c484d3afbe3b029733a3bbfab07055"


def git(*args):
    return subprocess.check_output(["git", *args])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--staged", action="store_true")
    args = parser.parse_args()
    root = Path(git("rev-parse", "--show-toplevel").decode().strip())
    scratch = root / ".tmp" / "security-scans"
    scratch.mkdir(parents=True, exist_ok=True)
    run = Path(tempfile.mkdtemp(prefix="staged-" if args.staged else "history-", dir=scratch))
    corpus = run / "blobs"
    reports = run / "reports"
    corpus.mkdir()
    reports.mkdir()
    if args.staged:
        names = git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z").decode().split("\0")
        objects = {}
        for name in filter(None, names):
            oid = git("rev-parse", ":" + name).decode().strip()
            objects.setdefault(oid, name)
    else:
        objects = {}
        for line in git("rev-list", "--objects", "--all").decode().splitlines():
            oid, _, name = line.partition(" ")
            objects.setdefault(oid, name)

    manifest = []
    process = subprocess.Popen(["git", "cat-file", "--batch"], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    try:
        for oid, name in objects.items():
            process.stdin.write((oid + "\n").encode())
            process.stdin.flush()
            header = process.stdout.readline().decode().split()
            if len(header) != 3:
                raise RuntimeError("Unable to read Git object " + oid)
            size = int(header[2])
            data = process.stdout.read(size)
            if len(data) != size or process.stdout.read(1) != b"\n":
                raise RuntimeError("Truncated Git object " + oid)
            if header[1] != "blob":
                continue
            path = PurePosixPath(name or "unnamed-blob")
            if path.is_absolute() or ".." in path.parts:
                raise RuntimeError("Unsafe export path")
            target = corpus / oid / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            manifest.append({"blob": oid, "path": name, "bytes": size})
    finally:
        process.stdin.close()
        process.wait()
    (run / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf8")
    started = time.monotonic()
    command = ["docker", "run", "--rm", "--network=none", "--memory=1g", "-e", "GOMAXPROCS=2",
               "--mount", f"type=bind,src={corpus},dst=/scan,readonly",
               "--mount", f"type=bind,src={reports},dst=/reports", IMAGE,
               "dir", "/scan", "--ignore-gitleaks-allow", "--gitleaks-ignore-path", "/nonexistent",
               "--redact", "--no-banner", "--no-color", "--report-format", "json",
               "--report-path", "/reports/findings.json"]
    with (run / "scanner-output.txt").open("w", encoding="utf8") as output:
        result = subprocess.run(command, stdout=output, stderr=subprocess.STDOUT)
    raw = reports / "findings.json"
    findings = json.loads(raw.read_text(encoding="utf8")) if raw.exists() else []
    summary = {"mode": "staged" if args.staged else "all-reachable-unique-blobs", "image": IMAGE,
               "rules": "gitleaks 8.24.3 defaults; no custom allowlist; ignore allow comments",
               "head": git("rev-parse", "HEAD").decode().strip(),
               "reachableCommits": int(git("rev-list", "--all", "--count")),
               "uniqueBlobs": len(manifest), "exportedBytes": sum(x["bytes"] for x in manifest),
               "exitCode": result.returncode, "findings": len(findings),
               "byRule": dict(Counter(f["RuleID"] for f in findings)),
               "findingPaths": sorted(set(f["File"] for f in findings)),
               "durationSeconds": round(time.monotonic() - started, 2),
               "reportSha256": hashlib.sha256(raw.read_bytes()).hexdigest() if raw.exists() else None}
    (run / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf8")
    print(json.dumps(summary, indent=2))
    print("Private scan artifacts:", run)
    if result.returncode != 0 or findings:
        raise SystemExit(result.returncode or 1)


if __name__ == "__main__":
    main()
