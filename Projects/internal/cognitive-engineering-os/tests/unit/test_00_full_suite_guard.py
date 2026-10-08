"""Full-suite guard, second entry point (the check and its reasons: tests/__init__.py). `discover -s tests/unit` never
imports the tests package first; this file sorts first in the directory, so that run stops here.
The end-to-end cases run real unittest/pytest processes with COS_FULL_SUITE removed, so a guard that stops guarding
turns this red even inside the CI full suite. CONFTEST below is a path expression on purpose: scripts/affected_tests.py
selects this module when tests/conftest.py changes (pytest loads it by name, not by import)."""

from __future__ import annotations

import fnmatch
import importlib.util
import os
import subprocess
import sys
import unittest
from pathlib import Path

import tests

tests.block_full_walk()
# A probe child started by the cases below that still reached this file during discovery: the guard failed. Stop now --
# checked from argv, not from tests/__init__.py, so a broken guard cannot also break this stop (2026-10-08 a mutated
# guard let each probe child run these cases again: a process fork chain that exhausted the machine).
if os.environ.get("COS_GUARD_PROBE") == "1" and "discover" in sys.argv:
    os._exit(3)

COS = Path(__file__).resolve().parents[2]
CONFTEST = COS / "tests" / "conftest.py"
_ENV = {k: v for k, v in os.environ.items() if k != "COS_FULL_SUITE"} | {"PYTHONIOENCODING": "utf-8", "COS_GUARD_PROBE": "1"}
_IN_PROBE = os.environ.get("COS_GUARD_PROBE") == "1"


def _run(*args: str, cwd: Path = COS) -> subprocess.CompletedProcess[str]:
    return subprocess.run([sys.executable, *args], cwd=cwd, env=_ENV, capture_output=True, text=True, timeout=180)


class FullSuiteGuardTests(unittest.TestCase):
    def test_a_named_module_run_is_not_a_whole_tree_walk(self) -> None:
        self.assertFalse(tests.walks_whole_tree())

    def test_only_a_pattern_that_would_load_this_file_counts_as_whole_tree(self) -> None:
        self.assertTrue(fnmatch.fnmatch(tests._GUARD_FILE, "test*.py"))  # unittest's default
        self.assertFalse(fnmatch.fnmatch(tests._GUARD_FILE, "test_5w1h*.py"))  # a -p narrowed run

    @unittest.skipIf(_IN_PROBE, "a probe child never starts another")
    def test_whole_tree_discovery_stops_before_any_test(self) -> None:
        for start in (["-s", "tests", "-t", "."], ["-s", "tests/unit"]):
            with self.subTest(start=start):
                done = _run("-m", "unittest", "discover", *start, "-q")
                self.assertEqual(done.returncode, 2, done.stderr[-2000:])
                self.assertIn("FULL SUITE BLOCKED", done.stderr)


@unittest.skipIf(_IN_PROBE, "a probe child never starts another")
@unittest.skipUnless(importlib.util.find_spec("pytest"), "pytest not installed (requirements-test.lock has it)")
class PytestGuardTests(unittest.TestCase):
    def test_conftest_is_where_pytest_finds_it(self) -> None:
        self.assertTrue(CONFTEST.is_file())

    def test_a_directory_argument_or_none_is_blocked(self) -> None:
        # tests/fixtures holds no test file: the block must come from the directory, not from what was collected.
        for args, cwd in ((["tests/fixtures"], COS), ([], COS / "tests" / "fixtures")):
            with self.subTest(args=args, cwd=cwd.name):
                done = _run("-m", "pytest", "-q", "-p", "no:cacheprovider", *args, cwd=cwd)
                self.assertEqual(done.returncode, 2, done.stdout[-2000:])
                self.assertIn("FULL SUITE BLOCKED", done.stdout + done.stderr)

    def test_a_named_node_runs(self) -> None:
        node = f"{Path(__file__).relative_to(COS).as_posix()}::FullSuiteGuardTests::test_a_named_module_run_is_not_a_whole_tree_walk"
        done = _run("-m", "pytest", "-q", "-p", "no:cacheprovider", node)
        self.assertEqual(done.returncode, 0, done.stdout[-2000:])
