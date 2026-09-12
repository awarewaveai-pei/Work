"""Mutation-style tests for ``epistemic.assumption_registry`` (2nd of 2 F10 epistemic-family members built this
batch).

THE real invariant (``is_critical_assumption`` is GENUINE_COMPUTE, mechanically derived from
``impact_if_wrong == "Critical"`` and never caller-supplied) plus the second independent invariant (a validated
status requires a non-empty ``validation`` field), exercised at BOTH layers: construction-time refusal
(``generate_assumption_registry``/``assumption_entry`` raising a specific ``InvariantViolation`` code) and
independent gate re-derivation (``evaluate_registry_integrity_gate`` catching a hand-tampered raw dict that
bypassed the builder entirely, never calling the builder itself). Schema conformance is checked against the
real spec-root schema this same batch added (``typed-objects/assumption-registry.schema.yaml``), which composes
(``$ref``, never redefines) ``specs/evidence/assumption.schema.yaml``.
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
from ai_lego.modules.epistemic.assumption_registry import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    VALIDATED_STATUS_TOKENS,
    all_gates_pass,
    assumption_entry,
    derive_is_critical_assumption,
    evaluate_provenance_required_gate,
    evaluate_registry_integrity_gate,
    evaluate_assumption_registry_gates,
    generate_assumption_registry,
    is_status_asserting_validated,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

ASSUMPTION_REGISTRY_SCHEMA = "ai-lego://specs/cognitive/typed-objects/assumption-registry.schema.yaml"
ASSUMPTION_PROVENANCE = make_provenance("ASSUMPTION", "AI_GENERATED")
REGISTRY_PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _entries() -> list[dict]:
    return [
        assumption_entry("ASM-1", "大學願意採用外部 AI 教育平台", "Validated", ASSUMPTION_PROVENANCE, impact_if_wrong="Critical", validation="Interview 30 universities"),
        assumption_entry("ASM-2", "現有 IT 團隊有能力自行維運新平台", "Unverified", ASSUMPTION_PROVENANCE, impact_if_wrong="Moderate"),
    ]


def _kwargs(**overrides: object) -> dict:
    base = dict(entries=_entries(), provenance=REGISTRY_PROVENANCE)
    base.update(overrides)
    return base


def _valid_registry(*, record_id: str = "AREG-T-001", **overrides: object):
    return generate_assumption_registry(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_registry_validates_against_the_real_schema(self):
        self.contracts.validate(ASSUMPTION_REGISTRY_SCHEMA, _valid_registry(), "assumption registry")

    def test_entries_validate_against_the_real_composed_assumption_schema(self):
        """Real internal consistency: each entries[] item must independently satisfy
        specs/evidence/assumption.schema.yaml -- proves the $ref composition is real, not just a same-shaped
        coincidence."""
        registry = _valid_registry()
        for entry in registry["entries"]:
            self.contracts.validate("ai-lego://specs/evidence/assumption.schema.yaml", entry, f"entry {entry['id']}")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, registry = live.invoke(METHOD_ID, generate_assumption_registry, "AREG-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/epistemic.assumption_registry.contract.yaml")
        self.assertEqual(registry["id"], "AREG-T-INVOKE")

    def test_empty_catalog_blocks_assumption_registry_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        tampered = copy.deepcopy(_valid_registry())
        tampered["entries"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(ASSUMPTION_REGISTRY_SCHEMA, tampered, "tampered registry")
        gate = evaluate_registry_integrity_gate(tampered, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_a_malformed_entry_missing_required_assumption_fields(self):
        registry = _valid_registry()
        del registry["entries"][0]["statement"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(ASSUMPTION_REGISTRY_SCHEMA, registry, "registry with an entry missing statement")

    def test_schema_permits_is_critical_assumption_disagreeing_with_impact_if_wrong_the_gate_is_the_real_enforcer(self):
        """assumption.schema.yaml's own is_critical_assumption field is untyped boolean/null with no cross-field
        constraint against impact_if_wrong -- the schema alone cannot catch a disagreement. This is exactly why
        evaluate_registry_integrity_gate (see GateIndependenceTests) exists as the real, layered enforcement."""
        registry = _valid_registry()
        registry["entries"][1]["is_critical_assumption"] = True  # ASM-2 is Moderate, not Critical
        self.contracts.validate(ASSUMPTION_REGISTRY_SCHEMA, registry, "registry with a disagreeing is_critical_assumption")

    def test_id_is_distinct_from_a_sibling_f10_machine_id(self):
        self.assertEqual(METHOD_ID, "epistemic.assumption_registry")
        self.assertNotEqual(METHOD_ID, "epistemic.assumption_mapping")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim true going forward, same live
        check every sibling contract's own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "epistemic.assumption_registry.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "epistemic.assumption_registry contract")


class CriticalAssumptionDerivationTests(unittest.TestCase):
    """GENUINE_COMPUTE: `is_critical_assumption` is a total function of `impact_if_wrong`, never a builder
    parameter."""

    def test_critical_impact_value_produces_true(self):
        self.assertTrue(derive_is_critical_assumption("Critical"))

    def test_non_critical_impact_values_produce_false(self):
        for value in ("Moderate", "Low", "critical", "CRITICAL", None, ""):
            with self.subTest(value=value):
                self.assertFalse(derive_is_critical_assumption(value))

    def test_builder_has_no_is_critical_assumption_parameter(self):
        """Verified via inspect.signature, not just by reading the source -- `is_critical_assumption` must never
        be an accepted constructor parameter anywhere in this method's own public surface."""
        self.assertNotIn("is_critical_assumption", inspect.signature(generate_assumption_registry).parameters)

    def test_assumption_entry_convenience_constructor_has_no_is_critical_assumption_parameter(self):
        self.assertNotIn("is_critical_assumption", inspect.signature(assumption_entry).parameters)

    def test_stored_entry_flag_matches_its_own_impact_if_wrong(self):
        registry = _valid_registry()
        for entry in registry["entries"]:
            self.assertEqual(entry["is_critical_assumption"], derive_is_critical_assumption(entry.get("impact_if_wrong")))
        asm1 = next(e for e in registry["entries"] if e["id"] == "ASM-1")
        self.assertTrue(asm1["is_critical_assumption"])  # Critical
        asm2 = next(e for e in registry["entries"] if e["id"] == "ASM-2")
        self.assertFalse(asm2["is_critical_assumption"])  # Moderate

    def test_caller_supplied_is_critical_assumption_key_on_a_hand_built_entry_dict_is_refused(self):
        """A hand-crafted dict smuggling an `is_critical_assumption` key past `assumption_entry()` must still be
        refused by the builder's own allowed-key-set check."""
        bad_entries = _entries()
        bad_entries[0] = {**bad_entries[0], "is_critical_assumption": True}
        with self.assertRaisesRegex(InvariantViolation, "ASSUMPTIONREGISTRY_INVALID_ENTRY"):
            _valid_registry(entries=bad_entries)

    def test_entry_missing_impact_if_wrong_computes_not_critical(self):
        entry = assumption_entry("ASM-5", "陳述", "Unverified", ASSUMPTION_PROVENANCE)
        self.assertNotIn("impact_if_wrong", entry)
        registry = _valid_registry(entries=[entry])
        self.assertFalse(registry["entries"][0]["is_critical_assumption"])


class ValidatedStatusRequiresValidationTests(unittest.TestCase):
    """(c) An entry whose status asserts validation must carry a non-empty validation field."""

    def test_is_status_asserting_validated_matches_case_insensitively(self):
        for status in ("Validated", "validated", "VALIDATED", "Verified", "verified", "  Validated  "):
            with self.subTest(status=status):
                self.assertTrue(is_status_asserting_validated(status))

    def test_is_status_asserting_validated_does_not_false_positive_on_invalidated_or_unverified(self):
        """Regression guard: 'Invalidated' contains 'validated' as a substring -- exact-token matching (not
        substring) must not treat it as an affirmative validation claim."""
        for status in ("Invalidated", "Unverified", "Pending", ""):
            with self.subTest(status=status):
                self.assertFalse(is_status_asserting_validated(status))

    def test_is_status_asserting_validated_false_on_non_string(self):
        for status in (None, 42, [], {}):
            with self.subTest(status=status):
                self.assertFalse(is_status_asserting_validated(status))

    def test_validated_status_constant(self):
        self.assertEqual(VALIDATED_STATUS_TOKENS, frozenset({"validated", "verified"}))

    def test_assumption_entry_refuses_validated_status_with_no_validation(self):
        with self.assertRaisesRegex(InvariantViolation, "ASSUMPTIONREGISTRY_VALIDATED_STATUS_REQUIRES_VALIDATION"):
            assumption_entry("ASM-9", "陳述", "Validated", ASSUMPTION_PROVENANCE)

    def test_assumption_entry_refuses_validated_status_with_empty_string_validation(self):
        with self.assertRaisesRegex(InvariantViolation, "ASSUMPTIONREGISTRY_VALIDATED_STATUS_REQUIRES_VALIDATION"):
            assumption_entry("ASM-9", "陳述", "Verified", ASSUMPTION_PROVENANCE, validation="   ")

    def test_assumption_entry_accepts_validated_status_with_real_validation(self):
        entry = assumption_entry("ASM-9", "陳述", "Validated", ASSUMPTION_PROVENANCE, validation="Interview 5 users")
        self.assertEqual(entry["validation"], "Interview 5 users")

    def test_assumption_entry_accepts_unverified_status_with_no_validation(self):
        entry = assumption_entry("ASM-9", "陳述", "Unverified", ASSUMPTION_PROVENANCE)
        self.assertNotIn("validation", entry)

    def test_hand_crafted_entry_smuggling_a_validated_status_past_the_convenience_constructor_is_refused_by_the_builder(self):
        bad_entries = _entries()
        bad_entries[1] = {**bad_entries[1], "status": "Validated"}  # ASM-2 has no validation field
        with self.assertRaisesRegex(InvariantViolation, "ASSUMPTIONREGISTRY_INVALID_ENTRY"):
            _valid_registry(entries=bad_entries)


class EntriesTests(unittest.TestCase):
    def test_empty_entries_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ASSUMPTIONREGISTRY_EMPTY_ENTRIES"):
            _valid_registry(entries=[])

    def test_non_list_entries_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ASSUMPTIONREGISTRY_EMPTY_ENTRIES"):
            _valid_registry(entries="not-a-list")

    def test_invalid_entry_id_format_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ASSUMPTIONREGISTRY_INVALID_ENTRY_ID"):
            assumption_entry("NOT-AN-ASM-ID", "陳述", "Unverified", ASSUMPTION_PROVENANCE)

    def test_empty_statement_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ASSUMPTIONREGISTRY_INVALID_ENTRY_FIELD"):
            assumption_entry("ASM-9", "   ", "Unverified", ASSUMPTION_PROVENANCE)

    def test_empty_status_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ASSUMPTIONREGISTRY_INVALID_ENTRY_FIELD"):
            assumption_entry("ASM-9", "陳述", "", ASSUMPTION_PROVENANCE)

    def test_entry_provenance_not_pinned_to_assumption_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ASSUMPTIONREGISTRY_INVALID_ENTRY_PROVENANCE"):
            assumption_entry("ASM-9", "陳述", "Unverified", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_duplicate_entry_id_is_refused(self):
        bad_entries = _entries()
        bad_entries[1] = {**bad_entries[1], "id": bad_entries[0]["id"]}
        with self.assertRaisesRegex(InvariantViolation, "ASSUMPTIONREGISTRY_DUPLICATE_ENTRY_ID"):
            _valid_registry(entries=bad_entries)

    def test_single_entry_is_accepted(self):
        registry = _valid_registry(entries=[_entries()[0]])
        self.assertEqual(len(registry["entries"]), 1)


class IdAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "AREG-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ASSUMPTIONREGISTRY_INVALID_ID"):
            _valid_registry(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ASSUMPTIONREGISTRY_INVALID_ID"):
            _valid_registry(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ASSUMPTIONREGISTRY_INVALID_VERSION"):
            generate_assumption_registry("AREG-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_registry_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ASSUMPTIONREGISTRY_INVALID_PROVENANCE"):
            _valid_registry(provenance={"epistemic_type": "NOT_REAL"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID registry's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_registry(self):
        results = evaluate_assumption_registry_gates(_valid_registry(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_integrity_gate_catches_hand_tampered_critical_flag(self):
        """The exact scenario the task brief prescribes: a hand-tampered record (bypassing the builder to splice
        in a wrong is_critical_assumption) must be caught by the independent gate, not just the builder."""
        record = copy.deepcopy(_valid_registry())
        record["entries"][1]["is_critical_assumption"] = True  # ASM-2 is Moderate, not Critical
        gate = evaluate_registry_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_hand_tampered_validated_status_with_no_validation(self):
        record = copy.deepcopy(_valid_registry())
        record["entries"][1]["status"] = "Validated"  # ASM-2 carries no validation field
        gate = evaluate_registry_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_registry_integrity_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_registry())
        record["id"] = "WRONG-001"
        gate = evaluate_registry_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_registry())
        record["version"] = 1
        gate = evaluate_registry_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_duplicate_entry_id(self):
        record = copy.deepcopy(_valid_registry())
        record["entries"][1]["id"] = record["entries"][0]["id"]
        gate = evaluate_registry_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_empty_entries(self):
        record = copy.deepcopy(_valid_registry())
        record["entries"] = []
        gate = evaluate_registry_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_smuggled_extra_key_via_allowed_key_shape_check(self):
        record = copy.deepcopy(_valid_registry())
        record["entries"][0]["extra_field"] = "smuggled"
        gate = evaluate_registry_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_registry(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_registry_level_provenance_invalid(self):
        record = copy.deepcopy(_valid_registry())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_when_entry_provenance_not_pinned_to_assumption(self):
        record = copy.deepcopy(_valid_registry())
        record["entries"][0]["provenance"] = {"epistemic_type": "AI_INFERENCE", "authorship_state": "AI_GENERATED", "locked": None}
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class AliasingTests(unittest.TestCase):
    def test_builder_does_not_alias_the_callers_supplied_entry_dicts(self):
        entries = _entries()
        registry = _valid_registry(entries=entries)
        entries[0]["statement"] = "tampered-after-construction"
        self.assertNotEqual(registry["entries"][0]["statement"], "tampered-after-construction")

    def test_mutating_the_callers_input_list_after_construction_does_not_affect_the_record(self):
        entries = _entries()
        registry = _valid_registry(entries=entries)
        original_length = len(registry["entries"])
        entries.append(assumption_entry("ASM-99", "陳述", "Unverified", ASSUMPTION_PROVENANCE))
        self.assertEqual(len(registry["entries"]), original_length)

    def test_builder_does_not_alias_a_callers_nested_evidence_list(self):
        """F09 critic-pass nested-list-aliasing lesson: mutating the caller's own nested `evidence`
        list after construction must NOT change the already-returned record's own copy."""
        evidence_items = [{"evidence_id": "E-1", "provenance": {"epistemic_type": "EVIDENCE", "authorship_state": "AI_GENERATED", "locked": None}}]
        entry = assumption_entry("ASM-7", "陳述", "Unverified", ASSUMPTION_PROVENANCE, evidence=evidence_items)
        registry = _valid_registry(entries=[entry])
        evidence_items[0]["evidence_id"] = "E-TAMPERED"
        entry["evidence"][0]["evidence_id"] = "E-TAMPERED-VIA-INPUT-ENTRY"
        self.assertEqual(registry["entries"][0]["evidence"][0]["evidence_id"], "E-1")

    def test_builder_does_not_alias_an_evidence_items_own_nested_object(self):
        """The scalar-only version of this test above passes even against a one-level-too-shallow copy, which
        is how a real aliasing defect survived to a 2026-09-12 critic pass: an evidence item's own
        `quality_assessment` (an object per evidence.schema.yaml) stayed shared, so a caller could rewrite a
        stored record's evidence quality after construction with every gate still reporting PASS. Asserts
        object identity too, so this cannot silently regress to a shallow copy again."""
        quality = {"sample": "n=30", "method_quality": "peer-reviewed"}
        evidence_items = [{
            "evidence_id": "E-1",
            "provenance": {"epistemic_type": "EVIDENCE", "authorship_state": "AI_GENERATED", "locked": None},
            "quality_assessment": quality,
        }]
        entry = assumption_entry("ASM-8", "陳述", "Unverified", ASSUMPTION_PROVENANCE, evidence=evidence_items)
        registry = _valid_registry(entries=[entry])
        stored_quality = registry["entries"][0]["evidence"][0]["quality_assessment"]
        self.assertIsNot(stored_quality, quality)
        quality["method_quality"] = "FABRICATED"
        self.assertEqual(stored_quality["method_quality"], "peer-reviewed")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_assumption_registry_gates_returns_two_gates_in_order(self):
        results = evaluate_assumption_registry_gates(_valid_registry(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "registry_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "epistemic.assumption_registry")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        registry = _valid_registry()
        self.assertEqual(set(registry.keys()), {"id", "version", "generated_by_method", "entries", "provenance"})


if __name__ == "__main__":
    unittest.main()
