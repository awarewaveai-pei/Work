"""``framing.future_compass`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_future_compass_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.framing.future_compass import generate_future_compass
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class FutureCompassTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("FCOMPASS_INVALID_COMPASS", lambda: generate_future_compass("FCOMPASS-X", "here", " HERE", _ok()[0][3], _ok()[0][4], P)),
        ("FCOMPASS_INVALID_COMPASS", lambda: generate_future_compass("FCOMPASS-X", "d", "c", [], _ok()[0][4], P)),
        ("FCOMPASS_INVALID_COMPASS", lambda: generate_future_compass("FCOMPASS-X", "d", "c", _ok()[0][3], {**_ok()[0][4], "bearing_ref": "B9"}, P)),
        ("FCOMPASS_INVALID_COMPASS", lambda: generate_future_compass("FCOMPASS-X", "d", "c", [_ok()[0][3][0], {**_ok()[0][3][1], "id": "B1"}], _ok()[0][4], P)),
        ("FCOMPASS_INVALID_COMPASS", lambda: generate_future_compass("FCOMPASS-X", "d", "c", _ok()[0][3], {"description": "x"}, P)),
    ]
    TAMPERS = [
        ("future_compass_integrity", lambda r: {**r, "current_position": r["destination"]}),
        ("future_compass_integrity", lambda r: {**r, "bearings": [{**r["bearings"][0], "meaning": ""}]}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]



if __name__ == "__main__":
    unittest.main()
