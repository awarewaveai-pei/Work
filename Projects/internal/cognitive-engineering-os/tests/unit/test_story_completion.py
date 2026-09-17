"""``art_therapy.story_completion`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_story_completion_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.story_completion import generate_story_completion
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class StoryCompletionTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("STORYC_INVALID_STORY", lambda: generate_story_completion("STORYC-X", "stem", "Stem ", _ok()[0][3], P)),
        ("STORYC_INVALID_STORY", lambda: generate_story_completion("STORYC-X", "stem", "more", [], P)),
        ("STORYC_INVALID_STORY", lambda: generate_story_completion("STORYC-X", "stem", "more", [_ok()[0][3][0], {**_ok()[0][3][1], "id": "C1"}], P)),
        ("STORYC_INVALID_STORY", lambda: generate_story_completion("STORYC-X", "stem", "more", _ok()[0][3], P, felt_dynamics=[])),
        ("STORYC_INVALID_STORY", lambda: generate_story_completion("STORYC-X", "stem", "more", [{"id": "C1", "name": "n", "inner_role": "r", "extra": 1}], P)),
    ]
    TAMPERS = [
        ("story_completion_integrity", lambda r: {**r, "characters": []}),
        ("story_completion_integrity", lambda r: {**r, "felt_dynamics": ["", ""]}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]



if __name__ == "__main__":
    unittest.main()
