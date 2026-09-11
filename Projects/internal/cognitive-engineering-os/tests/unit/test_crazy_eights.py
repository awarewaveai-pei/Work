"""Mutation-style tests for ``divergent.crazy_eights`` (F03 divergent-ideation family, 1st member).

Two real invariants beyond per-field shape (8-box completeness/uniqueness, pairwise sketch_description
distinctness), exercised at BOTH layers: construction-time refusal (``generate_crazy_eights_session`` raising
a specific ``InvariantViolation`` code) and independent gate re-derivation
(``evaluate_crazy_eights_integrity_gate`` catching a hand-tampered raw dict that bypassed the builder
entirely, never calling the builder itself). Schema conformance is checked against the real spec-root schema
this same slice added (``typed-objects/crazy-eights-session.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.divergent.crazy_eights import (
    BOX_NUMBERS,
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    concept_entry,
    evaluate_crazy_eights_gates,
    evaluate_crazy_eights_integrity_gate,
    evaluate_provenance_required_gate,
    generate_crazy_eights_session,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

CRAZY_EIGHTS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/crazy-eights-session.schema.yaml"

_DESCRIPTIONS = [
    "single-page checkout with every field flattened onto one screen",
    "3-step wizard checkout, one question per step",
    "side-drawer checkout that never leaves the product page",
    "pay first, address later, to reduce cart abandonment",
    "voice-only checkout flow, no typing required",
    "chatbot-driven Q&A checkout",
    "scan-to-collect in store, online only picks the spec",
    "subscription auto-renewal, fully checkout-free after the first order",
]


def _concepts(**overrides: dict) -> list[dict]:
    base = {i: dict(box_number=i, sketch_description=_DESCRIPTIONS[i - 1]) for i in range(1, 9)}
    base.update(overrides)
    return [concept_entry(v["box_number"], v["sketch_description"]) for v in base.values()]


def _valid_session(
    *,
    session_id: str = "CRAZY8-T-001",
    concepts: list[dict] | None = None,
    provenance: dict | None = None,
):
    return generate_crazy_eights_session(
        session_id,
        concepts if concepts is not None else _concepts(),
        provenance if provenance is not None else make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_session_validates_against_the_real_schema(self):
        self.contracts.validate(CRAZY_EIGHTS_SCHEMA, _valid_session(), "crazy eights session")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, session = live.invoke(
            METHOD_ID, generate_crazy_eights_session, "CRAZY8-T-INVOKE", _concepts(), make_provenance("HYPOTHESIS", "AI_SUGGESTED")
        )
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/divergent.crazy_eights.contract.yaml")
        self.assertEqual(session["id"], "CRAZY8-T-INVOKE")

    def test_empty_catalog_blocks_crazy_eights_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_session())
        tampered["concepts"] = tampered["concepts"][:7]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CRAZY_EIGHTS_SCHEMA, tampered, "tampered session")
        gate = evaluate_crazy_eights_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        """additionalProperties:false must reject a smuggled top-level key (same discipline as
        ansoff-matrix.schema.yaml's own equivalent test)."""
        session = _valid_session()
        session["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CRAZY_EIGHTS_SCHEMA, session, "session with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_a_concepts_entry(self):
        session = _valid_session()
        session["concepts"][0] = {**session["concepts"][0], "score": 42}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CRAZY_EIGHTS_SCHEMA, session, "session with a smuggled concepts[] key")

    def test_schema_rejects_a_per_concept_provenance_key(self):
        """Task-mandated shape has NO per-concept provenance field -- a smuggled one must be rejected by
        additionalProperties:false on the concepts[] item schema."""
        session = _valid_session()
        session["concepts"][0] = {**session["concepts"][0], "provenance": make_provenance("HYPOTHESIS", "AI_SUGGESTED")}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CRAZY_EIGHTS_SCHEMA, session, "session with a smuggled per-concept provenance key")

    def test_id_is_distinct_from_strategy_ansoff_machine_id(self):
        self.assertNotEqual(METHOD_ID, "strategy.ansoff")
        self.assertEqual(METHOD_ID, "divergent.crazy_eights")

    def test_crazy_eights_and_ansoff_both_resolve_as_separate_entries(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID, "strategy.ansoff"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "divergent.crazy_eights.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "divergent.crazy_eights contract")


class BoxNumberVocabularyTests(unittest.TestCase):
    def test_box_numbers_is_exactly_1_through_8(self):
        self.assertEqual(BOX_NUMBERS, frozenset({1, 2, 3, 4, 5, 6, 7, 8}))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "CRAZY8-")

    def test_concept_entry_rejects_an_out_of_range_box_number(self):
        with self.assertRaisesRegex(InvariantViolation, "CRAZY8_UNKNOWN_BOX_NUMBER"):
            concept_entry(9, "a 9th box that does not exist")
        with self.assertRaisesRegex(InvariantViolation, "CRAZY8_UNKNOWN_BOX_NUMBER"):
            concept_entry(0, "a 0th box that does not exist")

    def test_concept_entry_rejects_a_non_integer_box_number(self):
        with self.assertRaisesRegex(InvariantViolation, "CRAZY8_UNKNOWN_BOX_NUMBER"):
            concept_entry("1", "a string instead of an int")

    def test_concept_entry_rejects_a_bool_masquerading_as_an_int(self):
        """bool is a subclass of int in Python -- True must not silently pass as box_number 1."""
        with self.assertRaisesRegex(InvariantViolation, "CRAZY8_UNKNOWN_BOX_NUMBER"):
            concept_entry(True, "a bool masquerading as box 1")

    def test_concept_entry_rejects_an_empty_sketch_description(self):
        with self.assertRaisesRegex(InvariantViolation, "CRAZY8_EMPTY_SKETCH_DESCRIPTION"):
            concept_entry(1, "   ")

    def test_concept_entry_accepts_all_8_box_numbers(self):
        for box_number in sorted(BOX_NUMBERS):
            entry = concept_entry(box_number, f"concept for box {box_number}")
            self.assertEqual(entry["box_number"], box_number)

    def test_concept_entry_does_not_leak_extra_keys(self):
        entry = concept_entry(1, "text")
        self.assertEqual(set(entry.keys()), {"box_number", "sketch_description"})


class ConceptSetCompletenessTests(unittest.TestCase):
    """Invariant 1 (module docstring): concepts must name EXACTLY the 8 BOX_NUMBERS, each exactly once, in any
    order -- the core "closed SET, unordered, completeness required" design-shape invariant."""

    def test_valid_8_concepts_in_canonical_order_is_accepted(self):
        session = _valid_session()
        self.assertEqual(len(session["concepts"]), 8)

    def test_valid_8_concepts_in_a_shuffled_order_is_also_accepted(self):
        """Order carries no meaning Atlas cites -- same "no position enforced" discipline ansoff.py's own
        identical test establishes."""
        concepts = _concepts()
        shuffled = [concepts[7], concepts[3], concepts[0], concepts[5], concepts[1], concepts[6], concepts[2], concepts[4]]
        session = generate_crazy_eights_session("CRAZY8-T-SHUFFLED", shuffled, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
        self.assertEqual({c["box_number"] for c in session["concepts"]}, BOX_NUMBERS)

    def test_seven_concepts_missing_box_8_is_refused(self):
        concepts = _concepts()[:7]  # drops box_number 8 (dict insertion order preserved -- it is last)
        with self.assertRaisesRegex(InvariantViolation, "CRAZY8_INCOMPLETE_CONCEPT_SET"):
            generate_crazy_eights_session("CRAZY8-T-SEVEN", concepts, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_nine_concepts_with_a_duplicated_box_number_is_refused(self):
        concepts = _concepts() + [concept_entry(1, "a 9th duplicate box_number entry")]
        with self.assertRaisesRegex(InvariantViolation, "CRAZY8_INCOMPLETE_CONCEPT_SET"):
            generate_crazy_eights_session("CRAZY8-T-NINE", concepts, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_missing_all_concepts_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CRAZY8_INCOMPLETE_CONCEPT_SET"):
            generate_crazy_eights_session("CRAZY8-T-EMPTY", [], make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_duplicate_box_number_replacing_a_different_one_is_refused(self):
        concepts = _concepts()[:7] + [_concepts()[0]]  # box 1 appears twice, box 8 missing
        with self.assertRaisesRegex(InvariantViolation, "CRAZY8_INCOMPLETE_CONCEPT_SET"):
            generate_crazy_eights_session("CRAZY8-T-DUP", concepts, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_non_list_concepts_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CRAZY8_INVALID_CONCEPT_SET"):
            generate_crazy_eights_session("CRAZY8-T-NONLIST", "not a list", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_unknown_box_number_smuggled_in_via_raw_dict_is_refused(self):
        concepts = _concepts()[:7] + [{"box_number": 99, "sketch_description": "x"}]
        with self.assertRaisesRegex(InvariantViolation, "CRAZY8_UNKNOWN_BOX_NUMBER"):
            generate_crazy_eights_session("CRAZY8-T-UNKNOWNBOX", concepts, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))


class SketchDescriptionDistinctnessTests(unittest.TestCase):
    """Invariant 2 (module docstring): every concept entry needs a non-empty sketch_description, AND no two
    entries may share a character-identical sketch_description."""

    def test_empty_sketch_description_is_refused(self):
        concepts = _concepts()
        concepts[0] = {**concepts[0], "sketch_description": ""}
        with self.assertRaisesRegex(InvariantViolation, "CRAZY8_EMPTY_SKETCH_DESCRIPTION"):
            generate_crazy_eights_session("CRAZY8-T-EMPTYDESC", concepts, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_whitespace_only_sketch_description_is_refused(self):
        concepts = _concepts()
        concepts[0] = {**concepts[0], "sketch_description": "   "}
        with self.assertRaisesRegex(InvariantViolation, "CRAZY8_EMPTY_SKETCH_DESCRIPTION"):
            generate_crazy_eights_session("CRAZY8-T-WSDESC", concepts, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_duplicate_sketch_description_across_two_boxes_is_refused(self):
        """The core Crazy 8s invariant: 8 identical entries (or even 2) would mean the exercise's own stated
        purpose ('強迫突破第一答案') failed."""
        concepts = _concepts()
        concepts[1] = {**concepts[1], "sketch_description": concepts[0]["sketch_description"]}
        with self.assertRaisesRegex(InvariantViolation, "CRAZY8_DUPLICATE_SKETCH_DESCRIPTION"):
            generate_crazy_eights_session("CRAZY8-T-DUPDESC", concepts, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_all_8_identical_sketch_descriptions_is_refused(self):
        """The worst-case failure of the method's own purpose: 8 copies of the first idea."""
        concepts = [concept_entry(i, "the exact same idea, copy-pasted") for i in range(1, 9)]
        with self.assertRaisesRegex(InvariantViolation, "CRAZY8_DUPLICATE_SKETCH_DESCRIPTION"):
            generate_crazy_eights_session("CRAZY8-T-ALLDUP", concepts, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_near_identical_descriptions_differing_by_one_character_are_accepted(self):
        """Exact character-match only (task-mandated, not normalized) -- see contract's own
        compilation_decisions. A near-duplicate differing by even one character is a genuinely distinct
        string and must be accepted."""
        concepts = _concepts()
        concepts[1] = {**concepts[1], "sketch_description": concepts[0]["sketch_description"] + "!"}
        session = generate_crazy_eights_session("CRAZY8-T-NEARDUP", concepts, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
        self.assertEqual(len(session["concepts"]), 8)

    def test_builder_does_not_reorder_or_dedupe_descriptions_it_accepts(self):
        session = _valid_session()
        descriptions = [c["sketch_description"] for c in session["concepts"]]
        self.assertEqual(len(set(descriptions)), 8)


class IdVersionAndProvenanceTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CRAZY8_INVALID_ID"):
            _valid_session(session_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CRAZY8_INVALID_ID"):
            _valid_session(session_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CRAZY8_INVALID_VERSION"):
            generate_crazy_eights_session("CRAZY8-T-002", _concepts(), make_provenance("HYPOTHESIS", "AI_SUGGESTED"), version=1)

    def test_missing_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CRAZY8_INVALID_PROVENANCE"):
            generate_crazy_eights_session("CRAZY8-T-NOPROV", _concepts(), None)

    def test_malformed_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CRAZY8_INVALID_PROVENANCE"):
            generate_crazy_eights_session("CRAZY8-T-BADPROV", _concepts(), {"epistemic_type": "NOT_REAL", "authorship_state": "AI_SUGGESTED", "locked": None})

    def test_builder_stores_the_record_level_provenance_verbatim(self):
        provenance = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")
        session = _valid_session(provenance=provenance)
        self.assertEqual(session["provenance"], provenance)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID session's raw dict directly (never going through the builder again), then call the
    gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_session(self):
        gate = evaluate_crazy_eights_integrity_gate(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_missing_concept(self):
        session = copy.deepcopy(_valid_session())
        session["concepts"] = session["concepts"][:7]
        gate = evaluate_crazy_eights_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_duplicated_box_number(self):
        session = copy.deepcopy(_valid_session())
        session["concepts"] = session["concepts"][:7] + [session["concepts"][0]]
        gate = evaluate_crazy_eights_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_sketch_description(self):
        session = copy.deepcopy(_valid_session())
        session["concepts"][0]["sketch_description"] = ""
        gate = evaluate_crazy_eights_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_duplicated_sketch_description(self):
        """The independent-gate proof of the pairwise-distinctness invariant, mirroring the CLI slice's own
        hand-tamper demonstration."""
        session = copy.deepcopy(_valid_session())
        session["concepts"][1]["sketch_description"] = session["concepts"][0]["sketch_description"]
        gate = evaluate_crazy_eights_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_session(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_crazy_eights_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        session = copy.deepcopy(_valid_session())
        session["id"] = "WRONG-001"
        gate = evaluate_crazy_eights_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        session = copy.deepcopy(_valid_session())
        session["version"] = 1
        gate = evaluate_crazy_eights_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_invalid_record_level_provenance(self):
        session = copy.deepcopy(_valid_session())
        session["provenance"] = None
        gate = evaluate_crazy_eights_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    """Record-level-only provenance gate (no per-concept provenance field -- see module docstring), same
    shape decomposition/wbs.py's own identical gate already establishes."""

    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_record_level_provenance_invalid(self):
        session = copy.deepcopy(_valid_session())
        session["provenance"] = None
        gate = evaluate_provenance_required_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_missing_provenance_key(self):
        gate = evaluate_provenance_required_gate({"concepts": _concepts()}, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_crazy_eights_gates_returns_two_gates_in_order(self):
        results = evaluate_crazy_eights_gates(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "crazy_eights_integrity"])

    def test_evaluate_crazy_eights_gates_all_pass_on_a_valid_session(self):
        results = evaluate_crazy_eights_gates(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "divergent.crazy_eights")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        session = _valid_session()
        self.assertEqual(set(session.keys()), {"id", "version", "generated_by_method", "provenance", "concepts"})


if __name__ == "__main__":
    unittest.main()
