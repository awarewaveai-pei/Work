"""Mutation-style tests for ``epistemic.assumption_mapping`` (1st of 2 F10 epistemic-family members built this
batch).

THE real invariant (`impact`/`uncertainty` are each a closed HIGH/LOW enum, `quadrant` is GENUINE_COMPUTE
mechanically derived from the pair and never caller-supplied) exercised at BOTH layers: construction-time
refusal (``generate_assumption_mapping`` raising a specific ``InvariantViolation`` code) and independent gate
re-derivation (``evaluate_assumption_mapping_integrity_gate`` catching a hand-tampered raw dict that bypassed
the builder entirely, never calling the builder itself). Schema conformance is checked against the real
spec-root schema this same batch added (``typed-objects/assumption-mapping.schema.yaml``).
"""

from __future__ import annotations

import copy
import inspect
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.epistemic.assumption_mapping import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    VALID_LEVELS,
    VALID_QUADRANTS,
    all_gates_pass,
    derive_quadrant,
    evaluate_assumption_mapping_gates,
    evaluate_assumption_mapping_integrity_gate,
    evaluate_provenance_required_gate,
    generate_assumption_mapping,
    mapped_assumption,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

ASSUMPTION_MAPPING_SCHEMA = "ai-lego://specs/cognitive/typed-objects/assumption-mapping.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _entries() -> list[dict]:
    return [
        mapped_assumption("ASM-1", "HIGH", "HIGH"),
        mapped_assumption("ASM-2", "LOW", "HIGH"),
    ]


def _kwargs(**overrides: object) -> dict:
    base = dict(mapped_assumptions=_entries(), provenance=PROVENANCE)
    base.update(overrides)
    return base


def _valid_mapping(*, record_id: str = "AMAP-T-001", **overrides: object):
    return generate_assumption_mapping(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_mapping_validates_against_the_real_schema(self):
        self.contracts.validate(ASSUMPTION_MAPPING_SCHEMA, _valid_mapping(), "assumption mapping")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, mapping = live.invoke(METHOD_ID, generate_assumption_mapping, "AMAP-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/epistemic.assumption_mapping.contract.yaml")
        self.assertEqual(mapping["id"], "AMAP-T-INVOKE")

    def test_empty_catalog_blocks_assumption_mapping_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        tampered = copy.deepcopy(_valid_mapping())
        tampered["mapped_assumptions"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(ASSUMPTION_MAPPING_SCHEMA, tampered, "tampered mapping")
        gate = evaluate_assumption_mapping_integrity_gate(tampered, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        mapping = _valid_mapping()
        mapping["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(ASSUMPTION_MAPPING_SCHEMA, mapping, "mapping with a smuggled top-level key")

    def test_schema_rejects_out_of_vocabulary_impact(self):
        mapping = _valid_mapping()
        mapping["mapped_assumptions"][0]["impact"] = "MEDIUM"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(ASSUMPTION_MAPPING_SCHEMA, mapping, "mapping with an invalid impact")

    def test_schema_rejects_out_of_vocabulary_quadrant(self):
        mapping = _valid_mapping()
        mapping["mapped_assumptions"][0]["quadrant"] = "URGENT"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(ASSUMPTION_MAPPING_SCHEMA, mapping, "mapping with an invalid quadrant")

    def test_schema_permits_a_quadrant_disagreeing_with_impact_and_uncertainty_the_gate_is_the_real_enforcer(self):
        """The schema's own enum check on `quadrant` cannot express the cross-field constraint (JSON Schema
        2020-12 has no sibling-field-dependent enum here) -- a quadrant that disagrees with its own
        impact/uncertainty but is still one of the 4 legal enum VALUES passes schema validation. This is exactly
        why `evaluate_assumption_mapping_integrity_gate` (see GateIndependenceTests) exists as the real, layered
        enforcement -- same limitation systems.leverage_point_analysis's own schema discloses for tier_rank."""
        mapping = _valid_mapping()
        mapping["mapped_assumptions"][0]["quadrant"] = "MONITOR"  # was VALIDATE_FIRST for HIGH/HIGH, still a legal enum value
        self.contracts.validate(ASSUMPTION_MAPPING_SCHEMA, mapping, "mapping with quadrant disagreeing with impact/uncertainty")

    def test_id_is_distinct_from_a_sibling_f10_machine_id(self):
        self.assertEqual(METHOD_ID, "epistemic.assumption_mapping")
        self.assertNotEqual(METHOD_ID, "epistemic.assumption_registry")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim true going forward, same live
        check every sibling contract's own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "epistemic.assumption_mapping.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "epistemic.assumption_mapping contract")


class QuadrantDerivationTests(unittest.TestCase):
    """GENUINE_COMPUTE: `quadrant` is a total mapping over the 4 (impact, uncertainty) combinations, never a
    builder parameter."""

    def test_all_four_combinations_produce_a_deterministic_quadrant(self):
        expected = {
            ("HIGH", "HIGH"): "VALIDATE_FIRST",
            ("HIGH", "LOW"): "KNOWN_CRITICAL",
            ("LOW", "LOW"): "MONITOR",
            ("LOW", "HIGH"): "CHEAP_TESTS",
        }
        for (impact, uncertainty), quadrant in expected.items():
            with self.subTest(impact=impact, uncertainty=uncertainty):
                self.assertEqual(derive_quadrant(impact, uncertainty), quadrant)

    def test_invalid_impact_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ASSUMPTIONMAPPING_INVALID_LEVEL"):
            derive_quadrant("MEDIUM", "HIGH")

    def test_invalid_uncertainty_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ASSUMPTIONMAPPING_INVALID_LEVEL"):
            derive_quadrant("HIGH", "MEDIUM")

    def test_builder_has_no_quadrant_parameter(self):
        """Verified via inspect.signature, not just by reading the source -- `quadrant` must never be an
        accepted constructor parameter anywhere in this method's own public surface."""
        self.assertNotIn("quadrant", inspect.signature(generate_assumption_mapping).parameters)

    def test_mapped_assumption_convenience_constructor_has_no_quadrant_parameter(self):
        self.assertNotIn("quadrant", inspect.signature(mapped_assumption).parameters)

    def test_stored_entry_quadrant_matches_its_own_impact_and_uncertainty(self):
        mapping = _valid_mapping()
        for entry in mapping["mapped_assumptions"]:
            self.assertEqual(entry["quadrant"], derive_quadrant(entry["impact"], entry["uncertainty"]))
        asm1 = next(e for e in mapping["mapped_assumptions"] if e["assumption_id"] == "ASM-1")
        self.assertEqual(asm1["quadrant"], "VALIDATE_FIRST")  # HIGH/HIGH
        asm2 = next(e for e in mapping["mapped_assumptions"] if e["assumption_id"] == "ASM-2")
        self.assertEqual(asm2["quadrant"], "CHEAP_TESTS")  # LOW/HIGH

    def test_caller_supplied_quadrant_key_on_a_hand_built_entry_dict_is_refused(self):
        """A hand-crafted dict smuggling a `quadrant` key past `mapped_assumption()` must still be refused by
        the builder's own input-shape check (exactly the input keys, no more)."""
        bad_entries = _entries()
        bad_entries[0] = {**bad_entries[0], "quadrant": "VALIDATE_FIRST"}
        with self.assertRaisesRegex(InvariantViolation, "ASSUMPTIONMAPPING_INVALID_ENTRY"):
            _valid_mapping(mapped_assumptions=bad_entries)


class MappedAssumptionsTests(unittest.TestCase):
    def test_empty_mapped_assumptions_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ASSUMPTIONMAPPING_EMPTY_ENTRIES"):
            _valid_mapping(mapped_assumptions=[])

    def test_non_list_mapped_assumptions_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ASSUMPTIONMAPPING_EMPTY_ENTRIES"):
            _valid_mapping(mapped_assumptions="not-a-list")

    def test_invalid_assumption_id_format_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ASSUMPTIONMAPPING_INVALID_ASSUMPTION_ID"):
            mapped_assumption("NOT-AN-ASM-ID", "HIGH", "HIGH")

    def test_out_of_vocabulary_impact_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ASSUMPTIONMAPPING_INVALID_LEVEL"):
            mapped_assumption("ASM-9", "MEDIUM", "HIGH")

    def test_duplicate_assumption_id_is_refused(self):
        bad_entries = _entries()
        bad_entries[1] = {**bad_entries[1], "assumption_id": bad_entries[0]["assumption_id"]}
        with self.assertRaisesRegex(InvariantViolation, "ASSUMPTIONMAPPING_DUPLICATE_ASSUMPTION_ID"):
            _valid_mapping(mapped_assumptions=bad_entries)

    def test_single_mapped_assumption_is_accepted(self):
        mapping = _valid_mapping(mapped_assumptions=[_entries()[0]])
        self.assertEqual(len(mapping["mapped_assumptions"]), 1)

    def test_all_four_quadrants_are_accepted_in_one_mapping(self):
        entries = [
            mapped_assumption("ASM-1", "HIGH", "HIGH"),
            mapped_assumption("ASM-2", "HIGH", "LOW"),
            mapped_assumption("ASM-3", "LOW", "LOW"),
            mapped_assumption("ASM-4", "LOW", "HIGH"),
        ]
        mapping = _valid_mapping(mapped_assumptions=entries)
        self.assertEqual({e["quadrant"] for e in mapping["mapped_assumptions"]}, VALID_QUADRANTS)


class IdAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "AMAP-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ASSUMPTIONMAPPING_INVALID_ID"):
            _valid_mapping(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ASSUMPTIONMAPPING_INVALID_ID"):
            _valid_mapping(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ASSUMPTIONMAPPING_INVALID_VERSION"):
            generate_assumption_mapping("AMAP-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ASSUMPTIONMAPPING_INVALID_PROVENANCE"):
            _valid_mapping(provenance={"epistemic_type": "NOT_REAL"})


class ConvenienceConstructorTests(unittest.TestCase):
    def test_mapped_assumption_builds_a_well_formed_input_entry(self):
        entry = mapped_assumption("ASM-10", "HIGH", "LOW")
        self.assertEqual(entry, {"assumption_id": "ASM-10", "impact": "HIGH", "uncertainty": "LOW"})

    def test_mapped_assumption_rejects_malformed_assumption_id(self):
        with self.assertRaisesRegex(InvariantViolation, "ASSUMPTIONMAPPING_INVALID_ASSUMPTION_ID"):
            mapped_assumption("ASM-", "HIGH", "LOW")

    def test_mapped_assumption_rejects_invalid_uncertainty(self):
        with self.assertRaisesRegex(InvariantViolation, "ASSUMPTIONMAPPING_INVALID_LEVEL"):
            mapped_assumption("ASM-10", "HIGH", "MEDIUM")


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID mapping's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_mapping(self):
        results = evaluate_assumption_mapping_gates(_valid_mapping(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_integrity_gate_catches_hand_tampered_quadrant(self):
        """The exact scenario the task brief prescribes: a hand-tampered record (bypassing the builder to splice
        in a wrong quadrant) must be caught by the independent gate, not just the builder."""
        record = copy.deepcopy(_valid_mapping())
        record["mapped_assumptions"][0]["quadrant"] = "MONITOR"  # was VALIDATE_FIRST for HIGH/HIGH
        gate = evaluate_assumption_mapping_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_assumption_mapping_integrity_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_mapping())
        record["id"] = "WRONG-001"
        gate = evaluate_assumption_mapping_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_mapping())
        record["version"] = 1
        gate = evaluate_assumption_mapping_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_duplicate_assumption_id(self):
        record = copy.deepcopy(_valid_mapping())
        record["mapped_assumptions"][1]["assumption_id"] = record["mapped_assumptions"][0]["assumption_id"]
        gate = evaluate_assumption_mapping_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_empty_mapped_assumptions(self):
        record = copy.deepcopy(_valid_mapping())
        record["mapped_assumptions"] = []
        gate = evaluate_assumption_mapping_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_smuggled_quadrant_key_via_extra_key_shape_check(self):
        """A hand-tampered STORED entry carrying an extra key beyond the closed stored-key set must also fail
        the exact-key-set shape check, independent of whether the quadrant value itself happens to agree."""
        record = copy.deepcopy(_valid_mapping())
        record["mapped_assumptions"][0]["extra_field"] = "smuggled"
        gate = evaluate_assumption_mapping_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_mapping(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_mapping())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class AliasingTests(unittest.TestCase):
    def test_builder_does_not_alias_the_callers_supplied_entry_dicts(self):
        entries = _entries()
        mapping = _valid_mapping(mapped_assumptions=entries)
        entries[0]["assumption_id"] = "ASM-TAMPERED"
        self.assertNotEqual(mapping["mapped_assumptions"][0]["assumption_id"], "ASM-TAMPERED")

    def test_mutating_the_callers_input_list_after_construction_does_not_affect_the_record(self):
        """2026-09-04 F09 critic-pass lesson: the RETURNED record's own top-level list must not be the same list
        object as the caller's input -- mutating the caller's list after construction must not silently change
        the already-returned record."""
        entries = _entries()
        mapping = _valid_mapping(mapped_assumptions=entries)
        original_length = len(mapping["mapped_assumptions"])
        entries.append(mapped_assumption("ASM-99", "LOW", "LOW"))
        self.assertEqual(len(mapping["mapped_assumptions"]), original_length)


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_assumption_mapping_gates_returns_two_gates_in_order(self):
        results = evaluate_assumption_mapping_gates(_valid_mapping(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "assumption_mapping_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "epistemic.assumption_mapping")

    def test_valid_levels_constant(self):
        self.assertEqual(VALID_LEVELS, frozenset({"HIGH", "LOW"}))

    def test_valid_quadrants_constant(self):
        self.assertEqual(VALID_QUADRANTS, frozenset({"VALIDATE_FIRST", "KNOWN_CRITICAL", "MONITOR", "CHEAP_TESTS"}))

    def test_builder_does_not_leak_extra_top_level_keys(self):
        mapping = _valid_mapping()
        self.assertEqual(set(mapping.keys()), {"id", "version", "generated_by_method", "mapped_assumptions", "provenance"})


if __name__ == "__main__":
    unittest.main()
