"""``divergent.triz`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_triz_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.divergent.triz import generate_triz
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class TrizTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("TRIZ_INVALID_CONTRADICTION", lambda: generate_triz("TRIZ-X", "p", {"improving_parameter": "a", "worsening_parameter": "A"}, _ok()[0][3], P)),
        ("TRIZ_INVALID_CONTRADICTION", lambda: generate_triz("TRIZ-X", "p", _ok()[0][2], [{**_ok()[0][3][0], "principle_number": True}], P)),
        ("TRIZ_INVALID_CONTRADICTION", lambda: generate_triz("TRIZ-X", "p", _ok()[0][2], [{**_ok()[0][3][0], "principle_number": 0}], P)),
        ("TRIZ_INVALID_CONTRADICTION", lambda: generate_triz("TRIZ-X", "p", _ok()[0][2], [_ok()[0][3][0], {**_ok()[0][3][1], "principle_number": 1}], P)),
        ("TRIZ_INVALID_CONTRADICTION", lambda: generate_triz("TRIZ-X", "p", {"improving_parameter": "a"}, _ok()[0][3], P)),
    ]
    TAMPERS = [
        ("triz_integrity", lambda r: {**r, "contradiction": {**r["contradiction"], "worsening_parameter": r["contradiction"]["improving_parameter"]}}),
        ("triz_integrity", lambda r: {**r, "principles": []}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]



if __name__ == "__main__":
    unittest.main()
