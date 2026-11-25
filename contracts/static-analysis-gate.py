#!/usr/bin/env python3
"""Fails unless Slither or forge lint reports exactly the findings of the triaged baseline.

The baseline is static-analysis.baseline.json next to this file. Every entry in it has a triage id (S-xx, F-xx) that
docs/security/static-analysis.md triages. Run from contracts/:

  slither . --fail-none --json "$TMP/slither.json"
  python3 static-analysis-gate.py slither "$TMP/slither.json"

  forge lint src --json --only-lint unsafe-typecast > "$TMP/forge-lint-typecast.jsonl"
  forge lint src --json --severity info gas code-size > "$TMP/forge-lint-notes.jsonl"
  python3 static-analysis-gate.py forge-lint "$TMP/forge-lint-typecast.jsonl" "$TMP/forge-lint-notes.jsonl"

Several reports for one tool add up. The check fails (exit 1) on:

- a NEW finding, which is not in the baseline;
- an UNTRIAGED finding, which is in the baseline with the triage "untriaged";
- a GONE finding, which is in the baseline but no longer reported. The deployed source is immutable and every tool
  version is pinned, so this means that the run broke (nothing compiled, an empty or changed report) or that the
  baseline is stale;
- a triage id of the baseline that the doc does not name.

Add --write to rewrite that tool's part of the baseline from the reports. Entries that are still reported keep their
triage id; new ones get "untriaged", which fails the check until they are triaged in the doc and given an id.

Slither's own result ids are not used: reentrancy-events lists tied events in set order, so one finding can get a
different id from one run to the next. The fingerprint here is the detector name plus the sorted lines of the result's
description, which name every element with its file and lines but do not depend on that order. Run Slither from
contracts/, so that the file names in the descriptions are relative to it.

forge lint reports only what the config and the inline forge-lint comments leave. Its High, Medium and Low lints run
by default and the inline comments in src/ are their baseline, except unsafe-typecast, which foundry.toml excludes.
That lint and the Info, Gas and Code-size lints, which forge lint does not run by default, are pinned here by location.

Standard library only.
"""

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASELINE = HERE / "static-analysis.baseline.json"
DOC = HERE.parent / "docs" / "security" / "static-analysis.md"
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


def describe(entry: dict) -> str:
    return f"[{entry.get('check') or entry.get('lint')}] {entry.get('summary') or entry.get('location')}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("tool", choices=sorted(TOOLS))
    parser.add_argument("reports", type=Path, nargs="+", help="one or more reports of that tool; they add up")
    parser.add_argument("--write", action="store_true", help="rewrite this tool's part of the baseline")
    parser.add_argument("--baseline", type=Path, default=BASELINE, help=argparse.SUPPRESS)
    parser.add_argument("--doc", type=Path, default=DOC, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)

    key, read, fields = TOOLS[args.tool]
    baseline = json.loads(args.baseline.read_text(encoding="utf8")) if args.baseline.exists() else {}
    known = {e["fingerprint"]: e for e in baseline.get(key, [])}
    # The same finding in two reports counts once.
    found = list({e["fingerprint"]: e for report in args.reports for e in read(report)}.values())

    if args.write:
        rows = []
        for entry in found:
            entry["triage"] = known.get(entry["fingerprint"], {}).get("triage", UNTRIAGED)
            rows.append({f: entry[f] for f in fields})
        rows.sort(key=lambda r: (r["triage"] == UNTRIAGED, r["triage"], r["fingerprint"]))
        baseline[key] = rows
        text = json.dumps(baseline, indent=2, ensure_ascii=False) + "\n"
        args.baseline.write_text(text, encoding="utf8", newline="\n")
        untriaged = sum(r["triage"] == UNTRIAGED for r in rows)
        print(f"{args.tool}: wrote {len(rows)} entries to {args.baseline.name}, {untriaged} of them untriaged")
        return 0

    if not args.doc.exists():
        print(f"error: cannot read the triage doc {args.doc}")
        return 1
    doc = args.doc.read_text(encoding="utf8")

    new = [e for e in found if e["fingerprint"] not in known]
    untriaged = [e for e in found if known.get(e["fingerprint"], {}).get("triage") == UNTRIAGED]
    seen = {e["fingerprint"] for e in found}
    gone = [e for e in known.values() if e["fingerprint"] not in seen]
    ids = sorted({e["triage"] for e in known.values() if e["triage"] != UNTRIAGED})
    undocumented = [i for i in ids if not re.search(rf"(?<![\w-]){re.escape(i)}(?![\w-])", doc)]

    for entry in new:
        print(f"NEW {args.tool} finding, not in the triaged baseline: {describe(entry)}")
    for entry in untriaged:
        print(f"UNTRIAGED {args.tool} finding, in the baseline without a triage id: {describe(entry)}")
    for entry in gone:
        print(f"GONE {args.tool} finding {entry['triage']}, in the baseline but not reported: {describe(entry)}")
    for triage in undocumented:
        print(f"UNDOCUMENTED triage id {triage}: {args.doc.name} does not name it")
    if gone:
        print("The source and the tool versions are pinned, so a finding cannot just go away: check that the run")
        print("compiled and that the reports are complete. Rewrite the baseline only for a new deployment or tool.")
    triaged = len(found) - len(new) - len(untriaged)
    print(
        f"{args.tool}: {len(found)} reported, {triaged} triaged, {len(new)} new, {len(untriaged)} untriaged, "
        f"{len(gone)} gone, {len(undocumented)} undocumented"
    )
    return 1 if new or untriaged or gone or undocumented else 0


if __name__ == "__main__":
    sys.exit(main())
