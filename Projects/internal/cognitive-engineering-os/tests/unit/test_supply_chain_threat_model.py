"""Mutation-style tests for ``security.supply_chain_threat_model`` (fifty-first Method Atlas slice this
session, SIXTH member of the `security` family, F20 -- the SECOND F20 member confirmed genuinely absent from
Execution Contract §32 entirely, after `security.dpia_pia`). Two real invariant classes proven at BOTH the
construction and the independent gate layer, beyond the shared seven-stage ORDER invariant (same class
`security.pasta`/`security.dpia_pia` already establish): (1) DEPENDENCY-CONSIDERATION COMPLETENESS -- every
`dependency_entries[]` entry must carry all seven of Execution Contract §34's own named considerations, and
(2) the PRODUCTION-VERIFIED-ARTIFACT GATE -- `production_deployment_occurred` may not be True while
`artifact_verified` is False (EC §34 L1328-1332, converging with Master Plan §66 L2758)."""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.security.supply_chain_threat_model import (
    METHOD_ID,
    STAGE_ORDER,
    all_gates_pass,
    evaluate_provenance_required_gate,
    evaluate_supply_chain_threat_model_gates,
    evaluate_supply_chain_threat_model_integrity_gate,
    generate_supply_chain_threat_model_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/supply-chain-threat-model-record.schema.yaml"
TS = "2026-09-06T00:00:00Z"


def _prov():
    return make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _process(stage_id="source", summary="s"):
    return {"stage_id": stage_id, "summary": summary}


def _considerations(**overrides):
    base = {
        "maintenance": "maintained",
        "license": "MIT",
        "vulnerability_history": "none known",
        "replaceability": "low cost",
        "transitive_dependencies": "none of note",
        "size_performance": "negligible",
        "long_term_support": "long track record",
    }
    base.update(overrides)
    return base


def _dependency_entry(name="a-dependency", **consideration_overrides):
    return {"name": name, "considerations": _considerations(**consideration_overrides)}


def _dependency(*entries):
    return {"stage_id": "dependency", "dependency_entries": list(entries) if entries else [_dependency_entry()]}


def _sign_verify(summary="s", artifact_verified=True, production_deployment_occurred=True, verification_method="cosign verify"):
    return {
        "stage_id": "sign_verify",
        "summary": summary,
        "artifact_verified": artifact_verified,
        "production_deployment_occurred": production_deployment_occurred,
        "verification_method": verification_method,
    }


def _valid_stages():
    return [
        _process("source"),
        _dependency(),
        _process("ci"),
        _process("artifact"),
        _process("registry"),
        _process("deploy"),
        _sign_verify(),
    ]


def _build(record_id="SCTM-T-001", system_or_component="a system", stages=None):
    return generate_supply_chain_threat_model_record(record_id, system_or_component, _valid_stages() if stages is None else stages, _prov())


def _valid_record():
    return _build()


def _release_stages():
    return [
        _process("source", "GitHub repository, main branch protected, two-reviewer rule enforced."),
        _dependency(
            _dependency_entry(
                "jsonschema",
                maintenance="Actively maintained, multiple releases per year.",
                license="MIT.",
                vulnerability_history="No open CVEs.",
                replaceability="Low switching cost.",
                transitive_dependencies="Two small transitive deps.",
                size_performance="Pure-Python, negligible.",
                long_term_support="Reference implementation of the spec.",
            ),
            _dependency_entry(
                "PyYAML",
                maintenance="Actively maintained.",
                license="MIT.",
                vulnerability_history="Historical unsafe-load CVEs -- safe_load used exclusively.",
                replaceability="Moderate switching cost.",
                transitive_dependencies="None of note.",
                size_performance="Small.",
                long_term_support="De facto standard.",
            ),
        ),
        _process("ci", "GitHub Actions runs the full unit test suite on every push and PR."),
        _process("artifact", "sdist and wheel built from the tagged commit."),
        _process("registry", "Internal package index."),
        _process("deploy", "Pulled by internal runtime images at container build time."),
        _sign_verify("GitHub Artifact Attestations verified at image-build time.", True, True, "GitHub Artifact Attestations (Sigstore/cosign-backed)."),
    ]


def _release_record():
    return _build(record_id="SCTM-T-002", system_or_component="ai_lego package release pipeline", stages=_release_stages())


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "minimal supply-chain review record")

    def test_release_record_validates_in_atlas_own_order(self):
        record = _release_record()
        self.contracts.validate(RECORD_SCHEMA, record, "ai_lego release pipeline supply-chain review")
        self.assertEqual([s["stage_id"] for s in record["stages"]], list(STAGE_ORDER))

    def test_builder_round_trips_generated_by_method_and_version(self):
        record = generate_supply_chain_threat_model_record("SCTM-T-005", "s", _valid_stages(), _prov(), version="2.3.4", generated_by_method="security.supply_chain_threat_model@test")
        self.assertEqual(record["generated_by_method"], "security.supply_chain_threat_model@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(_valid_record()["generated_by_method"], METHOD_ID)

    def test_stage_order_constant_matches_atlas_own_seven_word_f20_row(self):
        self.assertEqual(STAGE_ORDER, ("source", "dependency", "ci", "artifact", "registry", "deploy", "sign_verify"))

    def test_schema_own_examples_validate_and_pass_every_gate(self):
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "supply-chain-threat-model-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        examples = schema_doc.get("examples") or []
        self.assertTrue(examples, "supply-chain-threat-model-record.schema.yaml has no examples to check")
        for example in examples:
            with self.subTest(description=example.get("description")):
                value = example["value"]
                self.contracts.validate(RECORD_SCHEMA, value, f"schema example: {example.get('description')}")
                self.assertTrue(all_gates_pass(evaluate_supply_chain_threat_model_gates(value, "test", TS)), f"schema example failed a real gate: {example.get('description')}")

    # --- id / version ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_record_id_without_sctm_prefix_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_RECORD_ID"):
            _build(record_id="DPIA-1")

    def test_non_string_version_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_VERSION"):
            generate_supply_chain_threat_model_record("SCTM-T-V1", "s", _valid_stages(), _prov(), version=123)

    def test_empty_system_or_component_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCTM_EMPTY_RECORD_FIELD"):
            _build(system_or_component="")

    # --- stages: shape and order ---
    def test_two_adjacent_stages_swapped_is_refused_even_though_the_set_is_unchanged(self):
        stages = _valid_stages()
        stages[0], stages[1] = stages[1], stages[0]
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_sign_verify_stage_moved_to_the_front_is_refused(self):
        stages = _valid_stages()
        stages.insert(0, stages.pop())
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_missing_a_stage_is_refused(self):
        stages = _valid_stages()[:-1]  # only six
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_duplicate_stage_is_refused(self):
        stages = _valid_stages()[:-1]  # drop sign_verify
        stages.append(_process("source"))  # duplicate source instead of sign_verify
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_extra_eighth_stage_is_refused(self):
        """Regression guard, same class security.pasta's/security.dpia_pia's own critic-caught test already
        establishes: the extra element must itself be SHAPE-VALID (a real sign_verify stage), or this would
        pass 'by accident' via the shape check at position -1 rather than genuinely exercising the length
        guard."""
        stages = _valid_stages() + [_sign_verify()]
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_process_stage_with_extra_key_is_refused(self):
        stages = _valid_stages()
        stages[0] = dict(stages[0], owner="x")
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_process_stage_missing_summary_is_refused(self):
        stages = _valid_stages()
        del stages[2]["summary"]
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_process_stage_empty_summary_is_refused(self):
        stages = _valid_stages()
        stages[3]["summary"] = "  "
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_process_stage_with_illegal_stage_id_value_is_refused(self):
        stages = _valid_stages()
        stages[0]["stage_id"] = "not_a_real_stage"
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_process_stage_at_wrong_position_is_refused(self):
        """ci placed at the artifact position (position 3) instead of its own position (2) -- same SET of
        legal stage_ids elsewhere in the record, wrong positional match."""
        stages = _valid_stages()
        stages[3] = _process("ci")
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_non_list_stages_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages="not a list")

    def test_non_dict_stage_entry_is_refused_not_crashed(self):
        stages = _valid_stages()
        stages[0] = "not a dict"
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    # --- dependency stage: shape ---
    def test_empty_dependency_entries_list_is_refused(self):
        stages = _valid_stages()
        stages[1]["dependency_entries"] = []
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_dependency_entry_missing_name_is_refused(self):
        stages = _valid_stages()
        del stages[1]["dependency_entries"][0]["name"]
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_dependency_entry_empty_name_is_refused(self):
        stages = _valid_stages()
        stages[1]["dependency_entries"][0]["name"] = " "
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_dependency_entry_with_extra_key_is_refused(self):
        stages = _valid_stages()
        stages[1]["dependency_entries"][0]["version"] = "1.0.0"
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_dependency_stage_with_wrong_stage_id_is_refused(self):
        stages = _valid_stages()
        stages[1]["stage_id"] = "dependencies"
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_non_dict_considerations_is_refused(self):
        stages = _valid_stages()
        stages[1]["dependency_entries"][0]["considerations"] = "not a dict"
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_considerations_with_extra_key_is_refused(self):
        stages = _valid_stages()
        stages[1]["dependency_entries"][0]["considerations"]["owner"] = "someone"
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    # --- dependency stage: the DEPENDENCY-CONSIDERATION COMPLETENESS invariant, one test per EC §34 dimension ---
    def test_considerations_missing_maintenance_is_refused(self):
        stages = _valid_stages()
        del stages[1]["dependency_entries"][0]["considerations"]["maintenance"]
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_considerations_missing_license_is_refused(self):
        stages = _valid_stages()
        del stages[1]["dependency_entries"][0]["considerations"]["license"]
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_considerations_missing_vulnerability_history_is_refused(self):
        stages = _valid_stages()
        del stages[1]["dependency_entries"][0]["considerations"]["vulnerability_history"]
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_considerations_missing_replaceability_is_refused(self):
        stages = _valid_stages()
        del stages[1]["dependency_entries"][0]["considerations"]["replaceability"]
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_considerations_missing_transitive_dependencies_is_refused(self):
        stages = _valid_stages()
        del stages[1]["dependency_entries"][0]["considerations"]["transitive_dependencies"]
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_considerations_missing_size_performance_is_refused(self):
        stages = _valid_stages()
        del stages[1]["dependency_entries"][0]["considerations"]["size_performance"]
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_considerations_missing_long_term_support_is_refused(self):
        stages = _valid_stages()
        del stages[1]["dependency_entries"][0]["considerations"]["long_term_support"]
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_considerations_with_one_empty_value_is_refused(self):
        stages = _valid_stages()
        stages[1]["dependency_entries"][0]["considerations"]["license"] = "  "
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_second_dependency_entry_incomplete_considerations_is_refused(self):
        """The completeness invariant applies to EVERY entry, not just the first."""
        stages = _valid_stages()
        second = _dependency_entry("second-dependency")
        del second["considerations"]["maintenance"]
        stages[1]["dependency_entries"].append(second)
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_multiple_complete_dependency_entries_validate(self):
        stages = _valid_stages()
        stages[1]["dependency_entries"].append(_dependency_entry("second-dependency"))
        record = _build(stages=stages)
        self.assertEqual(len(record["stages"][1]["dependency_entries"]), 2)

    # --- sign_verify stage: shape ---
    def test_sign_verify_missing_summary_is_refused(self):
        stages = _valid_stages()
        del stages[6]["summary"]
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_sign_verify_empty_summary_is_refused(self):
        stages = _valid_stages()
        stages[6]["summary"] = " "
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_sign_verify_empty_verification_method_is_refused(self):
        stages = _valid_stages()
        stages[6]["verification_method"] = " "
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_sign_verify_non_bool_artifact_verified_is_refused(self):
        stages = _valid_stages()
        stages[6]["artifact_verified"] = "true"
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_sign_verify_non_bool_production_deployment_occurred_is_refused(self):
        stages = _valid_stages()
        stages[6]["production_deployment_occurred"] = 1
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_sign_verify_with_extra_key_is_refused(self):
        stages = _valid_stages()
        stages[6]["control"] = "c"
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_sign_verify_with_wrong_stage_id_is_refused(self):
        stages = _valid_stages()
        stages[6]["stage_id"] = "deploy"
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    # --- sign_verify stage: the PRODUCTION-VERIFIED-ARTIFACT GATE invariant ---
    def test_production_deployed_but_not_verified_is_refused(self):
        """The core EC §34 / Master Plan §66 invariant: production_deployment_occurred=True with
        artifact_verified=False must be refused, even though every individual field is otherwise well
        -shaped."""
        stages = _valid_stages()
        stages[6] = _sign_verify(artifact_verified=False, production_deployment_occurred=True)
        with self.assertRaisesRegex(InvariantViolation, "SCTM_INVALID_STAGES"):
            _build(stages=stages)

    def test_verified_and_deployed_is_legal(self):
        stages = _valid_stages()
        stages[6] = _sign_verify(artifact_verified=True, production_deployment_occurred=True)
        record = _build(stages=stages)
        self.assertTrue(record["stages"][-1]["artifact_verified"])
        self.assertTrue(record["stages"][-1]["production_deployment_occurred"])

    def test_verified_but_not_yet_deployed_is_legal(self):
        stages = _valid_stages()
        stages[6] = _sign_verify(artifact_verified=True, production_deployment_occurred=False)
        record = _build(stages=stages)
        self.assertFalse(record["stages"][-1]["production_deployment_occurred"])

    def test_not_verified_and_not_deployed_is_legal(self):
        """Confirms the rule is a conjunction (deploy AND NOT verified), not a bare 'must always verify'
        requirement -- an artifact that never reached production has nothing to gate."""
        stages = _valid_stages()
        stages[6] = _sign_verify(artifact_verified=False, production_deployment_occurred=False)
        record = _build(stages=stages)
        self.assertFalse(record["stages"][-1]["artifact_verified"])
        self.assertFalse(record["stages"][-1]["production_deployment_occurred"])

    # --- schema-layer pins ---
    def test_schema_layer_rejects_an_id_without_the_sctm_prefix(self):
        record = _valid_record()
        record["id"] = "DPIA-1"
        with self.assertRaisesRegex(Exception, "SCTM-"):
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

    def test_schema_layer_rejects_a_process_stage_with_dependency_entries_key(self):
        record = _valid_record()
        record["stages"][0]["dependency_entries"] = []
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema process_stage additionalProperties")

    def test_schema_layer_rejects_considerations_missing_a_required_dimension(self):
        record = _valid_record()
        del record["stages"][1]["dependency_entries"][0]["considerations"]["license"]
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema dependency_considerations required")

    def test_schema_layer_rejects_considerations_with_an_unknown_dimension(self):
        record = _valid_record()
        record["stages"][1]["dependency_entries"][0]["considerations"]["owner"] = "someone"
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema dependency_considerations additionalProperties")

    def test_schema_layer_rejects_sign_verify_with_non_boolean_artifact_verified(self):
        record = _valid_record()
        record["stages"][6]["artifact_verified"] = "yes"
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema sign_verify_stage boolean type")

    # --- rebuild-not-alias ---
    def test_mutating_the_callers_own_inputs_after_construction_does_not_affect_the_stored_record(self):
        stages = _valid_stages()
        record = generate_supply_chain_threat_model_record("SCTM-T-010", "s", stages, _prov())
        stages[0]["summary"] = "mutated"
        stages[1]["dependency_entries"][0]["name"] = "mutated"
        stages[1]["dependency_entries"][0]["considerations"]["license"] = "mutated"
        stages[6]["summary"] = "mutated"
        self.assertEqual(record["stages"][0]["summary"], "s")
        self.assertEqual(record["stages"][1]["dependency_entries"][0]["name"], "a-dependency")
        self.assertEqual(record["stages"][1]["dependency_entries"][0]["considerations"]["license"], "MIT")
        self.assertEqual(record["stages"][6]["summary"], "s")

    def test_provenance_is_deliberately_aliased_not_rebuilt(self):
        provenance = _prov()
        record = generate_supply_chain_threat_model_record("SCTM-T-011", "s", _valid_stages(), provenance)
        provenance["epistemic_type"] = "AI_INFERENCE"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        self.assertIsNone(live.resolve([METHOD_ID])["blocked"])

    def test_empty_catalog_blocks_supply_chain_threat_model_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def _gate(self, record):
        return evaluate_supply_chain_threat_model_integrity_gate(record, "test", TS)

    def test_valid_record_passes_both_gates(self):
        results = evaluate_supply_chain_threat_model_gates(_valid_record(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "supply_chain_threat_model_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_release_record_passes_both_gates(self):
        self.assertTrue(all_gates_pass(evaluate_supply_chain_threat_model_gates(_release_record(), "test", TS)))

    def test_all_gates_pass_returns_false_when_a_gate_fails(self):
        record = _valid_record()
        record["id"] = ""
        self.assertFalse(all_gates_pass(evaluate_supply_chain_threat_model_gates(record, "test", TS)))

    def test_hand_tampered_empty_id_fails_the_gate(self):
        record = _valid_record()
        record["id"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "id missing, empty, or not prefixed 'SCTM-'")

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
        after construction must be caught by the gate's own fresh re-validation, not accepted because every
        individual stage still LOOKS well-formed."""
        record = _release_record()
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
        record["stages"].append(_sign_verify())
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_dependency_entries_emptied_fails_the_gate(self):
        record = _release_record()
        record["stages"][1]["dependency_entries"] = []
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_consideration_removed_fails_the_gate(self):
        """The core re-derived-not-trusted dependency-consideration-completeness invariant, at the gate
        layer: a copy's own consideration silently dropped must be caught."""
        record = _release_record()
        del record["stages"][1]["dependency_entries"][0]["considerations"]["vulnerability_history"]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_artifact_verified_flipped_to_false_after_deployment_fails_the_gate(self):
        """The core re-derived-not-trusted production-verified-artifact invariant, at the gate layer: a
        copy's own artifact_verified silently flipped to False while production_deployment_occurred stays
        True must be caught."""
        record = _release_record()
        record["stages"][6]["artifact_verified"] = False
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_gate_evidence_reports_accurate_counts_on_a_valid_record(self):
        gate = self._gate(_release_record())
        self.assertEqual(gate["evidence"][0], {"stage_count": 7, "dependency_count": 2})

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _release_record()
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
