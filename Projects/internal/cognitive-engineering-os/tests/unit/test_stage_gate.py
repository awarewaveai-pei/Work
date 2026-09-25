"""Mutation-style tests for ``delivery.stage_gate`` (F22 PM/Delivery/Governance family, Atlas L921, §11.52).

Section 11.52's own sunk-cost-prevention benefit is proven at BOTH independent layers: the
construction-time builder refuses a GO decision with no evidence, an invalid gate_decision, or a blank
required field, and the independent gates re-derive the same rules directly from a raw (possibly
hand-tampered) dict, never trusting that the builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.delivery.stage_gate import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_go_decision_evidence_gate,
    evaluate_provenance_required_gate,
    evaluate_review_shape_integrity_gate,
    evaluate_stage_gate_gates,
    generate_stage_gate,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

STAGE_GATE_SCHEMA = "ai-lego://specs/cognitive/typed-objects/stage-gate-record.schema.yaml"
PROVENANCE = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        stage_reviews=[
            {
                "stage_name": "Discovery",
                "evidence": ["12 customer interviews confirm the pain point", "3 competitors lack this feature"],
                "gate_criteria": [">=10 confirmed customer interviews", ">=1 differentiated angle vs competitors"],
                "gate_decision": "GO",
            },
            {
                "stage_name": "Build",
                "evidence": [],
                "gate_criteria": ["prototype clickthrough rate >=20%"],
                "gate_decision": "HOLD",
            },
        ],
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_record(*, record_id: str = "STAGEGATE-T-001", **overrides: object):
    return generate_stage_gate(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(STAGE_GATE_SCHEMA, _valid_record(), "stage gate record")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, record = live.invoke(METHOD_ID, generate_stage_gate, "STAGEGATE-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/delivery.stage_gate.contract.yaml")
        self.assertEqual(record["id"], "STAGEGATE-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(STAGE_GATE_SCHEMA, record, "record with a smuggled top-level key")

    def test_schema_rejects_an_invalid_gate_decision_value(self):
        record = _valid_record()
        record["stage_reviews"][0]["gate_decision"] = "MAYBE"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(STAGE_GATE_SCHEMA, record, "record with an invalid gate_decision value")

    def test_schema_rejects_go_decision_with_empty_evidence(self):
        record = _valid_record()
        record["stage_reviews"][0]["evidence"] = []  # Discovery is GO in the base fixture
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(STAGE_GATE_SCHEMA, record, "record with GO decision but empty evidence")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "delivery.stage_gate.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "delivery.stage_gate contract")


class DecisionClosedSetTests(unittest.TestCase):
    def test_invalid_decision_is_refused(self):
        kwargs = _kwargs()
        kwargs["stage_reviews"][1]["gate_decision"] = "MAYBE"
        with self.assertRaisesRegex(InvariantViolation, "STAGEGATE_INVALID_REVIEW"):
            generate_stage_gate("STAGEGATE-T-002", **kwargs)

    def test_all_four_decisions_are_legal_when_evidence_rule_is_satisfied(self):
        for decision in ("GO", "HOLD", "REWORK", "KILL"):
            with self.subTest(decision=decision):
                kwargs = _kwargs()
                kwargs["stage_reviews"][1]["gate_decision"] = decision
                if decision != "GO":
                    kwargs["stage_reviews"][1]["evidence"] = []
                else:
                    kwargs["stage_reviews"][1]["evidence"] = ["at least one evidence item"]
                record = generate_stage_gate("STAGEGATE-T-003", **kwargs)
                self.assertEqual(record["stage_reviews"][1]["gate_decision"], decision)


class RequiredFieldTests(unittest.TestCase):
    def test_blank_stage_name_is_refused(self):
        kwargs = _kwargs()
        kwargs["stage_reviews"][0]["stage_name"] = "   "
        with self.assertRaisesRegex(InvariantViolation, "STAGEGATE_INVALID_REVIEW"):
            generate_stage_gate("STAGEGATE-T-004", **kwargs)

    def test_empty_gate_criteria_is_refused(self):
        kwargs = _kwargs()
        kwargs["stage_reviews"][0]["gate_criteria"] = []
        with self.assertRaisesRegex(InvariantViolation, "STAGEGATE_INVALID_REVIEW"):
            generate_stage_gate("STAGEGATE-T-005", **kwargs)

    def test_missing_gate_decision_is_refused(self):
        kwargs = _kwargs()
        del kwargs["stage_reviews"][0]["gate_decision"]
        with self.assertRaisesRegex(InvariantViolation, "STAGEGATE_INVALID_REVIEW"):
            generate_stage_gate("STAGEGATE-T-006", **kwargs)

    def test_empty_stage_reviews_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STAGEGATE_EMPTY_REVIEWS"):
            generate_stage_gate("STAGEGATE-T-007", stage_reviews=[], provenance=PROVENANCE)

    def test_unknown_key_on_a_stored_record_is_refused_by_the_shape_gate(self):
        record = copy.deepcopy(_valid_record())
        record["stage_reviews"][0]["owner"] = "PM"
        gate = evaluate_review_shape_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class GoEvidenceTests(unittest.TestCase):
    """THE real invariant -- a GO decision must carry non-empty evidence."""

    def test_go_with_no_evidence_is_refused(self):
        kwargs = _kwargs()
        kwargs["stage_reviews"][1]["gate_decision"] = "GO"  # Build's evidence is [] in the base fixture
        with self.assertRaisesRegex(InvariantViolation, "STAGEGATE_GO_WITHOUT_EVIDENCE"):
            generate_stage_gate("STAGEGATE-T-008", **kwargs)

    def test_go_with_real_evidence_is_accepted(self):
        record = _valid_record()
        self.assertEqual(record["stage_reviews"][0]["gate_decision"], "GO")
        self.assertTrue(record["stage_reviews"][0]["evidence"])

    def test_hold_with_no_evidence_is_accepted(self):
        record = _valid_record()
        self.assertEqual(record["stage_reviews"][1]["gate_decision"], "HOLD")
        self.assertEqual(record["stage_reviews"][1]["evidence"], [])

    def test_kill_with_no_evidence_is_accepted(self):
        kwargs = _kwargs()
        kwargs["stage_reviews"][1]["gate_decision"] = "KILL"
        record = generate_stage_gate("STAGEGATE-T-009", **kwargs)
        self.assertEqual(record["stage_reviews"][1]["gate_decision"], "KILL")

    def test_rework_with_no_evidence_is_accepted(self):
        kwargs = _kwargs()
        kwargs["stage_reviews"][1]["gate_decision"] = "REWORK"
        record = generate_stage_gate("STAGEGATE-T-010", **kwargs)
        self.assertEqual(record["stage_reviews"][1]["gate_decision"], "REWORK")


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        record = generate_stage_gate("STAGEGATE-T-011", **kwargs)
        kwargs["stage_reviews"][0]["stage_name"] = "MUTATED AFTER RETURN"
        self.assertNotEqual(record["stage_reviews"][0]["stage_name"], "MUTATED AFTER RETURN")
        self.assertIsNot(record["stage_reviews"], kwargs["stage_reviews"])


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_record(self):
        results = evaluate_stage_gate_gates(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_review_shape_integrity_gate_catches_hand_tampered_invalid_decision(self):
        record = copy.deepcopy(_valid_record())
        record["stage_reviews"][0]["gate_decision"] = "NOT_REAL"
        gate = evaluate_review_shape_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_review_shape_integrity_gate_catches_hand_tampered_empty_criteria(self):
        record = copy.deepcopy(_valid_record())
        record["stage_reviews"][0]["gate_criteria"] = []
        gate = evaluate_review_shape_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_go_decision_evidence_gate_catches_hand_tampered_blanked_evidence_after_go(self):
        record = copy.deepcopy(_valid_record())
        record["stage_reviews"][0]["evidence"] = []  # Discovery was GO with real evidence
        gate = evaluate_go_decision_evidence_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_go_decision_evidence_gate_passes_a_genuinely_valid_record(self):
        gate = evaluate_go_decision_evidence_gate(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_stage_gate_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "STAGEGATE-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STAGEGATE_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STAGEGATE_INVALID_VERSION"):
            generate_stage_gate("STAGEGATE-T-012", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STAGEGATE_INVALID_PROVENANCE"):
            _valid_record(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "delivery.stage_gate")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_stage_gate_gates(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "review_shape_integrity", "go_decision_evidence"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        record = _valid_record()
        self.assertEqual(set(record.keys()), {"id", "version", "generated_by_method", "stage_reviews", "provenance"})


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """Same defect class the F13/F15 batches' own critic passes found (builders returning the caller's
    provenance dict BY REFERENCE) -- guarded here from the start via copy.deepcopy at return."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_record()
        provenance = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")
        record = generate_stage_gate(base["id"], base["stage_reviews"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "HUMAN_OPINION")


if __name__ == "__main__":
    unittest.main()
