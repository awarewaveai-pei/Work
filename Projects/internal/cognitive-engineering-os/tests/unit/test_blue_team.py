"""Mutation-style tests for ``challenge.blue_team`` (twenty-sixth Method Atlas slice, second from the
`challenge` family). Atlas's own purpose line (not blindly endorsing the original proposal) is proven at BOTH
independent layers -- construction-time and gate re-derivation -- same discipline every prior forbidden-state
guard this session built already established.

Includes fixes for a critic review of this slice's first draft: (1) a test that claimed to prove this
method's deliberate divergence from `challenge.red_team` (no evidence-labeling gate) actually asserted nothing
red_team's own gate wouldn't also pass -- rewritten to use an EVIDENCE-labeled improvement with no supporting
refs, the one case that genuinely differs between the two methods; (2) `generate_blue_team_review`'s
category-validation and the gates' own re-derivation crashed (KeyError/AttributeError, not InvariantViolation)
on hand-built improvement dicts missing keys or of the wrong type -- a mutation test proved the category
re-check was uncovered dead code before this fix; both are now covered here.
"""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.challenge.blue_team import (
    METHOD_ID,
    all_gates_pass,
    evaluate_at_least_one_improvement_gate,
    evaluate_blue_team_gates,
    evaluate_provenance_required_gate,
    generate_blue_team_review,
    improvement,
)
from ai_lego.modules.challenge.red_team import evaluate_evidence_labeling_required_gate, finding, generate_red_team_challenge
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

BLUE_TEAM_REVIEW_SCHEMA = "ai-lego://specs/cognitive/typed-objects/blue-team-review.schema.yaml"


def _improvement(with_evidence: bool = False):
    refs = ["E-1"] if with_evidence else None
    return improvement("BTR-T-001-I1", "FALLBACK", "add a rollback step", make_provenance("AI_INFERENCE", "AI_GENERATED"), supporting_evidence_refs=refs)


def _valid_review():
    return generate_blue_team_review("BTR-T-001", "PROP-T-001", [_improvement()], make_provenance("AI_INFERENCE", "AI_GENERATED"))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_blue_team_review_validates_against_the_real_schema(self):
        self.contracts.validate(BLUE_TEAM_REVIEW_SCHEMA, _valid_review(), "blue team review")

    def test_improvement_with_supporting_evidence_refs_validates(self):
        """Exercises the supporting_evidence_refs branch -- a critic-caught coverage gap (the first draft's
        with_evidence=True path was never actually asserted)."""
        review = generate_blue_team_review("BTR-T-001B", "PROP-T-001B", [_improvement(with_evidence=True)], make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.assertEqual(review["improvements"][0]["supporting_evidence_refs"], ["E-1"])
        self.contracts.validate(BLUE_TEAM_REVIEW_SCHEMA, review, "review with evidence refs")

    def test_multiple_improvements_across_categories_validate(self):
        improvements = [
            improvement("BTR-T-002-I1", "FALLBACK", "add rollback", make_provenance("AI_INFERENCE", "AI_GENERATED")),
            improvement("BTR-T-002-I2", "MONITORING", "add progress reporting", make_provenance("AI_INFERENCE", "AI_GENERATED")),
            improvement("BTR-T-002-I3", "RECOVERY", "add automated retry", make_provenance("AI_INFERENCE", "AI_GENERATED")),
        ]
        review = generate_blue_team_review("BTR-T-002", "PROP-T-002", improvements, make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.contracts.validate(BLUE_TEAM_REVIEW_SCHEMA, review, "multi-category review")

    def test_zero_improvements_is_refused(self):
        """Atlas's own purpose line (§11.24 L1742) plus the F12 table's own benefit column (L645): a review
        that strengthens nothing did not steelman the proposal."""
        with self.assertRaisesRegex(InvariantViolation, "BLUETEAM_NO_IMPROVEMENTS_RECORDED"):
            generate_blue_team_review("BTR-T-003", "PROP-T-003", [], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_invalid_category_on_an_improvement_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "BLUETEAM_INVALID_CATEGORY"):
            improvement("BTR-T-004-I1", "TESTING", "x", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_empty_improvement_description_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "BLUETEAM_EMPTY_IMPROVEMENT_DESCRIPTION"):
            improvement("BTR-T-005-I1", "CONTROLS", "", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_hand_built_improvement_dict_with_invalid_category_is_refused(self):
        """generate_blue_team_review's own category re-check must catch a hand-built dict that bypassed
        improvement() entirely, not just re-validate what improvement() already validated -- a critic-caught
        mutation test proved this check was uncovered before this test existed."""
        hand_built = {"id": "BTR-T-005B-I1", "category": "TESTING", "description": "x", "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED")}
        with self.assertRaisesRegex(InvariantViolation, "BLUETEAM_INVALID_CATEGORY"):
            generate_blue_team_review("BTR-T-005B", "PROP-T-005B", [hand_built], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_hand_built_improvement_dict_missing_category_key_is_refused_not_crashed(self):
        """A critic-caught crash: the first draft's item['category'] (not .get) raised a bare KeyError here,
        not an InvariantViolation -- unreachable by the CLI's own except InvariantViolation handler."""
        hand_built = {"id": "BTR-T-005C-I1", "description": "x", "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED")}
        with self.assertRaisesRegex(InvariantViolation, "BLUETEAM_INVALID_CATEGORY"):
            generate_blue_team_review("BTR-T-005C", "PROP-T-005C", [hand_built], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_non_dict_improvement_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "BLUETEAM_INVALID_IMPROVEMENT_SHAPE"):
            generate_blue_team_review("BTR-T-005D", "PROP-T-005D", ["not-a-dict"], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_blue_team_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class DeliberateDivergenceFromRedTeamTests(unittest.TestCase):
    """challenge.blue_team's own quality.evidence_labeling_required:false is a real divergence from
    challenge.red_team's own quality.evidence_labeling_required:true -- proven here by the ONE case that
    actually differs: an EVIDENCE-labeled item with no supporting_evidence_refs. A critic review caught that
    the first draft's own attempted proof used AI_INFERENCE, which red_team's own gate also passes -- not a
    genuine divergence case."""

    def test_evidence_labeled_improvement_without_refs_still_passes_because_blue_team_has_no_evidence_gate(self):
        review = generate_blue_team_review(
            "BTR-T-006", "PROP-T-006", [improvement("BTR-T-006-I1", "EVIDENCE", "cite past migration success rate", make_provenance("EVIDENCE", "AI_GENERATED"))],
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
        )
        results = evaluate_blue_team_gates(review, "test", "2026-09-05T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_the_same_evidence_labeled_shape_would_fail_red_teams_own_evidence_gate(self):
        """Confirms the divergence is real by exercising the sibling method's own gate on the structurally
        equivalent input -- not asserted from the outside, actually run."""
        fabricated = finding("RTC-T-BT-001-F1", "SECURITY", "cite past migration success rate", make_provenance("EVIDENCE", "AI_GENERATED"))
        challenge = generate_red_team_challenge("RTC-T-BT-001", "PROP-T-006", ["SECURITY"], [fabricated], make_provenance("AI_INFERENCE", "AI_GENERATED"))
        gate = evaluate_evidence_labeling_required_gate(challenge, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class GateMutationTests(unittest.TestCase):
    def test_valid_review_passes_both_gates(self):
        results = evaluate_blue_team_gates(_valid_review(), "test", "2026-09-05T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "at_least_one_improvement"})
        self.assertTrue(all_gates_pass(results))

    def test_hand_tampered_emptied_improvements_fails_the_gate(self):
        """A record that bypassed the builder's own construction-time check (e.g. improvements emptied after
        construction) must still be caught by the gate re-derivation -- not just trusting that the builder's
        own check already ran."""
        review = _valid_review()
        review["improvements"] = []
        gate = evaluate_at_least_one_improvement_gate(review, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_missing_improvements_key_fails_closed_rather_than_pass(self):
        review = _valid_review()
        del review["improvements"]
        gate = evaluate_at_least_one_improvement_gate(review, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_improvements_tampered_to_a_bare_string_fails_closed_rather_than_counting_characters(self):
        """A bare string is len()-able in Python -- a naive re-derivation could silently 'pass' by counting
        characters instead of improvements."""
        review = _valid_review()
        review["improvements"] = "not a list"
        gate = evaluate_at_least_one_improvement_gate(review, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_improvement_item_fails_the_provenance_gate_not_a_crash(self):
        """A critic-caught crash: item['id'] (not .get) on a non-dict item raised AttributeError, not a FAIL
        gate result -- unreachable by the CLI's own exception handling and never schema-validated as a
        gate_result."""
        review = _valid_review()
        review["improvements"] = ["not-a-dict"]
        gate = evaluate_provenance_required_gate(review, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_improvement_missing_id_key_fails_the_provenance_gate_not_a_crash(self):
        review = _valid_review()
        review["improvements"] = [{"category": "CONTROLS", "description": "x", "provenance": None}]
        gate = evaluate_provenance_required_gate(review, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_missing_provenance_fails_provenance_required_only(self):
        """Proves the 'only' in the name: at_least_one_improvement must still PASS on the same tampered
        record, since the improvement count itself is untouched."""
        review = _valid_review()
        review["improvements"][0] = {**review["improvements"][0], "provenance": None}
        results = evaluate_blue_team_gates(review, "test", "2026-09-05T00:00:00Z")
        by_id = {r["gate_id"]: r["status"] for r in results}
        self.assertEqual(by_id["provenance_required"], "FAIL")
        self.assertEqual(by_id["at_least_one_improvement"], "PASS")


if __name__ == "__main__":
    unittest.main()
