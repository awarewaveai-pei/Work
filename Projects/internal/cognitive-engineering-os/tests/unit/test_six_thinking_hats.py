"""``divergent.six_thinking_hats`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_six_thinking_hats_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.divergent.six_thinking_hats import generate_six_thinking_hats
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class SixThinkingHatsTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("SIXHATS_INVALID_HATS", lambda: generate_six_thinking_hats("SIXHATS-X", "t", _ok()[0][2][:5], P)),
        ("SIXHATS_INVALID_HATS", lambda: generate_six_thinking_hats("SIXHATS-X", "t", _ok()[0][2][:5] + [{"hat": "WHITE", "statements": ["dup"]}], P)),
        ("SIXHATS_INVALID_HATS", lambda: generate_six_thinking_hats("SIXHATS-X", "t", _ok()[0][2][:5] + [{"hat": "PURPLE", "statements": ["x"]}], P)),
        ("SIXHATS_INVALID_HATS", lambda: generate_six_thinking_hats("SIXHATS-X", "t", _ok()[0][2][:5] + [{"hat": "BLUE", "statements": []}], P)),
        ("SIXHATS_INVALID_HATS", lambda: generate_six_thinking_hats("SIXHATS-X", "", _ok()[0][2], P)),
    ]
    TAMPERS = [
        ("six_thinking_hats_integrity", lambda r: {**r, "hats": r["hats"][1:]}),
        ("six_thinking_hats_integrity", lambda r: {**r, "hats": [{**r["hats"][0], "statements": [""]}] + r["hats"][1:]}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]



if __name__ == "__main__":
    unittest.main()
