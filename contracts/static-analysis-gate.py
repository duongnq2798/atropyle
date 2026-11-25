#!/usr/bin/env python3
"""Fails when Slither or forge lint reports a finding that is not in the triaged baseline.

The baseline is static-analysis.baseline.json next to this file. Every entry in it is triaged in
docs/security/static-analysis.md. Run from contracts/:

  slither . --fail-none --json "$TMP/slither.json"
  python3 static-analysis-gate.py slither "$TMP/slither.json"

  forge lint src --json --only-lint unsafe-typecast > "$TMP/typecast.jsonl"
  python3 static-analysis-gate.py forge-lint "$TMP/typecast.jsonl"

Add --write to rewrite that tool's part of the baseline from the report. Entries that are still reported keep their
triage id; new ones get "untriaged" and must be triaged in the doc before the change is merged.

Slither's own result ids are not used: reentrancy-events lists tied events in set order, so one finding can get a
different id from one run to the next. The fingerprint here is the detector name plus the sorted lines of the result's
description, which name every element with its file and lines but do not depend on that order. Run Slither from
contracts/, so that the file names in the descriptions are relative to it.

forge lint reports only what the config and the inline forge-lint comments leave. unsafe-typecast is excluded in
foundry.toml, so its findings are pinned here by location; the other triaged lints are suppressed in src/ itself.

Standard library only.
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

BASELINE = Path(__file__).with_name("static-analysis.baseline.json")
UNTRIAGED = "untriaged"


def slither_fingerprint(result: dict) -> str:
    # The description names every element with its file (relative to contracts/) and lines. Sorting its lines keeps
    # the multiset, which is stable, and drops the order, which is not.
    lines = sorted(line.strip() for line in result["description"].splitlines() if line.strip())
    text = result["check"] + "\n" + "\n".join(lines)
    return hashlib.sha256(text.encode("utf8")).hexdigest()


def read_slither(path: Path) -> list[dict]:
    report = json.loads(path.read_text(encoding="utf8"))
    if not report.get("success", False):
        raise SystemExit(f"Slither did not finish: {report.get('error')}")
    entries = []
    for result in (report.get("results") or {}).get("detectors", []):
        entries.append(
            {
                "check": result["check"],
                "impact": result["impact"],
                "confidence": result["confidence"],
                "summary": result["description"].strip().splitlines()[0],
                "fingerprint": slither_fingerprint(result),
            }
        )
    return entries


def read_forge_lint(path: Path) -> list[dict]:
    entries = []
    for line in path.read_text(encoding="utf8").splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        diagnostic = json.loads(line)
        if diagnostic.get("$message_type") != "diagnostic" or not diagnostic.get("code"):
            continue
        span = next((s for s in diagnostic.get("spans", []) if s.get("is_primary")), None)
        if span is None:
            continue
        lint = diagnostic["code"]["code"]
        where = f"{span['file_name']}:{span['line_start']}:{span['column_start']}"
        entries.append({"lint": lint, "location": where, "fingerprint": f"{lint}@{where}"})
    return entries


TOOLS = {
    "slither": ("slither", read_slither, ("triage", "check", "impact", "confidence", "summary", "fingerprint")),
    "forge-lint": ("forgeLint", read_forge_lint, ("triage", "lint", "location", "fingerprint")),
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("tool", choices=sorted(TOOLS))
    parser.add_argument("report", type=Path)
    parser.add_argument("--write", action="store_true", help="rewrite this tool's part of the baseline")
    args = parser.parse_args()

    key, read, fields = TOOLS[args.tool]
    baseline = json.loads(BASELINE.read_text(encoding="utf8")) if BASELINE.exists() else {}
    known = {e["fingerprint"]: e for e in baseline.get(key, [])}
    found = read(args.report)

    if args.write:
        rows = []
        for entry in found:
            entry["triage"] = known.get(entry["fingerprint"], {}).get("triage", UNTRIAGED)
            rows.append({f: entry[f] for f in fields})
        rows.sort(key=lambda r: (r["triage"] == UNTRIAGED, r["triage"], r["fingerprint"]))
        baseline[key] = rows
        BASELINE.write_text(json.dumps(baseline, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
        print(f"{args.tool}: wrote {len(rows)} entries to {BASELINE.name}")
        return 0

    new = [e for e in found if e["fingerprint"] not in known]
    seen = {e["fingerprint"] for e in found}
    gone = [e for e in known.values() if e["fingerprint"] not in seen]
    for entry in gone:
        print(f"note: {entry['triage']} is no longer reported: {entry.get('summary') or entry.get('location')}")
    for entry in new:
        what = entry.get("summary") or entry.get("location")
        print(f"NEW {args.tool} finding, not in the triaged baseline: [{entry.get('check') or entry.get('lint')}] {what}")
    print(f"{args.tool}: {len(found)} reported, {len(found) - len(new)} triaged, {len(new)} new, {len(gone)} gone")
    return 1 if new else 0


if __name__ == "__main__":
    sys.exit(main())
