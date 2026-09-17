"""``systems.life_system_mapping`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_life_system_mapping_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.systems.life_system_mapping import generate_life_system_mapping
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class LifeSystemMappingTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("LSYSMAP_INVALID_SYSTEM", lambda: generate_life_system_mapping("LSYSMAP-X", "me", _ok()[0][2][:1], P)),
        ("LSYSMAP_INVALID_SYSTEM", lambda: generate_life_system_mapping("LSYSMAP-X", "me", [{**_ok()[0][2][0], "domain": "HOBBY"}, _ok()[0][2][1]], P)),
        ("LSYSMAP_INVALID_SYSTEM", lambda: generate_life_system_mapping("LSYSMAP-X", "me", [{**_ok()[0][2][0], "influences": [{"target_ref": "S9", "direction": "MIXED", "note": "x"}]}, _ok()[0][2][1]], P)),
        ("LSYSMAP_INVALID_SYSTEM", lambda: generate_life_system_mapping("LSYSMAP-X", "me", [{**_ok()[0][2][0], "influences": [{"target_ref": "S2", "direction": "HELPS", "note": "x"}]}, _ok()[0][2][1]], P)),
        ("LSYSMAP_INVALID_SYSTEM", lambda: generate_life_system_mapping("LSYSMAP-X", "me", [_ok()[0][2][0], {**_ok()[0][2][1], "id": "S1"}], P)),
    ]
    TAMPERS = [
        ("life_system_mapping_integrity", lambda r: {**r, "subsystems": [{**r["subsystems"][0], "influences": [{"target_ref": "S1", "direction": "MIXED", "note": "self"}]}] + r["subsystems"][1:]}),
        ("life_system_mapping_integrity", lambda r: {**r, "subsystems": r["subsystems"][:1]}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]



if __name__ == "__main__":
    unittest.main()
