"""``finance.financial_assumptions`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_financial_assumptions_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.finance.financial_assumptions import generate_financial_assumptions
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class FinancialAssumptionsTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("FINASSUM_INVALID_ASSUMPTIONS", lambda: generate_financial_assumptions("FINASSUM-X", "s", "twd", 0.08, 2, _ok()[0][5], _ok()[0][6], P)),
        ("FINASSUM_INVALID_ASSUMPTIONS", lambda: generate_financial_assumptions("FINASSUM-X", "s", "TWD", 1.2, 2, _ok()[0][5], _ok()[0][6], P)),
        ("FINASSUM_INVALID_ASSUMPTIONS", lambda: generate_financial_assumptions("FINASSUM-X", "s", "TWD", 0.08, 0, _ok()[0][5], _ok()[0][6], P)),
        ("FINASSUM_INVALID_ASSUMPTIONS", lambda: generate_financial_assumptions("FINASSUM-X", "s", "TWD", 0.08, 2, [{**_ok()[0][5][0], "basis": ""}], _ok()[0][6], P)),
        ("FINASSUM_INVALID_ASSUMPTIONS", lambda: generate_financial_assumptions("FINASSUM-X", "s", "TWD", 0.08, 2, [{**_ok()[0][5][0], "provenance": {}}], _ok()[0][6], P)),
        ("FINASSUM_INVALID_ASSUMPTIONS", lambda: generate_financial_assumptions("FINASSUM-X", "s", "TWD", 0.08, 2, _ok()[0][5], _ok()[0][6][:2], P)),
        ("FINASSUM_INVALID_ASSUMPTIONS", lambda: generate_financial_assumptions("FINASSUM-X", "s", "TWD", 0.08, 2, _ok()[0][5], list(reversed(_ok()[0][6])), P)),
        ("FINASSUM_INVALID_ASSUMPTIONS", lambda: generate_financial_assumptions("FINASSUM-X", "s", "TWD", 0.08, 2, _ok()[0][5], [{**c, "amount": float("nan")} for c in _ok()[0][6]], P)),
    ]
    TAMPERS = [
        ("financial_assumptions_integrity", lambda r: {**r, "cash_flow_projection": r["cash_flow_projection"][:2]}),
        ("financial_assumptions_integrity", lambda r: {**r, "assumptions": [{**r["assumptions"][0], "value": True}]}),
        ("provenance_required", lambda r: {**r, "assumptions": [{**r["assumptions"][0], "provenance": None}]}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]



if __name__ == "__main__":
    unittest.main()
