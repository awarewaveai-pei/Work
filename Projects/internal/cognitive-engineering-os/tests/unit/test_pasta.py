"""Mutation-style tests for ``security.pasta`` (forty-seventh Method Atlas slice, FOURTH member of the
`security` family, F20 -- a genuinely THIRD structural shape after STRIDE/LINDDUN's shared flat-DFD shape and
Attack Tree's own recursive tree). Two-layer discipline proven for the real ORDER invariant: a caller-supplied
stage list with the right SET of seven stage_ids but the WRONG ORDER must be refused at both construction and
the independent gate, which re-derives shape-and-order from the record's own raw fields rather than trusting
a stored value."""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.security.pasta import (
    METHOD_ID,
    STAGE_ORDER,
    all_gates_pass,
    evaluate_pasta_gates,
    evaluate_pasta_integrity_gate,
    evaluate_provenance_required_gate,
    generate_pasta_threat_model_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/pasta-threat-model-record.schema.yaml"
TS = "2026-09-06T00:00:00Z"


def _prov():
    return make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _tb(name="boundary A", description="a description"):
    return {"name": name, "description": description}


def _process(stage_id, summary="s"):
    return {"stage_id": stage_id, "summary": summary}


def _risk(summary="s", control="c", residual_risk="r", test_evidence="t"):
    return {"stage_id": "risk", "summary": summary, "control": control, "residual_risk": residual_risk, "test_evidence": test_evidence}


def _valid_stages():
    return [_process(stage_id) for stage_id in STAGE_ORDER[:-1]] + [_risk()]


def _build(
    record_id="PASTA-T-001",
    system_or_component="a system",
    assets=None,
    trust_boundaries=None,
    entry_points=None,
    stages=None,
):
    return generate_pasta_threat_model_record(
        record_id,
        system_or_component,
        ["an asset"] if assets is None else assets,
        [] if trust_boundaries is None else trust_boundaries,
        [] if entry_points is None else entry_points,
        _valid_stages() if stages is None else stages,
        _prov(),
    )


def _valid_record():
    return _build()


def _payment_stages():
    return [
        _process("business", "Protect merchant revenue and PCI compliance posture."),
        _process("scope", "In scope: charge-initiation service and its outbound call."),
        _process("decompose", "Charge assembled -> token attached -> signed request sent -> webhook updates status."),
        _process("threat", "Webhook callback could be spoofed to falsely mark orders paid."),
        _process("vulnerability", "Signature verification exists but the shared secret is not rotated."),
        _process("attack", "An attacker with the webhook secret could forge a paid-order callback."),
        _risk("Medium-high residual risk.", "Webhook signature verification enforced; secret in secrets manager.", "Medium -- rotation not automated.", "Manual code review, 2026-09-01."),
    ]


def _payment_record():
    return _build(record_id="PASTA-T-002", assets=["cardholder tokenized reference", "merchant settlement records"], stages=_payment_stages())


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "minimal PASTA record")

    def test_payment_record_validates_in_atlas_own_order(self):
        record = _payment_record()
        self.contracts.validate(RECORD_SCHEMA, record, "payment-gateway PASTA record")
        self.assertEqual([s["stage_id"] for s in record["stages"]], list(STAGE_ORDER))

    def test_builder_round_trips_generated_by_method_and_version(self):
        record = generate_pasta_threat_model_record("PASTA-T-005", "s", ["a"], [], [], _valid_stages(), _prov(), version="2.3.4", generated_by_method="security.pasta@test")
        self.assertEqual(record["generated_by_method"], "security.pasta@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(_valid_record()["generated_by_method"], METHOD_ID)

    def test_stage_order_constant_matches_atlas_own_seven_word_chain(self):
        self.assertEqual(STAGE_ORDER, ("business", "scope", "decompose", "threat", "vulnerability", "attack", "risk"))

    def test_schema_own_examples_validate_and_pass_every_gate(self):
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "pasta-threat-model-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        examples = schema_doc.get("examples") or []
        self.assertTrue(examples, "pasta-threat-model-record.schema.yaml has no examples to check")
        for example in examples:
            with self.subTest(description=example.get("description")):
                value = example["value"]
                self.contracts.validate(RECORD_SCHEMA, value, f"schema example: {example.get('description')}")
                self.assertTrue(all_gates_pass(evaluate_pasta_gates(value, "test", TS)), f"schema example failed a real gate: {example.get('description')}")

    # --- id / version ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PASTA_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_record_id_without_pasta_prefix_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "PASTA_INVALID_RECORD_ID"):
            _build(record_id="STRIDE-1")

    def test_non_string_version_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "PASTA_INVALID_VERSION"):
            generate_pasta_threat_model_record("PASTA-T-V1", "s", ["a"], [], [], _valid_stages(), _prov(), version=123)

    def test_empty_system_or_component_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PASTA_EMPTY_RECORD_FIELD"):
            _build(system_or_component="")

    # --- assets / trust_boundaries / entry_points (same family-wide checks) ---
    def test_empty_assets_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PASTA_INVALID_ASSETS"):
            _build(assets=[])

    def test_trust_boundary_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PASTA_INVALID_TRUST_BOUNDARIES"):
            _build(trust_boundaries=[dict(_tb(), owner="x")])

    def test_entry_points_with_non_string_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PASTA_INVALID_ENTRY_POINTS"):
            _build(entry_points=["a", 1])

    # --- stages: the real order invariant ---
    def test_two_adjacent_stages_swapped_is_refused_even_though_the_set_is_unchanged(self):
        """The core real invariant: business/scope swapped is the SAME SET of seven stage_ids, wrong order."""
        stages = _valid_stages()
        stages[0], stages[1] = stages[1], stages[0]
        with self.assertRaisesRegex(InvariantViolation, "PASTA_INVALID_STAGES"):
            _build(stages=stages)

    def test_risk_stage_moved_to_the_front_is_refused(self):
        stages = _valid_stages()
        stages.insert(0, stages.pop())
        with self.assertRaisesRegex(InvariantViolation, "PASTA_INVALID_STAGES"):
            _build(stages=stages)

    def test_missing_a_stage_is_refused(self):
        stages = _valid_stages()[:-1]  # only six
        with self.assertRaisesRegex(InvariantViolation, "PASTA_INVALID_STAGES"):
            _build(stages=stages)

    def test_duplicate_stage_is_refused(self):
        stages = _valid_stages()[:-1]  # drop risk
        stages.append(_process("business"))  # duplicate business instead of risk
        with self.assertRaisesRegex(InvariantViolation, "PASTA_INVALID_STAGES"):
            _build(stages=stages)

    def test_extra_eighth_stage_is_refused(self):
        """Regression guard, critic-caught: the extra element must itself be SHAPE-VALID (a real risk
        stage), or this test would pass 'by accident' via the shape check at position -1 rather than
        genuinely exercising the length guard -- an appended process stage lands at stages[-1] and fails
        _risk_stage_is_valid regardless of whether the length check exists at all."""
        stages = _valid_stages() + [_risk()]
        with self.assertRaisesRegex(InvariantViolation, "PASTA_INVALID_STAGES"):
            _build(stages=stages)

    def test_process_stage_with_extra_key_is_refused(self):
        stages = _valid_stages()
        stages[0] = dict(stages[0], control="c")
        with self.assertRaisesRegex(InvariantViolation, "PASTA_INVALID_STAGES"):
            _build(stages=stages)

    def test_process_stage_missing_summary_is_refused(self):
        stages = _valid_stages()
        del stages[2]["summary"]
        with self.assertRaisesRegex(InvariantViolation, "PASTA_INVALID_STAGES"):
            _build(stages=stages)

    def test_process_stage_empty_summary_is_refused(self):
        stages = _valid_stages()
        stages[3]["summary"] = "  "
        with self.assertRaisesRegex(InvariantViolation, "PASTA_INVALID_STAGES"):
            _build(stages=stages)

    def test_risk_stage_missing_control_is_refused(self):
        stages = _valid_stages()
        del stages[-1]["control"]
        with self.assertRaisesRegex(InvariantViolation, "PASTA_INVALID_STAGES"):
            _build(stages=stages)

    def test_risk_stage_empty_residual_risk_is_refused(self):
        stages = _valid_stages()
        stages[-1]["residual_risk"] = ""
        with self.assertRaisesRegex(InvariantViolation, "PASTA_INVALID_STAGES"):
            _build(stages=stages)

    def test_risk_stage_empty_test_evidence_is_refused(self):
        stages = _valid_stages()
        stages[-1]["test_evidence"] = ""
        with self.assertRaisesRegex(InvariantViolation, "PASTA_INVALID_STAGES"):
            _build(stages=stages)

    def test_risk_stage_with_wrong_stage_id_is_refused(self):
        stages = _valid_stages()
        stages[-1]["stage_id"] = "attack"
        with self.assertRaisesRegex(InvariantViolation, "PASTA_INVALID_STAGES"):
            _build(stages=stages)

    def test_process_stage_with_illegal_stage_id_value_is_refused(self):
        stages = _valid_stages()
        stages[0]["stage_id"] = "not_a_real_stage"
        with self.assertRaisesRegex(InvariantViolation, "PASTA_INVALID_STAGES"):
            _build(stages=stages)

    def test_non_list_stages_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "PASTA_INVALID_STAGES"):
            _build(stages="not a list")

    def test_non_dict_stage_entry_is_refused_not_crashed(self):
        stages = _valid_stages()
        stages[0] = "not a dict"
        with self.assertRaisesRegex(InvariantViolation, "PASTA_INVALID_STAGES"):
            _build(stages=stages)

    # --- schema-layer pins ---
    def test_schema_layer_rejects_an_id_without_the_pasta_prefix(self):
        record = _valid_record()
        record["id"] = "STRIDE-1"
        with self.assertRaisesRegex(Exception, "PASTA-"):
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

    def test_schema_layer_rejects_a_sixth_stage_with_control_key(self):
        record = _valid_record()
        record["stages"][0]["control"] = "c"
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema process_stage additionalProperties")

    # --- rebuild-not-alias ---
    def test_mutating_the_callers_own_inputs_after_construction_does_not_affect_the_stored_record(self):
        assets = ["a"]
        trust_boundaries = [_tb()]
        entry_points = ["ep"]
        stages = _valid_stages()
        record = generate_pasta_threat_model_record("PASTA-T-010", "s", assets, trust_boundaries, entry_points, stages, _prov())
        assets.append("mutated")
        trust_boundaries[0]["name"] = "mutated"
        entry_points.append("mutated")
        stages[0]["summary"] = "mutated"
        stages[-1]["control"] = "mutated"  # the risk stage is a DISTINCT nested shape from process stages
        self.assertEqual(record["assets"], ["a"])
        self.assertEqual(record["trust_boundaries"][0]["name"], "boundary A")
        self.assertEqual(record["entry_points"], ["ep"])
        self.assertEqual(record["stages"][0]["summary"], "s")
        self.assertEqual(record["stages"][-1]["control"], "c")

    def test_provenance_is_deliberately_aliased_not_rebuilt(self):
        provenance = _prov()
        record = generate_pasta_threat_model_record("PASTA-T-011", "s", ["a"], [], [], _valid_stages(), provenance)
        provenance["epistemic_type"] = "AI_INFERENCE"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        self.assertIsNone(live.resolve([METHOD_ID])["blocked"])

    def test_empty_catalog_blocks_pasta_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def _gate(self, record):
        return evaluate_pasta_integrity_gate(record, "test", TS)

    def test_valid_record_passes_both_gates(self):
        results = evaluate_pasta_gates(_valid_record(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "pasta_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_payment_record_passes_both_gates(self):
        self.assertTrue(all_gates_pass(evaluate_pasta_gates(_payment_record(), "test", TS)))

    def test_all_gates_pass_returns_false_when_a_gate_fails(self):
        record = _valid_record()
        record["id"] = ""
        self.assertFalse(all_gates_pass(evaluate_pasta_gates(record, "test", TS)))

    def test_hand_tampered_empty_id_fails_the_gate(self):
        record = _valid_record()
        record["id"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "id missing, empty, or not prefixed 'PASTA-'")

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

    def test_hand_tampered_empty_assets_fails_the_gate(self):
        record = _valid_record()
        record["assets"] = []
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "assets invalid (empty, malformed, or non-string entry)")

    def test_hand_tampered_trust_boundary_extra_key_fails_the_gate(self):
        record = _build(trust_boundaries=[_tb()])
        record["trust_boundaries"][0]["owner"] = "x"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "trust_boundaries invalid (malformed entry or unknown keys)")

    def test_hand_tampered_non_string_entry_point_fails_the_gate(self):
        record = _build(entry_points=["a"])
        record["entry_points"][0] = 1
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "entry_points invalid (not a list, or contains a non-string/empty entry)")

    def test_hand_tampered_stage_reorder_fails_the_gate(self):
        """The core re-derived-not-trusted invariant: reordering two adjacent stages (same set, wrong order)
        after construction must be caught by the gate's own fresh re-validation, not accepted because every
        individual stage still LOOKS well-formed."""
        record = _payment_record()
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
        """Same length-guard regression this session's own critic review caught in the construction-layer
        test -- proven here at the independent GATE layer too: an appended EIGHTH stage that is itself
        shape-valid (a real risk stage) must still be refused on length alone."""
        record = _valid_record()
        record["stages"].append(_risk())
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_risk_stage_control_emptied_fails_the_gate(self):
        record = _valid_record()
        record["stages"][-1]["control"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_process_stage_summary_emptied_fails_the_gate(self):
        for position in range(6):
            with self.subTest(position=position):
                record = _valid_record()
                record["stages"][position]["summary"] = " "
                gate = self._gate(record)
                self.assertEqual(gate["status"], "FAIL")
                self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_gate_evidence_reports_accurate_counts_on_a_valid_record(self):
        gate = self._gate(_payment_record())
        self.assertEqual(gate["evidence"][0], {"asset_count": 2, "stage_count": 7})

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _payment_record()
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
