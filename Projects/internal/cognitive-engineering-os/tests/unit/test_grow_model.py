"""``framing.grow_model`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_grow_model_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.framing.grow_model import generate_grow_model
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class GrowModelTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("GROW_INVALID_PLAN", lambda: generate_grow_model("GROW-X", "g", "r", _ok()[0][3][:1], _ok()[0][4], P)),
        ("GROW_INVALID_PLAN", lambda: generate_grow_model("GROW-X", "g", "r", _ok()[0][3], {**_ok()[0][4], "chosen_option_ref": "O9"}, P)),
        ("GROW_INVALID_PLAN", lambda: generate_grow_model("GROW-X", "g", "r", _ok()[0][3], {**_ok()[0][4], "by_when": "2026/09/18"}, P)),
        ("GROW_INVALID_PLAN", lambda: generate_grow_model("GROW-X", "g", "r", _ok()[0][3], {**_ok()[0][4], "first_step": ""}, P)),
        ("GROW_INVALID_PLAN", lambda: generate_grow_model("GROW-X", "g", "", _ok()[0][3], _ok()[0][4], P)),
    ]
    TAMPERS = [
        ("grow_model_integrity", lambda r: {**r, "options": r["options"][1:]}),
        ("grow_model_integrity", lambda r: {**r, "will": {**r["will"], "extra": 1}}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]



if __name__ == "__main__":
    unittest.main()
