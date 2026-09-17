"""``framing.reframing`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_reframing_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.framing.reframing import generate_reframing
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class ReframingTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("REFRAME_INVALID_REFRAMES", lambda: generate_reframing("REFRAME-X", {"statement": "s", "label": "GUILT"}, _ok()[0][2], P)),
        ("REFRAME_INVALID_REFRAMES", lambda: generate_reframing("REFRAME-X", _ok()[0][1], [], P)),
        ("REFRAME_INVALID_REFRAMES", lambda: generate_reframing("REFRAME-X", _ok()[0][1], [{"id": "RF1", "perspective": "p", "statement": _ok()[0][1]["statement"].upper()}], P)),
        ("REFRAME_INVALID_REFRAMES", lambda: generate_reframing("REFRAME-X", _ok()[0][1], [_ok()[0][2][0], {**_ok()[0][2][1], "id": "RF1"}], P)),
        ("REFRAME_INVALID_REFRAMES", lambda: generate_reframing("REFRAME-X", {"statement": "", "label": "SHAME"}, _ok()[0][2], P)),
    ]
    TAMPERS = [
        ("reframing_integrity", lambda r: {**r, "reframes": [{**r["reframes"][0], "statement": r["original_frame"]["statement"]}]}),
        ("reframing_integrity", lambda r: {**r, "original_frame": {"statement": "s"}}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]



if __name__ == "__main__":
    unittest.main()
