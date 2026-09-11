"""Mutation-style tests for ``insight.empathy_map`` (F06 human/customer-insight family, 3rd member built).

Three real invariants beyond per-field shape (4-quadrant completeness floor, per-entry basis label, top-level
subject), exercised at BOTH layers: construction-time refusal (``generate_empathy_map`` raising a specific
``InvariantViolation`` code) and independent gate re-derivation (``evaluate_empathy_map_integrity_gate``
catching a hand-tampered raw dict that bypassed the builder entirely, never calling the builder itself).
Schema conformance is checked against the real spec-root schema this same slice added
(``typed-objects/empathy-map.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.insight.empathy_map import (
    DOES,
    FACT,
    FEELS,
    INFERENCE,
    METHOD_ID,
    QUADRANT_NAMES,
    RECORD_ID_PREFIX,
    SAYS,
    THINKS,
    VALID_BASES,
    all_gates_pass,
    entry,
    evaluate_empathy_map_gates,
    evaluate_empathy_map_integrity_gate,
    evaluate_provenance_required_gate,
    generate_empathy_map,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

EMPATHY_MAP_SCHEMA = "ai-lego://specs/cognitive/typed-objects/empathy-map.schema.yaml"
SUBJECT = "small-studio owner evaluating a new invoicing tool"


def _entries(**overrides: dict) -> list[dict]:
    base = {
        "says": dict(quadrant=SAYS, content="the current invoicing process is too much manual re-entry", basis=FACT),
        "thinks": dict(quadrant=THINKS, content="may worry switching tools loses reconciliation history", basis=INFERENCE),
        "does": dict(quadrant=DOES, content="observed copying the last quote and editing the amount by hand", basis=FACT),
        "feels": dict(quadrant=FEELS, content="visibly relaxed once shown the automation demo", basis=INFERENCE),
    }
    base.update(overrides)
    return [entry(v["quadrant"], v["content"], v["basis"]) for v in base.values()]


def _valid_map(
    *,
    map_id: str = "EMPATHY-T-001",
    subject: str = SUBJECT,
    entries: list[dict] | None = None,
):
    return generate_empathy_map(
        map_id,
        subject,
        entries if entries is not None else _entries(),
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_map_validates_against_the_real_schema(self):
        self.contracts.validate(EMPATHY_MAP_SCHEMA, _valid_map(), "empathy map")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, empathy_map = live.invoke(
            METHOD_ID, generate_empathy_map, "EMPATHY-T-INVOKE", SUBJECT, _entries(), make_provenance("EVIDENCE", "HUMAN_APPROVED")
        )
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/insight.empathy_map.contract.yaml")
        self.assertEqual(empathy_map["id"], "EMPATHY-T-INVOKE")

    def test_empty_catalog_blocks_empathy_map_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_map())
        tampered["subject"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(EMPATHY_MAP_SCHEMA, tampered, "tampered map")
        gate = evaluate_empathy_map_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        """additionalProperties:false must reject a smuggled top-level key (same discipline as
        scamper-session.schema.yaml's own equivalent test)."""
        empathy_map = _valid_map()
        empathy_map["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(EMPATHY_MAP_SCHEMA, empathy_map, "map with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_an_entries_entry(self):
        empathy_map = _valid_map()
        empathy_map["entries"][0] = {**empathy_map["entries"][0], "confidence": 0.9}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(EMPATHY_MAP_SCHEMA, empathy_map, "map with a smuggled entries[] key")

    def test_schema_rejects_a_smuggled_per_entry_provenance_key(self):
        """Record-level-only provenance is a real, checked shape decision -- an entry carrying its own
        provenance field must be rejected, not silently accepted."""
        empathy_map = _valid_map()
        empathy_map["entries"][0] = {**empathy_map["entries"][0], "provenance": make_provenance("HYPOTHESIS", "AI_SUGGESTED")}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(EMPATHY_MAP_SCHEMA, empathy_map, "map with a smuggled per-entry provenance key")

    def test_id_is_distinct_from_insight_persona_machine_id(self):
        self.assertNotEqual(METHOD_ID, "insight.persona")
        self.assertEqual(METHOD_ID, "insight.empathy_map")

    def test_empathy_map_and_persona_both_resolve_as_separate_entries(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID, "insight.persona"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "insight.empathy_map.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "insight.empathy_map contract")


class QuadrantAndBasisVocabularyTests(unittest.TestCase):
    def test_quadrant_names_is_exactly_the_atlas_l463_four(self):
        self.assertEqual(QUADRANT_NAMES, frozenset({"SAYS", "THINKS", "DOES", "FEELS"}))

    def test_valid_bases_is_exactly_fact_and_inference(self):
        self.assertEqual(VALID_BASES, frozenset({"FACT", "INFERENCE"}))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "EMPATHY-")

    def test_entry_rejects_an_unknown_quadrant_name(self):
        with self.assertRaisesRegex(InvariantViolation, "EMPATHY_UNKNOWN_QUADRANT"):
            entry("HOPES", "not one of the four", FACT)

    def test_entry_rejects_an_unknown_basis(self):
        with self.assertRaisesRegex(InvariantViolation, "EMPATHY_INVALID_BASIS"):
            entry(SAYS, "some observation", "GUESS")

    def test_entry_rejects_empty_content(self):
        with self.assertRaisesRegex(InvariantViolation, "EMPATHY_EMPTY_CONTENT"):
            entry(SAYS, "   ", FACT)

    def test_entry_accepts_all_4_quadrants_and_both_bases(self):
        for quadrant in sorted(QUADRANT_NAMES):
            for basis in sorted(VALID_BASES):
                built = entry(quadrant, "some content", basis)
                self.assertEqual(built["quadrant"], quadrant)
                self.assertEqual(built["basis"], basis)


class QuadrantCompletenessTests(unittest.TestCase):
    """Invariant 1 (module docstring): entries must cover all 4 QUADRANT_NAMES at least once each -- a
    completeness FLOOR, not an exact-cardinality cap (unlike strategy.porter_five_forces's own exact-5)."""

    def test_exactly_4_entries_one_per_quadrant_is_accepted(self):
        empathy_map = _valid_map()
        self.assertEqual(len(empathy_map["entries"]), 4)
        self.assertEqual({e["quadrant"] for e in empathy_map["entries"]}, QUADRANT_NAMES)

    def test_more_than_4_entries_with_a_repeated_quadrant_is_accepted(self):
        """Task-mandated: multiple observations per quadrant are real interview/observation practice."""
        entries = _entries() + [entry(SAYS, "a second SAYS observation", FACT)]
        empathy_map = generate_empathy_map("EMPATHY-T-EXTRA", SUBJECT, entries, make_provenance("EVIDENCE", "HUMAN_APPROVED"))
        self.assertEqual(len(empathy_map["entries"]), 5)
        self.assertEqual({e["quadrant"] for e in empathy_map["entries"]}, QUADRANT_NAMES)

    def test_entries_in_a_shuffled_order_is_also_accepted(self):
        """Order carries no meaning Atlas cites -- unlike a positional pipeline, position is not enforced."""
        entries = _entries()
        shuffled = [entries[3], entries[1], entries[0], entries[2]]
        empathy_map = generate_empathy_map("EMPATHY-T-SHUFFLED", SUBJECT, shuffled, make_provenance("EVIDENCE", "HUMAN_APPROVED"))
        self.assertEqual({e["quadrant"] for e in empathy_map["entries"]}, QUADRANT_NAMES)

    def test_missing_one_quadrant_is_refused(self):
        entries = [e for e in _entries() if e["quadrant"] != "FEELS"]
        with self.assertRaisesRegex(InvariantViolation, "EMPATHY_MISSING_QUADRANTS"):
            generate_empathy_map("EMPATHY-T-MISSING", SUBJECT, entries, make_provenance("EVIDENCE", "HUMAN_APPROVED"))

    def test_missing_all_quadrants_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EMPATHY_EMPTY_ENTRIES"):
            generate_empathy_map("EMPATHY-T-EMPTY", SUBJECT, [], make_provenance("EVIDENCE", "HUMAN_APPROVED"))

    def test_4_entries_all_the_same_quadrant_is_refused(self):
        """4 well-shaped entries is not sufficient -- they must actually cover all 4 distinct quadrants."""
        entries = [entry(SAYS, f"observation {i}", FACT) for i in range(4)]
        with self.assertRaisesRegex(InvariantViolation, "EMPATHY_MISSING_QUADRANTS"):
            generate_empathy_map("EMPATHY-T-SAMEQUADRANT", SUBJECT, entries, make_provenance("EVIDENCE", "HUMAN_APPROVED"))

    def test_non_list_entries_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EMPATHY_INVALID_ENTRY_SHAPE"):
            generate_empathy_map("EMPATHY-T-NONLIST", SUBJECT, "not a list", make_provenance("EVIDENCE", "HUMAN_APPROVED"))

    def test_unknown_quadrant_smuggled_in_via_raw_dict_is_refused(self):
        entries = _entries()[:3] + [{"quadrant": "HOPES", "content": "x", "basis": FACT}]
        with self.assertRaisesRegex(InvariantViolation, "EMPATHY_UNKNOWN_QUADRANT"):
            generate_empathy_map("EMPATHY-T-UNKNOWNQUADRANT", SUBJECT, entries, make_provenance("EVIDENCE", "HUMAN_APPROVED"))


class EntryContentAndBasisTests(unittest.TestCase):
    """Invariant 2 (module docstring): every entry needs a non-empty content and a basis in {FACT, INFERENCE},
    REQUIRED and never defaulted."""

    def test_empty_content_is_refused(self):
        entries = _entries()
        entries[0] = {**entries[0], "content": ""}
        with self.assertRaisesRegex(InvariantViolation, "EMPATHY_EMPTY_CONTENT"):
            generate_empathy_map("EMPATHY-T-EMPTYCONTENT", SUBJECT, entries, make_provenance("EVIDENCE", "HUMAN_APPROVED"))

    def test_whitespace_only_content_is_refused(self):
        entries = _entries()
        entries[0] = {**entries[0], "content": "   "}
        with self.assertRaisesRegex(InvariantViolation, "EMPATHY_EMPTY_CONTENT"):
            generate_empathy_map("EMPATHY-T-WSCONTENT", SUBJECT, entries, make_provenance("EVIDENCE", "HUMAN_APPROVED"))

    def test_invalid_basis_smuggled_in_via_raw_dict_is_refused(self):
        entries = _entries()
        entries[0] = {**entries[0], "basis": "GUESS"}
        with self.assertRaisesRegex(InvariantViolation, "EMPATHY_INVALID_BASIS"):
            generate_empathy_map("EMPATHY-T-BADBASIS", SUBJECT, entries, make_provenance("EVIDENCE", "HUMAN_APPROVED"))

    def test_missing_basis_key_is_refused(self):
        entries = _entries()
        del entries[0]["basis"]
        with self.assertRaisesRegex(InvariantViolation, "EMPATHY_INVALID_ENTRY_SHAPE"):
            generate_empathy_map("EMPATHY-T-NOBASIS", SUBJECT, entries, make_provenance("EVIDENCE", "HUMAN_APPROVED"))

    def test_none_basis_is_refused(self):
        entries = _entries()
        entries[0] = {**entries[0], "basis": None}
        with self.assertRaisesRegex(InvariantViolation, "EMPATHY_INVALID_BASIS"):
            generate_empathy_map("EMPATHY-T-NONEBASIS", SUBJECT, entries, make_provenance("EVIDENCE", "HUMAN_APPROVED"))


class SubjectTests(unittest.TestCase):
    """Invariant 3 (module docstring): subject is required, non-empty, never derived."""

    def test_empty_subject_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EMPATHY_EMPTY_SUBJECT"):
            _valid_map(subject="")

    def test_whitespace_only_subject_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EMPATHY_EMPTY_SUBJECT"):
            _valid_map(subject="   ")

    def test_none_subject_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EMPATHY_EMPTY_SUBJECT"):
            _valid_map(subject=None)

    def test_a_real_subject_is_accepted_and_stored_verbatim(self):
        empathy_map = _valid_map(subject="a specific named persona")
        self.assertEqual(empathy_map["subject"], "a specific named persona")


class IdAndVersionTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EMPATHY_INVALID_ID"):
            _valid_map(map_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EMPATHY_INVALID_ID"):
            _valid_map(map_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EMPATHY_INVALID_VERSION"):
            generate_empathy_map("EMPATHY-T-002", SUBJECT, _entries(), make_provenance("EVIDENCE", "HUMAN_APPROVED"), version=1)

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EMPATHY_INVALID_PROVENANCE"):
            generate_empathy_map("EMPATHY-T-BADPROV", SUBJECT, _entries(), {"epistemic_type": "BOGUS", "authorship_state": "BOGUS"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID map's raw dict directly (never going through the builder again), then call the
    gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_map(self):
        gate = evaluate_empathy_map_integrity_gate(_valid_map(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_missing_quadrant(self):
        empathy_map = copy.deepcopy(_valid_map())
        empathy_map["entries"] = [e for e in empathy_map["entries"] if e["quadrant"] != "FEELS"]
        gate = evaluate_empathy_map_integrity_gate(empathy_map, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_content(self):
        empathy_map = copy.deepcopy(_valid_map())
        empathy_map["entries"][0]["content"] = ""
        gate = evaluate_empathy_map_integrity_gate(empathy_map, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_invalid_basis(self):
        empathy_map = copy.deepcopy(_valid_map())
        empathy_map["entries"][0]["basis"] = "MAYBE"
        gate = evaluate_empathy_map_integrity_gate(empathy_map, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_subject(self):
        empathy_map = copy.deepcopy(_valid_map())
        empathy_map["subject"] = ""
        gate = evaluate_empathy_map_integrity_gate(empathy_map, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_map(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_empathy_map_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        empathy_map = copy.deepcopy(_valid_map())
        empathy_map["id"] = "WRONG-001"
        gate = evaluate_empathy_map_integrity_gate(empathy_map, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        empathy_map = copy.deepcopy(_valid_map())
        empathy_map["version"] = 1
        gate = evaluate_empathy_map_integrity_gate(empathy_map, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_map(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_record_provenance_invalid(self):
        empathy_map = copy.deepcopy(_valid_map())
        empathy_map["provenance"] = {"epistemic_type": "BOGUS", "authorship_state": "BOGUS"}
        gate = evaluate_provenance_required_gate(empathy_map, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_empathy_map_gates_returns_two_gates_in_order(self):
        results = evaluate_empathy_map_gates(_valid_map(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "empathy_map_integrity"])

    def test_evaluate_empathy_map_gates_all_pass_on_a_valid_map(self):
        results = evaluate_empathy_map_gates(_valid_map(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "insight.empathy_map")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        empathy_map = _valid_map()
        self.assertEqual(set(empathy_map.keys()), {"id", "version", "generated_by_method", "subject", "entries", "provenance"})

    def test_entry_does_not_leak_extra_keys(self):
        built = entry(SAYS, "text", FACT)
        self.assertEqual(set(built.keys()), {"quadrant", "content", "basis"})


if __name__ == "__main__":
    unittest.main()
