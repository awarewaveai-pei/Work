"""Mutation-style tests for ``jurisdiction.cultural_context_review`` (F23 Global Jurisdiction/
Compliance/Localization family, Atlas L941, §12.44).

§12.44's own 關鍵規則 ("文化模型是 hypothesis/context，不是刻板印象；高風險決策要有 Local Data /
Interview / Survey / Expert Review") is proven at BOTH independent layers: the construction-time
builder refuses a record missing any of the 8 declared factors AND refuses a HIGH-risk factor
with empty evidence; the independent gates re-derive the same rules directly from a raw (possibly
hand-tampered) dict, never trusting that the builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.jurisdiction.cultural_context_review import (
    EVIDENCE_TYPES,
    FACTORS,
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_cultural_context_review_gates,
    evaluate_evidence_required_for_high_risk_gate,
    evaluate_factor_completeness_gate,
    evaluate_provenance_required_gate,
    generate_cultural_context_review,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

CULTCTX_SCHEMA = "ai-lego://specs/cognitive/typed-objects/cultural-context-review-record.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _all_low() -> dict:
    return {name: {"risk_level": "LOW", "note": f"{name} assessed low risk", "evidence": []} for name in FACTORS}


def _kwargs(**overrides: object) -> dict:
    base = dict(
        target="JP enterprise B2B sales motion -- direct-outreach cold-call campaign",
        factors=_all_low(),
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_review(*, record_id: str = "CULTCTX-T-001", **overrides: object):
    return generate_cultural_context_review(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_review_validates_against_the_real_schema(self):
        self.contracts.validate(CULTCTX_SCHEMA, _valid_review(), "cultural context review record")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, review = live.invoke(METHOD_ID, generate_cultural_context_review, "CULTCTX-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/jurisdiction.cultural_context_review.contract.yaml")
        self.assertEqual(review["id"], "CULTCTX-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        review = _valid_review()
        review["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CULTCTX_SCHEMA, review, "review with a smuggled top-level key")

    def test_schema_rejects_an_evidence_item_outside_the_closed_set(self):
        review = _valid_review()
        review["factors"]["trust"]["evidence"] = ["ANECDOTE"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CULTCTX_SCHEMA, review, "review with an out-of-enum evidence item")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "jurisdiction.cultural_context_review.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "jurisdiction.cultural_context_review contract")


class FactorCountTests(unittest.TestCase):
    def test_exactly_eight_factors_declared(self):
        self.assertEqual(len(FACTORS), 8)
        self.assertEqual(
            set(FACTORS),
            {"trust", "authority", "communication_style", "privacy_perception", "risk_preference", "technology_acceptance", "education_expectation", "historical_context"},
        )

    def test_exactly_four_evidence_types(self):
        self.assertEqual(EVIDENCE_TYPES, frozenset({"LOCAL_DATA", "INTERVIEW", "SURVEY", "EXPERT_REVIEW"}))


class FactorCompletenessTests(unittest.TestCase):
    """§12.44's own 8-factor list -- no missing, no extra."""

    def test_missing_factor_is_refused(self):
        kwargs = _kwargs()
        del kwargs["factors"]["historical_context"]
        with self.assertRaisesRegex(InvariantViolation, "CULTCTX_INVALID_FACTORS"):
            generate_cultural_context_review("CULTCTX-T-002", **kwargs)

    def test_unknown_extra_factor_is_refused(self):
        kwargs = _kwargs()
        kwargs["factors"]["religion"] = {"risk_level": "LOW", "note": "n/a", "evidence": []}
        with self.assertRaisesRegex(InvariantViolation, "CULTCTX_INVALID_FACTORS"):
            generate_cultural_context_review("CULTCTX-T-003", **kwargs)

    def test_invalid_risk_level_is_refused(self):
        kwargs = _kwargs()
        kwargs["factors"]["trust"]["risk_level"] = "SEVERE"
        with self.assertRaisesRegex(InvariantViolation, "CULTCTX_INVALID_FACTORS"):
            generate_cultural_context_review("CULTCTX-T-004", **kwargs)

    def test_empty_note_is_refused(self):
        kwargs = _kwargs()
        kwargs["factors"]["trust"]["note"] = ""
        with self.assertRaisesRegex(InvariantViolation, "CULTCTX_INVALID_FACTORS"):
            generate_cultural_context_review("CULTCTX-T-005", **kwargs)

    def test_evidence_item_outside_closed_set_is_refused(self):
        kwargs = _kwargs()
        kwargs["factors"]["trust"]["evidence"] = ["ANECDOTE"]
        with self.assertRaisesRegex(InvariantViolation, "CULTCTX_INVALID_FACTORS"):
            generate_cultural_context_review("CULTCTX-T-006", **kwargs)

    def test_duplicate_evidence_item_is_refused(self):
        kwargs = _kwargs()
        kwargs["factors"]["trust"] = {"risk_level": "MEDIUM", "note": "n", "evidence": ["LOCAL_DATA", "LOCAL_DATA"]}
        with self.assertRaisesRegex(InvariantViolation, "CULTCTX_INVALID_FACTORS"):
            generate_cultural_context_review("CULTCTX-T-007", **kwargs)

    def test_all_eight_present_and_well_shaped_is_accepted(self):
        review = _valid_review()
        self.assertEqual(set(review["factors"].keys()), set(FACTORS))


class EvidenceForHighRiskTests(unittest.TestCase):
    """§12.44's own 關鍵規則: 高風險決策要有 Local Data/Interview/Survey/Expert Review -- the
    anti-stereotype invariant this method exists to enforce."""

    def test_high_risk_with_no_evidence_is_refused(self):
        kwargs = _kwargs()
        kwargs["factors"]["authority"] = {"risk_level": "HIGH", "note": "this culture is just hierarchical", "evidence": []}
        with self.assertRaisesRegex(InvariantViolation, "CULTCTX_MISSING_EVIDENCE_FOR_HIGH_RISK"):
            generate_cultural_context_review("CULTCTX-T-008", **kwargs)

    def test_high_risk_with_one_evidence_item_is_accepted(self):
        kwargs = _kwargs()
        kwargs["factors"]["authority"] = {"risk_level": "HIGH", "note": "confirmed via local interviews", "evidence": ["INTERVIEW"]}
        review = generate_cultural_context_review("CULTCTX-T-009", **kwargs)
        self.assertEqual(review["factors"]["authority"]["risk_level"], "HIGH")

    def test_medium_risk_with_no_evidence_is_accepted(self):
        """Only HIGH triggers the mandatory-evidence rule -- MEDIUM/LOW are unaffected (see contract open_questions)."""
        kwargs = _kwargs()
        kwargs["factors"]["trust"] = {"risk_level": "MEDIUM", "note": "moderate concern, no hard data yet", "evidence": []}
        review = generate_cultural_context_review("CULTCTX-T-010", **kwargs)
        self.assertEqual(review["factors"]["trust"]["risk_level"], "MEDIUM")

    def test_low_risk_with_no_evidence_is_accepted(self):
        review = _valid_review()
        self.assertEqual(review["factors"]["trust"]["evidence"], [])

    def test_all_four_evidence_types_individually_satisfy_the_high_risk_rule(self):
        for evidence_type in sorted(EVIDENCE_TYPES):
            with self.subTest(evidence_type=evidence_type):
                kwargs = _kwargs()
                kwargs["factors"]["authority"] = {"risk_level": "HIGH", "note": "backed", "evidence": [evidence_type]}
                review = generate_cultural_context_review(f"CULTCTX-T-EV-{evidence_type}", **kwargs)
                self.assertEqual(review["factors"]["authority"]["evidence"], [evidence_type])


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        review = generate_cultural_context_review("CULTCTX-T-011", **kwargs)
        kwargs["factors"]["trust"]["note"] = "MUTATED AFTER RETURN"
        self.assertEqual(review["factors"]["trust"]["note"], "trust assessed low risk")

    def test_mutating_caller_evidence_list_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        kwargs["factors"]["authority"] = {"risk_level": "HIGH", "note": "backed", "evidence": ["INTERVIEW"]}
        review = generate_cultural_context_review("CULTCTX-T-012", **kwargs)
        kwargs["factors"]["authority"]["evidence"].append("SURVEY")
        self.assertEqual(review["factors"]["authority"]["evidence"], ["INTERVIEW"])


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_review(self):
        results = evaluate_cultural_context_review_gates(_valid_review(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_factor_completeness_gate_catches_hand_tampered_missing_factor(self):
        record = copy.deepcopy(_valid_review())
        del record["factors"]["historical_context"]
        gate = evaluate_factor_completeness_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_evidence_required_for_high_risk_gate_catches_hand_tampered_evidence_stripped(self):
        kwargs = _kwargs()
        kwargs["factors"]["authority"] = {"risk_level": "HIGH", "note": "backed", "evidence": ["INTERVIEW"]}
        record = copy.deepcopy(generate_cultural_context_review("CULTCTX-T-013", **kwargs))
        record["factors"]["authority"]["evidence"] = []
        gate = evaluate_evidence_required_for_high_risk_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_evidence_required_for_high_risk_gate_passes_a_genuinely_backed_record(self):
        kwargs = _kwargs()
        kwargs["factors"]["authority"] = {"risk_level": "HIGH", "note": "backed", "evidence": ["INTERVIEW", "EXPERT_REVIEW"]}
        review = generate_cultural_context_review("CULTCTX-T-014", **kwargs)
        gate = evaluate_evidence_required_for_high_risk_gate(review, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_evidence_required_for_high_risk_gate_does_not_need_full_completeness(self):
        """The gate independently scans present factors -- it must catch a HIGH-risk violation
        even when the record is ALSO missing other factors (a hand-tampered partial record)."""
        record = {"factors": {"authority": {"risk_level": "HIGH", "note": "n", "evidence": []}}}
        gate = evaluate_evidence_required_for_high_risk_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_cultural_context_review_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_review(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_review())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "CULTCTX-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CULTCTX_INVALID_ID"):
            _valid_review(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CULTCTX_INVALID_VERSION"):
            generate_cultural_context_review("CULTCTX-T-015", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CULTCTX_INVALID_PROVENANCE"):
            _valid_review(provenance={"epistemic_type": "NOT_REAL"})

    def test_empty_target_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CULTCTX_INVALID_TARGET"):
            _valid_review(target="")

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "jurisdiction.cultural_context_review")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_cultural_context_review_gates(_valid_review(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "factor_completeness", "evidence_required_for_high_risk"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        review = _valid_review()
        self.assertEqual(
            set(review.keys()),
            {"id", "version", "generated_by_method", "target", "factors", "provenance"},
        )


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """Same defect class this corpus's F13/F15/F22 batches repeatedly found in a majority of their
    builders -- returning the caller's own ``provenance`` dict BY REFERENCE rather than a copy.
    Guards against a 5th recurrence."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_review()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_cultural_context_review(base["id"], base["target"], base["factors"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()
