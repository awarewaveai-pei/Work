"""``art_therapy.life_timeline`` -- shared MethodSliceMixin proofs + method-specific refusals/tampers."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_life_timeline_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.life_timeline import generate_life_timeline
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _a():
    return list(fixture_args()[0])


def _build(**override):
    a = _a()
    names = ["record_id", "subject", "now", "present_self", "direction", "events"]
    values = dict(zip(names, a[:6]))
    values.update(override)
    return generate_life_timeline(values["record_id"], values["subject"], values["now"], values["present_self"], values["direction"], values["events"], P)


def _events():
    return [dict(e) for e in _a()[5]]


class LifeTimelineTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("LIFETL_INVALID_LINE", lambda: _build(direction="forward")),                                     # backward-listed events walked forward
        ("LIFETL_INVALID_LINE", lambda: _build(direction="sideways")),
        ("LIFETL_INVALID_LINE", lambda: _build(now="2026/10/02")),
        ("LIFETL_INVALID_LINE", lambda: _build(present_self=" ")),
        ("LIFETL_INVALID_LINE", lambda: _build(events=[e for e in _events() if e["id"] != "P1"])),          # no past
        ("LIFETL_INVALID_LINE", lambda: _build(events=[e for e in _events() if not e["id"].startswith("F")])),  # no future
        ("LIFETL_INVALID_LINE", lambda: _build(events=[{k: v for k, v in e.items() if k != "first_step"} for e in _events()])),  # future without a first step
        ("LIFETL_INVALID_LINE", lambda: _build(events=[{**e, "first_step": "x"} if e["id"] == "P1" else e for e in _events()])),  # past with a first step
        ("LIFETL_INVALID_LINE", lambda: _build(events=[{**e, "phase": "past"} for e in _events()])),       # phase is never an input
        ("LIFETL_INVALID_LINE", lambda: _build(events=[{**e, "id": "F1"} for e in _events()][:2])),        # duplicate id
        ("LIFETL_INVALID_LINE", lambda: _build(events=[{**e, "feeling": ""} for e in _events()])),
        ("LIFETL_INVALID_LINE", lambda: _build(events=None)),                                                # not a list: refused, never a TypeError
        ("LIFETL_INVALID_LINE", lambda: _build(events=7)),
        ("LIFETL_INVALID_ID", lambda: _build(record_id="NOPE-1")),
    ]
    TAMPERS = [
        ("life_timeline_integrity", lambda r: {**r, "events": list(reversed(r["events"]))}),               # order no longer backward
        ("life_timeline_integrity", lambda r: {**r, "now": "2030-01-01"}),                                 # every phase now wrong
        ("life_timeline_integrity", lambda r: {**r, "events": [{**e, "phase": "present"} for e in r["events"]]}),
        ("provenance_required", lambda r: {**r, "provenance": {"epistemic_type": "nope"}}),
    ]

    def test_forward_walk_is_accepted_and_phases_are_computed(self):
        record = _build(direction="forward", events=list(reversed(_events())))
        self.assertEqual([e["phase"] for e in record["events"]], ["past", "present", "future", "future"])

    def test_present_event_on_the_anchor_day_is_optional(self):
        record = _build(events=[e for e in _events() if e["id"] != "N1"])
        self.assertNotIn("present", [e["phase"] for e in record["events"]])


if __name__ == "__main__":
    unittest.main()
