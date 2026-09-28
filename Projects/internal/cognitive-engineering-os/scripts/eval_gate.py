"""Offline eval harness gate (plan §3.7, WC-P2-09 ④): the one command list every caller shares --
scripts/test-eval-harness.ps1 (local and .github/workflows/cognitive-os-eval.yml) and scripts/test-gate.sh (the test
image). Never calls a model; eval/produce.py is the only step that does, and it is not part of this gate.
  1. tests/unit/test_eval_harness.py   scorer, report, producer->scorer fit, mutation-proof checks
  2. eval/run.py --golden              every golden passes the P-c contract and its snapshot
  3. eval/mutate.py                    the harness still turns red on a deleted source and a fake citation
Exit 0 = all three passed; 1 = the first one that failed (its name is printed)."""

from __future__ import annotations

import os
import pathlib
import subprocess
import sys
import tempfile

COS = pathlib.Path(__file__).resolve().parents[1]


def main() -> int:
    out = tempfile.mkdtemp(prefix="evalrep-")
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    steps = [
        ("unittest test_eval_harness", ["-m", "unittest", "tests.unit.test_eval_harness", "-q"]),
        ("run.py --golden", ["eval/run.py", "--golden", "--out", out]),
        ("mutate.py", ["eval/mutate.py"]),
    ]
    for name, args in steps:
        print(f"== {name} ==", flush=True)
        code = subprocess.run([sys.executable, *args], cwd=COS, env=env).returncode
        if code != 0:
            print(f"FAIL: {name} (exit {code})", flush=True)
            return 1
    print(f"PASS: eval harness (report: {out})", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
