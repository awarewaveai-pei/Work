"""Mutation-style tests for ``challenge.red_team`` (ninth Method Atlas slice, first from the challenge family,
sixth structural shape this session -- a checklist-structured critique).

Atlas §11.23's own explicit no-final-authority rule (L1735) is proven at
BOTH independent layers: the runtime guard refuses to construct a record
carrying an authority-shaped key, and a hand-crafted bypass (skipping the
builder entirely) is independently refused by the schema's own
``additionalProperties: false``.
"""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.challenge.red_team import (
    METHOD_ID,
    all_gates_pass,
    assert_no_authority_claim,
    evaluate_evidence_labeling_required_gate,
    evaluate_no_authority_claim_gate,
    evaluate_provenance_required_gate,
    evaluate_red_team_gates,
    finding,
    generate_red_team_challenge,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

RED_TEAM_CHALLENGE_SCHEMA = "ai-lego://specs/cognitive/typed-objects/red-team-challenge.schema.yaml"


def _finding(with_evidence: bool = True):
    refs = ["E-1"] if with_evidence else None
    return finding("RTC-T-001-F1", "OPERATIONS", "no rollback plan", make_provenance("EVIDENCE" if with_evidence else "AI_INFERENCE", "AI_GENERATED"), supporting_evidence_refs=refs)


def _valid_challenge():
    return generate_red_team_challenge("RTC-T-001", "PROP-T-001", ["OPERATIONS", "SECURITY"], [_finding()], make_provenance("AI_INFERENCE", "AI_GENERATED"))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_red_team_challenge_validates_against_the_real_schema(self):
        self.contracts.validate(RED_TEAM_CHALLENGE_SCHEMA, _valid_challenge(), "red team challenge")

    def test_zero_findings_is_legal_a_dimension_may_be_examined_and_found_clean(self):
        challenge = generate_red_team_challenge("RTC-T-002", "PROP-T-002", ["PRIVACY"], [], make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.contracts.validate(RED_TEAM_CHALLENGE_SCHEMA, challenge, "clean-pass challenge")

    def test_no_dimensions_examined_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "REDTEAM_NO_DIMENSIONS_EXAMINED"):
            generate_red_team_challenge("RTC-T-003", "PROP-T-003", [], [], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_invalid_dimension_in_dimensions_examined_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "REDTEAM_INVALID_DIMENSION"):
            generate_red_team_challenge("RTC-T-004", "PROP-T-004", ["VIBES"], [], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_invalid_dimension_on_a_finding_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "REDTEAM_INVALID_DIMENSION"):
            finding("RTC-T-005-F1", "VIBES", "x", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_finding_dimension_outside_dimensions_examined_is_refused(self):
        """A finding cannot claim a dimension the run never actually examined."""
        unexamined_finding = finding("RTC-T-006-F1", "LEGAL", "x", make_provenance("AI_INFERENCE", "AI_GENERATED"))
        with self.assertRaisesRegex(InvariantViolation, "REDTEAM_FINDING_OUTSIDE_EXAMINED_DIMENSIONS"):
            generate_red_team_challenge("RTC-T-006", "PROP-T-006", ["OPERATIONS"], [unexamined_finding], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_red_team_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class NoFinalAuthorityTests(unittest.TestCase):
    """Atlas L1735: 'Red Team has no final authority, may only output a challenge artifact.' Proven at both
    independent layers."""

    def test_top_level_authority_key_is_refused_at_construction(self):
        challenge = _valid_challenge()
        challenge["approved"] = True
        with self.assertRaisesRegex(InvariantViolation, "REDTEAM_AUTHORITY_CLAIM_FORBIDDEN"):
            assert_no_authority_claim(challenge)

    def test_per_finding_authority_key_is_refused_at_construction(self):
        challenge = _valid_challenge()
        challenge["findings"][0]["verdict"] = "REJECTED"
        with self.assertRaisesRegex(InvariantViolation, "REDTEAM_AUTHORITY_CLAIM_FORBIDDEN"):
            assert_no_authority_claim(challenge)

    def test_clean_record_passes_the_authority_check(self):
        assert_no_authority_claim(_valid_challenge())  # must not raise

    def test_non_dict_record_is_refused_not_crashed_by_the_authority_assert(self):
        """This gate's own precedent had no isinstance guard and would crash with AttributeError (``dict.keys``
        called on a non-dict) instead of failing closed -- the same fix ``decision.mcda``'s own equivalent now
        also applies."""
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                with self.assertRaisesRegex(InvariantViolation, "REDTEAM_AUTHORITY_CLAIM_FORBIDDEN"):
                    assert_no_authority_claim(bad_record)

    def test_schema_layer_independently_refuses_a_hand_crafted_bypass(self):
        """Second, independent enforcement: even if a caller bypasses assert_no_authority_claim entirely and
        hand-crafts the dict, additionalProperties:false still refuses it."""
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        tampered = _valid_challenge()
        tampered["approved"] = True
        with self.assertRaises(SchemaValidationError):
            contracts.validate(RED_TEAM_CHALLENGE_SCHEMA, tampered, "hand-crafted bypass")

    def test_gate_reuses_assert_no_authority_claim_and_fails_on_a_tampered_record(self):
        challenge = _valid_challenge()
        challenge["approved"] = True
        gate = evaluate_no_authority_claim_gate(challenge, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class GateMutationTests(unittest.TestCase):
    def test_valid_challenge_passes_all_three_gates(self):
        results = evaluate_red_team_gates(_valid_challenge(), "test", "2026-09-04T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "evidence_labeling_required", "no_final_authority_claim"})
        self.assertTrue(all_gates_pass(results))

    def test_missing_provenance_fails_provenance_required_only(self):
        challenge = _valid_challenge()
        challenge["findings"][0] = {**challenge["findings"][0], "provenance": None}
        gate = evaluate_provenance_required_gate(challenge, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_finding_fails_the_evidence_gate_not_a_crash(self):
        """A critic review of this family's own third slice (challenge.independent_judge, WORKLOG continuation
        40) found this exact gate crashes (AttributeError) on a non-dict finding instead of failing closed --
        the same fix applied there was applied back here."""
        challenge = _valid_challenge()
        challenge["findings"] = ["not-a-dict"]
        gate = evaluate_evidence_labeling_required_gate(challenge, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_evidence_labeled_finding_with_no_refs_fails_evidence_labeling_gate(self):
        """Atlas's own real risk: an unevidenced claim of failure ('this is insecure') is still an ungrounded
        claim, whether or not it turns out to be true."""
        fabricated = finding("RTC-T-007-F1", "SECURITY", "unsupported claim", make_provenance("EVIDENCE", "AI_GENERATED"))
        challenge = generate_red_team_challenge("RTC-T-007", "PROP-T-007", ["SECURITY"], [fabricated], make_provenance("AI_INFERENCE", "AI_GENERATED"))
        gate = evaluate_evidence_labeling_required_gate(challenge, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_challenge_fails_all_gates_not_a_crash(self):
        """Every gate in this module's own aggregate must fail closed, not crash, on a non-dict top-level
        argument -- the same regression class ``root_cause.fault_tree``'s own
        ``test_non_dict_record_fails_all_gates_not_a_crash`` proves for its family. The prior
        ``test_non_dict_finding_fails_the_evidence_gate_not_a_crash`` above covers a malformed ENTRY inside
        ``findings``; this covers ``challenge`` itself not being a dict at all."""
        for bad_challenge in (None, "not-a-dict", [], 42):
            with self.subTest(bad_challenge=bad_challenge):
                results = evaluate_red_team_gates(bad_challenge, "test", "2026-09-04T00:00:00Z")  # must not raise
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


if __name__ == "__main__":
    unittest.main()
