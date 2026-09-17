"""``art_therapy.storytelling`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_storytelling_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.storytelling import generate_storytelling
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class StorytellingTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("STORY_INVALID_NARRATIVE", lambda: generate_storytelling("STORY-X", "t", {**_ok()[0][2], "epilogue": "x"}, _ok()[0][3], P)),
        ("STORY_INVALID_NARRATIVE", lambda: generate_storytelling("STORY-X", "t", {**_ok()[0][2], "conflict": ""}, _ok()[0][3], P)),
        ("STORY_INVALID_NARRATIVE", lambda: generate_storytelling("STORY-X", "t", _ok()[0][2], [], P)),
        ("STORY_INVALID_NARRATIVE", lambda: generate_storytelling("STORY-X", "t", _ok()[0][2], [_ok()[0][3][0], {**_ok()[0][3][1], "id": "C1"}], P)),
        ("STORY_INVALID_NARRATIVE", lambda: generate_storytelling("STORY-X", "", _ok()[0][2], _ok()[0][3], P)),
    ]
    TAMPERS = [
        ("storytelling_integrity", lambda r: {**r, "arc": {k: v for k, v in r["arc"].items() if k != "meaning"}}),
        ("storytelling_integrity", lambda r: {**r, "characters": [{"id": "C1", "name": "x"}]}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]



if __name__ == "__main__":
    unittest.main()
