"""``art_therapy.wusheng_five_phase`` -- shared MethodSliceTestCase + method-specific static-reference checks."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_wusheng_five_phase_slice import SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.wusheng_five_phase import PHASE_CODES, PHASE_REFERENCE, generate_wusheng_five_phase
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")
_PHASE_ATTRIBUTES = frozenset({"guiding_question", "working_hypothesis", "practice_strategy", "progress_indicator"})


class WushengFivePhaseTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("WUSHENG_INVALID_PHASE", lambda: generate_wusheng_five_phase("WUSHENG-X", "s", "WS-99", "evidence", P)),
        ("WUSHENG_INVALID_PHASE", lambda: generate_wusheng_five_phase("WUSHENG-X", "s", "進步中", "evidence", P)),  # free text, not the closed set
        ("WUSHENG_INVALID_EVIDENCE", lambda: generate_wusheng_five_phase("WUSHENG-X", "s", "WS-01", " ", P)),
        ("WUSHENG_INVALID_EVIDENCE", lambda: generate_wusheng_five_phase("WUSHENG-X", "s", "WS-01", "", P)),
        ("WUSHENG_INVALID_SUBJECT", lambda: generate_wusheng_five_phase("WUSHENG-X", " ", "WS-01", "evidence", P)),
        ("WUSHENG_INVALID_LINKED_TOOLS", lambda: generate_wusheng_five_phase("WUSHENG-X", "s", "WS-01", "evidence", P, linked_tool_ids=[])),
        ("WUSHENG_INVALID_LINKED_TOOLS", lambda: generate_wusheng_five_phase("WUSHENG-X", "s", "WS-01", "evidence", P, linked_tool_ids=["", "ok"])),
        ("WUSHENG_INVALID_ID", lambda: generate_wusheng_five_phase("WRONG-1", "s", "WS-01", "evidence", P)),
        ("WUSHENG_INVALID_PROVENANCE", lambda: generate_wusheng_five_phase("WUSHENG-X", "s", "WS-01", "evidence", {"epistemic_type": "nope"})),
    ]
    TAMPERS = [
        ("wusheng_five_phase_integrity", lambda r: {**r, "current_phase": "WS-06"}),
        ("wusheng_five_phase_integrity", lambda r: {**r, "progress_evidence": ""}),
        ("wusheng_five_phase_integrity", lambda r: {**r, "linked_tool_ids": []}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]

    def test_phase_reference_has_exactly_the_five_closed_set_codes(self):
        self.assertEqual(set(PHASE_REFERENCE), {"WS-01", "WS-02", "WS-03", "WS-04", "WS-05"})
        self.assertEqual(PHASE_CODES, frozenset(PHASE_REFERENCE))
        for code, entry in PHASE_REFERENCE.items():
            with self.subTest(code=code):
                for attribute in _PHASE_ATTRIBUTES:
                    self.assertIsInstance(entry[attribute], str)
                    self.assertTrue(entry[attribute].strip(), f"{code}.{attribute} must not be empty")

    def test_linked_tool_ids_omitted_when_not_provided(self):
        args, _ = fixture_args()
        record = generate_wusheng_five_phase(*args)
        self.assertNotIn("linked_tool_ids", record)

    def test_record_does_not_alias_caller_linked_tool_ids(self):
        args, kwargs = fixture_args()
        tool_ids = list(kwargs["linked_tool_ids"])
        record = generate_wusheng_five_phase(*args, linked_tool_ids=tool_ids)
        tool_ids.append("ART-TOOL-999")
        self.assertEqual(record["linked_tool_ids"], ["ART-TOOL-014", "ART-TOOL-027"])


if __name__ == "__main__":
    unittest.main()
