"""``framing.value_sorting`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_value_sorting_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.framing.value_sorting import generate_value_sorting, top_values
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class ValueSortingTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("VSORT_INVALID_RANKING", lambda: generate_value_sorting("VSORT-X", "c", _ok()[0][2], _ok()[0][3][:4], P)),
        ("VSORT_INVALID_RANKING", lambda: generate_value_sorting("VSORT-X", "c", _ok()[0][2], _ok()[0][3] + ["V9"], P)),
        ("VSORT_INVALID_RANKING", lambda: generate_value_sorting("VSORT-X", "c", _ok()[0][2][:1], ["V1"], P)),
        ("VSORT_INVALID_RANKING", lambda: generate_value_sorting("VSORT-X", "c", [{"id": "V1", "value": "a"}, {"id": "V2", "value": "A "}], ["V1", "V2"], P)),
        ("VSORT_INVALID_RANKING", lambda: generate_value_sorting("VSORT-X", "c", _ok()[0][2], "V1,V2,V3,V4,V5", P)),
    ]
    TAMPERS = [
        ("value_sorting_integrity", lambda r: {**r, "ranking": r["ranking"][1:]}),
        ("value_sorting_integrity", lambda r: {**r, "candidate_values": r["candidate_values"][:-1]}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]
    def test_top_values_follow_ranking(self):
        args, kwargs = fixture_args()
        self.assertEqual(top_values(generate_value_sorting(*args, **kwargs)), ["自主", "學習", "陪伴"])


if __name__ == "__main__":
    unittest.main()
