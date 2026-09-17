"""``art_therapy.life_wheel`` -- shared MethodSliceTestCase + method-specific derived-view checks."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_life_wheel_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.life_wheel import balance_summary, generate_life_wheel
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _dims(n=4, **override):
    return [{"id": f"D{i}", "name": f"dim {i}", "score": 5, **override} for i in range(n)]


class LifeWheelTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("LWHEEL_INVALID_DIMENSIONS", lambda: generate_life_wheel("LWHEEL-X", "s", _dims(3), P)),
        ("LWHEEL_INVALID_DIMENSIONS", lambda: generate_life_wheel("LWHEEL-X", "s", _dims(4, score=True), P)),  # bool is not a score
        ("LWHEEL_INVALID_DIMENSIONS", lambda: generate_life_wheel("LWHEEL-X", "s", _dims(4, score=10.5), P)),
        ("LWHEEL_INVALID_DIMENSIONS", lambda: generate_life_wheel("LWHEEL-X", "s", _dims(3) + [{"id": "D9", "name": "Dim 0", "score": 1}], P)),  # dup name (normalized)
        ("LWHEEL_INVALID_DIMENSIONS", lambda: generate_life_wheel("LWHEEL-X", "s", _dims(4, extra="x"), P)),  # unknown key
        ("LWHEEL_INVALID_SUBJECT", lambda: generate_life_wheel("LWHEEL-X", " ", _dims(), P)),
        ("LWHEEL_INVALID_ID", lambda: generate_life_wheel("WRONG-1", "s", _dims(), P)),
        ("LWHEEL_INVALID_PROVENANCE", lambda: generate_life_wheel("LWHEEL-X", "s", _dims(), {"epistemic_type": "nope"})),
    ]
    TAMPERS = [
        ("life_wheel_integrity", lambda r: {**r, "dimensions": r["dimensions"][:3]}),
        ("life_wheel_integrity", lambda r: {**r, "dimensions": [{**r["dimensions"][0], "score": -1}] + r["dimensions"][1:]}),
        ("life_wheel_integrity", lambda r: {**r, "dimensions": [{**d, "name": "same"} for d in r["dimensions"]]}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]

    def test_balance_summary_is_recomputed_from_scores(self):
        args, kwargs = fixture_args()
        record = generate_life_wheel(*args, **kwargs)
        summary = balance_summary(record)
        self.assertEqual((summary["lowest"], summary["highest"], summary["balance_gap"]), ("休息", "創作", 6))
        record["dimensions"][4]["score"] = 8
        self.assertEqual(balance_summary(record)["lowest"], "學業／論文")

    def test_record_does_not_alias_caller_dimensions(self):
        dims = _dims()
        record = generate_life_wheel("LWHEEL-A", "s", dims, P)
        dims[0]["score"] = 99
        self.assertEqual(record["dimensions"][0]["score"], 5)


if __name__ == "__main__":
    unittest.main()
