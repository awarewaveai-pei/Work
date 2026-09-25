"""Mutation-style tests for ``causal.logic_model`` (F11 causal family, Atlas F11 table row L619).

Two real invariants, each exercised at BOTH layers: construction-time refusal
(``generate_logic_model`` raising a specific ``InvariantViolation`` code) and
independent gate re-derivation (``evaluate_logic_model_integrity_gate``
catching a hand-tampered raw dict that bypassed the builder entirely, never
calling the builder itself). Schema conformance is checked against the real
spec-root schema this same slice added
(``typed-objects/logic-model-record.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.causal.logic_model import (
    METHOD_ID,
    OUTCOME_STAGES,
    RECORD_ID_PREFIX,
    STAGE_ORDER,
    all_gates_pass,
    evaluate_evidence_labeling_required_gate,
    evaluate_logic_model_gates,
    evaluate_logic_model_integrity_gate,
    evaluate_provenance_required_gate,
    generate_logic_model,
    stage_entry,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

LGM_SCHEMA = "ai-lego://specs/cognitive/typed-objects/logic-model-record.schema.yaml"


def _stage(stage: str, description: str = "desc", indicators=None, refs=("E-1",), epistemic_type: str = "SOURCE_FACT", authorship_state: str = "HUMAN_APPROVED") -> dict:
    return stage_entry(stage, description, make_provenance(epistemic_type, authorship_state), indicators=indicators, supporting_evidence_refs=list(refs) if refs else None)


def _valid_stages() -> list[dict]:
    return [
        _stage("INPUTS", "2 FTE + $50K budget"),
        _stage("ACTIVITIES", "build onboarding tutorial"),
        _stage("OUTPUTS", "tutorial completions counted"),
        _stage("SHORT_TERM_OUTCOMES", "activation rate rises", indicators=["7-day activation rate"]),
        _stage("LONG_TERM_OUTCOMES", "churn falls", indicators=["Month-2 churn rate"]),
    ]


def _valid_model(*, stages=None, program_name: str = "Test Program", record_id: str = "LGM-T-001"):
    return generate_logic_model(
        record_id,
        program_name,
        stages if stages is not None else _valid_stages(),
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )


class RecordConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(LGM_SCHEMA, _valid_model(), "logic model record")

    def test_valid_record_with_extra_input_stage_indicators_validates(self):
        stages = _valid_stages()
        stages[0] = _stage("INPUTS", "2 FTE + $50K budget", indicators=["quarterly budget ($)"])
        model = _valid_model(stages=stages)
        self.contracts.validate(LGM_SCHEMA, model, "logic model record with optional input indicator")
        self.assertIn("indicators", model["stages"][0])

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_logic_model_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_record_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOGICMODEL_INVALID_ID"):
            _valid_model(record_id="WRONG-PREFIX-001")

    def test_invalid_record_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOGICMODEL_INVALID_ID"):
            _valid_model(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOGICMODEL_INVALID_VERSION"):
            generate_logic_model("LGM-T-002", "Test Program", _valid_stages(), make_provenance("AI_INFERENCE", "AI_GENERATED"), version=1)

    def test_empty_program_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOGICMODEL_EMPTY_PROGRAM_NAME"):
            _valid_model(program_name="   ")

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_model())
        tampered["stages"][0]["description"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(LGM_SCHEMA, tampered, "tampered logic model record")
        gate = evaluate_logic_model_integrity_gate(tampered, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_itself_rejects_outcome_stage_with_no_indicators(self):
        """The schema layer independently enforces the outcome-indicator invariant too (a per-item,
        position-local constraint, unlike kepner_tregoe's own cross-field check the schema cannot express)."""
        tampered = copy.deepcopy(_valid_model())
        del tampered["stages"][4]["indicators"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(LGM_SCHEMA, tampered, "tampered logic model record missing outcome indicator")

    def test_schema_rejects_an_unknown_top_level_key(self):
        """Same discipline as how-might-we-record.schema.yaml's own test: additionalProperties:false must
        reject a smuggled top-level key."""
        record = _valid_model()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(LGM_SCHEMA, record, "logic model record with a smuggled top-level key")


class StageShapeTests(unittest.TestCase):
    def test_stages_wrong_count_too_few_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOGICMODEL_INVALID_STAGE_SET"):
            _valid_model(stages=_valid_stages()[:4])

    def test_stages_wrong_count_too_many_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOGICMODEL_INVALID_STAGE_SET"):
            _valid_model(stages=_valid_stages() + [_stage("INPUTS", "extra")])

    def test_stages_wrong_order_is_refused(self):
        stages = _valid_stages()
        stages[0], stages[1] = stages[1], stages[0]
        with self.assertRaisesRegex(InvariantViolation, "LOGICMODEL_INVALID_STAGE_SET"):
            _valid_model(stages=stages)

    def test_stages_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOGICMODEL_INVALID_STAGE_SET"):
            _valid_model(stages="not-a-list")

    def test_stage_entry_missing_required_key_is_refused(self):
        stages = _valid_stages()
        del stages[0]["provenance"]
        with self.assertRaisesRegex(InvariantViolation, "LOGICMODEL_INVALID_STAGE_SET"):
            _valid_model(stages=stages)

    def test_stage_entry_unknown_extra_key_is_refused(self):
        stages = _valid_stages()
        stages[0]["unexpected_field"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "LOGICMODEL_INVALID_STAGE_SET"):
            _valid_model(stages=stages)

    def test_stage_entry_wrong_stage_name_is_refused(self):
        stages = _valid_stages()
        stages[0]["stage"] = "RESOURCES"
        with self.assertRaisesRegex(InvariantViolation, "LOGICMODEL_INVALID_STAGE_SET"):
            _valid_model(stages=stages)

    def test_indicators_malformed_empty_list_is_refused(self):
        stages = _valid_stages()
        stages[0]["indicators"] = []
        with self.assertRaisesRegex(InvariantViolation, "LOGICMODEL_INVALID_STAGE_SET"):
            _valid_model(stages=stages)

    def test_indicators_malformed_blank_string_entry_is_refused(self):
        stages = _valid_stages()
        stages[0]["indicators"] = ["   "]
        with self.assertRaisesRegex(InvariantViolation, "LOGICMODEL_INVALID_STAGE_SET"):
            _valid_model(stages=stages)


class DescriptionRequirementTests(unittest.TestCase):
    """Every one of the 5 stages must independently enforce the non-empty-description invariant."""

    def _assert_empty_description_refused(self, position: int):
        stages = _valid_stages()
        stages[position]["description"] = ""
        with self.assertRaisesRegex(InvariantViolation, "LOGICMODEL_EMPTY_DESCRIPTION"):
            _valid_model(stages=stages)

    def test_empty_description_on_inputs_is_refused(self):
        self._assert_empty_description_refused(0)

    def test_empty_description_on_activities_is_refused(self):
        self._assert_empty_description_refused(1)

    def test_empty_description_on_outputs_is_refused(self):
        self._assert_empty_description_refused(2)

    def test_empty_description_on_short_term_outcomes_is_refused(self):
        self._assert_empty_description_refused(3)

    def test_empty_description_on_long_term_outcomes_is_refused(self):
        self._assert_empty_description_refused(4)

    def test_whitespace_only_description_is_treated_as_empty_and_refused(self):
        stages = _valid_stages()
        stages[0]["description"] = "   "
        with self.assertRaisesRegex(InvariantViolation, "LOGICMODEL_EMPTY_DESCRIPTION"):
            _valid_model(stages=stages)


class OutcomeIndicatorRequirementTests(unittest.TestCase):
    """Only the two outcome stages require indicators; INPUTS/ACTIVITIES/OUTPUTS never do."""

    def test_short_term_outcomes_missing_indicators_is_refused(self):
        stages = _valid_stages()
        stages[3] = _stage("SHORT_TERM_OUTCOMES", "activation rate rises")  # no indicators
        with self.assertRaisesRegex(InvariantViolation, "LOGICMODEL_OUTCOME_MISSING_INDICATOR"):
            _valid_model(stages=stages)

    def test_long_term_outcomes_missing_indicators_is_refused(self):
        stages = _valid_stages()
        stages[4] = _stage("LONG_TERM_OUTCOMES", "churn falls")  # no indicators
        with self.assertRaisesRegex(InvariantViolation, "LOGICMODEL_OUTCOME_MISSING_INDICATOR"):
            _valid_model(stages=stages)

    def test_inputs_stage_with_no_indicators_is_accepted(self):
        model = _valid_model()
        self.assertNotIn("indicators", model["stages"][0])

    def test_activities_stage_with_no_indicators_is_accepted(self):
        model = _valid_model()
        self.assertNotIn("indicators", model["stages"][1])

    def test_outputs_stage_with_no_indicators_is_accepted(self):
        model = _valid_model()
        self.assertNotIn("indicators", model["stages"][2])

    def test_inputs_stage_may_optionally_carry_indicators(self):
        stages = _valid_stages()
        stages[0] = _stage("INPUTS", "2 FTE + $50K budget", indicators=["quarterly budget ($)"])
        model = _valid_model(stages=stages)
        self.assertEqual(model["stages"][0]["indicators"], ["quarterly budget ($)"])

    def test_outcome_stages_constant_matches_atlas_citation(self):
        self.assertEqual(OUTCOME_STAGES, frozenset({"SHORT_TERM_OUTCOMES", "LONG_TERM_OUTCOMES"}))


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call
    the gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_record(self):
        record = _valid_model()
        gate = evaluate_logic_model_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_empty_description(self):
        record = copy.deepcopy(_valid_model())
        record["stages"][2]["description"] = ""
        gate = evaluate_logic_model_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_wrong_stage_order(self):
        record = copy.deepcopy(_valid_model())
        record["stages"][0], record["stages"][1] = record["stages"][1], record["stages"][0]
        gate = evaluate_logic_model_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_short_term_outcomes_indicators_stripped(self):
        record = copy.deepcopy(_valid_model())
        del record["stages"][3]["indicators"]
        gate = evaluate_logic_model_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_long_term_outcomes_indicators_stripped(self):
        record = copy.deepcopy(_valid_model())
        del record["stages"][4]["indicators"]
        gate = evaluate_logic_model_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_indicators_emptied_to_blank_list(self):
        record = copy.deepcopy(_valid_model())
        record["stages"][3]["indicators"] = []
        gate = evaluate_logic_model_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_record(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_logic_model_integrity_gate(bad_record, "test", "2026-09-10T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_model())
        record["id"] = "WRONG-001"
        gate = evaluate_logic_model_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_model())
        record["version"] = 1
        gate = evaluate_logic_model_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_empty_program_name(self):
        record = copy.deepcopy(_valid_model())
        record["program_name"] = ""
        gate = evaluate_logic_model_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_wrong_stage_count(self):
        record = copy.deepcopy(_valid_model())
        record["stages"] = record["stages"][:3]
        gate = evaluate_logic_model_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceAndEvidenceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_all_valid(self):
        gate = evaluate_provenance_required_gate(_valid_model(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_a_stage_provenance_invalid(self):
        record = copy.deepcopy(_valid_model())
        record["stages"][0]["provenance"] = {"epistemic_type": "NOT_REAL", "authorship_state": "HUMAN_APPROVED"}
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_when_record_provenance_invalid(self):
        record = copy.deepcopy(_valid_model())
        record["provenance"] = {"epistemic_type": "BOGUS", "authorship_state": "BOGUS"}
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_evidence_labeling_gate_passes_when_evidence_labeled_stages_cite_refs(self):
        gate = evaluate_evidence_labeling_required_gate(_valid_model(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_evidence_labeling_gate_fails_when_evidence_labeled_stage_cites_no_refs(self):
        stages = _valid_stages()
        stages[0] = _stage("INPUTS", "2 FTE + $50K budget", refs=None, epistemic_type="EVIDENCE")  # EVIDENCE but no refs
        model = _valid_model(stages=stages)
        gate = evaluate_evidence_labeling_required_gate(model, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_evidence_labeling_gate_fails_when_no_epistemic_type_label(self):
        record = copy.deepcopy(_valid_model())
        record["stages"][0]["provenance"] = {}
        gate = evaluate_evidence_labeling_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_evidence_labeling_gate_passes_for_hypothesis_labeled_stage_without_refs(self):
        stages = _valid_stages()
        stages[3] = _stage("SHORT_TERM_OUTCOMES", "activation rate rises", indicators=["7-day activation rate"], refs=None, epistemic_type="HYPOTHESIS", authorship_state="AI_SUGGESTED")
        model = _valid_model(stages=stages)
        gate = evaluate_evidence_labeling_required_gate(model, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")


class HelperFunctionTests(unittest.TestCase):
    def test_stage_entry_helper_omits_indicators_when_none(self):
        entry = stage_entry("INPUTS", "x", make_provenance("SOURCE_FACT", "HUMAN_APPROVED"))
        self.assertNotIn("indicators", entry)

    def test_stage_entry_helper_includes_indicators_when_given(self):
        entry = stage_entry("SHORT_TERM_OUTCOMES", "x", make_provenance("HYPOTHESIS", "AI_SUGGESTED"), indicators=["metric"])
        self.assertEqual(entry["indicators"], ["metric"])

    def test_all_gates_pass_true_when_all_pass(self):
        results = [{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]
        self.assertTrue(all_gates_pass(results))

    def test_all_gates_pass_false_when_one_fails(self):
        results = [{"status": "PASS"}, {"status": "FAIL"}]
        self.assertFalse(all_gates_pass(results))

    def test_evaluate_logic_model_gates_returns_three_gates_in_order(self):
        results = evaluate_logic_model_gates(_valid_model(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "evidence_labeling_required", "logic_model_integrity"])

    def test_evaluate_logic_model_gates_all_pass_on_a_valid_record(self):
        results = evaluate_logic_model_gates(_valid_model(), "test", "2026-09-10T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_stage_order_constant_matches_atlas_citation_order(self):
        self.assertEqual(STAGE_ORDER, ("INPUTS", "ACTIVITIES", "OUTPUTS", "SHORT_TERM_OUTCOMES", "LONG_TERM_OUTCOMES"))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "LGM-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "causal.logic_model")


if __name__ == "__main__":
    unittest.main()
