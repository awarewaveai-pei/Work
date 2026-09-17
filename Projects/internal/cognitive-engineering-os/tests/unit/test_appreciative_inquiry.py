"""``learning.appreciative_inquiry`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_appreciative_inquiry_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.learning.appreciative_inquiry import generate_appreciative_inquiry
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class AppreciativeInquiryTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("AI4D_INVALID_CYCLE", lambda: generate_appreciative_inquiry("AI4D-X", "t", [], "d", ["x"], ["y"], P)),
        ("AI4D_INVALID_CYCLE", lambda: generate_appreciative_inquiry("AI4D-X", "t", ["a"], "", ["x"], ["y"], P)),
        ("AI4D_INVALID_CYCLE", lambda: generate_appreciative_inquiry("AI4D-X", "t", ["a"], "d", [], ["y"], P)),
        ("AI4D_INVALID_CYCLE", lambda: generate_appreciative_inquiry("AI4D-X", "t", ["a"], "d", ["x"], [""], P)),
        ("AI4D_INVALID_CYCLE", lambda: generate_appreciative_inquiry("AI4D-X", "", ["a"], "d", ["x"], ["y"], P)),
    ]
    TAMPERS = [
        ("appreciative_inquiry_integrity", lambda r: {**r, "destiny": []}),
        ("appreciative_inquiry_integrity", lambda r: {**r, "discover": "not a list"}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]



if __name__ == "__main__":
    unittest.main()
