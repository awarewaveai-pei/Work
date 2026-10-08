"""Test suite for the Cognitive Engineering OS runtime. Run from the product root, only what a change can affect:

    python scripts/affected_tests.py --run

Full-suite guard (plan §12.1 rule 11; operator 2026-10-08): a run that walks the whole tree is ~14k tests and 25-55 min;
it runs only where COS_FULL_SUITE=1 says so on purpose (scripts/test-gate.sh --all in GitHub CI, or a wave close-out the
operator asked for). The check sits here because a discovery run from the product root imports this package before any
test module; tests/unit/test_00_full_suite_guard.py repeats it for `discover -s tests/unit`; pytest: tests/conftest.py.
"Whole tree" = the discovery pattern would also pick up that guard file, so a `-p`-narrowed discovery and a named-module
run (`python -m unittest tests.unit.test_x`) both pass.
os._exit, not an exception: discovery turns an import error into one failed test and keeps going. ASCII message: a
cp950 stderr would raise on anything else, and that raise would be swallowed the same way.
"""

from __future__ import annotations

import fnmatch
import os
import sys

_GUARD_FILE = "test_00_full_suite_guard.py"
MESSAGE = """
FULL SUITE BLOCKED (tests/__init__.py, plan rule 11): this run walks the whole tests/ tree -- ~14k tests, 25-55 min.
After a change, run only what it can affect:
    python scripts/affected_tests.py --run
or name the modules:
    python -m unittest tests.unit.test_<name>
The full suite is for a lock/pyproject/Dockerfile/compose or selector change (GitHub CI runs it), or a wave close-out
the operator asked for:
    COS_FULL_SUITE=1 python -m unittest discover -s tests -t .           (bash)
    $env:COS_FULL_SUITE='1'; python -m unittest discover -s tests -t .   (PowerShell)
"""


def walks_whole_tree() -> bool:
    """True when the current import is part of a unittest discovery whose pattern would load the guard file."""
    frame = sys._getframe()
    while frame is not None:
        path = frame.f_code.co_filename.replace("\\", "/")
        if frame.f_code.co_name == "discover" and path.endswith("unittest/loader.py"):
            pattern = frame.f_locals.get("pattern")
            return fnmatch.fnmatch(_GUARD_FILE, "test*.py" if pattern is None else pattern)
        frame = frame.f_back
    return False


def block_full_walk() -> None:
    if os.environ.get("COS_FULL_SUITE") != "1" and walks_whole_tree():
        sys.stdout.flush()
        os.write(2, MESSAGE.encode("ascii"))
        os._exit(2)


block_full_walk()
