"""``divergent.design_thinking`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_design_thinking_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.divergent.design_thinking import generate_design_thinking
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class DesignThinkingTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("DTHINK_INVALID_STAGES", lambda: generate_design_thinking("DTHINK-X", "c", {k: v for k, v in _ok()[0][2].items() if k != "test"}, P)),
        ("DTHINK_INVALID_STAGES", lambda: generate_design_thinking("DTHINK-X", "c", {**_ok()[0][2], "ideate": {"summary": "s", "items": ["one"]}}, P)),
        ("DTHINK_INVALID_STAGES", lambda: generate_design_thinking("DTHINK-X", "c", {**_ok()[0][2], "test": {"summary": "s", "items": []}}, P)),
        ("DTHINK_INVALID_STAGES", lambda: generate_design_thinking("DTHINK-X", "c", {**_ok()[0][2], "define": {"summary": "", "items": []}}, P)),
        ("DTHINK_INVALID_STAGES", lambda: generate_design_thinking("DTHINK-X", "c", {**_ok()[0][2], "empathize": {"summary": "s", "items": [1]}}, P)),
    ]
    TAMPERS = [
        ("design_thinking_integrity", lambda r: {**r, "stages": {**r["stages"], "extra": {"summary": "s", "items": []}}}),
        ("design_thinking_integrity", lambda r: {**r, "stages": {**r["stages"], "prototype": {"summary": "s"}}}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]



if __name__ == "__main__":
    unittest.main()
