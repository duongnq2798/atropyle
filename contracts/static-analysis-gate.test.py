#!/usr/bin/env python3
"""Tests of static-analysis-gate.py on synthetic reports, and of the doc's dependency-only locations against the
OpenZeppelin source. Run from anywhere: python3 static-analysis-gate.test.py

Standard library only.
"""

import contextlib
import importlib.util
import io
import json
import re
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
        # The Solidity sources that the slither mode checks for CRLF line endings, LF here.
        self.contracts = self.dir / "contracts"
        self.source("src/C.sol", b"pragma solidity 0.8.24;\ncontract C {}\n")
        self.source("lib/dep/contracts/D.sol", b"pragma solidity ^0.8.20;\ncontract D {}\n")

    def tearDown(self):
        self.tmp.cleanup()

    def source(self, name: str, data: bytes) -> Path:
        path = self.contracts / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

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
        argv += ["--contracts", str(self.contracts)]
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

    def pin_one_slither_result(self) -> Path:
        result = slither_result("timestamp", "C.f() (src/C.sol#1-2) uses timestamp for comparisons\n")
        full = self.slither_report("full.json", result)
        self.run_gate("slither", full, write=True)
        self.set_triage("slither", "S-01")
        return full

    def test_slither_fails_when_a_source_in_lib_has_crlf_line_endings(self):
        # A Windows checkout with core.autocrlf=true writes CRLF in the submodules, where the superproject's
        # .gitattributes does not apply, and Slither then reports other line numbers than on the LF checkout of CI.
        full = self.pin_one_slither_result()
        self.source("lib/dep/contracts/D.sol", b"pragma solidity ^0.8.20;\r\ncontract D {}\r\n")
        code, out = self.run_gate("slither", full)
        self.assertEqual(code, 1, out)
        self.assertIn("1 Solidity file has CRLF line endings under src/ or lib/: lib/dep/contracts/D.sol.", out)
        self.assertIn("core.autocrlf false", out)
        self.assertNotIn("reported,", out)

    def test_slither_fails_when_a_source_in_src_has_crlf_line_endings(self):
        full = self.pin_one_slither_result()
        self.source("src/nested/E.sol", b"contract E {}\r\n")
        code, out = self.run_gate("slither", full)
        self.assertEqual(code, 1, out)
        self.assertIn("src/nested/E.sol", out)

    def test_slither_write_refuses_crlf_sources_and_keeps_the_baseline(self):
        full = self.pin_one_slither_result()
        before = self.baseline.read_bytes()
        self.source("lib/dep/contracts/D.sol", b"contract D {}\r\n")
        code, out = self.run_gate("slither", full, write=True)
        self.assertEqual(code, 1, out)
        self.assertIn("CRLF", out)
        self.assertEqual(self.baseline.read_bytes(), before)

    def test_forge_lint_does_not_check_line_endings(self):
        a, b = self.pin_two_lints()
        self.source("lib/dep/contracts/D.sol", b"contract D {}\r\n")
        code, out = self.run_gate("forge-lint", a, b)
        self.assertEqual(code, 0, out)

    def test_slither_report_of_a_failed_run_is_rejected(self):
        failed = self.report("failed.json", json.dumps({"success": False, "error": "compile failed", "results": {}}))
        with self.assertRaises(SystemExit) as raised:
            self.run_gate("slither", failed)
        self.assertIn("compile failed", str(raised.exception.code))


class DependencyLocationsTest(unittest.TestCase):
    """The D-xx rows of the doc cite the lines of the OpenZeppelin source that Slither reports on an LF checkout.

    This reads the real doc and lib/openzeppelin-contracts, so it needs the submodules (CI checks them out). The line
    numbers of a file do not depend on its line endings, but a Slither run on CRLF reports them shifted (D-01 at 29-36
    instead of 30-37), so a location copied from such a run fails here.
    """

    ROW = re.compile(r"^\| (D-\d\d) +\| ([\w-]+) \(\w+\) *\| `([\w/.]+\.sol):(\d+)(?:-(\d+))?`", re.MULTILINE)
    # What the first cited line holds, for the results that cite one statement or declaration.
    ONE_LINE = {
        "low-level-calls": r"\.(call|staticcall|delegatecall)\b",
        "naming-convention": r"\bfunction \w+\(",
        "too-many-digits": r"0x[0-9a-f]{40,}",
    }

    def test_each_location_starts_and_ends_where_the_reported_element_does(self):
        doc = gate.DOC.read_text(encoding="utf8")
        root = GATE_PATH.parent / "lib" / "openzeppelin-contracts" / "contracts"
        rows = self.ROW.findall(doc)
        # D-05 names 9 files and no lines.
        self.assertEqual([r[0] for r in rows], [f"D-{i:02}" for i in range(1, 14) if i != 5])
        for triage, detector, file, first, last in rows:
            with self.subTest(triage=triage, location=f"{file}:{first}-{last or first}"):
                lines = (root / file).read_text(encoding="utf8").splitlines()
                start, end = int(first), int(last or first)
                if detector == "assembly":
                    self.assertRegex(lines[start - 1], r"\bassembly \{")
                    self.assertEqual(lines[end - 1].strip(), "}")
                else:
                    self.assertEqual(start, end, "Slither cites this element on one line")
                    self.assertRegex(lines[start - 1], self.ONE_LINE[detector])


if __name__ == "__main__":
    unittest.main()
