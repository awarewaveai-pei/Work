"""``art_therapy.role_playing`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_role_playing_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.role_playing import generate_role_playing
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class RolePlayingTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("ROLEPLAY_INVALID_ENACTMENT", lambda: generate_role_playing("ROLEPLAY-X", "s", _ok()[0][2], [{**_ok()[0][3][0], "role_ref": "R9"}], P)),
        ("ROLEPLAY_INVALID_ENACTMENT", lambda: generate_role_playing("ROLEPLAY-X", "s", [{**_ok()[0][2][0], "played_by": "THERAPIST"}], _ok()[0][3], P)),
        ("ROLEPLAY_INVALID_ENACTMENT", lambda: generate_role_playing("ROLEPLAY-X", "s", _ok()[0][2], [], P)),
        ("ROLEPLAY_INVALID_ENACTMENT", lambda: generate_role_playing("ROLEPLAY-X", "s", [_ok()[0][2][0], {**_ok()[0][2][1], "id": "R1"}], _ok()[0][3], P)),
        ("ROLEPLAY_INVALID_ENACTMENT", lambda: generate_role_playing("ROLEPLAY-X", " ", _ok()[0][2], _ok()[0][3], P)),
    ]
    TAMPERS = [
        ("role_playing_integrity", lambda r: {**r, "roles": r["roles"][1:]}),
        ("role_playing_integrity", lambda r: {**r, "reflections": [{**r["reflections"][0], "prediction": ""}]}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]



if __name__ == "__main__":
    unittest.main()
