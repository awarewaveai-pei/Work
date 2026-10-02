"""``art_therapy.personal_swot`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_personal_swot_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.personal_swot import generate_personal_swot
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _factors():
    return [dict(f) for f in fixture_args()[0][2]]


def _action(**override):
    return {**fixture_args()[0][3], **override}


def _build(subject="s", factors=None, action=None, record_id="PSWOT-X"):
    return generate_personal_swot(record_id, subject, _factors() if factors is None else factors, _action() if action is None else action, P)


class PersonalSwotTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("PSWOT_INVALID", lambda: _build(factors=[f for f in _factors() if f["category"] != "THREAT"] + [{**_factors()[0], "id": "S2"}])),  # 4 items, 3 quadrants
        ("PSWOT_INVALID", lambda: _build(factors=[{**f, "moment": ""} for f in _factors()])),
        ("PSWOT_INVALID", lambda: _build(factors=[{**f, "category": "HOPE"} if f["id"] == "O1" else f for f in _factors()])),
        ("PSWOT_INVALID", lambda: _build(factors=[{**f, "id": "S1"} for f in _factors()])),
        ("PSWOT_INVALID", lambda: _build(factors=[{**f, "source": "x"} for f in _factors()])),                 # strategy.swot fields are not taken
        ("PSWOT_INVALID", lambda: _build(factors="not a list")),
        ("PSWOT_INVALID", lambda: _build(factors=7)),
        ("PSWOT_INVALID", lambda: _build(action=_action(strength_id="W1"))),
        ("PSWOT_INVALID", lambda: _build(action=_action(opportunity_id="T1"))),
        ("PSWOT_INVALID", lambda: _build(action=_action(opportunity_id="O9"))),
        ("PSWOT_INVALID", lambda: _build(action=_action(first_step=" "))),
        ("PSWOT_INVALID", lambda: _build(action={"strength_id": "S1", "opportunity_id": "O1"})),
        ("PSWOT_INVALID", lambda: _build(action=["S1", "O1", "x"])),
        ("PSWOT_INVALID", lambda: _build(subject=" ")),
        ("PSWOT_INVALID_ID", lambda: _build(record_id="NOPE-1")),
    ]
    TAMPERS = [
        ("personal_swot_integrity", lambda r: {**r, "factors": [f for f in r["factors"] if f["category"] != "WEAKNESS"]}),
        ("personal_swot_integrity", lambda r: {**r, "action": {**r["action"], "strength_id": "T1"}}),
        ("personal_swot_integrity", lambda r: {**r, "action": None}),
        ("provenance_required", lambda r: {**r, "provenance": {"epistemic_type": "nope"}}),
    ]


if __name__ == "__main__":
    unittest.main()
