"""Mutation-style tests for ``strategy.vrio`` (F08 context/strategy family, 7th member).

Four real invariants beyond per-field shape (questions completeness/distinctness, per-question content,
competitive_implication GENUINE_COMPUTE agreement, top-level resource_description), exercised at BOTH layers:
construction-time refusal (``generate_vrio_analysis`` raising a specific ``InvariantViolation`` code) and
independent gate re-derivation (``evaluate_vrio_integrity_gate`` catching a hand-tampered raw dict that
bypassed the builder entirely, never calling the builder itself). Schema conformance is checked against the
real spec-root schema this same slice added (``typed-objects/vrio-analysis.schema.yaml``). A dedicated class
independently verifies the full 16-cell Barney/VRIO classification table is TOTAL and correct.
"""

from __future__ import annotations

import copy
import itertools
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.strategy.vrio import (
    COMPETITIVE_DISADVANTAGE,
    COMPETITIVE_PARITY,
    METHOD_ID,
    RECORD_ID_PREFIX,
    SUSTAINED_COMPETITIVE_ADVANTAGE,
    TEMPORARY_COMPETITIVE_ADVANTAGE,
    UNUSED_COMPETITIVE_ADVANTAGE,
    VALID_ANSWERS,
    VALID_IMPLICATIONS,
    VRIO_DIMENSIONS,
    all_gates_pass,
    derive_vrio_competitive_implication,
    evaluate_evidence_labeling_required_gate,
    evaluate_provenance_required_gate,
    evaluate_vrio_gates,
    evaluate_vrio_integrity_gate,
    generate_vrio_analysis,
    question_entry,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

VRIO_SCHEMA = "ai-lego://specs/cognitive/typed-objects/vrio-analysis.schema.yaml"
RESOURCE_DESCRIPTION = "proprietary regional supply-chain anomaly-detection data pipeline"


def _questions(**overrides: dict) -> list[dict]:
    base = {
        "VALUE": dict(dimension="VALUE", answer="YES", reasoning="cuts detection lead time by 3x vs industry baseline", provenance=make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-501"]),
        "RARITY": dict(dimension="RARITY", answer="YES", reasoning="only 1 competitor runs a comparably-scaled in-house pipeline", provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        "IMITABILITY": dict(dimension="IMITABILITY", answer="YES", reasoning="5 years of proprietary labeled anomaly data is path-dependent, hard to replicate quickly", provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        "ORGANIZATION": dict(dimension="ORGANIZATION", answer="NO", reasoning="pipeline is internal-ops-only, no productization or cross-team process captures the value yet", provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
    }
    base.update(overrides)
    return [
        question_entry(v["dimension"], v["answer"], v["reasoning"], v["provenance"], supporting_evidence_refs=v.get("supporting_evidence_refs"))
        for v in base.values()
    ]


def _valid_analysis(
    *,
    analysis_id: str = "VRIO-T-001",
    resource_description: str = RESOURCE_DESCRIPTION,
    questions: list[dict] | None = None,
):
    return generate_vrio_analysis(
        analysis_id,
        resource_description,
        questions if questions is not None else _questions(),
        make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_analysis_validates_against_the_real_schema(self):
        self.contracts.validate(VRIO_SCHEMA, _valid_analysis(), "vrio analysis")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, analysis = live.invoke(
            METHOD_ID, generate_vrio_analysis, "VRIO-T-INVOKE", RESOURCE_DESCRIPTION, _questions(), make_provenance("AI_INFERENCE", "AI_SUGGESTED")
        )
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/strategy.vrio.contract.yaml")
        self.assertEqual(analysis["id"], "VRIO-T-INVOKE")

    def test_empty_catalog_blocks_vrio_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_analysis())
        tampered["resource_description"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(VRIO_SCHEMA, tampered, "tampered analysis")
        gate = evaluate_vrio_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        """additionalProperties:false must reject a smuggled top-level key (same discipline as
        porter-five-forces-analysis.schema.yaml's own equivalent test)."""
        analysis = _valid_analysis()
        analysis["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(VRIO_SCHEMA, analysis, "analysis with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_a_question_entry(self):
        analysis = _valid_analysis()
        analysis["questions"][0] = {**analysis["questions"][0], "score": 42}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(VRIO_SCHEMA, analysis, "analysis with a smuggled questions[] key")

    def test_id_is_distinct_from_strategy_porter_five_forces_machine_id(self):
        self.assertNotEqual(METHOD_ID, "strategy.porter_five_forces")
        self.assertEqual(METHOD_ID, "strategy.vrio")

    def test_vrio_and_porter_five_forces_both_resolve_as_separate_entries(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID, "strategy.porter_five_forces"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's
        own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "strategy.vrio.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "strategy.vrio contract")


class DimensionVocabularyTests(unittest.TestCase):
    def test_vrio_dimensions_is_exactly_the_atlas_12_13_four(self):
        self.assertEqual(VRIO_DIMENSIONS, frozenset({"VALUE", "RARITY", "IMITABILITY", "ORGANIZATION"}))

    def test_valid_answers_is_exactly_yes_no(self):
        self.assertEqual(VALID_ANSWERS, frozenset({"YES", "NO"}))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "VRIO-")

    def test_question_entry_rejects_an_unknown_dimension_name(self):
        with self.assertRaisesRegex(InvariantViolation, "VRIO_UNKNOWN_DIMENSION"):
            question_entry("SCARCITY", "YES", "not one of the four", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_question_entry_rejects_an_unknown_answer(self):
        with self.assertRaisesRegex(InvariantViolation, "VRIO_INVALID_ANSWER"):
            question_entry("VALUE", "MAYBE", "not one of the two", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_question_entry_accepts_all_4_dimensions_and_both_answers(self):
        for dimension in sorted(VRIO_DIMENSIONS):
            for answer in sorted(VALID_ANSWERS):
                entry = question_entry(dimension, answer, "some reasoning", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
                self.assertEqual(entry["dimension"], dimension)
                self.assertEqual(entry["answer"], answer)


class QuestionSetCompletenessTests(unittest.TestCase):
    """Invariant 1 (module docstring): questions must name EXACTLY the 4 VRIO_DIMENSIONS, each exactly once,
    in any order -- the core "closed SET, unordered, completeness required" design-shape invariant."""

    def test_valid_4_questions_in_atlas_order_is_accepted(self):
        analysis = _valid_analysis()
        self.assertEqual(len(analysis["questions"]), 4)

    def test_valid_4_questions_in_a_shuffled_order_is_also_accepted(self):
        """Order carries no meaning Atlas cites -- unlike causal.logic_model's STAGE_ORDER, position is not enforced."""
        questions = _questions()
        shuffled = [questions[3], questions[1], questions[0], questions[2]]
        analysis = generate_vrio_analysis("VRIO-T-SHUFFLED", RESOURCE_DESCRIPTION, shuffled, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
        self.assertEqual({q["dimension"] for q in analysis["questions"]}, VRIO_DIMENSIONS)

    def test_missing_one_dimension_is_refused(self):
        questions = _questions()[:3]  # drops ORGANIZATION (dict insertion order preserved -- ORGANIZATION is last)
        with self.assertRaisesRegex(InvariantViolation, "VRIO_INCOMPLETE_QUESTION_SET"):
            generate_vrio_analysis("VRIO-T-MISSING", RESOURCE_DESCRIPTION, questions, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_missing_all_questions_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "VRIO_INCOMPLETE_QUESTION_SET"):
            generate_vrio_analysis("VRIO-T-EMPTY", RESOURCE_DESCRIPTION, [], make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_duplicate_dimension_replacing_a_different_one_is_refused(self):
        """5 slots is impossible (maxItems:4 at the schema layer already prevents 5), but a caller supplying 4
        entries where one dimension is duplicated and another is entirely missing must still be refused by the
        runtime completeness check."""
        questions = _questions()[:3] + [_questions()[0]]  # VALUE appears twice, ORGANIZATION missing
        with self.assertRaisesRegex(InvariantViolation, "VRIO_INCOMPLETE_QUESTION_SET"):
            generate_vrio_analysis("VRIO-T-DUP", RESOURCE_DESCRIPTION, questions, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_five_questions_is_refused(self):
        questions = _questions() + [question_entry("VALUE", "NO", "a 5th duplicate entry", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]
        with self.assertRaisesRegex(InvariantViolation, "VRIO_INCOMPLETE_QUESTION_SET"):
            generate_vrio_analysis("VRIO-T-FIVE", RESOURCE_DESCRIPTION, questions, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_non_list_questions_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "VRIO_INVALID_QUESTION_SET"):
            generate_vrio_analysis("VRIO-T-NONLIST", RESOURCE_DESCRIPTION, "not a list", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_unknown_dimension_name_smuggled_in_via_raw_dict_is_refused(self):
        questions = _questions()[:3] + [{"dimension": "SCARCITY", "answer": "YES", "reasoning": "x", "provenance": make_provenance("HYPOTHESIS", "AI_SUGGESTED")}]
        with self.assertRaisesRegex(InvariantViolation, "VRIO_UNKNOWN_DIMENSION"):
            generate_vrio_analysis("VRIO-T-UNKNOWNDIM", RESOURCE_DESCRIPTION, questions, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))


class QuestionContentTests(unittest.TestCase):
    """Invariant 2 (module docstring): every question entry needs a non-empty reasoning and a valid answer."""

    def test_empty_reasoning_is_refused(self):
        questions = _questions()
        questions[0] = {**questions[0], "reasoning": ""}
        with self.assertRaisesRegex(InvariantViolation, "VRIO_EMPTY_REASONING"):
            generate_vrio_analysis("VRIO-T-EMPTYREASON", RESOURCE_DESCRIPTION, questions, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_whitespace_only_reasoning_is_refused(self):
        questions = _questions()
        questions[0] = {**questions[0], "reasoning": "   "}
        with self.assertRaisesRegex(InvariantViolation, "VRIO_EMPTY_REASONING"):
            generate_vrio_analysis("VRIO-T-WSREASON", RESOURCE_DESCRIPTION, questions, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_invalid_answer_smuggled_in_via_raw_dict_is_refused(self):
        questions = _questions()
        questions[0] = {**questions[0], "answer": "PARTIALLY"}
        with self.assertRaisesRegex(InvariantViolation, "VRIO_INVALID_ANSWER"):
            generate_vrio_analysis("VRIO-T-BADANSWER", RESOURCE_DESCRIPTION, questions, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_missing_answer_key_is_refused(self):
        questions = _questions()
        del questions[0]["answer"]
        with self.assertRaisesRegex(InvariantViolation, "VRIO_INVALID_QUESTION_SET"):
            generate_vrio_analysis("VRIO-T-NOANSWER", RESOURCE_DESCRIPTION, questions, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_invalid_provenance_smuggled_in_via_raw_dict_is_refused(self):
        questions = _questions()
        questions[0] = {**questions[0], "provenance": None}
        with self.assertRaisesRegex(InvariantViolation, "VRIO_INVALID_PROVENANCE"):
            generate_vrio_analysis("VRIO-T-BADPROV", RESOURCE_DESCRIPTION, questions, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))


class ResourceDescriptionTests(unittest.TestCase):
    """Invariant 4 (module docstring): resource_description is required, non-empty, names the subject under judgment."""

    def test_empty_resource_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "VRIO_EMPTY_RESOURCE_DESCRIPTION"):
            _valid_analysis(resource_description="")

    def test_whitespace_only_resource_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "VRIO_EMPTY_RESOURCE_DESCRIPTION"):
            _valid_analysis(resource_description="   ")

    def test_none_resource_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "VRIO_EMPTY_RESOURCE_DESCRIPTION"):
            _valid_analysis(resource_description=None)

    def test_a_real_resource_description_is_accepted_and_stored_verbatim(self):
        text = "in-house regulatory-compliance automation toolchain"
        analysis = _valid_analysis(resource_description=text)
        self.assertEqual(analysis["resource_description"], text)


class IdAndVersionTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "VRIO_INVALID_ID"):
            _valid_analysis(analysis_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "VRIO_INVALID_ID"):
            _valid_analysis(analysis_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "VRIO_INVALID_VERSION"):
            generate_vrio_analysis("VRIO-T-002", RESOURCE_DESCRIPTION, _questions(), make_provenance("AI_INFERENCE", "AI_SUGGESTED"), version=1)


class ClassificationTableTests(unittest.TestCase):
    """Independent verification that the real external Barney/VRIO lookup table (module docstring) is TOTAL
    over all 16 YES/NO combinations and matches the standard textbook classification -- not merely trusted
    from the module's own docstring claim."""

    def test_valid_implications_is_exactly_the_5_standard_outcomes(self):
        self.assertEqual(
            VALID_IMPLICATIONS,
            frozenset(
                {
                    "COMPETITIVE_DISADVANTAGE",
                    "COMPETITIVE_PARITY",
                    "TEMPORARY_COMPETITIVE_ADVANTAGE",
                    "UNUSED_COMPETITIVE_ADVANTAGE",
                    "SUSTAINED_COMPETITIVE_ADVANTAGE",
                }
            ),
        )

    def test_table_is_total_over_all_16_combinations(self):
        """Every one of the 2^4 = 16 YES/NO combinations must resolve to exactly one of the 5 implications --
        no KeyError, no combination silently unhandled."""
        for combo in itertools.product(("YES", "NO"), repeat=4):
            implication = derive_vrio_competitive_implication(*combo)
            self.assertIn(implication, VALID_IMPLICATIONS)

    def test_not_valuable_is_always_disadvantage_regardless_of_other_3(self):
        for rarity, imitability, organization in itertools.product(("YES", "NO"), repeat=3):
            self.assertEqual(derive_vrio_competitive_implication("NO", rarity, imitability, organization), COMPETITIVE_DISADVANTAGE)

    def test_valuable_not_rare_is_always_parity_regardless_of_imitability_organization(self):
        for imitability, organization in itertools.product(("YES", "NO"), repeat=2):
            self.assertEqual(derive_vrio_competitive_implication("YES", "NO", imitability, organization), COMPETITIVE_PARITY)

    def test_valuable_rare_not_costly_to_imitate_is_always_temporary_regardless_of_organization(self):
        for organization in ("YES", "NO"):
            self.assertEqual(derive_vrio_competitive_implication("YES", "YES", "NO", organization), TEMPORARY_COMPETITIVE_ADVANTAGE)

    def test_valuable_rare_costly_to_imitate_not_organized_is_unused(self):
        self.assertEqual(derive_vrio_competitive_implication("YES", "YES", "YES", "NO"), UNUSED_COMPETITIVE_ADVANTAGE)

    def test_all_four_yes_is_sustained(self):
        self.assertEqual(derive_vrio_competitive_implication("YES", "YES", "YES", "YES"), SUSTAINED_COMPETITIVE_ADVANTAGE)

    def test_invalid_answer_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "VRIO_UNRESOLVABLE_IMPLICATION"):
            derive_vrio_competitive_implication("MAYBE", "YES", "YES", "YES")

    def test_builder_computes_implication_matching_direct_derivation(self):
        analysis = _valid_analysis()
        self.assertEqual(analysis["competitive_implication"], derive_vrio_competitive_implication("YES", "YES", "YES", "NO"))
        self.assertEqual(analysis["competitive_implication"], UNUSED_COMPETITIVE_ADVANTAGE)

    def test_builder_never_accepts_a_caller_supplied_implication(self):
        """Structural elimination: generate_vrio_analysis has no competitive_implication parameter at all, so
        there is no code path through which a caller could pass one in even if they tried via kwargs collision
        -- verified here by confirming the computed value always matches derive_vrio_competitive_implication,
        never an arbitrary caller string."""
        all_yes = [question_entry(dim, "YES", "reasoning text", make_provenance("HYPOTHESIS", "AI_SUGGESTED")) for dim in sorted(VRIO_DIMENSIONS)]
        analysis = generate_vrio_analysis("VRIO-T-ALLYES", RESOURCE_DESCRIPTION, all_yes, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
        self.assertEqual(analysis["competitive_implication"], SUSTAINED_COMPETITIVE_ADVANTAGE)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID analysis's raw dict directly (never going through the builder again), then call the
    gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_analysis(self):
        gate = evaluate_vrio_integrity_gate(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_missing_dimension(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["questions"] = analysis["questions"][:3]
        gate = evaluate_vrio_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_duplicated_dimension(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["questions"] = analysis["questions"][:3] + [analysis["questions"][0]]
        gate = evaluate_vrio_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_reasoning(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["questions"][0]["reasoning"] = ""
        gate = evaluate_vrio_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_invalid_answer(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["questions"][0]["answer"] = "SOMEWHAT"
        gate = evaluate_vrio_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_competitive_implication(self):
        """The core GENUINE_COMPUTE proof: flipping the stored implication without touching the 4 answers
        must be caught by recomputation, not merely by schema enum membership (the tampered value is itself a
        legal enum member, just the WRONG one for these 4 answers)."""
        analysis = copy.deepcopy(_valid_analysis())
        self.assertEqual(analysis["competitive_implication"], UNUSED_COMPETITIVE_ADVANTAGE)
        analysis["competitive_implication"] = SUSTAINED_COMPETITIVE_ADVANTAGE
        gate = evaluate_vrio_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_resource_description(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["resource_description"] = ""
        gate = evaluate_vrio_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_analysis(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_vrio_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["id"] = "WRONG-001"
        gate = evaluate_vrio_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["version"] = 1
        gate = evaluate_vrio_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_a_question_provenance_invalid(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["questions"][0]["provenance"] = None
        gate = evaluate_provenance_required_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_when_record_provenance_invalid(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["provenance"] = {"epistemic_type": "BOGUS", "authorship_state": "BOGUS"}
        gate = evaluate_provenance_required_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class EvidenceLabelingGateTests(unittest.TestCase):
    """Atlas §12.13 gives no explicit misuse warning the way SWOT's own L1347 does (disclosed in this method's
    contract open_questions) -- this gate is a same-family generalization of Porter's identical check: an
    EVIDENCE-labeled question with no supporting_evidence_refs is an unbacked claim."""

    def test_valid_analysis_passes(self):
        gate = evaluate_evidence_labeling_required_gate(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_evidence_labeled_question_with_no_supporting_refs_fails(self):
        questions = _questions()
        fabricated = question_entry("VALUE", "YES", "value is high", make_provenance("EVIDENCE", "AI_SUGGESTED"))
        questions = [q for q in questions if q["dimension"] != "VALUE"] + [fabricated]
        analysis = generate_vrio_analysis("VRIO-T-UNEVIDENCED", RESOURCE_DESCRIPTION, questions, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
        gate = evaluate_evidence_labeling_required_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertTrue(any(p["dimension"] == "VALUE" for p in gate["evidence"][0]["problems"]))

    def test_hypothesis_labeled_question_with_no_supporting_refs_still_passes(self):
        """Only EVIDENCE-labeled claims require a citation -- a disclosed HYPOTHESIS is not a violation."""
        gate = evaluate_evidence_labeling_required_gate(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_vrio_gates_returns_three_gates_in_order(self):
        results = evaluate_vrio_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "evidence_labeling_required", "vrio_integrity"])

    def test_evaluate_vrio_gates_all_pass_on_a_valid_analysis(self):
        results = evaluate_vrio_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "strategy.vrio")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        analysis = _valid_analysis()
        self.assertEqual(
            set(analysis.keys()),
            {"id", "version", "generated_by_method", "resource_description", "questions", "competitive_implication", "computation_provenance_ref", "provenance"},
        )

    def test_question_entry_does_not_leak_extra_keys_when_no_refs_given(self):
        entry = question_entry("VALUE", "YES", "text", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
        self.assertEqual(set(entry.keys()), {"dimension", "answer", "reasoning", "provenance"})

    def test_question_entry_includes_supporting_evidence_refs_when_provided(self):
        entry = question_entry("VALUE", "YES", "text", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-1"])
        self.assertEqual(entry["supporting_evidence_refs"], ["E-1"])


if __name__ == "__main__":
    unittest.main()
