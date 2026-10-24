#!/usr/bin/env python3
"""Validate a Codex queue before the driver starts any card.

    python validate-codex-queue.py                                   # the COS build queue
    python validate-codex-queue.py --queue agency-os/handoffs/codex-queue --profile general
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[4]
COS = ROOT / "Projects" / "internal" / "cognitive-engineering-os"
sys.path.insert(0, str(COS))

from tests.unit.test_codex_queue import PROFILES, QUEUE_REL, validate_queue  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--queue", default=str(QUEUE_REL), help="queue folder, relative to the repository root")
    parser.add_argument("--profile", default="cos", choices=PROFILES)
    args = parser.parse_args()
    queue_rel = Path(args.queue)
    queue = json.loads((ROOT / queue_rel / "queue.json").read_text(encoding="utf-8"))
    errors = validate_queue(queue, ROOT, queue_rel, args.profile)
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    print(f"queue valid: {len(queue['cards'])} card(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
