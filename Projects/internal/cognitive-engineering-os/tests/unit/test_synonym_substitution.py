"""``art_therapy.synonym_substitution`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_synonym_substitution_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.synonym_substitution import generate_synonym_substitution
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class SynonymSubstitutionTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("SYNSUB_INVALID_SUBSTITUTIONS", lambda: generate_synonym_substitution("SYNSUB-X", "c", [], P)),
        ("SYNSUB_INVALID_SUBSTITUTIONS", lambda: generate_synonym_substitution("SYNSUB-X", "c", [{"id": "X1", "original_phrase": "a", "replacement_phrase": "A", "rationale": "r"}], P)),
        ("SYNSUB_INVALID_SUBSTITUTIONS", lambda: generate_synonym_substitution("SYNSUB-X", "c", [{"id": "X1", "original_phrase": "a", "replacement_phrase": "b", "rationale": ""}], P)),
        ("SYNSUB_INVALID_SUBSTITUTIONS", lambda: generate_synonym_substitution("SYNSUB-X", "c", [_ok()[0][2][0], {**_ok()[0][2][1], "id": "X1"}], P)),
        ("SYNSUB_INVALID_SUBSTITUTIONS", lambda: generate_synonym_substitution("SYNSUB-X", "", _ok()[0][2], P)),
    ]
    TAMPERS = [
        ("synonym_substitution_integrity", lambda r: {**r, "substitutions": []}),
        ("synonym_substitution_integrity", lambda r: {**r, "substitutions": [{**r["substitutions"][0], "rationale": None}]}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]



if __name__ == "__main__":
    unittest.main()
