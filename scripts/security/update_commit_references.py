"""Preview or apply unambiguous rewritten Git references in documentation."""
import argparse
import json
from pathlib import Path
import re


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    mapping = dict(line.split() for line in Path("docs/history-rewrite-commit-map.txt").read_text().splitlines()[1:])
    # Annotated tag object, distinct from its unchanged target commit.
    mapping["c6c93e8245b528a48fa065e6fdb06fbab35efa33"] = "b1260e2ffe9b7e6ba8dcf1b786517109d6b63aca"
    changes = []
    files = [*Path(".").glob("README*"), *Path("docs").rglob("*"), *Path("results").glob("*.json")]
    for path in sorted(set(files)):
        if not path.is_file() or path.suffix not in {".md", ".json", ".txt", ".yml", ".yaml"}:
            continue
        if path.name.startswith("history-rewrite"):
            continue
        original = path.read_bytes()
        def replace(match):
            value = match.group().decode("ascii")
            candidates = [old for old in mapping if old.startswith(value)]
            if len(candidates) != 1:
                return value.encode("ascii")
            updated = mapping[candidates[0]][:len(value)]
            if updated != value:
                changes.append({"file": path.as_posix(), "old": value, "new": updated})
            return updated.encode("ascii")
        updated = re.sub(rb"(?<![0-9a-fA-F])[0-9a-f]{7,40}(?![0-9a-fA-F])", replace, original)
        if args.write and updated != original:
            path.write_bytes(updated)
    print(json.dumps({"write": args.write, "replacements": changes}, indent=2))


if __name__ == "__main__":
    main()
