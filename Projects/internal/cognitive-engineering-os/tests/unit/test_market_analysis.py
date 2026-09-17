"""``strategy.market_analysis`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_market_analysis_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.strategy.market_analysis import generate_market_analysis
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class MarketAnalysisTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("MKT_INVALID_ANALYSIS", lambda: generate_market_analysis("MKT-X", "m", {**_ok()[0][2], "som": 50000}, _ok()[0][3], P)),
        ("MKT_INVALID_ANALYSIS", lambda: generate_market_analysis("MKT-X", "m", {**_ok()[0][2], "tam": True}, _ok()[0][3], P)),
        ("MKT_INVALID_ANALYSIS", lambda: generate_market_analysis("MKT-X", "m", {**_ok()[0][2], "unit": ""}, _ok()[0][3], P)),
        ("MKT_INVALID_ANALYSIS", lambda: generate_market_analysis("MKT-X", "m", _ok()[0][2], [{**_ok()[0][3][0], "evidence_ref": ""}], P)),
        ("MKT_INVALID_ANALYSIS", lambda: generate_market_analysis("MKT-X", "m", _ok()[0][2], [{**_ok()[0][3][0], "growth_rate": 11}], P)),
        ("MKT_INVALID_ANALYSIS", lambda: generate_market_analysis("MKT-X", "m", _ok()[0][2], [], P)),
    ]
    TAMPERS = [
        ("market_analysis_integrity", lambda r: {**r, "sizing": {**r["sizing"], "sam": r["sizing"]["tam"] + 1}}),
        ("market_analysis_integrity", lambda r: {**r, "segments": [_ok()[0][3][0], {**_ok()[0][3][1], "id": "SG1"}]}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]



if __name__ == "__main__":
    unittest.main()
