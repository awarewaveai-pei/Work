"""``systems.force_field_analysis`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_force_field_analysis_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.systems.force_field_analysis import generate_force_field_analysis, net_force
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class ForceFieldAnalysisTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("FFA_INVALID_FORCES", lambda: generate_force_field_analysis("FFA-X", "g", _ok()[0][2], [], P)),
        ("FFA_INVALID_FORCES", lambda: generate_force_field_analysis("FFA-X", "g", _ok()[0][2], [{**_ok()[0][3][0], "id": "D1"}], P)),
        ("FFA_INVALID_FORCES", lambda: generate_force_field_analysis("FFA-X", "g", [{**_ok()[0][2][0], "strength": True}], _ok()[0][3], P)),
        ("FFA_INVALID_FORCES", lambda: generate_force_field_analysis("FFA-X", "g", [{**_ok()[0][2][0], "strength": 6}], _ok()[0][3], P)),
        ("FFA_INVALID_FORCES", lambda: generate_force_field_analysis("FFA-X", "", _ok()[0][2], _ok()[0][3], P)),
    ]
    TAMPERS = [
        ("force_field_integrity", lambda r: {**r, "restraining_forces": []}),
        ("force_field_integrity", lambda r: {**r, "driving_forces": [{**r["driving_forces"][0], "strength": 2.5}]}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]
    def test_net_force_is_recomputed(self):
        args, kwargs = fixture_args()
        self.assertEqual(net_force(generate_force_field_analysis(*args, **kwargs)), {"driving_total": 8, "restraining_total": 4, "net": 4})


if __name__ == "__main__":
    unittest.main()
