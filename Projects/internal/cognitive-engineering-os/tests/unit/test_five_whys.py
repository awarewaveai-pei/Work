"""Mutation-style tests for ``root_cause.five_whys`` (fourth Method Atlas slice, closes root_cause.fishbone's gap).

Schema conformance is checked against the real spec-root schema this same
session added (``typed-objects/five-whys-validation.schema.yaml``). The
three Atlas failure modes are proven to be caught at BOTH layers: the
runtime builder raises before construction (``FIVEWHYS_FAILURE_MODE_TRIGGERED``),
and the schema's own ``const: false`` gates independently refuse a
hand-crafted instance that bypasses the builder. The full real promotion
chain (fishbone's CauseHypothesisSet -> five_whys's validation -> fishbone's
own attempt_promote_to_root_cause_fact, unchanged) is exercised end to end.
"""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.root_cause.five_whys import (
    METHOD_ID,
    all_gates_pass,
    evaluate_evidence_labeling_required_gate,
    evaluate_five_whys_gates,
    evaluate_provenance_required_gate,
    generate_five_whys_validation,
    why_chain_step,
)
from ai_lego.modules.root_cause.fishbone import (
    attempt_promote_to_root_cause_fact,
    build_problem_statement,
    cause_hypothesis,
    generate_cause_hypothesis_set,
    record_validation_applied,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

FIVE_WHYS_VALIDATION_SCHEMA = "ai-lego://specs/cognitive/typed-objects/five-whys-validation.schema.yaml"
ROOT_CAUSE_FACT_SCHEMA = "ai-lego://specs/cognitive/typed-objects/root-cause-fact.schema.yaml"


def _problem_statement():
    return build_problem_statement("PROB-T-FW-001", {"current_state": "x", "expected_state": "y", "gap": "z"}, make_provenance("EVIDENCE", "HUMAN_APPROVED"))


def _cause_hypothesis_set():
    hypotheses = [
        cause_hypothesis("CHS-T-FW-001-H1", "candidate cause one", "Process", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-1"]),
        cause_hypothesis("CHS-T-FW-001-H2", "candidate cause two", "Process", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
    ]
    return generate_cause_hypothesis_set("CHS-T-FW-001", _problem_statement(), hypotheses)


def _why_chain(with_evidence: bool = True):
    refs = ["E-1"] if with_evidence else None
    return [
        why_chain_step(1, "why did X happen?", "because of Y", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=refs),
        why_chain_step(2, "why did Y happen?", "because of Z, a controllable process mechanism", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=refs),
    ]


def _valid_validation():
    return generate_five_whys_validation(
        "FWV-T-001", _cause_hypothesis_set(), "CHS-T-FW-001-H1", _why_chain(), ["CONTROLLABLE_BY_ORGANIZATION", "CLEAR_EVIDENCE_TO_VERIFY"], make_provenance("EVIDENCE", "HUMAN_APPROVED")
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_five_whys_validation_validates_against_the_real_schema(self):
        self.contracts.validate(FIVE_WHYS_VALIDATION_SCHEMA, _valid_validation(), "five whys validation")

    def test_target_hypothesis_not_in_set_is_refused_before_any_schema_check(self):
        with self.assertRaisesRegex(InvariantViolation, "FIVEWHYS_PRECONDITION_FAILED"):
            generate_five_whys_validation("FWV-T-002", _cause_hypothesis_set(), "CHS-DOES-NOT-EXIST", _why_chain(), ["CONTROLLABLE_BY_ORGANIZATION"], make_provenance("EVIDENCE", "HUMAN_APPROVED"))

    def test_empty_why_chain_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FIVEWHYS_EMPTY_CHAIN"):
            generate_five_whys_validation("FWV-T-003", _cause_hypothesis_set(), "CHS-T-FW-001-H1", [], ["CONTROLLABLE_BY_ORGANIZATION"], make_provenance("EVIDENCE", "HUMAN_APPROVED"))

    def test_no_stop_condition_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FIVEWHYS_NO_STOP_CONDITION"):
            generate_five_whys_validation("FWV-T-004", _cause_hypothesis_set(), "CHS-T-FW-001-H1", _why_chain(), [], make_provenance("EVIDENCE", "HUMAN_APPROVED"))

    def test_unknown_stop_condition_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FIVEWHYS_UNKNOWN_STOP_CONDITION"):
            generate_five_whys_validation("FWV-T-005", _cause_hypothesis_set(), "CHS-T-FW-001-H1", _why_chain(), ["RAN_OUT_OF_TIME"], make_provenance("EVIDENCE", "HUMAN_APPROVED"))

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_five_whys_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class FailureModeTests(unittest.TestCase):
    """Atlas L1289-1293's three named failure modes, caught at two independent layers."""

    def test_declared_without_data_is_computed_not_self_reported_and_blocks_construction(self):
        """No supporting_evidence_refs ANYWHERE in the chain -> computed True -> builder raises."""
        with self.assertRaisesRegex(InvariantViolation, "FIVEWHYS_FAILURE_MODE_TRIGGERED.*declared_without_data"):
            generate_five_whys_validation("FWV-T-006", _cause_hypothesis_set(), "CHS-T-FW-001-H1", _why_chain(with_evidence=False), ["CLEAR_EVIDENCE_TO_VERIFY"], make_provenance("HYPOTHESIS", "AI_GENERATED"))

    def test_a_single_evidence_backed_step_is_enough_to_avoid_declared_without_data(self):
        chain = [
            why_chain_step(1, "why?", "no data here", make_provenance("HYPOTHESIS", "AI_GENERATED")),
            why_chain_step(2, "why that?", "this one has data", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-9"]),
        ]
        validation = generate_five_whys_validation("FWV-T-007", _cause_hypothesis_set(), "CHS-T-FW-001-H1", chain, ["CLEAR_EVIDENCE_TO_VERIFY"], make_provenance("EVIDENCE", "HUMAN_APPROVED"))
        self.assertFalse(validation["failure_mode_self_check"]["declared_without_data"])

    def test_self_reported_oversimplification_blocks_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "FIVEWHYS_FAILURE_MODE_TRIGGERED.*single_path_oversimplifies"):
            generate_five_whys_validation(
                "FWV-T-008", _cause_hypothesis_set(), "CHS-T-FW-001-H1", _why_chain(), ["CLEAR_EVIDENCE_TO_VERIFY"], make_provenance("EVIDENCE", "HUMAN_APPROVED"),
                single_path_oversimplifies_multi_causal_problem=True,
            )

    def test_self_reported_human_carelessness_blocks_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "FIVEWHYS_FAILURE_MODE_TRIGGERED.*human_carelessness"):
            generate_five_whys_validation(
                "FWV-T-009", _cause_hypothesis_set(), "CHS-T-FW-001-H1", _why_chain(), ["CLEAR_EVIDENCE_TO_VERIFY"], make_provenance("EVIDENCE", "HUMAN_APPROVED"),
                human_carelessness_treated_as_final_cause=True,
            )

    def test_schema_layer_independently_refuses_a_hand_crafted_instance_that_bypasses_the_builder(self):
        """Second, independent enforcement: even if a caller builds the dict directly (skipping the builder's own
        raise), the schema's const:false still refuses it."""
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        hand_crafted = _valid_validation()
        hand_crafted["failure_mode_self_check"]["declared_without_data"] = True
        with self.assertRaises(SchemaValidationError):
            contracts.validate(FIVE_WHYS_VALIDATION_SCHEMA, hand_crafted, "hand-crafted bypass")


class GateMutationTests(unittest.TestCase):
    def test_valid_validation_passes_both_gates(self):
        results = evaluate_five_whys_gates(_valid_validation(), "test", "2026-09-04T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "evidence_labeling_required"})
        self.assertTrue(all_gates_pass(results))

    def test_missing_provenance_fails_provenance_required_only(self):
        validation = _valid_validation()
        validation["why_chain"][0] = {**validation["why_chain"][0], "provenance": None}
        gate = evaluate_provenance_required_gate(validation, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_evidence_labeled_step_with_no_refs_fails_evidence_labeling_gate(self):
        validation = _valid_validation()
        validation["why_chain"].append(why_chain_step(3, "why?", "unsupported claim", make_provenance("EVIDENCE", "AI_SUGGESTED")))
        gate = evaluate_evidence_labeling_required_gate(validation, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class RealPromotionChainTests(unittest.TestCase):
    """The chain root_cause.fishbone's own slice left honestly incomplete: this proves it end to end, for real,
    reusing fishbone.py's promotion functions completely unchanged."""

    def test_five_whys_validation_legally_promotes_a_cause_hypothesis_set_to_a_real_root_cause_fact(self):
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        chs = _cause_hypothesis_set()
        validation = generate_five_whys_validation("FWV-T-CHAIN", chs, "CHS-T-FW-001-H1", _why_chain(), ["CONTROLLABLE_BY_ORGANIZATION", "CLEAR_EVIDENCE_TO_VERIFY"], make_provenance("EVIDENCE", "HUMAN_APPROVED"))
        contracts.validate(FIVE_WHYS_VALIDATION_SCHEMA, validation, "validation")

        validated_chs = record_validation_applied(chs, [METHOD_ID])
        self.assertTrue(validated_chs["promotion"]["ready_for_promotion"])

        rcf = attempt_promote_to_root_cause_fact("RCF-T-CHAIN", validated_chs, "CHS-T-FW-001-H1", "the real root cause statement", evidence_and_causal_validation_pass=True, provenance=make_provenance("SOURCE_FACT", "HUMAN_APPROVED"))
        contracts.validate(ROOT_CAUSE_FACT_SCHEMA, rcf, "root cause fact")
        self.assertEqual(rcf["legal_promotion_path"]["validation_methods_applied"], [METHOD_ID])
        self.assertEqual(rcf["source_cause_hypothesis_set_ref"], chs["id"])


if __name__ == "__main__":
    unittest.main()
