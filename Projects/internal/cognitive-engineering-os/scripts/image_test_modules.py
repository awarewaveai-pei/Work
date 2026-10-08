"""Keep the Docker test image's unittest boundary explicit.

The test image contains the engine package, SPEC, tests, eval, scripts, and web
fixtures. Tests that read repository files outside those copied roots run in the
checkout job instead; they must never become a silent missing-file skip.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import subprocess
import sys


CHECKOUT_ONLY_TEST_MODULES = frozenset(
    {
        "tests.unit.test_block_act",
        "tests.unit.test_block_compute",
        "tests.unit.test_block_decide",
        "tests.unit.test_block_foundation",
        "tests.unit.test_block_gather",
        "tests.unit.test_block_govern",
        "tests.unit.test_block_learn",
        "tests.unit.test_block_think",
        "tests.unit.test_block_verify",
        "tests.unit.test_ci_postgres",
        "tests.unit.test_codex_queue",
        "tests.unit.test_cognitive_db_ops",
        "tests.unit.test_collect_lookups",
        "tests.unit.test_collector_wire_v2",
        "tests.unit.test_integrity",
        "tests.unit.test_step2_foundation",
    }
)


def all_test_modules(tests_root: Path) -> tuple[str, ...]:
    root = Path(tests_root).resolve()
    modules = []
    for path in sorted(root.rglob("test_*.py")):
        relative = path.relative_to(root.parent).with_suffix("")
        modules.append(".".join(relative.parts))
    return tuple(modules)


def image_test_modules(tests_root: Path) -> tuple[str, ...]:
    return tuple(module for module in all_test_modules(tests_root) if module not in CHECKOUT_ONLY_TEST_MODULES)


def checkout_test_modules(tests_root: Path) -> tuple[str, ...]:
    # This is deliberately a fixed manifest: a newly added repository-file test
    # must be reviewed into this list instead of silently moving between jobs.
    return tuple(sorted(CHECKOUT_ONLY_TEST_MODULES))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", action="store_true", help="run tests whose repository reads are copied into the image")
    parser.add_argument("--checkout", action="store_true", help="run the explicit checkout-only test list")
    args = parser.parse_args()
    if args.image == args.checkout:
        parser.error("choose exactly one of --image or --checkout")

    modules = image_test_modules(Path("tests")) if args.image else checkout_test_modules(Path("tests"))
    print("test modules:")
    print("\n".join(modules))
    return subprocess.run([sys.executable, "-m", "unittest", *modules, "-q"], check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
