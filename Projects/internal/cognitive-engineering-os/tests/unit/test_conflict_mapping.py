"""``art_therapy.conflict_mapping`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_conflict_mapping_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.conflict_mapping import generate_conflict_mapping
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class ConflictMappingTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("CONFMAP_INVALID_MAP", lambda: generate_conflict_mapping("CONFMAP-X", "c", _ok()[0][2][:1], _ok()[0][3], P)),
        ("CONFMAP_INVALID_MAP", lambda: generate_conflict_mapping("CONFMAP-X", "c", [_ok()[0][2][0], {**_ok()[0][2][1], "name": "想休息的我 "}], _ok()[0][3], P)),
        ("CONFMAP_INVALID_MAP", lambda: generate_conflict_mapping("CONFMAP-X", "c", _ok()[0][2], [], P)),
        ("CONFMAP_INVALID_MAP", lambda: generate_conflict_mapping("CONFMAP-X", "c", _ok()[0][2], [{"id": "S1", "step": "x", "resource_gained": " "}], P)),
        ("CONFMAP_INVALID_PROVENANCE", lambda: generate_conflict_mapping("CONFMAP-X", "c", _ok()[0][2], _ok()[0][3], {})),
    ]
    TAMPERS = [
        ("conflict_mapping_integrity", lambda r: {**r, "parties": r["parties"][:1]}),
        ("conflict_mapping_integrity", lambda r: {**r, "transformation_path": [{**r["transformation_path"][0], "id": "S1"}, {**r["transformation_path"][1], "id": "S1"}]}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]



if __name__ == "__main__":
    unittest.main()
