"""Mutation-style tests for ``security.dpia_pia`` (forty-eighth Method Atlas slice, FIFTH member of the
`security` family, F20 -- the FIRST F20 member that is NOT one of Execution Contract §32's own four named
Threat Review methods). Three real invariant classes proven at BOTH the construction and the independent
gate layer: (1) the eight-stage ORDER invariant (same class security.pasta already establishes, one stage
longer), (2) cross-stage RISK TRACEABILITY (every risk_id in the risks stage must be addressed by at least
one control and have exactly one residual assessment, and every control/residual risk_id must reference a
real declared risk), and (3) the HIGH-RESIDUAL-RISK ESCALATION rule (a bare 'approved' decision is refused
when any residual assessment is 'high')."""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.security.dpia_pia import (
    METHOD_ID,
    STAGE_ORDER,
    all_gates_pass,
    evaluate_dpia_pia_gates,
    evaluate_dpia_pia_integrity_gate,
    evaluate_provenance_required_gate,
    generate_dpia_pia_impact_assessment_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/dpia-pia-impact-assessment-record.schema.yaml"
TS = "2026-09-06T00:00:00Z"


def _prov():
    return make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _narrative(stage_id, summary="s"):
    return {"stage_id": stage_id, "summary": summary}


def _risk_entry(risk_id="RISK-001", description="d", likelihood="low", severity="low", affected_rights=None):
    return {"risk_id": risk_id, "description": description, "likelihood": likelihood, "severity": severity, "affected_rights": ["r"] if affected_rights is None else affected_rights}


def _control_entry(control_id="CTRL-001", description="d", mitigates_risk_ids=None):
    return {"control_id": control_id, "description": description, "mitigates_risk_ids": ["RISK-001"] if mitigates_risk_ids is None else mitigates_risk_ids}


def _residual_entry(risk_id="RISK-001", residual_likelihood="low", residual_severity="low", residual_risk_level="low", accepted_by="a"):
    return {"risk_id": risk_id, "residual_likelihood": residual_likelihood, "residual_severity": residual_severity, "residual_risk_level": residual_risk_level, "accepted_by": accepted_by}


def _approval(decision="approved", **overrides):
    base = {
        "stage_id": "approval",
        "approver_role": "role",
        "approver_name": "name",
        "decision": decision,
        "decision_date": "2026-09-06",
        "conditions": [],
        "jurisdiction_pack_ref": None,
    }
    base.update(overrides)
    return base


def _valid_stages():
    return [
        _narrative("processing"),
        _narrative("purpose"),
        _narrative("necessity_proportionality"),
        _narrative("data_subjects"),
        {"stage_id": "risks", "risks": [_risk_entry()]},
        {"stage_id": "controls", "controls": [_control_entry()]},
        {"stage_id": "residual_risk", "assessments": [_residual_entry()]},
        _approval(),
    ]


def _build(record_id="DPIA-T-001", system_or_component="a system", stages=None):
    return generate_dpia_pia_impact_assessment_record(record_id, system_or_component, _valid_stages() if stages is None else stages, _prov())


def _valid_record():
    return _build()


def _adr002_stages():
    return [
        _narrative("processing", "Personal-data fields stored inline in append-only Event Ledger payloads, encrypted per-subject with a DEK."),
        _narrative("purpose", "Event-sourced audit trail and replay-based system reconstruction (EC §112)."),
        _narrative("necessity_proportionality", "Crypto-shredding is the only ADR-002 option satisfying irreversible deletion with zero schema disruption."),
        _narrative("data_subjects", "End users whose personal-data fields appear in event payloads."),
        {"stage_id": "risks", "risks": [_risk_entry("RISK-001", "Unencrypted event metadata survives DEK destruction, can leak that a subject existed.", "medium", "medium", ["right to erasure"])]},
        {"stage_id": "controls", "controls": [_control_entry("CTRL-001", "AES-256 per-subject DEK; Key Destruction Record audit log; post-destruction decrypt re-attempt.", ["RISK-001"])]},
        {"stage_id": "residual_risk", "assessments": [_residual_entry("RISK-001", "medium", "low", "medium", "Data Protection Steward")]},
        _approval(decision="approved_with_conditions", approver_role="Data Protection Steward", approver_name="TBD", conditions=["Track as Phase 2 DPIA backlog item"]),
    ]


def _adr002_record():
    return _build(record_id="DPIA-T-002", system_or_component="Event Ledger under ADR-002 Option A", stages=_adr002_stages())


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "minimal DPIA/PIA record")

    def test_adr002_record_validates_in_atlas_own_order(self):
        record = _adr002_record()
        self.contracts.validate(RECORD_SCHEMA, record, "ADR-002 DPIA/PIA record")
        self.assertEqual([s["stage_id"] for s in record["stages"]], list(STAGE_ORDER))

    def test_builder_round_trips_generated_by_method_and_version(self):
        record = generate_dpia_pia_impact_assessment_record("DPIA-T-005", "s", _valid_stages(), _prov(), version="2.3.4", generated_by_method="security.dpia_pia@test")
        self.assertEqual(record["generated_by_method"], "security.dpia_pia@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(_valid_record()["generated_by_method"], METHOD_ID)

    def test_stage_order_constant_matches_atlas_own_eight_word_chain(self):
        self.assertEqual(STAGE_ORDER, ("processing", "purpose", "necessity_proportionality", "data_subjects", "risks", "controls", "residual_risk", "approval"))

    def test_schema_own_examples_validate_and_pass_every_gate(self):
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "dpia-pia-impact-assessment-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        examples = schema_doc.get("examples") or []
        self.assertTrue(examples, "dpia-pia-impact-assessment-record.schema.yaml has no examples to check")
        for example in examples:
            with self.subTest(description=example.get("description")):
                value = example["value"]
                self.contracts.validate(RECORD_SCHEMA, value, f"schema example: {example.get('description')}")
                self.assertTrue(all_gates_pass(evaluate_dpia_pia_gates(value, "test", TS)), f"schema example failed a real gate: {example.get('description')}")

    # --- id / version ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_record_id_without_dpia_prefix_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_RECORD_ID"):
            _build(record_id="PASTA-1")

    def test_non_string_version_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_VERSION"):
            generate_dpia_pia_impact_assessment_record("DPIA-T-V1", "s", _valid_stages(), _prov(), version=123)

    def test_empty_system_or_component_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DPIA_EMPTY_RECORD_FIELD"):
            _build(system_or_component="")

    # --- stages: shape and order ---
    def test_two_adjacent_stages_swapped_is_refused_even_though_the_set_is_unchanged(self):
        stages = _valid_stages()
        stages[0], stages[1] = stages[1], stages[0]
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages=stages)

    def test_approval_stage_moved_to_the_front_is_refused(self):
        stages = _valid_stages()
        stages.insert(0, stages.pop())
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages=stages)

    def test_missing_a_stage_is_refused(self):
        stages = _valid_stages()[:-1]  # only seven
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages=stages)

    def test_duplicate_stage_is_refused(self):
        stages = _valid_stages()[:-1]  # drop approval
        stages.append(_narrative("processing"))  # duplicate processing instead of approval
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages=stages)

    def test_extra_ninth_stage_is_refused(self):
        """Regression guard, same class security.pasta's own critic-caught test already establishes: the
        extra element must itself be SHAPE-VALID (a real approval stage), or this would pass 'by accident'
        via the shape check at position -1 rather than genuinely exercising the length guard."""
        stages = _valid_stages() + [_approval()]
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages=stages)

    def test_narrative_stage_with_extra_key_is_refused(self):
        stages = _valid_stages()
        stages[0] = dict(stages[0], control="c")
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages=stages)

    def test_narrative_stage_missing_summary_is_refused(self):
        stages = _valid_stages()
        del stages[2]["summary"]
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages=stages)

    def test_narrative_stage_empty_summary_is_refused(self):
        stages = _valid_stages()
        stages[3]["summary"] = "  "
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages=stages)

    def test_narrative_stage_with_illegal_stage_id_value_is_refused(self):
        stages = _valid_stages()
        stages[0]["stage_id"] = "not_a_real_stage"
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages=stages)

    def test_non_list_stages_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages="not a list")

    def test_non_dict_stage_entry_is_refused_not_crashed(self):
        stages = _valid_stages()
        stages[0] = "not a dict"
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages=stages)

    # --- risks stage ---
    def test_empty_risks_list_is_refused(self):
        stages = _valid_stages()
        stages[4]["risks"] = []
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages=stages)

    def test_risk_entry_without_risk_prefix_is_refused(self):
        stages = _valid_stages()
        stages[4]["risks"][0]["risk_id"] = "R-001"
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages=stages)

    def test_risk_entry_illegal_likelihood_is_refused(self):
        stages = _valid_stages()
        stages[4]["risks"][0]["likelihood"] = "extreme"
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages=stages)

    def test_risk_entry_empty_affected_rights_is_refused(self):
        stages = _valid_stages()
        stages[4]["risks"][0]["affected_rights"] = []
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages=stages)

    def test_duplicate_risk_id_within_risks_stage_is_refused(self):
        stages = _valid_stages()
        stages[4]["risks"].append(_risk_entry())  # same "RISK-001" twice
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages=stages)

    # --- controls stage: the RISK TRACEABILITY invariant ---
    def test_control_mitigating_a_nonexistent_risk_id_is_refused(self):
        """The core forward-traceability invariant: a control referencing a risk_id NOT declared in the
        risks stage must be refused, even though the control's own shape is otherwise valid."""
        stages = _valid_stages()
        stages[5]["controls"][0]["mitigates_risk_ids"] = ["RISK-999"]
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages=stages)

    def test_empty_controls_list_is_refused(self):
        stages = _valid_stages()
        stages[5]["controls"] = []
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages=stages)

    def test_control_with_empty_mitigates_risk_ids_is_refused(self):
        stages = _valid_stages()
        stages[5]["controls"][0]["mitigates_risk_ids"] = []
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages=stages)

    def test_a_risk_with_zero_controls_is_refused(self):
        """The reverse direction: a real risk declared in the risks stage that NO control mitigates."""
        stages = _valid_stages()
        stages[4]["risks"].append(_risk_entry("RISK-002"))
        # controls stage still only addresses RISK-001; residual_risk still only covers RISK-001 too, so
        # this must fail on the CONTROLS side (RISK-002 has no mitigating control) before residual_risk is
        # even reached, but either failure mode correctly refuses the record.
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages=stages)

    # --- residual_risk stage: the RISK TRACEABILITY invariant, other direction ---
    def test_residual_assessment_for_a_nonexistent_risk_id_is_refused(self):
        stages = _valid_stages()
        stages[6]["assessments"][0]["risk_id"] = "RISK-999"
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages=stages)

    def test_duplicate_residual_assessment_for_the_same_risk_id_is_refused(self):
        stages = _valid_stages()
        stages[6]["assessments"].append(_residual_entry())  # same "RISK-001" twice
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages=stages)

    def test_a_risk_with_zero_residual_assessments_is_refused(self):
        stages = _valid_stages()
        stages[4]["risks"].append(_risk_entry("RISK-002"))
        stages[5]["controls"][0]["mitigates_risk_ids"].append("RISK-002")
        # residual_risk still only covers RISK-001 -- RISK-002 has no residual assessment at all.
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages=stages)

    def test_residual_entry_illegal_level_is_refused(self):
        stages = _valid_stages()
        stages[6]["assessments"][0]["residual_risk_level"] = "extreme"
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages=stages)

    def test_residual_entry_empty_accepted_by_is_refused(self):
        stages = _valid_stages()
        stages[6]["assessments"][0]["accepted_by"] = " "
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages=stages)

    # --- multi-risk record: traceability holds across more than one risk ---
    def test_two_risks_each_fully_traced_validates(self):
        stages = _valid_stages()
        stages[4]["risks"].append(_risk_entry("RISK-002", "second risk"))
        stages[5]["controls"].append(_control_entry("CTRL-002", "second control", ["RISK-002"]))
        stages[6]["assessments"].append(_residual_entry("RISK-002"))
        record = _build(stages=stages)
        self.assertEqual(len(record["stages"][4]["risks"]), 2)

    def test_one_control_mitigating_two_risks_validates(self):
        stages = _valid_stages()
        stages[4]["risks"].append(_risk_entry("RISK-002", "second risk"))
        stages[5]["controls"][0]["mitigates_risk_ids"] = ["RISK-001", "RISK-002"]
        stages[6]["assessments"].append(_residual_entry("RISK-002"))
        record = _build(stages=stages)
        self.assertEqual(record["stages"][5]["controls"][0]["mitigates_risk_ids"], ["RISK-001", "RISK-002"])

    # --- approval stage: shape, decision enum, and the ESCALATION invariant ---
    def test_approval_illegal_decision_is_refused(self):
        stages = _valid_stages()
        stages[7]["decision"] = "maybe"
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages=stages)

    def test_approval_empty_approver_role_is_refused(self):
        stages = _valid_stages()
        stages[7]["approver_role"] = " "
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages=stages)

    def test_approval_jurisdiction_pack_ref_without_jpack_prefix_is_refused(self):
        stages = _valid_stages()
        stages[7]["jurisdiction_pack_ref"] = "PACK-1"
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages=stages)

    def test_approval_jurisdiction_pack_ref_null_is_legal(self):
        record = _build()
        self.assertIsNone(record["stages"][-1]["jurisdiction_pack_ref"])

    def test_approval_jurisdiction_pack_ref_valid_value_round_trips(self):
        stages = _valid_stages()
        stages[7]["jurisdiction_pack_ref"] = "JPACK-eu-gdpr-v1.0"
        record = _build(stages=stages)
        self.assertEqual(record["stages"][-1]["jurisdiction_pack_ref"], "JPACK-eu-gdpr-v1.0")

    def test_high_residual_risk_bare_approved_is_refused(self):
        """The core GDPR Art. 36 invariant: a bare 'approved' decision over a HIGH residual risk must be
        refused, even though every individual stage is otherwise well-shaped."""
        stages = _valid_stages()
        stages[6]["assessments"][0]["residual_risk_level"] = "high"
        stages[7]["decision"] = "approved"
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages=stages)

    def test_high_residual_risk_approved_with_conditions_is_legal(self):
        stages = _valid_stages()
        stages[6]["assessments"][0]["residual_risk_level"] = "high"
        stages[7]["decision"] = "approved_with_conditions"
        record = _build(stages=stages)
        self.assertEqual(record["stages"][-1]["decision"], "approved_with_conditions")

    def test_high_residual_risk_escalated_is_legal(self):
        stages = _valid_stages()
        stages[6]["assessments"][0]["residual_risk_level"] = "high"
        stages[7]["decision"] = "escalated"
        record = _build(stages=stages)
        self.assertEqual(record["stages"][-1]["decision"], "escalated")

    def test_high_residual_risk_rejected_is_legal(self):
        stages = _valid_stages()
        stages[6]["assessments"][0]["residual_risk_level"] = "high"
        stages[7]["decision"] = "rejected"
        record = _build(stages=stages)
        self.assertEqual(record["stages"][-1]["decision"], "rejected")

    def test_medium_residual_risk_bare_approved_is_legal(self):
        """Confirms the escalation rule is keyed on 'high' specifically, not any non-'low' level."""
        stages = _valid_stages()
        stages[6]["assessments"][0]["residual_risk_level"] = "medium"
        stages[7]["decision"] = "approved"
        record = _build(stages=stages)
        self.assertEqual(record["stages"][-1]["decision"], "approved")

    def test_escalation_rule_checks_the_highest_of_multiple_residual_levels(self):
        """One risk 'low', a second 'high' -- the escalation rule must fire on the HIGHEST across all
        assessments, not just the first one in the list."""
        stages = _valid_stages()
        stages[4]["risks"].append(_risk_entry("RISK-002", "second risk"))
        stages[5]["controls"].append(_control_entry("CTRL-002", "second control", ["RISK-002"]))
        stages[6]["assessments"].append(_residual_entry("RISK-002", residual_risk_level="high"))
        stages[7]["decision"] = "approved"
        with self.assertRaisesRegex(InvariantViolation, "DPIA_INVALID_STAGES"):
            _build(stages=stages)

    # --- schema-layer pins ---
    def test_schema_layer_rejects_an_id_without_the_dpia_prefix(self):
        record = _valid_record()
        record["id"] = "PASTA-1"
        with self.assertRaisesRegex(Exception, "DPIA-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema id prefix")

    def test_schema_layer_rejects_a_missing_required_top_level_field(self):
        record = _valid_record()
        del record["stages"]
        with self.assertRaisesRegex(Exception, "stages"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema top-level required")

    def test_schema_layer_rejects_swapped_stage_order(self):
        record = _valid_record()
        record["stages"][0], record["stages"][1] = record["stages"][1], record["stages"][0]
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema prefixItems order")

    def test_schema_layer_rejects_a_narrative_stage_with_control_key(self):
        record = _valid_record()
        record["stages"][0]["control"] = "c"
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema narrative_stage additionalProperties")

    # --- rebuild-not-alias ---
    def test_mutating_the_callers_own_inputs_after_construction_does_not_affect_the_stored_record(self):
        stages = _valid_stages()
        record = generate_dpia_pia_impact_assessment_record("DPIA-T-010", "s", stages, _prov())
        stages[0]["summary"] = "mutated"
        stages[4]["risks"][0]["description"] = "mutated"
        stages[5]["controls"][0]["description"] = "mutated"
        stages[6]["assessments"][0]["accepted_by"] = "mutated"
        stages[7]["conditions"].append("mutated")
        self.assertEqual(record["stages"][0]["summary"], "s")
        self.assertEqual(record["stages"][4]["risks"][0]["description"], "d")
        self.assertEqual(record["stages"][5]["controls"][0]["description"], "d")
        self.assertEqual(record["stages"][6]["assessments"][0]["accepted_by"], "a")
        self.assertEqual(record["stages"][7]["conditions"], [])

    def test_provenance_is_deliberately_aliased_not_rebuilt(self):
        provenance = _prov()
        record = generate_dpia_pia_impact_assessment_record("DPIA-T-011", "s", _valid_stages(), provenance)
        provenance["epistemic_type"] = "AI_INFERENCE"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        self.assertIsNone(live.resolve([METHOD_ID])["blocked"])

    def test_empty_catalog_blocks_dpia_pia_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def _gate(self, record):
        return evaluate_dpia_pia_integrity_gate(record, "test", TS)

    def test_valid_record_passes_both_gates(self):
        results = evaluate_dpia_pia_gates(_valid_record(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "dpia_pia_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_adr002_record_passes_both_gates(self):
        self.assertTrue(all_gates_pass(evaluate_dpia_pia_gates(_adr002_record(), "test", TS)))

    def test_all_gates_pass_returns_false_when_a_gate_fails(self):
        record = _valid_record()
        record["id"] = ""
        self.assertFalse(all_gates_pass(evaluate_dpia_pia_gates(record, "test", TS)))

    def test_hand_tampered_empty_id_fails_the_gate(self):
        record = _valid_record()
        record["id"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "id missing, empty, or not prefixed 'DPIA-'")

    def test_hand_tampered_non_string_version_fails_the_gate(self):
        record = _valid_record()
        record["version"] = 123
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "version missing or not a string")

    def test_hand_tampered_empty_system_or_component_fails_the_gate(self):
        record = _valid_record()
        record["system_or_component"] = " "
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "system_or_component missing or empty")

    def test_hand_tampered_stage_reorder_fails_the_gate(self):
        """The core re-derived-not-trusted invariant: reordering two adjacent stages (same set, wrong order)
        after construction must be caught by the gate's own fresh re-validation."""
        record = _adr002_record()
        record["stages"][0], record["stages"][1] = record["stages"][1], record["stages"][0]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_stage_dropped_fails_the_gate(self):
        record = _valid_record()
        del record["stages"][3]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_extra_shape_valid_stage_appended_fails_the_gate(self):
        record = _valid_record()
        record["stages"].append(_approval())
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_control_retargeted_to_nonexistent_risk_fails_the_gate(self):
        """The core re-derived-not-trusted risk-traceability invariant, at the gate layer: a copy's own
        control silently retargeted to a risk_id that does not exist must be caught."""
        record = _adr002_record()
        record["stages"][5]["controls"][0]["mitigates_risk_ids"] = ["RISK-999"]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_residual_assessment_removed_fails_the_gate(self):
        record = _adr002_record()
        record["stages"][6]["assessments"] = []
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_high_residual_bare_approved_fails_the_gate(self):
        """The core re-derived-not-trusted ESCALATION invariant, at the gate layer: a copy's own residual
        level silently pushed to 'high' with the decision left at bare 'approved' must be caught."""
        record = _adr002_record()
        record["stages"][6]["assessments"][0]["residual_risk_level"] = "high"
        record["stages"][7]["decision"] = "approved"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_gate_evidence_reports_accurate_counts_on_a_valid_record(self):
        gate = self._gate(_adr002_record())
        self.assertEqual(gate["evidence"][0], {"stage_count": 8, "risk_count": 1})

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _adr002_record()
        before = copy.deepcopy(record)
        self._gate(record)
        self.assertEqual(record, before)

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                self.assertEqual(self._gate(bad_record)["status"], "FAIL")
                self.assertEqual(evaluate_provenance_required_gate(bad_record, "test", TS)["status"], "FAIL")

    def test_missing_record_provenance_fails_the_provenance_gate_not_a_crash(self):
        record = _valid_record()
        record["provenance"] = None
        self.assertEqual(evaluate_provenance_required_gate(record, "test", TS)["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
