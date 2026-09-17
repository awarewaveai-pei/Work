"""``systems.sipoc`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_sipoc_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.systems.sipoc import generate_sipoc
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class SipocTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("SIPOC_INVALID_SCOPE", lambda: generate_sipoc("SIPOC-X", "p", [], _ok()[0][3], _ok()[0][4], _ok()[0][5], _ok()[0][6], P)),
        ("SIPOC_INVALID_SCOPE", lambda: generate_sipoc("SIPOC-X", "p", _ok()[0][2], _ok()[0][3], [], _ok()[0][5], _ok()[0][6], P)),
        ("SIPOC_INVALID_SCOPE", lambda: generate_sipoc("SIPOC-X", "p", _ok()[0][2], _ok()[0][3], [_ok()[0][4][0], _ok()[0][4][0]], _ok()[0][5], _ok()[0][6], P)),
        ("SIPOC_INVALID_SCOPE", lambda: generate_sipoc("SIPOC-X", "p", _ok()[0][2], [""], _ok()[0][4], _ok()[0][5], _ok()[0][6], P)),
        ("SIPOC_INVALID_SCOPE", lambda: generate_sipoc("SIPOC-X", "", _ok()[0][2], _ok()[0][3], _ok()[0][4], _ok()[0][5], _ok()[0][6], P)),
    ]
    TAMPERS = [
        ("sipoc_integrity", lambda r: {**r, "outputs": []}),
        ("sipoc_integrity", lambda r: {**r, "process_steps": [{"id": "P1"}]}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]



if __name__ == "__main__":
    unittest.main()
