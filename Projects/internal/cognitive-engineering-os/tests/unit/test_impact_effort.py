"""Mutation-style tests for ``decision.impact_effort`` (third member of the `decision` family, F16, after
`decision.ahp` and `decision.mcda`).

Two-layer discipline proven for BOTH headline invariants, same split ``test_fault_tree.py`` already
establishes for its own family:

1. Quadrant genuine-compute -- ``classify_quadrant`` is checked against known boundary cases at the compute
   layer, then re-proven end-to-end: construction always produces a matching quadrant (there is no
   constructor parameter for it), and a hand-tampered mismatched quadrant is caught independently by
   ``evaluate_quadrant_integrity_gate``, which never trusts a stored label.
2. Scale consistency -- ``validate_scale``/``validate_threshold_in_scale``/``validate_value_in_scale`` are
   each checked against accept/reject boundary cases at the compute layer, then re-proven at both
   construction (raises) and the gate (re-derives, does not trust).

The no-automatic-authority guard (Atlas §11.30 L1905-1906, inferred -- see the method contract's own
compilation_decisions for why this is disclosed as prose-grounded, not table-cited) is proven at both
independent layers, same discipline ``test_mcda.py``'s own ``NoAutomaticAuthorityTests`` class already
established for a sibling rule.
"""

from __future__ import annotations

import copy
import math
import unittest

from ai_lego import resolve_spec_root
from ai_lego.compute.impact_effort.classification import (
    QUADRANT_AVOID_RECONSIDER,
    QUADRANT_FILL_INS,
    QUADRANT_MAJOR_PROJECTS,
    QUADRANT_QUICK_WINS,
    VALID_QUADRANTS,
    classify_ideas,
    classify_quadrant,
    validate_scale,
    validate_threshold_in_scale,
    validate_value_in_scale,
)
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.decision.impact_effort import (
    FORBIDDEN_AUTHORITY_KEYS,
    METHOD_ID,
    all_gates_pass,
    assert_no_automatic_authority_claim,
    evaluate_genuine_compute_gate,
    evaluate_impact_effort_gates,
    evaluate_no_automatic_authority_gate,
    evaluate_provenance_required_gate,
    evaluate_quadrant_integrity_gate,
    generate_impact_effort_classification,
)
from ai_lego.modules.research.gates import evaluate_statistical_gate
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

CLASSIFICATION_SCHEMA = "ai-lego://specs/cognitive/typed-objects/impact-effort-classification.schema.yaml"
METHOD_SCHEMA = "ai-lego://specs/cognitive/method.schema.yaml"
VALIDATOR = "test"
TS = "2026-09-08T00:00:00Z"


def _prov():
    return make_provenance("CALCULATED_RESULT", "AI_GENERATED")


def _scale(lo=1, hi=5):
    return {"min": lo, "max": hi}


def _ideas():
    return [
        {"id": "IDEA-1", "label": "self-serve password reset", "impact": 5, "effort": 2},  # quick_wins
        {"id": "IDEA-2", "label": "SSO integration", "impact": 5, "effort": 5},  # major_projects
        {"id": "IDEA-3", "label": "recolor login page", "impact": 1, "effort": 1},  # fill_ins
        {"id": "IDEA-4", "label": "custom legacy export format", "impact": 2, "effort": 5},  # avoid_reconsider
    ]


def _build(
    record_id="IMPACTEFFORT-T-001",
    subject="Q4 triage",
    ideas=None,
    impact_scale=None,
    effort_scale=None,
    impact_threshold=3,
    effort_threshold=3,
    version="1.0.0",
):
    return generate_impact_effort_classification(
        record_id,
        subject,
        _ideas() if ideas is None else ideas,
        _scale() if impact_scale is None else impact_scale,
        _scale() if effort_scale is None else effort_scale,
        impact_threshold,
        effort_threshold,
        _prov(),
        version=version,
    )


def _valid_classification():
    return _build()


class ClassifyQuadrantComputeTests(unittest.TestCase):
    """Pure ``classify_quadrant`` -- real boundary arithmetic, not just 'does it run'."""

    def test_high_impact_high_effort_is_major_projects(self):
        self.assertEqual(classify_quadrant(5, 5, 3, 3), QUADRANT_MAJOR_PROJECTS)

    def test_high_impact_low_effort_is_quick_wins(self):
        self.assertEqual(classify_quadrant(5, 1, 3, 3), QUADRANT_QUICK_WINS)

    def test_low_impact_low_effort_is_fill_ins(self):
        self.assertEqual(classify_quadrant(1, 1, 3, 3), QUADRANT_FILL_INS)

    def test_low_impact_high_effort_is_avoid_reconsider(self):
        self.assertEqual(classify_quadrant(1, 5, 3, 3), QUADRANT_AVOID_RECONSIDER)

    def test_impact_exactly_at_threshold_is_high(self):
        """>= convention (OQ-IMPACTEFFORT-1): impact == threshold counts as High."""
        self.assertEqual(classify_quadrant(3, 1, 3, 3), QUADRANT_QUICK_WINS)

    def test_effort_exactly_at_threshold_is_high(self):
        self.assertEqual(classify_quadrant(1, 3, 3, 3), QUADRANT_AVOID_RECONSIDER)

    def test_impact_just_below_threshold_is_low(self):
        self.assertEqual(classify_quadrant(2.999, 1, 3, 3), QUADRANT_FILL_INS)

    def test_effort_just_below_threshold_is_low(self):
        self.assertEqual(classify_quadrant(5, 2.999, 3, 3), QUADRANT_QUICK_WINS)

    def test_negative_scale_values_classify_correctly(self):
        self.assertEqual(classify_quadrant(-1, -1, -2, -2), QUADRANT_MAJOR_PROJECTS)  # both >= -2 -> High, High
        self.assertEqual(classify_quadrant(-1, -5, -2, -2), QUADRANT_QUICK_WINS)  # -5 < -2 -> High impact, Low effort

    def test_float_values_classify_correctly(self):
        self.assertEqual(classify_quadrant(4.5, 1.2, 3.0, 3.0), QUADRANT_QUICK_WINS)

    def test_classify_quadrant_always_returns_one_of_the_four_canonical_labels(self):
        for impact in (1, 2, 3, 4, 5):
            for effort in (1, 2, 3, 4, 5):
                with self.subTest(impact=impact, effort=effort):
                    self.assertIn(classify_quadrant(impact, effort, 3, 3), VALID_QUADRANTS)

    def test_classify_quadrant_is_pure_repeated_calls_agree(self):
        first = classify_quadrant(4, 2, 3, 3)
        second = classify_quadrant(4, 2, 3, 3)
        self.assertEqual(first, second)


class ScaleValidationComputeTests(unittest.TestCase):
    """``validate_scale`` / ``validate_threshold_in_scale`` / ``validate_value_in_scale`` -- real accept/reject
    boundary cases, same bool/NaN/inf discipline ``root_cause.fault_tree``'s own probability check uses."""

    def test_valid_scale_is_accepted(self):
        validate_scale(_scale(1, 5), "impact")  # must not raise

    def test_scale_min_equal_max_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_INVALID_SCALE"):
            validate_scale({"min": 3, "max": 3}, "impact")

    def test_scale_min_greater_than_max_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_INVALID_SCALE"):
            validate_scale({"min": 5, "max": 1}, "impact")

    def test_scale_missing_min_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_INVALID_SCALE"):
            validate_scale({"max": 5}, "impact")

    def test_scale_missing_max_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_INVALID_SCALE"):
            validate_scale({"min": 1}, "impact")

    def test_scale_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_INVALID_SCALE"):
            validate_scale({"min": 1, "max": 5, "unit": "points"}, "impact")

    def test_scale_non_dict_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_INVALID_SCALE"):
            validate_scale([1, 5], "impact")

    def test_scale_min_non_number_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_INVALID_SCALE"):
            validate_scale({"min": "low", "max": 5}, "impact")

    def test_scale_min_boolean_is_refused_not_silently_accepted(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_INVALID_SCALE"):
            validate_scale({"min": False, "max": 5}, "impact")

    def test_scale_max_nan_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_INVALID_SCALE"):
            validate_scale({"min": 1, "max": math.nan}, "impact")

    def test_scale_min_infinite_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_INVALID_SCALE"):
            validate_scale({"min": -math.inf, "max": 5}, "impact")

    def test_threshold_within_scale_is_accepted(self):
        validate_threshold_in_scale(3, _scale(1, 5), "impact")  # must not raise

    def test_threshold_at_scale_min_is_accepted(self):
        validate_threshold_in_scale(1, _scale(1, 5), "impact")  # must not raise

    def test_threshold_at_scale_max_is_accepted(self):
        validate_threshold_in_scale(5, _scale(1, 5), "impact")  # must not raise

    def test_threshold_below_scale_min_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_THRESHOLD_OUT_OF_SCALE"):
            validate_threshold_in_scale(0, _scale(1, 5), "impact")

    def test_threshold_above_scale_max_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_THRESHOLD_OUT_OF_SCALE"):
            validate_threshold_in_scale(6, _scale(1, 5), "impact")

    def test_threshold_boolean_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_INVALID_THRESHOLD"):
            validate_threshold_in_scale(True, _scale(0, 5), "impact")

    def test_threshold_nan_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_INVALID_THRESHOLD"):
            validate_threshold_in_scale(math.nan, _scale(1, 5), "impact")

    def test_value_within_scale_is_accepted(self):
        validate_value_in_scale(3, _scale(1, 5), "impact", "IDEA-1")  # must not raise

    def test_value_at_scale_boundaries_is_accepted(self):
        validate_value_in_scale(1, _scale(1, 5), "impact", "IDEA-1")
        validate_value_in_scale(5, _scale(1, 5), "impact", "IDEA-1")

    def test_value_below_scale_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_VALUE_OUT_OF_SCALE"):
            validate_value_in_scale(0, _scale(1, 5), "impact", "IDEA-1")

    def test_value_above_scale_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_VALUE_OUT_OF_SCALE"):
            validate_value_in_scale(11, _scale(1, 10), "effort", "IDEA-1")

    def test_value_boolean_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_INVALID_VALUE"):
            validate_value_in_scale(True, _scale(0, 5), "impact", "IDEA-1")

    def test_value_infinite_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_INVALID_VALUE"):
            validate_value_in_scale(math.inf, _scale(1, 5), "impact", "IDEA-1")

    def test_mixed_scale_rejected_impact_1_to_10_effort_1_to_5(self):
        """The task's own named concern: an idea whose impact draws from a 1-10 scale must not silently pass
        when the record's own declared impact_scale is 1-5."""
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_VALUE_OUT_OF_SCALE"):
            validate_value_in_scale(8, _scale(1, 5), "impact", "IDEA-1")


class ClassifyIdeasComputeTests(unittest.TestCase):
    def test_classify_ideas_computes_correct_quadrant_for_each_idea(self):
        classified = {c["id"]: c["quadrant"] for c in classify_ideas(_ideas(), _scale(), _scale(), 3, 3)}
        self.assertEqual(classified["IDEA-1"], QUADRANT_QUICK_WINS)
        self.assertEqual(classified["IDEA-2"], QUADRANT_MAJOR_PROJECTS)
        self.assertEqual(classified["IDEA-3"], QUADRANT_FILL_INS)
        self.assertEqual(classified["IDEA-4"], QUADRANT_AVOID_RECONSIDER)

    def test_classify_ideas_returns_new_dicts_not_the_callers_own(self):
        original = _ideas()
        classified = classify_ideas(original, _scale(), _scale(), 3, 3)
        self.assertIsNot(classified[0], original[0])
        self.assertNotIn("quadrant", original[0])

    def test_classify_ideas_rejects_invalid_impact_scale(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_INVALID_SCALE"):
            classify_ideas(_ideas(), {"min": 5, "max": 1}, _scale(), 3, 3)

    def test_classify_ideas_rejects_threshold_out_of_scale(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_THRESHOLD_OUT_OF_SCALE"):
            classify_ideas(_ideas(), _scale(), _scale(), 99, 3)

    def test_classify_ideas_rejects_idea_value_out_of_scale(self):
        bad = [{"id": "IDEA-X", "label": "x", "impact": 999, "effort": 1}]
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_VALUE_OUT_OF_SCALE"):
            classify_ideas(bad, _scale(), _scale(), 3, 3)

    def test_classify_ideas_single_idea_is_legal(self):
        result = classify_ideas([{"id": "SOLO", "label": "one idea", "impact": 4, "effort": 1}], _scale(), _scale(), 3, 3)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["quadrant"], QUADRANT_QUICK_WINS)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_classification_validates_against_the_real_schema(self):
        self.contracts.validate(CLASSIFICATION_SCHEMA, _valid_classification(), "impact effort classification")

    def test_method_contract_yaml_itself_validates_against_method_schema(self):
        """The contract's own `verification.method` text CLAIMS this was checked -- actually re-runs it here
        so the claim stays true if the contract file ever drifts (R4: claim-before-verify, not just
        asserted once by hand)."""
        import yaml

        contract_path = self.spec_root / "methods" / "contracts" / "decision.impact_effort.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate(METHOD_SCHEMA, instance, "decision.impact_effort contract")

    def test_quadrants_match_the_expected_spread_across_the_demo_batch(self):
        analysis = _valid_classification()
        quadrants = {idea["id"]: idea["quadrant"] for idea in analysis["ideas"]}
        self.assertEqual(quadrants, {"IDEA-1": QUADRANT_QUICK_WINS, "IDEA-2": QUADRANT_MAJOR_PROJECTS, "IDEA-3": QUADRANT_FILL_INS, "IDEA-4": QUADRANT_AVOID_RECONSIDER})

    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_record_id_without_prefix_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_INVALID_RECORD_ID"):
            _build(record_id="WRONG-001")

    def test_non_string_version_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_INVALID_VERSION"):
            _build(version=1.0)

    def test_empty_subject_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_EMPTY_RECORD_FIELD"):
            _build(subject="")

    def test_whitespace_only_subject_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_EMPTY_RECORD_FIELD"):
            _build(subject="   ")

    def test_empty_ideas_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_INVALID_IDEAS"):
            _build(ideas=[])

    def test_ideas_non_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_INVALID_IDEAS"):
            _build(ideas={"id": "IDEA-1"})

    def test_idea_missing_label_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_INVALID_IDEAS"):
            _build(ideas=[{"id": "IDEA-1", "impact": 1, "effort": 1}])

    def test_idea_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_INVALID_IDEAS"):
            _build(ideas=[{"id": "IDEA-1", "label": "x", "impact": 1, "effort": 1, "owner": "alice"}])

    def test_idea_empty_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_INVALID_IDEAS"):
            _build(ideas=[{"id": "", "label": "x", "impact": 1, "effort": 1}])

    def test_idea_empty_label_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_INVALID_IDEAS"):
            _build(ideas=[{"id": "IDEA-1", "label": "  ", "impact": 1, "effort": 1}])

    def test_idea_impact_boolean_is_refused_not_silently_accepted(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_INVALID_IDEAS"):
            _build(ideas=[{"id": "IDEA-1", "label": "x", "impact": True, "effort": 1}])

    def test_idea_effort_boolean_is_refused_not_silently_accepted(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_INVALID_IDEAS"):
            _build(ideas=[{"id": "IDEA-1", "label": "x", "impact": 1, "effort": False}])

    def test_idea_impact_non_number_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_INVALID_IDEAS"):
            _build(ideas=[{"id": "IDEA-1", "label": "x", "impact": "high", "effort": 1}])

    def test_duplicate_idea_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_DUPLICATE_IDEA_ID"):
            _build(ideas=[{"id": "IDEA-1", "label": "a", "impact": 1, "effort": 1}, {"id": "IDEA-1", "label": "b", "impact": 2, "effort": 2}])

    def test_idea_impact_out_of_scale_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_VALUE_OUT_OF_SCALE"):
            _build(ideas=[{"id": "IDEA-1", "label": "x", "impact": 99, "effort": 1}])

    def test_idea_effort_out_of_scale_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_VALUE_OUT_OF_SCALE"):
            _build(ideas=[{"id": "IDEA-1", "label": "x", "impact": 1, "effort": -5}])

    def test_threshold_out_of_scale_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_THRESHOLD_OUT_OF_SCALE"):
            _build(impact_threshold=100)

    def test_invalid_scale_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_INVALID_SCALE"):
            _build(impact_scale={"min": 5, "max": 1})

    def test_quadrant_is_not_a_constructor_parameter(self):
        """Structural guarantee, not just a convention: the constructor has no parameter named `quadrant`
        at all -- a caller cannot pass one even by mistake."""
        with self.assertRaises(TypeError):
            generate_impact_effort_classification(
                "IMPACTEFFORT-T-999", "x", _ideas(), _scale(), _scale(), 3, 3, _prov(), quadrant=QUADRANT_QUICK_WINS
            )

    def test_single_idea_record_is_legal_and_valid(self):
        """Unlike decision.mcda's own >=2 Options floor -- classification is independent per idea, not a
        relative ranking, so 1 idea is a complete, meaningful run."""
        record = _build(ideas=[{"id": "SOLO", "label": "one idea", "impact": 5, "effort": 1}])
        self.contracts.validate(CLASSIFICATION_SCHEMA, record, "single-idea classification")
        self.assertEqual(record["ideas"][0]["quadrant"], QUADRANT_QUICK_WINS)

    def test_mutating_the_callers_own_inputs_after_construction_does_not_affect_the_stored_record(self):
        ideas = _ideas()
        impact_scale = _scale()
        record = _build(ideas=ideas, impact_scale=impact_scale)
        ideas[0]["impact"] = -999
        impact_scale["max"] = 999
        self.assertEqual(record["ideas"][0]["impact"], 5)
        self.assertEqual(record["impact_scale"]["max"], 5)

    def test_provenance_is_deliberately_aliased_not_rebuilt(self):
        prov = _prov()
        record = _build_with_provenance(prov)
        self.assertIs(record["provenance"], prov)

    def test_default_ai_inference_provenance_still_passes_genuine_compute(self):
        record = _build_with_provenance(make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.assertEqual(record["provenance"]["epistemic_type"], "CALCULATED_RESULT")
        self.assertEqual(evaluate_genuine_compute_gate(record, "v", "2026-10-30T00:00:00Z")["status"], "PASS")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_impact_effort_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_layer_rejects_an_id_without_the_impacteffort_prefix(self):
        record = _valid_classification()
        record["id"] = "WRONG-001"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CLASSIFICATION_SCHEMA, record, "bad id")

    def test_schema_layer_rejects_a_missing_required_top_level_field(self):
        record = _valid_classification()
        del record["effort_threshold"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CLASSIFICATION_SCHEMA, record, "missing field")

    def test_schema_layer_rejects_an_idea_with_invalid_quadrant_enum_value(self):
        record = _valid_classification()
        record["ideas"][0]["quadrant"] = "not_a_real_quadrant"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CLASSIFICATION_SCHEMA, record, "bad quadrant enum")

    def test_schema_layer_rejects_a_scale_with_min_gte_max_shape_but_extra_key(self):
        record = _valid_classification()
        record["impact_scale"]["unit"] = "points"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CLASSIFICATION_SCHEMA, record, "scale with extra key")


def _build_with_provenance(provenance):
    return generate_impact_effort_classification("IMPACTEFFORT-T-PROV", "x", _ideas(), _scale(), _scale(), 3, 3, provenance)


class NoAutomaticAuthorityTests(unittest.TestCase):
    """Atlas §11.30 L1905-1906 (inferred, see method contract compilation_decisions): 'high-risk proposals
    must not be decided from this chart alone.' Proven at both independent layers, same discipline
    test_mcda.py's own NoAutomaticAuthorityTests class already established for a sibling rule."""

    def test_top_level_authority_key_is_refused_at_construction(self):
        record = _valid_classification()
        record["approved"] = True
        with self.assertRaisesRegex(InvariantViolation, "IMPACTEFFORT_AUTOMATIC_AUTHORITY_CLAIM_FORBIDDEN"):
            assert_no_automatic_authority_claim(record)

    def test_each_forbidden_key_individually_is_refused(self):
        for key in sorted(FORBIDDEN_AUTHORITY_KEYS):
            with self.subTest(key=key):
                record = _valid_classification()
                record[key] = "x"
                with self.assertRaises(InvariantViolation):
                    assert_no_automatic_authority_claim(record)

    def test_clean_record_passes_the_authority_check(self):
        assert_no_automatic_authority_claim(_valid_classification())  # must not raise

    def test_schema_layer_independently_refuses_a_hand_crafted_bypass(self):
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        tampered = _valid_classification()
        tampered["approved"] = True
        with self.assertRaises(SchemaValidationError):
            contracts.validate(CLASSIFICATION_SCHEMA, tampered, "hand-crafted bypass")

    def test_gate_reuses_assert_no_automatic_authority_claim_and_fails_on_a_tampered_record(self):
        record = _valid_classification()
        record["decision"] = "build IDEA-2 first"
        gate = evaluate_no_automatic_authority_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_passes_on_a_clean_record(self):
        gate = evaluate_no_automatic_authority_gate(_valid_classification(), VALIDATOR, TS)
        self.assertEqual(gate["status"], "PASS")


class GateMutationTests(unittest.TestCase):
    """Every gate re-derives from the record's own raw fields -- a hand-tampered copy of an already-valid
    record must still be caught, same discipline test_fault_tree.py's own GateMutationTests establishes."""

    def test_valid_classification_passes_all_four_gates(self):
        results = evaluate_impact_effort_gates(_valid_classification(), VALIDATOR, TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "genuine_compute", "quadrant_integrity", "no_automatic_authority_claim"})
        self.assertTrue(all_gates_pass(results))

    def test_genuine_compute_gate_is_the_same_function_pareto_ahp_mcda_already_reuse(self):
        record = _valid_classification()
        direct_pass, direct_evidence = evaluate_statistical_gate(record)
        gate = evaluate_genuine_compute_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "PASS" if direct_pass else "FAIL")
        self.assertEqual(gate["evidence"], direct_evidence)

    def test_hand_tampered_quadrant_mismatch_fails_the_integrity_gate(self):
        record = _valid_classification()
        record["ideas"][0]["quadrant"] = QUADRANT_AVOID_RECONSIDER  # was quick_wins
        gate = evaluate_quadrant_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("does not match recomputed", str(gate["evidence"]))

    def test_hand_tampered_invalid_quadrant_value_fails_the_integrity_gate(self):
        record = _valid_classification()
        record["ideas"][0]["quadrant"] = "not_a_real_quadrant"
        gate = evaluate_quadrant_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_impact_out_of_scale_fails_the_integrity_gate(self):
        record = _valid_classification()
        record["ideas"][0]["impact"] = 999
        gate = evaluate_quadrant_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_scale_fails_the_integrity_gate(self):
        record = _valid_classification()
        record["impact_scale"] = {"min": 5, "max": 1}
        gate = evaluate_quadrant_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_missing_impact_scale_fails_the_integrity_gate_not_a_crash(self):
        record = _valid_classification()
        del record["impact_scale"]
        gate = evaluate_quadrant_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_threshold_out_of_scale_fails_the_integrity_gate(self):
        record = _valid_classification()
        record["effort_threshold"] = 999
        gate = evaluate_quadrant_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_missing_id_prefix_fails_the_integrity_gate(self):
        record = _valid_classification()
        record["id"] = "WRONG-001"
        gate = evaluate_quadrant_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_empty_subject_fails_the_integrity_gate(self):
        record = _valid_classification()
        record["subject"] = ""
        gate = evaluate_quadrant_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_empty_ideas_fails_the_integrity_gate(self):
        record = _valid_classification()
        record["ideas"] = []
        gate = evaluate_quadrant_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_duplicate_idea_id_fails_the_integrity_gate(self):
        record = _valid_classification()
        record["ideas"][1]["id"] = record["ideas"][0]["id"]
        gate = evaluate_quadrant_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_idea_missing_key_fails_the_integrity_gate(self):
        record = _valid_classification()
        del record["ideas"][0]["quadrant"]
        gate = evaluate_quadrant_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_evidence_reports_quadrant_counts_on_pass(self):
        gate = evaluate_quadrant_integrity_gate(_valid_classification(), VALIDATOR, TS)
        self.assertEqual(gate["status"], "PASS")
        counts = gate["evidence"][0]["quadrant_counts"]
        self.assertEqual(counts[QUADRANT_MAJOR_PROJECTS], 1)
        self.assertEqual(counts[QUADRANT_QUICK_WINS], 1)
        self.assertEqual(counts[QUADRANT_FILL_INS], 1)
        self.assertEqual(counts[QUADRANT_AVOID_RECONSIDER], 1)

    def test_integrity_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _valid_classification()
        snapshot = copy.deepcopy(record)
        evaluate_quadrant_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(record, snapshot)

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        results = evaluate_impact_effort_gates("not a dict", VALIDATOR, TS)
        self.assertFalse(all_gates_pass(results))
        self.assertTrue(all(r["status"] == "FAIL" for r in results))

    def test_missing_record_provenance_fails_the_provenance_gate_not_a_crash(self):
        record = _valid_classification()
        del record["provenance"]
        gate = evaluate_provenance_required_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_all_gates_pass_returns_false_when_a_gate_fails(self):
        results = evaluate_impact_effort_gates(_valid_classification(), VALIDATOR, TS)
        results[0] = dict(results[0], status="FAIL")
        self.assertFalse(all_gates_pass(results))


if __name__ == "__main__":
    unittest.main()
