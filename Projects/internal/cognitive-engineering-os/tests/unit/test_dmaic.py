"""``learning.dmaic`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_dmaic_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.learning.dmaic import generate_dmaic
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class DmaicTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("DMAIC_INVALID_PHASES", lambda: generate_dmaic("DMAIC-X", "p", {k: v for k, v in _ok()[0][2].items() if k != "control"}, P)),
        ("DMAIC_INVALID_PHASES", lambda: generate_dmaic("DMAIC-X", "p", {**_ok()[0][2], "measure": {"summary": "s", "items": []}}, P)),
        ("DMAIC_INVALID_PHASES", lambda: generate_dmaic("DMAIC-X", "p", {**_ok()[0][2], "control": {"summary": "s", "items": [""]}}, P)),
        ("DMAIC_INVALID_PHASES", lambda: generate_dmaic("DMAIC-X", "p", {**_ok()[0][2], "analyze": {"summary": "", "items": []}}, P)),
        ("DMAIC_INVALID_PHASES", lambda: generate_dmaic("DMAIC-X", "", _ok()[0][2], P)),
    ]
    TAMPERS = [
        ("dmaic_integrity", lambda r: {**r, "phases": {**r["phases"], "verify": {"summary": "s", "items": []}}}),
        ("dmaic_integrity", lambda r: {**r, "phases": {**r["phases"], "improve": {"summary": "s", "items": "x"}}}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]



if __name__ == "__main__":
    unittest.main()
