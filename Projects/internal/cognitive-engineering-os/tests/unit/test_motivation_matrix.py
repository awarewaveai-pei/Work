"""``art_therapy.motivation_matrix`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_motivation_matrix_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.motivation_matrix import generate_motivation_matrix, quadrant_totals
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class MotivationMatrixTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("MOTMX_INVALID_ENTRIES", lambda: generate_motivation_matrix("MOTMX-X", "a", _ok()[0][2][:2], P)),
        ("MOTMX_INVALID_ENTRIES", lambda: generate_motivation_matrix("MOTMX-X", "a", [{**_ok()[0][2][0], "weight": True}, _ok()[0][2][2]], P)),
        ("MOTMX_INVALID_ENTRIES", lambda: generate_motivation_matrix("MOTMX-X", "a", [{**_ok()[0][2][0], "weight": 0}, _ok()[0][2][2]], P)),
        ("MOTMX_INVALID_ENTRIES", lambda: generate_motivation_matrix("MOTMX-X", "a", [{**_ok()[0][2][0], "source": "SOCIAL"}, _ok()[0][2][2]], P)),
        ("MOTMX_INVALID_ENTRIES", lambda: generate_motivation_matrix("MOTMX-X", "a", [_ok()[0][2][0], {**_ok()[0][2][2], "id": "M1"}], P)),
    ]
    TAMPERS = [
        ("motivation_matrix_integrity", lambda r: {**r, "entries": [e for e in r["entries"] if e["polarity"] == "DRIVES"]}),
        ("motivation_matrix_integrity", lambda r: {**r, "entries": [{**r["entries"][0], "weight": 2.5}] + r["entries"][1:]}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]
    def test_quadrant_totals_are_recomputed(self):
        args, kwargs = fixture_args()
        record = generate_motivation_matrix(*args, **kwargs)
        totals = quadrant_totals(record)
        self.assertEqual((totals["INTRINSIC_DRIVES"], totals["EXTRINSIC_BLOCKS"], totals["net_drive"]), (4, 5, -2))


if __name__ == "__main__":
    unittest.main()
