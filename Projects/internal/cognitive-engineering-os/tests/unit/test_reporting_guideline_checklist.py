"""``research.reporting_guideline_checklist`` -- shared MethodSliceTestCase + method-specific
derived-completion and brief-builder checks."""

from __future__ import annotations

import unittest

from ai_lego.apps.cli.run_reporting_guideline_checklist_slice import GUIDELINE_ID, SPEC, fixture_args
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.reporting_guideline_checklist import (
    build_checklist_brief,
    catalog_citation,
    catalog_items,
    completeness_summary,
    generate_reporting_guideline_checklist,
)
from tests.unit.method_testkit import MethodSliceMixin

P = make_provenance("AI_SUGGESTION", "AI_SUGGESTED")


def _valid_items():
    args, _kwargs = fixture_args()
    return args[3]


class ReportingGuidelineChecklistTests(MethodSliceMixin, unittest.TestCase):
    SPEC = SPEC
    REFUSALS = [
        ("RPTCHK_UNKNOWN_GUIDELINE", lambda: generate_reporting_guideline_checklist("RPTCHK-X", "NOPE", "x", _valid_items(), P)),
        ("RPTCHK_CITATION_MISMATCH", lambda: generate_reporting_guideline_checklist("RPTCHK-X", GUIDELINE_ID, "wrong citation", _valid_items(), P)),
        ("RPTCHK_INVALID_ITEMS", lambda: generate_reporting_guideline_checklist("RPTCHK-X", GUIDELINE_ID, catalog_citation(GUIDELINE_ID), [i for i in _valid_items() if i["item_id"] != "S21"], P)),  # missing S21
        ("RPTCHK_INVALID_ITEMS", lambda: generate_reporting_guideline_checklist("RPTCHK-X", GUIDELINE_ID, catalog_citation(GUIDELINE_ID), _valid_items() + [_valid_items()[0]], P)),  # duplicate item_id
        ("RPTCHK_INVALID_ITEMS", lambda: generate_reporting_guideline_checklist("RPTCHK-X", GUIDELINE_ID, catalog_citation(GUIDELINE_ID), [{**item, "requirement_text": "paraphrased"} for item in _valid_items()], P)),  # wrong wording
        ("RPTCHK_INVALID_ITEMS", lambda: generate_reporting_guideline_checklist("RPTCHK-X", GUIDELINE_ID, catalog_citation(GUIDELINE_ID), [{**item, "status": "MAYBE"} for item in _valid_items()], P)),  # bad status enum
        ("RPTCHK_INVALID_ID", lambda: generate_reporting_guideline_checklist("WRONG-1", GUIDELINE_ID, catalog_citation(GUIDELINE_ID), _valid_items(), P)),
        ("RPTCHK_INVALID_PROVENANCE", lambda: generate_reporting_guideline_checklist("RPTCHK-X", GUIDELINE_ID, catalog_citation(GUIDELINE_ID), _valid_items(), {"epistemic_type": "nope"})),
    ]
    TAMPERS = [
        ("reporting_guideline_checklist_integrity", lambda r: {**r, "items": r["items"][:-1]}),
        ("reporting_guideline_checklist_integrity", lambda r: {**r, "guideline_citation": "tampered"}),
        ("reporting_guideline_checklist_integrity", lambda r: {**r, "items": [{**item, "requirement_text": "tampered"} for item in r["items"]]}),
        ("provenance_required", lambda r: {**r, "provenance": None}),
    ]

    def test_completion_percentage_is_recomputed_from_placeholder_content_not_status(self):
        args, kwargs = fixture_args()
        record = generate_reporting_guideline_checklist(*args, **kwargs)
        summary = completeness_summary(record)
        self.assertEqual(summary["total_items"], len(catalog_items(GUIDELINE_ID)))
        self.assertEqual(summary["placeholder_items"], 1)  # the fixture's own S9 TBD: item
        self.assertLess(summary["completion_percentage"], 100.0)
        # A tampered status label alone (no content change) must not move the recomputed count.
        record["items"][0]["status"] = "NOT_STARTED"
        self.assertEqual(completeness_summary(record)["placeholder_items"], 1)
        record["items"][0]["drafted_content"] = "tbd: lowercase placeholder must still be caught"
        self.assertEqual(completeness_summary(record)["placeholder_items"], 2)

    def test_build_checklist_brief_embeds_every_official_item_and_the_anti_fabrication_instruction(self):
        brief = build_checklist_brief(GUIDELINE_ID, "A grounded theory study of EdD art-therapy students.")
        for item in catalog_items(GUIDELINE_ID):
            self.assertIn(item["item_id"], brief)
            self.assertIn(item["requirement_text"], brief)
        self.assertIn("TBD:", brief)
        self.assertIn("A grounded theory study of EdD art-therapy students.", brief)

    def test_build_checklist_brief_rejects_empty_research_facts(self):
        with self.assertRaisesRegex(InvariantViolation, "RPTCHK_BRIEF_RESEARCH_FACTS_REQUIRED"):
            build_checklist_brief(GUIDELINE_ID, "   ")

    def test_build_checklist_brief_rejects_unknown_guideline(self):
        with self.assertRaisesRegex(InvariantViolation, "RPTCHK_UNKNOWN_GUIDELINE"):
            build_checklist_brief("NOPE", "some facts")


if __name__ == "__main__":
    unittest.main()
