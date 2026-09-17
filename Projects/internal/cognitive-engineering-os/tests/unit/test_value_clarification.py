"""``art_therapy.value_clarification`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_value_clarification_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.value_clarification import generate_value_clarification
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class ValueClarificationTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("VCLAR_INVALID_VALUES", lambda: generate_value_clarification("VCLAR-X", "c", [], P)),
        ("VCLAR_INVALID_VALUES", lambda: generate_value_clarification("VCLAR-X", "c", [{"id": f"V{i}", "value": f"v{i}", "why_it_matters": "w", "life_direction": "d"} for i in range(6)], P)),
        ("VCLAR_INVALID_VALUES", lambda: generate_value_clarification("VCLAR-X", "c", [_ok()[0][2][0], {**_ok()[0][2][1], "value": "自主 "}], P)),
        ("VCLAR_INVALID_VALUES", lambda: generate_value_clarification("VCLAR-X", "c", [{**_ok()[0][2][0], "life_direction": ""}], P)),
        ("VCLAR_INVALID_VALUES", lambda: generate_value_clarification("VCLAR-X", "", _ok()[0][2], P)),
    ]
    TAMPERS = [
        ("value_clarification_integrity", lambda r: {**r, "core_values": r["core_values"] * 2}),
        ("value_clarification_integrity", lambda r: {**r, "core_values": [{**r["core_values"][0], "why_it_matters": 1}]}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]



if __name__ == "__main__":
    unittest.main()
