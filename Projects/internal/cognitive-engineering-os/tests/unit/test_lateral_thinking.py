"""``divergent.lateral_thinking`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_lateral_thinking_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.divergent.lateral_thinking import generate_lateral_thinking
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class LateralThinkingTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("LATERAL_INVALID_PROVOCATIONS", lambda: generate_lateral_thinking("LATERAL-X", "p", "a", [], P)),
        ("LATERAL_INVALID_PROVOCATIONS", lambda: generate_lateral_thinking("LATERAL-X", "p", "a", [{**_ok()[0][3][0], "movement": " " + _ok()[0][3][0]["statement"]}], P)),
        ("LATERAL_INVALID_PROVOCATIONS", lambda: generate_lateral_thinking("LATERAL-X", "p", "a", [{**_ok()[0][3][0], "technique": "MAGIC"}], P)),
        ("LATERAL_INVALID_PROVOCATIONS", lambda: generate_lateral_thinking("LATERAL-X", "p", "a", [_ok()[0][3][0], _ok()[0][3][0]], P)),
        ("LATERAL_INVALID_PROVOCATIONS", lambda: generate_lateral_thinking("LATERAL-X", "p", "", _ok()[0][3], P)),
    ]
    TAMPERS = [
        ("lateral_thinking_integrity", lambda r: {**r, "provocations": [{**r["provocations"][0], "movement": r["provocations"][0]["statement"]}]}),
        ("lateral_thinking_integrity", lambda r: {**r, "dominant_assumption": ""}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]



if __name__ == "__main__":
    unittest.main()
