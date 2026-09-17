"""``art_therapy.turning_point_analysis`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_turning_point_analysis_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.turning_point_analysis import generate_turning_point_analysis
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _ok():
    args, kwargs = fixture_args()
    return list(args), dict(kwargs)


class TurningPointAnalysisTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("TURNPT_INVALID_EVENTS", lambda: generate_turning_point_analysis("TURNPT-X", "s", [{**_ok()[0][2][0], "when": "20150601"}], P)),
        ("TURNPT_INVALID_EVENTS", lambda: generate_turning_point_analysis("TURNPT-X", "s", [{**_ok()[0][2][0], "when": " 2015-06-01"}], P)),
        ("TURNPT_INVALID_EVENTS", lambda: generate_turning_point_analysis("TURNPT-X", "s", [], P)),
        ("TURNPT_INVALID_EVENTS", lambda: generate_turning_point_analysis("TURNPT-X", "s", [{**_ok()[0][2][0], "when": "2015/06/01"}], P)),
        ("TURNPT_INVALID_EVENTS", lambda: generate_turning_point_analysis("TURNPT-X", "s", [_ok()[0][2][0], {**_ok()[0][2][1], "id": "E1"}], P)),
        ("TURNPT_INVALID_EVENTS", lambda: generate_turning_point_analysis("TURNPT-X", "s", list(reversed(_ok()[0][2])), P)),
        ("TURNPT_INVALID_EVENTS", lambda: generate_turning_point_analysis("TURNPT-X", " ", _ok()[0][2], P)),
        ("TURNPT_INVALID_ID", lambda: generate_turning_point_analysis("NOPE-1", "s", _ok()[0][2], P)),
    ]
    TAMPERS = [
        ("turning_point_integrity", lambda r: {**r, "events": list(reversed(r["events"]))}),
        ("turning_point_integrity", lambda r: {**r, "events": [{**r["events"][0], "belief_shift": ""}]}),
        ("provenance_required", lambda r: {**r, "provenance": {"epistemic_type": "nope"}}),
    ]



if __name__ == "__main__":
    unittest.main()
