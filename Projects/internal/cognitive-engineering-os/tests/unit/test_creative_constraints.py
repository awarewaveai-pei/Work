"""``divergent.creative_constraints`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_creative_constraints_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.divergent.creative_constraints import generate_creative_constraints
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class CreativeConstraintsTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("CCONSTR_INVALID_CONSTRAINTS", lambda: generate_creative_constraints("CCONSTR-X", "o", [], _ok()[0][3], P)),
        ("CCONSTR_INVALID_CONSTRAINTS", lambda: generate_creative_constraints("CCONSTR-X", "o", [{**_ok()[0][2][0], "constraint_type": "MOOD"}], _ok()[0][3], P)),
        ("CCONSTR_INVALID_CONSTRAINTS", lambda: generate_creative_constraints("CCONSTR-X", "o", _ok()[0][2], [{**_ok()[0][3][0], "constraint_refs": ["K9"]}], P)),
        ("CCONSTR_INVALID_CONSTRAINTS", lambda: generate_creative_constraints("CCONSTR-X", "o", _ok()[0][2], [], P)),
        ("CCONSTR_INVALID_CONSTRAINTS", lambda: generate_creative_constraints("CCONSTR-X", "o", [_ok()[0][2][0], _ok()[0][2][0]], _ok()[0][3], P)),
    ]
    TAMPERS = [
        ("creative_constraints_integrity", lambda r: {**r, "constraints": r["constraints"][:1]}),
        ("creative_constraints_integrity", lambda r: {**r, "outputs": [{**r["outputs"][0], "description": ""}]}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]



if __name__ == "__main__":
    unittest.main()
