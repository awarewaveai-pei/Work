"""Mutation-style tests for ``systems.systems_archetypes`` (F09 systems-thinking family, 1 of 2 members this
agent opens in a parallel batch alongside ``systems.rich_picture``).

Two real invariants beyond id/version/context/provenance shape (closed archetype-name vocabulary, evidence
minimum), exercised at BOTH layers: construction-time refusal (``generate_systems_archetype_match_set``
raising a specific ``InvariantViolation`` code) and independent gate re-derivation
(``evaluate_systems_archetypes_integrity_gate`` catching a hand-tampered raw dict that bypassed the builder
entirely, never calling the builder itself). Schema conformance is checked against the real spec-root schema
this same slice added (``typed-objects/systems-archetype-match.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.systems.systems_archetypes import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    VALID_ARCHETYPES,
    all_gates_pass,
    archetype_match,
    evaluate_provenance_required_gate,
    evaluate_systems_archetypes_gates,
    evaluate_systems_archetypes_integrity_gate,
    generate_systems_archetype_match_set,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

SYSTEMS_ARCHETYPE_MATCH_SCHEMA = "ai-lego://specs/cognitive/typed-objects/systems-archetype-match.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _matches() -> list[dict]:
    return [
        archetype_match("M1", "LIMITS_TO_GROWTH", ["新用戶成長率連續三季下滑", "客服回應時間隨用戶數增加而惡化"], "增強迴路撞上抑制迴路"),
    ]


def _kwargs(**overrides: object) -> dict:
    base = dict(context="SaaS 新創的成長與客服品質衝突分析", archetype_matches=_matches(), provenance=PROVENANCE)
    base.update(overrides)
    return base


def _valid_record(*, record_id: str = "ARCH-T-001", **overrides: object):
    return generate_systems_archetype_match_set(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(SYSTEMS_ARCHETYPE_MATCH_SCHEMA, _valid_record(), "systems archetype match set")

    def test_zero_matches_is_legal_a_scan_may_find_no_known_archetype(self):
        record = generate_systems_archetype_match_set("ARCH-T-002", "context", [], PROVENANCE)
        self.contracts.validate(SYSTEMS_ARCHETYPE_MATCH_SCHEMA, record, "clean-scan record")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, record = live.invoke(METHOD_ID, generate_systems_archetype_match_set, "ARCH-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/systems.systems_archetypes.contract.yaml")
        self.assertEqual(record["id"], "ARCH-T-INVOKE")

    def test_empty_catalog_blocks_systems_archetypes_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SYSTEMS_ARCHETYPE_MATCH_SCHEMA, record, "record with a smuggled top-level key")

    def test_schema_rejects_unknown_key_on_a_match(self):
        record = _valid_record()
        record["archetype_matches"][0]["confidence"] = "high"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SYSTEMS_ARCHETYPE_MATCH_SCHEMA, record, "record with a smuggled match key")

    def test_schema_rejects_an_unrecognized_archetype_name(self):
        record = _valid_record()
        record["archetype_matches"][0]["archetype_name"] = "GROUPTHINK"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SYSTEMS_ARCHETYPE_MATCH_SCHEMA, record, "record with an unrecognized archetype_name")

    def test_schema_rejects_empty_observed_symptoms(self):
        record = _valid_record()
        record["archetype_matches"][0]["observed_symptoms"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SYSTEMS_ARCHETYPE_MATCH_SCHEMA, record, "record with empty observed_symptoms")

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_record())
        tampered["archetype_matches"][0]["observed_symptoms"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SYSTEMS_ARCHETYPE_MATCH_SCHEMA, tampered, "tampered record")
        gate = evaluate_systems_archetypes_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_id_is_distinct_from_a_sibling_f09_machine_id(self):
        self.assertEqual(METHOD_ID, "systems.systems_archetypes")
        self.assertNotEqual(METHOD_ID, "systems.rich_picture")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "systems.systems_archetypes.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "systems.systems_archetypes contract")


class ClosedVocabularyTests(unittest.TestCase):
    """Invariant #1 (module docstring): every archetype_matches[].archetype_name must be a member of the
    closed 10-value vocabulary."""

    def test_all_ten_archetype_names_are_individually_accepted(self):
        for name in sorted(VALID_ARCHETYPES):
            with self.subTest(archetype_name=name):
                record = _valid_record(record_id=f"ARCH-T-{name}", archetype_matches=[archetype_match("M1", name, ["symptom"], "desc")])
                self.assertEqual(record["archetype_matches"][0]["archetype_name"], name)

    def test_exactly_ten_archetypes_in_the_closed_vocabulary(self):
        self.assertEqual(len(VALID_ARCHETYPES), 10)

    def test_unrecognized_archetype_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYSARCH_INVALID_ARCHETYPE_NAME"):
            _valid_record(archetype_matches=[archetype_match("M1", "GROUPTHINK", ["x"], "not real")])

    def test_lowercase_variant_of_a_real_archetype_is_refused(self):
        """Case-sensitivity is part of the closed vocabulary, not a normalization convenience."""
        with self.assertRaisesRegex(InvariantViolation, "SYSARCH_INVALID_ARCHETYPE_NAME"):
            _valid_record(archetype_matches=[archetype_match("M1", "limits_to_growth", ["x"], "wrong case")])

    def test_gate_catches_hand_tampered_unrecognized_archetype_name(self):
        record = copy.deepcopy(_valid_record())
        record["archetype_matches"][0]["archetype_name"] = "GROUPTHINK"
        gate = evaluate_systems_archetypes_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class EvidenceMinimumTests(unittest.TestCase):
    """Invariant #2 (module docstring): every archetype_matches[] entry must cite >=1 non-empty
    observed_symptoms entry."""

    def test_well_formed_match_is_accepted(self):
        record = _valid_record()
        self.assertEqual(len(record["archetype_matches"][0]["observed_symptoms"]), 2)

    def test_zero_observed_symptoms_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYSARCH_MATCH_NO_OBSERVED_SYMPTOMS"):
            _valid_record(archetype_matches=[archetype_match("M1", "ESCALATION", [], "unevidenced")])

    def test_whitespace_only_observed_symptom_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYSARCH_MATCH_NO_OBSERVED_SYMPTOMS"):
            _valid_record(archetype_matches=[archetype_match("M1", "ESCALATION", ["   "], "whitespace only")])

    def test_non_list_observed_symptoms_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYSARCH_MATCH_NO_OBSERVED_SYMPTOMS"):
            _valid_record(archetype_matches=[{"id": "M1", "archetype_name": "ESCALATION", "observed_symptoms": "not-a-list", "description": "x"}])

    def test_gate_catches_hand_tampered_empty_observed_symptoms(self):
        record = copy.deepcopy(_valid_record())
        record["archetype_matches"][0]["observed_symptoms"] = []
        gate = evaluate_systems_archetypes_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ArchetypeMatchesShapeAndUniquenessTests(unittest.TestCase):
    def test_empty_archetype_matches_is_accepted_a_clean_scan(self):
        record = _valid_record(archetype_matches=[])
        self.assertEqual(record["archetype_matches"], [])

    def test_duplicate_match_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYSARCH_DUPLICATE_MATCH_ID"):
            _valid_record(archetype_matches=[archetype_match("M1", "ESCALATION", ["x"], "a"), archetype_match("M1", "DRIFTING_GOALS", ["y"], "b")])

    def test_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYSARCH_INVALID_ARCHETYPE_MATCHES"):
            _valid_record(archetype_matches=[{"id": "M1", "archetype_name": "ESCALATION", "observed_symptoms": ["x"], "description": ""}])

    def test_non_list_archetype_matches_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYSARCH_INVALID_ARCHETYPE_MATCHES"):
            _valid_record(archetype_matches="not-a-list")

    def test_whitespace_padded_match_id_is_refused_at_the_shape_boundary(self):
        with self.assertRaisesRegex(InvariantViolation, "SYSARCH_INVALID_ARCHETYPE_MATCHES"):
            _valid_record(archetype_matches=[archetype_match("M1 ", "ESCALATION", ["x"], "padded id")])

    def test_gate_catches_hand_tampered_duplicate_match_id(self):
        record = copy.deepcopy(_valid_record(archetype_matches=[archetype_match("M1", "ESCALATION", ["x"], "a"), archetype_match("M2", "DRIFTING_GOALS", ["y"], "b")]))
        record["archetype_matches"][1]["id"] = "M1"
        gate = evaluate_systems_archetypes_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class IdContextAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "ARCH-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYSARCH_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYSARCH_INVALID_ID"):
            _valid_record(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYSARCH_INVALID_VERSION"):
            generate_systems_archetype_match_set("ARCH-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_empty_context_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYSARCH_EMPTY_CONTEXT"):
            _valid_record(context="   ")

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYSARCH_INVALID_PROVENANCE"):
            _valid_record(provenance={"epistemic_type": "NOT_REAL"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_record(self):
        results = evaluate_systems_archetypes_gates(_valid_record(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_content_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_systems_archetypes_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_systems_archetypes_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_record())
        record["version"] = 1
        gate = evaluate_systems_archetypes_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_empty_context(self):
        record = copy.deepcopy(_valid_record())
        record["context"] = ""
        gate = evaluate_systems_archetypes_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_record(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_systems_archetypes_gates_returns_two_gates_in_order(self):
        results = evaluate_systems_archetypes_gates(_valid_record(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "systems_archetypes_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "systems.systems_archetypes")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        record = _valid_record()
        self.assertEqual(set(record.keys()), {"id", "version", "generated_by_method", "context", "archetype_matches", "provenance"})

    def test_archetype_match_helper_shape(self):
        match = archetype_match("M9", "ESCALATION", ["s1"], "desc")
        self.assertEqual(set(match.keys()), {"id", "archetype_name", "observed_symptoms", "description"})


if __name__ == "__main__":
    unittest.main()
