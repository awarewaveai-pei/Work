"""Mutation-style tests for ``strategy.porter_five_forces`` (F08 context/strategy family, 2nd member).

Three real invariants beyond per-field shape (forces completeness/distinctness, per-force content, top-level
overall_attractiveness), exercised at BOTH layers: construction-time refusal
(``generate_porter_five_forces_analysis`` raising a specific ``InvariantViolation`` code) and independent gate
re-derivation (``evaluate_porter_five_forces_integrity_gate`` catching a hand-tampered raw dict that bypassed
the builder entirely, never calling the builder itself). Schema conformance is checked against the real
spec-root schema this same slice added
(``typed-objects/porter-five-forces-analysis.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.strategy.porter_five_forces import (
    FORCE_NAMES,
    METHOD_ID,
    RECORD_ID_PREFIX,
    VALID_INTENSITIES,
    all_gates_pass,
    evaluate_evidence_labeling_required_gate,
    evaluate_porter_five_forces_gates,
    evaluate_porter_five_forces_integrity_gate,
    evaluate_provenance_required_gate,
    force_entry,
    generate_porter_five_forces_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

PFF_SCHEMA = "ai-lego://specs/cognitive/typed-objects/porter-five-forces-analysis.schema.yaml"


def _forces(**overrides: dict) -> list[dict]:
    base = {
        "INDUSTRY_RIVALRY": dict(force="INDUSTRY_RIVALRY", intensity="HIGH", assessment="five incumbents compete on price", provenance=make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-401"]),
        "NEW_ENTRANTS": dict(force="NEW_ENTRANTS", intensity="MEDIUM", assessment="moderate technical barrier, some brand loyalty", provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        "SUBSTITUTES": dict(force="SUBSTITUTES", intensity="LOW", assessment="no functionally-equivalent substitute exists yet", provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        "SUPPLIER_POWER": dict(force="SUPPLIER_POWER", intensity="LOW", assessment="many interchangeable cloud infrastructure suppliers", provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        "BUYER_POWER": dict(force="BUYER_POWER", intensity="MEDIUM", assessment="large buyers negotiate, long tail does not", provenance=make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-402"]),
    }
    base.update(overrides)
    return [
        force_entry(v["force"], v["intensity"], v["assessment"], v["provenance"], supporting_evidence_refs=v.get("supporting_evidence_refs"))
        for v in base.values()
    ]


def _valid_analysis(
    *,
    analysis_id: str = "PFF-T-001",
    forces: list[dict] | None = None,
    overall_attractiveness: str = "moderate industry attractiveness: rivalry and buyer power compress margins, but entry barriers and substitute threats are limited",
):
    return generate_porter_five_forces_analysis(
        analysis_id,
        forces if forces is not None else _forces(),
        overall_attractiveness,
        make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_analysis_validates_against_the_real_schema(self):
        self.contracts.validate(PFF_SCHEMA, _valid_analysis(), "porter five forces analysis")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, analysis = live.invoke(
            METHOD_ID, generate_porter_five_forces_analysis, "PFF-T-INVOKE", _forces(), "some conclusion", make_provenance("AI_INFERENCE", "AI_SUGGESTED")
        )
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/strategy.porter_five_forces.contract.yaml")
        self.assertEqual(analysis["id"], "PFF-T-INVOKE")

    def test_empty_catalog_blocks_porter_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_analysis())
        tampered["overall_attractiveness"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(PFF_SCHEMA, tampered, "tampered analysis")
        gate = evaluate_porter_five_forces_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        """additionalProperties:false must reject a smuggled top-level key (same discipline as
        regression-discontinuity-record.schema.yaml's own equivalent test)."""
        analysis = _valid_analysis()
        analysis["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(PFF_SCHEMA, analysis, "analysis with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_a_forces_entry(self):
        analysis = _valid_analysis()
        analysis["forces"][0] = {**analysis["forces"][0], "score": 42}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(PFF_SCHEMA, analysis, "analysis with a smuggled forces[] key")

    def test_id_is_distinct_from_strategy_swot_machine_id(self):
        self.assertNotEqual(METHOD_ID, "strategy.swot")
        self.assertEqual(METHOD_ID, "strategy.porter_five_forces")

    def test_porter_and_swot_both_resolve_as_separate_entries(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID, "strategy.swot"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's
        own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "strategy.porter_five_forces.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "strategy.porter_five_forces contract")


class ForceVocabularyTests(unittest.TestCase):
    def test_force_names_is_exactly_the_atlas_5121_five(self):
        self.assertEqual(FORCE_NAMES, frozenset({"INDUSTRY_RIVALRY", "NEW_ENTRANTS", "SUBSTITUTES", "SUPPLIER_POWER", "BUYER_POWER"}))

    def test_valid_intensities_is_exactly_high_medium_low(self):
        self.assertEqual(VALID_INTENSITIES, frozenset({"HIGH", "MEDIUM", "LOW"}))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "PFF-")

    def test_force_entry_rejects_an_unknown_force_name(self):
        with self.assertRaisesRegex(InvariantViolation, "PORTER_UNKNOWN_FORCE"):
            force_entry("MACRO_ECONOMY", "HIGH", "not one of the five", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_force_entry_rejects_an_unknown_intensity(self):
        with self.assertRaisesRegex(InvariantViolation, "PORTER_INVALID_INTENSITY"):
            force_entry("INDUSTRY_RIVALRY", "SEVERE", "not one of the three", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_force_entry_accepts_all_5_names_and_all_3_intensities(self):
        for name in sorted(FORCE_NAMES):
            for intensity in sorted(VALID_INTENSITIES):
                entry = force_entry(name, intensity, "some assessment", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
                self.assertEqual(entry["force"], name)
                self.assertEqual(entry["intensity"], intensity)


class ForceSetCompletenessTests(unittest.TestCase):
    """Invariant 1 (module docstring): forces must name EXACTLY the 5 FORCE_NAMES, each exactly once, in any
    order -- the core "closed SET, unordered, completeness required" design-shape invariant."""

    def test_valid_5_forces_in_atlas_order_is_accepted(self):
        analysis = _valid_analysis()
        self.assertEqual(len(analysis["forces"]), 5)

    def test_valid_5_forces_in_a_shuffled_order_is_also_accepted(self):
        """Order carries no meaning Atlas cites -- unlike causal.logic_model's STAGE_ORDER, position is not enforced."""
        forces = _forces()
        shuffled = [forces[4], forces[1], forces[3], forces[0], forces[2]]
        analysis = generate_porter_five_forces_analysis("PFF-T-SHUFFLED", shuffled, "conclusion", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
        self.assertEqual({f["force"] for f in analysis["forces"]}, FORCE_NAMES)

    def test_missing_one_force_is_refused(self):
        forces = _forces()[:4]  # drops BUYER_POWER (dict insertion order preserved -- BUYER_POWER is last)
        with self.assertRaisesRegex(InvariantViolation, "PORTER_INCOMPLETE_FORCE_SET"):
            generate_porter_five_forces_analysis("PFF-T-MISSING", forces, "conclusion", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_missing_all_forces_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PORTER_INCOMPLETE_FORCE_SET"):
            generate_porter_five_forces_analysis("PFF-T-EMPTY", [], "conclusion", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_duplicate_force_replacing_a_different_one_is_refused(self):
        """6 slots is impossible (maxItems:5 at the schema layer already prevents 6), but a caller supplying
        5 entries where one force is duplicated and another is entirely missing must still be refused by the
        runtime completeness check."""
        forces = _forces()[:4] + [_forces()[0]]  # INDUSTRY_RIVALRY appears twice, BUYER_POWER missing
        with self.assertRaisesRegex(InvariantViolation, "PORTER_INCOMPLETE_FORCE_SET"):
            generate_porter_five_forces_analysis("PFF-T-DUP", forces, "conclusion", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_six_forces_is_refused(self):
        forces = _forces() + [force_entry("INDUSTRY_RIVALRY", "LOW", "a 6th duplicate entry", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]
        with self.assertRaisesRegex(InvariantViolation, "PORTER_INCOMPLETE_FORCE_SET"):
            generate_porter_five_forces_analysis("PFF-T-SIX", forces, "conclusion", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_non_list_forces_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PORTER_INVALID_FORCE_SET"):
            generate_porter_five_forces_analysis("PFF-T-NONLIST", "not a list", "conclusion", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_unknown_force_name_smuggled_in_via_raw_dict_is_refused(self):
        forces = _forces()[:4] + [{"force": "REGULATION", "intensity": "HIGH", "assessment": "x", "provenance": make_provenance("HYPOTHESIS", "AI_SUGGESTED")}]
        with self.assertRaisesRegex(InvariantViolation, "PORTER_UNKNOWN_FORCE"):
            generate_porter_five_forces_analysis("PFF-T-UNKNOWNFORCE", forces, "conclusion", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))


class ForceContentTests(unittest.TestCase):
    """Invariant 2 (module docstring): every force entry needs a non-empty assessment and a valid intensity."""

    def test_empty_assessment_is_refused(self):
        forces = _forces()
        forces[0] = {**forces[0], "assessment": ""}
        with self.assertRaisesRegex(InvariantViolation, "PORTER_EMPTY_ASSESSMENT"):
            generate_porter_five_forces_analysis("PFF-T-EMPTYASSESS", forces, "conclusion", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_whitespace_only_assessment_is_refused(self):
        forces = _forces()
        forces[0] = {**forces[0], "assessment": "   "}
        with self.assertRaisesRegex(InvariantViolation, "PORTER_EMPTY_ASSESSMENT"):
            generate_porter_five_forces_analysis("PFF-T-WSASSESS", forces, "conclusion", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_invalid_intensity_smuggled_in_via_raw_dict_is_refused(self):
        forces = _forces()
        forces[0] = {**forces[0], "intensity": "CRITICAL"}
        with self.assertRaisesRegex(InvariantViolation, "PORTER_INVALID_INTENSITY"):
            generate_porter_five_forces_analysis("PFF-T-BADINTENSITY", forces, "conclusion", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_missing_intensity_key_is_refused(self):
        forces = _forces()
        del forces[0]["intensity"]
        with self.assertRaisesRegex(InvariantViolation, "PORTER_INVALID_FORCE_SET"):
            generate_porter_five_forces_analysis("PFF-T-NOINTENSITY", forces, "conclusion", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))


class OverallAttractivenessTests(unittest.TestCase):
    """Invariant 3 (module docstring): overall_attractiveness is required, non-empty, and never auto-derived."""

    def test_empty_overall_attractiveness_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PORTER_EMPTY_OVERALL_ATTRACTIVENESS"):
            _valid_analysis(overall_attractiveness="")

    def test_whitespace_only_overall_attractiveness_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PORTER_EMPTY_OVERALL_ATTRACTIVENESS"):
            _valid_analysis(overall_attractiveness="   ")

    def test_none_overall_attractiveness_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PORTER_EMPTY_OVERALL_ATTRACTIVENESS"):
            _valid_analysis(overall_attractiveness=None)

    def test_a_real_conclusion_is_accepted_and_stored_verbatim(self):
        text = "attractiveness is low: rivalry and buyer power both HIGH, no offsetting weak forces"
        analysis = _valid_analysis(overall_attractiveness=text)
        self.assertEqual(analysis["overall_attractiveness"], text)

    def test_builder_never_derives_overall_attractiveness_from_intensities(self):
        """Task-mandated restraint: even an all-HIGH (maximally unattractive by convention) force set must
        NOT cause the builder to silently synthesize or override a caller-supplied conclusion."""
        all_high = [force_entry(name, "HIGH", "assessment text", make_provenance("HYPOTHESIS", "AI_SUGGESTED")) for name in sorted(FORCE_NAMES)]
        analysis = generate_porter_five_forces_analysis("PFF-T-ALLHIGH", all_high, "caller-supplied verbatim text", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
        self.assertEqual(analysis["overall_attractiveness"], "caller-supplied verbatim text")


class IdAndVersionTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PORTER_INVALID_ID"):
            _valid_analysis(analysis_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PORTER_INVALID_ID"):
            _valid_analysis(analysis_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PORTER_INVALID_VERSION"):
            generate_porter_five_forces_analysis("PFF-T-002", _forces(), "conclusion", make_provenance("AI_INFERENCE", "AI_SUGGESTED"), version=1)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID analysis's raw dict directly (never going through the builder again), then call
    the gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_analysis(self):
        gate = evaluate_porter_five_forces_integrity_gate(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_missing_force(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["forces"] = analysis["forces"][:4]
        gate = evaluate_porter_five_forces_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_duplicated_force(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["forces"] = analysis["forces"][:4] + [analysis["forces"][0]]
        gate = evaluate_porter_five_forces_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_assessment(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["forces"][0]["assessment"] = ""
        gate = evaluate_porter_five_forces_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_invalid_intensity(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["forces"][0]["intensity"] = "EXTREME"
        gate = evaluate_porter_five_forces_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_overall_attractiveness(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["overall_attractiveness"] = ""
        gate = evaluate_porter_five_forces_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_analysis(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_porter_five_forces_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["id"] = "WRONG-001"
        gate = evaluate_porter_five_forces_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["version"] = 1
        gate = evaluate_porter_five_forces_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_a_force_provenance_invalid(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["forces"][0]["provenance"] = None
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
    """Atlas §12.11 gives no explicit misuse warning the way SWOT's own L1347 does (disclosed in this
    method's contract open_questions) -- this gate is a same-family generalization of SWOT's identical check:
    an EVIDENCE-labeled force with no supporting_evidence_refs is an unbacked claim."""

    def test_valid_analysis_passes(self):
        gate = evaluate_evidence_labeling_required_gate(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_evidence_labeled_force_with_no_supporting_refs_fails(self):
        forces = _forces()
        fabricated = force_entry("INDUSTRY_RIVALRY", "HIGH", "rivalry is intense", make_provenance("EVIDENCE", "AI_SUGGESTED"))
        forces = [f for f in forces if f["force"] != "INDUSTRY_RIVALRY"] + [fabricated]
        analysis = generate_porter_five_forces_analysis("PFF-T-UNEVIDENCED", forces, "conclusion", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
        gate = evaluate_evidence_labeling_required_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertTrue(any(p["force"] == "INDUSTRY_RIVALRY" for p in gate["evidence"][0]["problems"]))

    def test_hypothesis_labeled_force_with_no_supporting_refs_still_passes(self):
        """Only EVIDENCE-labeled claims require a citation -- a disclosed HYPOTHESIS is not a violation."""
        gate = evaluate_evidence_labeling_required_gate(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_porter_five_forces_gates_returns_three_gates_in_order(self):
        results = evaluate_porter_five_forces_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "evidence_labeling_required", "porter_five_forces_integrity"])

    def test_evaluate_porter_five_forces_gates_all_pass_on_a_valid_analysis(self):
        results = evaluate_porter_five_forces_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "strategy.porter_five_forces")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        analysis = _valid_analysis()
        self.assertEqual(set(analysis.keys()), {"id", "version", "generated_by_method", "forces", "overall_attractiveness", "provenance"})

    def test_force_entry_does_not_leak_extra_keys_when_no_refs_given(self):
        entry = force_entry("INDUSTRY_RIVALRY", "HIGH", "text", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
        self.assertEqual(set(entry.keys()), {"force", "intensity", "assessment", "provenance"})

    def test_force_entry_includes_supporting_evidence_refs_when_provided(self):
        entry = force_entry("INDUSTRY_RIVALRY", "HIGH", "text", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-1"])
        self.assertEqual(entry["supporting_evidence_refs"], ["E-1"])


if __name__ == "__main__":
    unittest.main()
