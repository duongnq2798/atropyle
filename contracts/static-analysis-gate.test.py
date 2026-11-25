#!/usr/bin/env python3
"""Tests of static-analysis-gate.py on synthetic reports. Run from anywhere: python3 static-analysis-gate.test.py

Standard library only.
"""

import contextlib
import importlib.util
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ next to the contracts

GATE_PATH = Path(__file__).resolve().with_name("static-analysis-gate.py")
spec = importlib.util.spec_from_file_location("static_analysis_gate", GATE_PATH)
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


def lint_line(lint: str, file: str, line: int, column: int) -> str:
    span = {"file_name": file, "line_start": line, "column_start": column, "is_primary": True}
    return json.dumps({"$message_type": "diagnostic", "code": {"code": lint}, "level": "note", "spans": [span]})


def slither_result(check: str, description: str) -> dict:
    return {"check": check, "impact": "Low", "confidence": "Medium", "description": description}


class GateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.baseline = self.dir / "baseline.json"
        self.doc = self.dir / "doc.md"
        self.doc.write_text("| F-01 | ... |\n| F-02 | ... |\n| S-01 | ... |\n", encoding="utf8")

    def tearDown(self):
        self.tmp.cleanup()

    def report(self, name: str, text: str) -> Path:
        path = self.dir / name
        path.write_text(text, encoding="utf8")
        return path

    def lint_report(self, name: str, *findings: tuple) -> Path:
        return self.report(name, "".join(lint_line(*f) + "\n" for f in findings))

    def slither_report(self, name: str, *results: dict) -> Path:
        return self.report(name, json.dumps({"success": True, "error": None, "results": {"detectors": list(results)}}))

    def run_gate(self, tool: str, *reports: Path, write: bool = False) -> tuple[int, str]:
        argv = [tool, *map(str, reports), "--baseline", str(self.baseline), "--doc", str(self.doc)]
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = gate.main(argv + (["--write"] if write else []))
        return code, out.getvalue()

    def set_triage(self, key: str, *ids: str):
        data = json.loads(self.baseline.read_text(encoding="utf8"))
        for entry, triage in zip(data[key], ids, strict=True):
            entry["triage"] = triage
        self.baseline.write_text(json.dumps(data), encoding="utf8")

    def pin_two_lints(self) -> tuple[Path, Path]:
        a = self.lint_report("a.jsonl", ("unsafe-typecast", "src/A.sol", 1, 2))
        b = self.lint_report("b.jsonl", ("costly-loop", "src/B.sol", 3, 4))
        self.run_gate("forge-lint", a, b, write=True)
        self.set_triage("forgeLint", "F-01", "F-02")
        return a, b

    def test_passes_when_the_reports_match_the_triaged_baseline(self):
        a, b = self.pin_two_lints()
        code, out = self.run_gate("forge-lint", a, b)
        self.assertEqual(code, 0, out)
        self.assertIn("2 reported, 2 triaged, 0 new, 0 untriaged, 0 gone, 0 undocumented", out)

    def test_fails_on_a_new_finding(self):
        a, b = self.pin_two_lints()
        c = self.lint_report("c.jsonl", ("unsafe-typecast", "src/A.sol", 9, 9))
        code, out = self.run_gate("forge-lint", a, b, c)
        self.assertEqual(code, 1)
        self.assertIn("NEW forge-lint finding", out)

    def test_write_marks_new_findings_untriaged_and_the_check_still_fails(self):
        a, b = self.pin_two_lints()
        c = self.lint_report("c.jsonl", ("unsafe-typecast", "src/A.sol", 9, 9))
        self.run_gate("forge-lint", a, b, c, write=True)
        triages = [e["triage"] for e in json.loads(self.baseline.read_text(encoding="utf8"))["forgeLint"]]
        self.assertEqual(triages, ["F-01", "F-02", "untriaged"])
        code, out = self.run_gate("forge-lint", a, b, c)
        self.assertEqual(code, 1)
        self.assertIn("UNTRIAGED forge-lint finding", out)
        self.assertIn("3 reported, 2 triaged, 0 new, 1 untriaged", out)

    def test_fails_when_a_finding_is_gone(self):
        _, b = self.pin_two_lints()
        code, out = self.run_gate("forge-lint", b)
        self.assertEqual(code, 1)
        self.assertIn("GONE forge-lint finding", out)
        self.assertIn("[unsafe-typecast] src/A.sol:1:2", out)

    def test_fails_on_an_empty_forge_lint_report(self):
        self.pin_two_lints()
        code, out = self.run_gate("forge-lint", self.report("empty.jsonl", ""))
        self.assertEqual(code, 1)
        self.assertIn("0 reported, 0 triaged, 0 new, 0 untriaged, 2 gone", out)

    def test_fails_on_a_triage_id_that_the_doc_does_not_name(self):
        a, b = self.pin_two_lints()
        self.doc.write_text("| F-01 | ... |\n| F-020 | ... |\n", encoding="utf8")
        code, out = self.run_gate("forge-lint", a, b)
        self.assertEqual(code, 1)
        self.assertIn("UNDOCUMENTED triage id F-02", out)

    def test_fails_without_the_doc(self):
        a, b = self.pin_two_lints()
        self.doc.unlink()
        code, out = self.run_gate("forge-lint", a, b)
        self.assertEqual(code, 1)
        self.assertIn("cannot read the triage doc", out)

    def test_write_keeps_ids_and_writes_lf(self):
        a, b = self.pin_two_lints()
        self.run_gate("forge-lint", a, b, write=True)
        raw = self.baseline.read_bytes()
        self.assertNotIn(b"\r\n", raw)
        triages = [e["triage"] for e in json.loads(raw)["forgeLint"]]
        self.assertEqual(triages, ["F-01", "F-02"])

    def test_the_same_finding_in_two_reports_counts_once(self):
        a, b = self.pin_two_lints()
        code, out = self.run_gate("forge-lint", a, b, a)
        self.assertEqual(code, 0, out)
        self.assertIn("2 reported", out)

    def test_slither_fingerprint_ignores_the_order_of_description_lines(self):
        one = slither_result("reentrancy-events", "Reentrancy in f():\n\t- A\n\t- B\n")
        two = slither_result("reentrancy-events", "Reentrancy in f():\n\t- B\n\t- A\n")
        other = slither_result("reentrancy-benign", "Reentrancy in f():\n\t- A\n\t- B\n")
        self.assertEqual(gate.slither_fingerprint(one), gate.slither_fingerprint(two))
        self.assertNotEqual(gate.slither_fingerprint(one), gate.slither_fingerprint(other))

    def test_slither_passes_on_the_triaged_baseline_and_fails_on_an_empty_report(self):
        result = slither_result("timestamp", "C.f() (src/C.sol#1-2) uses timestamp for comparisons\n")
        full = self.slither_report("full.json", result)
        self.run_gate("slither", full, write=True)
        self.set_triage("slither", "S-01")
        code, out = self.run_gate("slither", full)
        self.assertEqual(code, 0, out)
        empty = self.report("empty.json", json.dumps({"success": True, "error": None, "results": {}}))
        code, out = self.run_gate("slither", empty)
        self.assertEqual(code, 1)
        self.assertIn("GONE slither finding S-01", out)

    def test_slither_report_of_a_failed_run_is_rejected(self):
        failed = self.report("failed.json", json.dumps({"success": False, "error": "compile failed", "results": {}}))
        with self.assertRaises(SystemExit) as raised:
            self.run_gate("slither", failed)
        self.assertIn("compile failed", str(raised.exception.code))


if __name__ == "__main__":
    unittest.main()
