"""``art_therapy.visual_metaphor`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_visual_metaphor_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.visual_metaphor import generate_visual_metaphor
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class VisualMetaphorTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("VISMET_INVALID_METAPHOR", lambda: generate_visual_metaphor("VISMET-X", "f", {"medium": "x"}, "m", _ok()[0][4], P)),
        ("VISMET_INVALID_METAPHOR", lambda: generate_visual_metaphor("VISMET-X", "f", _ok()[0][2], "", _ok()[0][4], P)),
        ("VISMET_INVALID_METAPHOR", lambda: generate_visual_metaphor("VISMET-X", "f", _ok()[0][2], "m", [], P)),
        ("VISMET_INVALID_METAPHOR", lambda: generate_visual_metaphor("VISMET-X", "f", _ok()[0][2], "m", [_ok()[0][4][0], {**_ok()[0][4][1], "id": "L1"}], P)),
        ("VISMET_INVALID_METAPHOR", lambda: generate_visual_metaphor("VISMET-X", "", _ok()[0][2], "m", _ok()[0][4], P)),
    ]
    TAMPERS = [
        ("visual_metaphor_integrity", lambda r: {**r, "elements": [{**r["elements"][0], "stands_for": ""}]}),
        ("visual_metaphor_integrity", lambda r: {**r, "image": {**r["image"], "frame": "gold"}}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]



if __name__ == "__main__":
    unittest.main()
