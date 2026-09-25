"""Mutation-style tests for ``decision.kano`` (12th concrete member of the ``decision`` family, F16, after
ahp/mcda/impact_effort/ice/rice/moscow/weighted_decision_matrix/topsis/decision_tree/expected_value/
pareto_frontier).

Two-layer discipline proven for the headline invariant, same split ``test_impact_effort.py`` already
establishes for its own family:

1. Category genuine-compute -- ``classify_kano_category`` is checked against every one of the 6 canonical
   categories (plus a full 25-cell totality sweep) at the compute layer, then re-proven end-to-end:
   construction always produces a matching category (there is no constructor parameter for it), and a
   hand-tampered mismatched category is caught independently by ``evaluate_kano_integrity_gate``, which never
   trusts a stored label.
2. Response validity -- ``validate_response`` is checked against accept/reject boundary cases at the compute
   layer, then re-proven at both construction (raises ``KANO_INVALID_FEATURES``, the shape-check layer -- see
   the dedicated asymmetric-unreachability test below for why ``KANO_INVALID_RESPONSE`` itself never surfaces
   through this path) and the gate (re-derives, does not trust).

No automatic-authority guard tests here (unlike ``test_impact_effort.py``'s own ``NoAutomaticAuthorityTests``)
-- Atlas gives Kano no dedicated section, no prose caution, and no §22.3 gate-table row (grep-confirmed), so
``decision.kano`` has no such rule to prove (see the method contract's own compilation_decisions)."""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.compute.kano.classification import (
    CATEGORY_BASIC,
    CATEGORY_DELIGHTER,
    CATEGORY_INDIFFERENT,
    CATEGORY_PERFORMANCE,
    CATEGORY_QUESTIONABLE,
    CATEGORY_REVERSE,
    VALID_CATEGORIES,
    VALID_RESPONSES,
    classify_features,
    classify_kano_category,
    validate_response,
)
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.decision.kano import (
    METHOD_ID,
    all_gates_pass,
    evaluate_genuine_compute_gate,
    evaluate_kano_gates,
    evaluate_kano_integrity_gate,
    evaluate_provenance_required_gate,
    generate_kano_classification_record,
)
from ai_lego.modules.research.gates import evaluate_statistical_gate
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

CLASSIFICATION_SCHEMA = "ai-lego://specs/cognitive/typed-objects/kano-classification-record.schema.yaml"
METHOD_SCHEMA = "ai-lego://specs/cognitive/method.schema.yaml"
VALIDATOR = "test"
TS = "2026-09-08T00:00:00Z"


def _prov():
    return make_provenance("CALCULATED_RESULT", "AI_GENERATED")


def _features():
    return [
        {"id": "FEAT-1", "label": "生物辨識登入", "functional_response": "LIKE", "dysfunctional_response": "NEUTRAL"},  # delighter
        {"id": "FEAT-2", "label": "頁面載入 < 2 秒", "functional_response": "LIKE", "dysfunctional_response": "DISLIKE"},  # performance
        {"id": "FEAT-3", "label": "HTTPS 加密", "functional_response": "MUST_BE", "dysfunctional_response": "DISLIKE"},  # basic
        {"id": "FEAT-4", "label": "多語言介面", "functional_response": "NEUTRAL", "dysfunctional_response": "NEUTRAL"},  # indifferent
    ]


def _build(
    record_id="KANO-T-001",
    subject="Q4 triage",
    features=None,
    version="1.0.0",
):
    return generate_kano_classification_record(
        record_id,
        subject,
        _features() if features is None else features,
        _prov(),
        version=version,
    )


def _valid_classification():
    return _build()


class ClassifyKanoCategoryComputeTests(unittest.TestCase):
    """Pure ``classify_kano_category`` -- checked against the classical evaluation table's own defining spot
    cases (cross-verified against Wikipedia's Kano-model article, see compute module docstring), not just
    'does it run'."""

    def test_like_dislike_is_performance(self):
        self.assertEqual(classify_kano_category("LIKE", "DISLIKE"), CATEGORY_PERFORMANCE)

    def test_like_neutral_is_delighter(self):
        self.assertEqual(classify_kano_category("LIKE", "NEUTRAL"), CATEGORY_DELIGHTER)

    def test_like_must_be_is_delighter(self):
        self.assertEqual(classify_kano_category("LIKE", "MUST_BE"), CATEGORY_DELIGHTER)

    def test_like_live_with_is_delighter(self):
        self.assertEqual(classify_kano_category("LIKE", "LIVE_WITH"), CATEGORY_DELIGHTER)

    def test_must_be_dislike_is_basic(self):
        self.assertEqual(classify_kano_category("MUST_BE", "DISLIKE"), CATEGORY_BASIC)

    def test_neutral_dislike_is_basic(self):
        self.assertEqual(classify_kano_category("NEUTRAL", "DISLIKE"), CATEGORY_BASIC)

    def test_live_with_dislike_is_basic(self):
        self.assertEqual(classify_kano_category("LIVE_WITH", "DISLIKE"), CATEGORY_BASIC)

    def test_neutral_neutral_is_indifferent(self):
        self.assertEqual(classify_kano_category("NEUTRAL", "NEUTRAL"), CATEGORY_INDIFFERENT)

    def test_must_be_must_be_is_indifferent(self):
        self.assertEqual(classify_kano_category("MUST_BE", "MUST_BE"), CATEGORY_INDIFFERENT)

    def test_live_with_live_with_is_indifferent(self):
        self.assertEqual(classify_kano_category("LIVE_WITH", "LIVE_WITH"), CATEGORY_INDIFFERENT)

    def test_must_be_neutral_is_indifferent(self):
        self.assertEqual(classify_kano_category("MUST_BE", "NEUTRAL"), CATEGORY_INDIFFERENT)

    def test_dislike_must_be_is_reverse(self):
        """The cell the rejected 'modified' web source got wrong (it claimed Must-be) -- Wikipedia-confirmed
        Reverse, and the anchor spot-check for this whole row."""
        self.assertEqual(classify_kano_category("DISLIKE", "MUST_BE"), CATEGORY_REVERSE)

    def test_dislike_like_is_reverse(self):
        self.assertEqual(classify_kano_category("DISLIKE", "LIKE"), CATEGORY_REVERSE)

    def test_dislike_neutral_is_reverse(self):
        self.assertEqual(classify_kano_category("DISLIKE", "NEUTRAL"), CATEGORY_REVERSE)

    def test_dislike_live_with_is_reverse(self):
        self.assertEqual(classify_kano_category("DISLIKE", "LIVE_WITH"), CATEGORY_REVERSE)

    def test_must_be_like_is_reverse(self):
        self.assertEqual(classify_kano_category("MUST_BE", "LIKE"), CATEGORY_REVERSE)

    def test_neutral_like_is_reverse(self):
        self.assertEqual(classify_kano_category("NEUTRAL", "LIKE"), CATEGORY_REVERSE)

    def test_live_with_like_is_reverse(self):
        self.assertEqual(classify_kano_category("LIVE_WITH", "LIKE"), CATEGORY_REVERSE)

    def test_like_like_is_questionable(self):
        """Both extreme-corner contradiction cells (a respondent claiming to like/dislike both presence AND
        absence of the same feature) -- the two Questionable cells."""
        self.assertEqual(classify_kano_category("LIKE", "LIKE"), CATEGORY_QUESTIONABLE)

    def test_dislike_dislike_is_questionable(self):
        self.assertEqual(classify_kano_category("DISLIKE", "DISLIKE"), CATEGORY_QUESTIONABLE)

    def test_classify_kano_category_is_total_over_all_25_combinations(self):
        """The lookup table must be TOTAL -- every (functional, dysfunctional) pair in VALID_RESPONSES x
        VALID_RESPONSES resolves to exactly one of the 6 canonical categories, never a KeyError."""
        for functional in sorted(VALID_RESPONSES):
            for dysfunctional in sorted(VALID_RESPONSES):
                with self.subTest(functional=functional, dysfunctional=dysfunctional):
                    self.assertIn(classify_kano_category(functional, dysfunctional), VALID_CATEGORIES)

    def test_classify_kano_category_is_pure_repeated_calls_agree(self):
        first = classify_kano_category("LIKE", "DISLIKE")
        second = classify_kano_category("LIKE", "DISLIKE")
        self.assertEqual(first, second)


class ResponseValidationComputeTests(unittest.TestCase):
    """``validate_response`` -- real accept/reject boundary cases, same fail-closed discipline
    ``impact_effort``'s own ``validate_value_in_scale`` uses."""

    def test_all_five_canonical_responses_are_accepted(self):
        for response in sorted(VALID_RESPONSES):
            with self.subTest(response=response):
                validate_response(response, "functional_response")  # must not raise

    def test_unknown_response_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "KANO_INVALID_RESPONSE"):
            validate_response("MAYBE", "functional_response")

    def test_lowercase_response_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "KANO_INVALID_RESPONSE"):
            validate_response("like", "functional_response")

    def test_none_response_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "KANO_INVALID_RESPONSE"):
            validate_response(None, "functional_response")

    def test_numeric_response_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "KANO_INVALID_RESPONSE"):
            validate_response(1, "functional_response")

    def test_error_names_the_axis_and_feature_id(self):
        with self.assertRaisesRegex(InvariantViolation, "FEAT-X.*dysfunctional_response"):
            validate_response("MAYBE", "dysfunctional_response", "FEAT-X")


class ClassifyFeaturesComputeTests(unittest.TestCase):
    def test_classify_features_computes_correct_category_for_each_feature(self):
        classified = {c["id"]: c["category"] for c in classify_features(_features())}
        self.assertEqual(classified["FEAT-1"], CATEGORY_DELIGHTER)
        self.assertEqual(classified["FEAT-2"], CATEGORY_PERFORMANCE)
        self.assertEqual(classified["FEAT-3"], CATEGORY_BASIC)
        self.assertEqual(classified["FEAT-4"], CATEGORY_INDIFFERENT)

    def test_classify_features_returns_new_dicts_not_the_callers_own(self):
        original = _features()
        classified = classify_features(original)
        self.assertIsNot(classified[0], original[0])
        self.assertNotIn("category", original[0])

    def test_classify_features_rejects_invalid_functional_response(self):
        bad = [{"id": "FEAT-X", "label": "x", "functional_response": "MAYBE", "dysfunctional_response": "NEUTRAL"}]
        with self.assertRaisesRegex(InvariantViolation, "KANO_INVALID_RESPONSE"):
            classify_features(bad)

    def test_classify_features_rejects_invalid_dysfunctional_response(self):
        bad = [{"id": "FEAT-X", "label": "x", "functional_response": "LIKE", "dysfunctional_response": "MAYBE"}]
        with self.assertRaisesRegex(InvariantViolation, "KANO_INVALID_RESPONSE"):
            classify_features(bad)

    def test_classify_features_single_feature_is_legal(self):
        result = classify_features([{"id": "SOLO", "label": "one feature", "functional_response": "LIKE", "dysfunctional_response": "DISLIKE"}])
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["category"], CATEGORY_PERFORMANCE)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_classification_validates_against_the_real_schema(self):
        self.contracts.validate(CLASSIFICATION_SCHEMA, _valid_classification(), "kano classification")

    def test_method_contract_yaml_itself_validates_against_method_schema(self):
        """The contract's own `verification.method` text CLAIMS this was checked -- actually re-runs it here
        so the claim stays true if the contract file ever drifts (R4: claim-before-verify)."""
        import yaml

        contract_path = self.spec_root / "methods" / "contracts" / "decision.kano.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate(METHOD_SCHEMA, instance, "decision.kano contract")

    def test_categories_match_the_expected_spread_across_the_demo_batch(self):
        classification = _valid_classification()
        categories = {f["id"]: f["category"] for f in classification["features"]}
        self.assertEqual(categories, {"FEAT-1": CATEGORY_DELIGHTER, "FEAT-2": CATEGORY_PERFORMANCE, "FEAT-3": CATEGORY_BASIC, "FEAT-4": CATEGORY_INDIFFERENT})

    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "KANO_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_record_id_without_prefix_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "KANO_INVALID_RECORD_ID"):
            _build(record_id="WRONG-001")

    def test_non_string_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "KANO_INVALID_RECORD_ID"):
            _build(record_id=None)

    def test_non_string_version_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "KANO_INVALID_VERSION"):
            _build(version=1.0)

    def test_empty_subject_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "KANO_EMPTY_RECORD_FIELD"):
            _build(subject="")

    def test_whitespace_only_subject_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "KANO_EMPTY_RECORD_FIELD"):
            _build(subject="   ")

    def test_non_string_subject_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "KANO_EMPTY_RECORD_FIELD"):
            _build(subject=42)

    def test_empty_features_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "KANO_INVALID_FEATURES"):
            _build(features=[])

    def test_features_non_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "KANO_INVALID_FEATURES"):
            _build(features={"id": "FEAT-1"})

    def test_feature_missing_label_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "KANO_INVALID_FEATURES"):
            _build(features=[{"id": "FEAT-1", "functional_response": "LIKE", "dysfunctional_response": "NEUTRAL"}])

    def test_feature_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "KANO_INVALID_FEATURES"):
            _build(features=[{"id": "FEAT-1", "label": "x", "functional_response": "LIKE", "dysfunctional_response": "NEUTRAL", "owner": "alice"}])

    def test_feature_empty_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "KANO_INVALID_FEATURES"):
            _build(features=[{"id": "", "label": "x", "functional_response": "LIKE", "dysfunctional_response": "NEUTRAL"}])

    def test_feature_empty_label_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "KANO_INVALID_FEATURES"):
            _build(features=[{"id": "FEAT-1", "label": "  ", "functional_response": "LIKE", "dysfunctional_response": "NEUTRAL"}])

    def test_feature_illegal_functional_response_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "KANO_INVALID_FEATURES"):
            _build(features=[{"id": "FEAT-1", "label": "x", "functional_response": "MAYBE", "dysfunctional_response": "NEUTRAL"}])

    def test_feature_illegal_dysfunctional_response_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "KANO_INVALID_FEATURES"):
            _build(features=[{"id": "FEAT-1", "label": "x", "functional_response": "LIKE", "dysfunctional_response": "MAYBE"}])

    def test_feature_lowercase_response_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "KANO_INVALID_FEATURES"):
            _build(features=[{"id": "FEAT-1", "label": "x", "functional_response": "like", "dysfunctional_response": "NEUTRAL"}])

    def test_duplicate_feature_id_is_refused(self):
        features = [
            {"id": "SAME-ID", "label": "d1", "functional_response": "LIKE", "dysfunctional_response": "NEUTRAL"},
            {"id": "SAME-ID", "label": "d2", "functional_response": "MUST_BE", "dysfunctional_response": "DISLIKE"},
        ]
        with self.assertRaisesRegex(InvariantViolation, "KANO_DUPLICATE_FEATURE_ID"):
            _build(features=features)

    def test_duplicate_feature_id_error_names_the_id(self):
        features = [
            {"id": "DUP-X", "label": "d1", "functional_response": "LIKE", "dysfunctional_response": "NEUTRAL"},
            {"id": "DUP-X", "label": "d2", "functional_response": "MUST_BE", "dysfunctional_response": "DISLIKE"},
        ]
        with self.assertRaisesRegex(InvariantViolation, "DUP-X"):
            _build(features=features)

    def test_category_is_not_a_constructor_parameter(self):
        """Structural guarantee, not just a convention: the constructor has no parameter named `category` at
        all -- a caller cannot pass one even by mistake, same guarantee
        ``test_impact_effort.py``'s own ``test_quadrant_is_not_a_constructor_parameter`` establishes."""
        with self.assertRaises(TypeError):
            generate_kano_classification_record("KANO-T-999", "x", _features(), _prov(), category=CATEGORY_BASIC)

    def test_single_feature_record_is_legal_and_valid(self):
        """Unlike decision.mcda's own >=2 Options floor -- classification is independent per feature, not a
        relative ranking, so 1 feature is a complete, meaningful run (same reasoning
        decision.impact_effort's own single-idea precedent already establishes)."""
        record = _build(features=[{"id": "SOLO", "label": "one feature", "functional_response": "LIKE", "dysfunctional_response": "DISLIKE"}])
        self.contracts.validate(CLASSIFICATION_SCHEMA, record, "single-feature classification")
        self.assertEqual(record["features"][0]["category"], CATEGORY_PERFORMANCE)

    def test_mutating_the_callers_own_features_after_construction_does_not_affect_the_stored_record(self):
        features = _features()
        record = _build(features=features)
        features[0]["label"] = "mutated after construction"
        self.assertEqual(record["features"][0]["label"], "生物辨識登入")

    def test_features_dicts_are_rebuilt_not_aliased(self):
        features = _features()
        record = _build(features=features)
        self.assertIsNot(record["features"][0], features[0])

    def test_provenance_is_deliberately_aliased_not_rebuilt(self):
        prov = _prov()
        record = generate_kano_classification_record("KANO-T-PROV", "x", _features(), prov)
        self.assertIs(record["provenance"], prov)

    def test_defaults_version_and_generated_by_method(self):
        record = _valid_classification()
        self.assertEqual(record["version"], "1.0.0")
        self.assertEqual(record["generated_by_method"], METHOD_ID)

    def test_custom_version_and_generated_by_method_round_trip(self):
        record = generate_kano_classification_record("KANO-T-002", "s", _features(), _prov(), version="2.3.4", generated_by_method="decision.kano@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(record["generated_by_method"], "decision.kano@test")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_kano_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_layer_rejects_an_id_without_the_kano_prefix(self):
        record = _valid_classification()
        record["id"] = "WRONG-001"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CLASSIFICATION_SCHEMA, record, "bad id")

    def test_schema_layer_rejects_a_missing_required_top_level_field(self):
        record = _valid_classification()
        del record["computation_provenance_ref"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CLASSIFICATION_SCHEMA, record, "missing field")

    def test_schema_layer_rejects_a_feature_with_invalid_category_enum_value(self):
        record = _valid_classification()
        record["features"][0]["category"] = "not_a_real_category"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CLASSIFICATION_SCHEMA, record, "bad category enum")

    def test_schema_layer_rejects_a_feature_with_invalid_response_enum_value(self):
        record = _valid_classification()
        record["features"][0]["functional_response"] = "MAYBE"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CLASSIFICATION_SCHEMA, record, "bad response enum")

    def test_schema_layer_rejects_a_feature_with_an_extra_key(self):
        record = _valid_classification()
        record["features"][0]["owner"] = "alice"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CLASSIFICATION_SCHEMA, record, "feature with extra key")

    def test_all_six_categories_individually_round_trip_through_schema(self):
        cases = [
            ("LIKE", "NEUTRAL", CATEGORY_DELIGHTER),
            ("LIKE", "DISLIKE", CATEGORY_PERFORMANCE),
            ("MUST_BE", "DISLIKE", CATEGORY_BASIC),
            ("NEUTRAL", "NEUTRAL", CATEGORY_INDIFFERENT),
            ("DISLIKE", "LIKE", CATEGORY_REVERSE),
            ("LIKE", "LIKE", CATEGORY_QUESTIONABLE),
        ]
        for functional, dysfunctional, expected in cases:
            with self.subTest(functional=functional, dysfunctional=dysfunctional, expected=expected):
                record = _build(features=[{"id": "F1", "label": "d", "functional_response": functional, "dysfunctional_response": dysfunctional}])
                self.assertEqual(record["features"][0]["category"], expected)
                self.contracts.validate(CLASSIFICATION_SCHEMA, record, f"round-trip for category={expected}")


class GateMutationTests(unittest.TestCase):
    """Every gate re-derives from the record's own raw fields -- a hand-tampered copy of an already-valid
    record must still be caught, same discipline ``test_impact_effort.py``'s own ``GateMutationTests``
    establishes."""

    def test_valid_classification_passes_all_three_gates(self):
        results = evaluate_kano_gates(_valid_classification(), VALIDATOR, TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "genuine_compute", "kano_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_genuine_compute_gate_is_the_same_function_impact_effort_already_reuses(self):
        record = _valid_classification()
        direct_pass, direct_evidence = evaluate_statistical_gate(record)
        gate = evaluate_genuine_compute_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "PASS" if direct_pass else "FAIL")
        self.assertEqual(gate["evidence"], direct_evidence)

    def test_hand_tampered_category_mismatch_fails_the_integrity_gate(self):
        record = _valid_classification()
        record["features"][0]["category"] = CATEGORY_BASIC  # FEAT-1 is really delighter (LIKE/NEUTRAL)
        gate = evaluate_kano_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("does not match recomputed", str(gate["evidence"]))

    def test_hand_tampered_invalid_category_value_fails_the_integrity_gate(self):
        record = _valid_classification()
        record["features"][0]["category"] = "not_a_real_category"
        gate = evaluate_kano_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_invalid_response_fails_the_integrity_gate_not_a_crash(self):
        record = _valid_classification()
        record["features"][0]["functional_response"] = "MAYBE"
        gate = evaluate_kano_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_this_asymmetric_case_is_unreachable_through_the_real_constructor(self):
        """``generate_kano_classification_record``'s own shape check (``_feature_input_is_valid``) makes an
        illegal stored response value construction-time unreachable (proven above by
        ``test_feature_illegal_functional_response_is_refused_at_construction``); the gate is the ONLY layer
        that can ever observe it on a hand-tampered record, hence this dedicated test -- same precedent
        ``test_moscow.py``'s own duplicate-id asymmetric-unreachability test already establishes for its
        family."""
        record = _valid_classification()
        record["features"][0]["dysfunctional_response"] = "MAYBE"
        self.assertEqual(evaluate_kano_integrity_gate(record, VALIDATOR, TS)["status"], "FAIL")

    def test_hand_tampered_scale_missing_key_fails_the_integrity_gate(self):
        record = _valid_classification()
        del record["features"][0]["label"]
        gate = evaluate_kano_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_missing_id_prefix_fails_the_integrity_gate(self):
        record = _valid_classification()
        record["id"] = "WRONG-001"
        gate = evaluate_kano_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_empty_subject_fails_the_integrity_gate(self):
        record = _valid_classification()
        record["subject"] = ""
        gate = evaluate_kano_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_empty_features_fails_the_integrity_gate(self):
        record = _valid_classification()
        record["features"] = []
        gate = evaluate_kano_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_duplicate_feature_id_fails_the_integrity_gate(self):
        record = _valid_classification()
        record["features"][1]["id"] = record["features"][0]["id"]
        gate = evaluate_kano_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_evidence_reports_category_counts_on_pass(self):
        gate = evaluate_kano_integrity_gate(_valid_classification(), VALIDATOR, TS)
        self.assertEqual(gate["status"], "PASS")
        counts = gate["evidence"][0]["category_counts"]
        self.assertEqual(counts[CATEGORY_DELIGHTER], 1)
        self.assertEqual(counts[CATEGORY_PERFORMANCE], 1)
        self.assertEqual(counts[CATEGORY_BASIC], 1)
        self.assertEqual(counts[CATEGORY_INDIFFERENT], 1)
        self.assertEqual(counts[CATEGORY_REVERSE], 0)

    def test_integrity_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _valid_classification()
        snapshot = copy.deepcopy(record)
        evaluate_kano_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(record, snapshot)

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        results = evaluate_kano_gates("not a dict", VALIDATOR, TS)
        self.assertFalse(all_gates_pass(results))
        self.assertTrue(all(r["status"] == "FAIL" for r in results))

    def test_none_record_fails_all_gates_not_a_crash(self):
        results = evaluate_kano_gates(None, VALIDATOR, TS)
        self.assertFalse(all_gates_pass(results))
        self.assertTrue(all(r["status"] == "FAIL" for r in results))

    def test_missing_record_provenance_fails_the_provenance_gate_not_a_crash(self):
        record = _valid_classification()
        del record["provenance"]
        gate = evaluate_provenance_required_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_gate_fails_on_non_dict_record(self):
        result = evaluate_provenance_required_gate("not a record", VALIDATOR, TS)
        self.assertEqual(result["status"], "FAIL")

    def test_all_gates_pass_returns_false_when_a_gate_fails(self):
        results = evaluate_kano_gates(_valid_classification(), VALIDATOR, TS)
        results[0] = dict(results[0], status="FAIL")
        self.assertFalse(all_gates_pass(results))

    def test_all_gates_pass_treats_not_applicable_as_passing(self):
        fake = [{"gate_id": "x", "status": "PASS"}, {"gate_id": "y", "status": "NOT_APPLICABLE"}]
        self.assertTrue(all_gates_pass(fake))

    def test_all_gates_pass_true_on_empty_list_vacuously(self):
        self.assertTrue(all_gates_pass([]))


if __name__ == "__main__":
    unittest.main()
