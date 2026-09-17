"""``art_therapy.metaphor_dialogue`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_metaphor_dialogue_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.metaphor_dialogue import generate_metaphor_dialogue
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class MetaphorDialogueTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("METDLG_INVALID_DIALOGUE", lambda: generate_metaphor_dialogue("METDLG-X", {"name": "x"}, _ok()[0][2], "n", P)),
        ("METDLG_INVALID_DIALOGUE", lambda: generate_metaphor_dialogue("METDLG-X", _ok()[0][1], _ok()[0][2][:1], "n", P)),
        ("METDLG_INVALID_DIALOGUE", lambda: generate_metaphor_dialogue("METDLG-X", _ok()[0][1], [{"id": "X1", "speaker": "SELF", "line": "a"}, {"id": "X2", "speaker": "SELF", "line": "b"}], "n", P)),
        ("METDLG_INVALID_DIALOGUE", lambda: generate_metaphor_dialogue("METDLG-X", _ok()[0][1], [{**_ok()[0][2][0], "speaker": "NARRATOR"}, _ok()[0][2][1]], "n", P)),
        ("METDLG_INVALID_DIALOGUE", lambda: generate_metaphor_dialogue("METDLG-X", _ok()[0][1], _ok()[0][2], "", P)),
    ]
    TAMPERS = [
        ("metaphor_dialogue_integrity", lambda r: {**r, "exchanges": [{**x, "speaker": "SELF"} for x in r["exchanges"]]}),
        ("metaphor_dialogue_integrity", lambda r: {**r, "figure": {"name": "x", "origin": ""}}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]



if __name__ == "__main__":
    unittest.main()
