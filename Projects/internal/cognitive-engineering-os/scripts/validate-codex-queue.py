#!/usr/bin/env python3
"""Validate the Codex queue before the driver starts any card."""

from __future__ import annotations

import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[4]
COS = ROOT / "Projects" / "internal" / "cognitive-engineering-os"
sys.path.insert(0, str(COS))

from tests.unit.test_codex_queue import validate_queue  # noqa: E402


def main() -> int:
    queue_path = ROOT / "agency-os" / "handoffs" / "cos-codex-queue" / "queue.json"
    queue = json.loads(queue_path.read_text(encoding="utf-8"))
    errors = validate_queue(queue, ROOT)
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    print(f"queue valid: {len(queue['cards'])} card(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
