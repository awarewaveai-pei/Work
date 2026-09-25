"""Mutation-style tests for ``decision.weighted_decision_matrix`` (Method Atlas slice, 7th member of the
decision family (F16), after ahp/mcda/impact_effort/ice/rice/moscow).

Central due-diligence question this slice's own build answered (task-mandated): is Weighted Decision
Matrix a genuine duplicate of decision.mcda's own pipeline, the same way architecture.trade_off_matrix
(F18 L825) was determined to be? ``DistinctnessFromMCDATests`` below is the regression guard for that
determination -- it fails if a future edit makes this method's contract/schema drift back toward MCDA's
own shape without re-deriving the due-diligence documented in
``methods/contracts/decision.weighted_decision_matrix.contract.yaml``'s own ``verification`` section.

The compute layer (``ai_lego/compute/weighted_decision_matrix/scoring.py``) is checked against boundary,
out-of-range, and malformed-bounds cases. This method's own inferred (not table-cited) no-automatic-
authority rule is proven at BOTH independent layers, the same discipline ``test_mcda.py``'s own
``NoAutomaticAuthorityTests`` already established for its table-cited sibling rule.
"""

from __future__ import annotations

import copy
import inspect
import math
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.compute.ahp.weights import rank_options
from ai_lego.compute.mcda.scoring import validate_weights_sum_to_one
from ai_lego.compute.weighted_decision_matrix.scoring import validate_scores_within_common_scale
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.decision import weighted_decision_matrix as wdm_module
from ai_lego.modules.decision.weighted_decision_matrix import (
    FORBIDDEN_AUTHORITY_KEYS,
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    assert_no_automatic_authority_claim,
    evaluate_genuine_compute_gate,
    evaluate_no_automatic_authority_gate,
    evaluate_provenance_required_gate,
    evaluate_score_matrix_integrity_gate,
    evaluate_sensitivity_disclosed_gate,
    evaluate_weighted_decision_matrix_gates,
    generate_weighted_decision_matrix_analysis,
)
from ai_lego.modules.research.gates import evaluate_statistical_gate
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

WDM_ANALYSIS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/weighted-decision-matrix-record.schema.yaml"
MCDA_ANALYSIS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/mcda-analysis.schema.yaml"


def _options():
    return [{"id": "O1", "label": "供應商 A"}, {"id": "O2", "label": "供應商 B"}]


def _criteria():
    return [{"id": "C1", "label": "價格"}, {"id": "C2", "label": "交期"}, {"id": "C3", "label": "品質"}]


def _scores():
    return [
        {"option_id": "O1", "criterion_id": "C1", "value": 4},
        {"option_id": "O1", "criterion_id": "C2", "value": 3},
        {"option_id": "O1", "criterion_id": "C3", "value": 5},
        {"option_id": "O2", "criterion_id": "C1", "value": 2},
        {"option_id": "O2", "criterion_id": "C2", "value": 5},
        {"option_id": "O2", "criterion_id": "C3", "value": 4},
    ]


def _weights():
    return [{"criterion_id": "C1", "weight": 0.3}, {"criterion_id": "C2", "weight": 0.4}, {"criterion_id": "C3", "weight": 0.3}]


def _valid_analysis(**overrides):
    kwargs = dict(
        analysis_id="WDM-T-001",
        options=_options(),
        criteria=_criteria(),
        scores=_scores(),
        weights=_weights(),
        scale_min=1,
        scale_max=5,
        sensitivity_notes="O1/O2 差距僅 0.1 分，屬高敏感度。人工檢查，非機械計算。",
        provenance=make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    )
    kwargs.update(overrides)
    return generate_weighted_decision_matrix_analysis(**kwargs)


class ComputeLayerTests(unittest.TestCase):
    """Real boundary/arithmetic checks against ai_lego/compute/weighted_decision_matrix/scoring.py, not
    just 'does it run'."""

    def test_value_within_scale_is_accepted(self):
        validate_scores_within_common_scale([{"option_id": "O1", "criterion_id": "C1", "value": 3}], 1, 5)  # must not raise

    def test_value_at_scale_min_boundary_is_accepted(self):
        validate_scores_within_common_scale([{"option_id": "O1", "criterion_id": "C1", "value": 1}], 1, 5)  # must not raise

    def test_value_at_scale_max_boundary_is_accepted(self):
        validate_scores_within_common_scale([{"option_id": "O1", "criterion_id": "C1", "value": 5}], 1, 5)  # must not raise

    def test_value_below_scale_min_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_SCORE_OUT_OF_SCALE"):
            validate_scores_within_common_scale([{"option_id": "O1", "criterion_id": "C1", "value": 0.9}], 1, 5)

    def test_value_above_scale_max_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_SCORE_OUT_OF_SCALE"):
            validate_scores_within_common_scale([{"option_id": "O1", "criterion_id": "C1", "value": 5.1}], 1, 5)

    def test_scale_max_equal_to_scale_min_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_INVALID_SCALE_BOUNDS"):
            validate_scores_within_common_scale([{"option_id": "O1", "criterion_id": "C1", "value": 1}], 1, 1)

    def test_scale_max_less_than_scale_min_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_INVALID_SCALE_BOUNDS"):
            validate_scores_within_common_scale([{"option_id": "O1", "criterion_id": "C1", "value": 1}], 5, 1)

    def test_non_numeric_scale_min_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_INVALID_SCALE_BOUNDS"):
            validate_scores_within_common_scale([], "one", 5)

    def test_non_numeric_scale_max_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_INVALID_SCALE_BOUNDS"):
            validate_scores_within_common_scale([], 1, "five")

    def test_nan_scale_bound_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_INVALID_SCALE_BOUNDS"):
            validate_scores_within_common_scale([], 1, math.nan)

    def test_infinite_scale_bound_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_INVALID_SCALE_BOUNDS"):
            validate_scores_within_common_scale([], 1, math.inf)

    def test_bool_scale_bound_is_refused(self):
        """True/False must not silently pass an isinstance(value, (int, float)) check as if they were 1/0."""
        with self.assertRaisesRegex(InvariantViolation, "WDM_INVALID_SCALE_BOUNDS"):
            validate_scores_within_common_scale([], False, True)

    def test_nan_score_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_SCORE_OUT_OF_SCALE"):
            validate_scores_within_common_scale([{"option_id": "O1", "criterion_id": "C1", "value": math.nan}], 1, 5)

    def test_bool_score_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_SCORE_OUT_OF_SCALE"):
            validate_scores_within_common_scale([{"option_id": "O1", "criterion_id": "C1", "value": True}], 1, 5)

    def test_multiple_out_of_range_scores_all_reported(self):
        scores = [
            {"option_id": "O1", "criterion_id": "C1", "value": -1},
            {"option_id": "O1", "criterion_id": "C2", "value": 3},
            {"option_id": "O2", "criterion_id": "C1", "value": 99},
        ]
        with self.assertRaisesRegex(InvariantViolation, r"2 score\(s\) fall outside"):
            validate_scores_within_common_scale(scores, 1, 5)

    def test_reused_weights_sum_to_one_validator_accepts_valid_weights(self):
        validate_weights_sum_to_one(_weights(), ["C1", "C2", "C3"])  # must not raise

    def test_reused_weights_sum_to_one_validator_rejects_bad_weights(self):
        with self.assertRaisesRegex(InvariantViolation, "MCDA_WEIGHTS_DO_NOT_SUM_TO_ONE"):
            validate_weights_sum_to_one([{"criterion_id": "C1", "weight": 0.9}], ["C1"])

    def test_score_stage_reuses_rank_options_unchanged(self):
        """The Score stage is not reimplemented -- it is the exact same function decision.ahp and
        decision.mcda already reuse, now exercised by a third family member."""
        analysis = _valid_analysis()
        weight_by_criterion = {w["criterion_id"]: w["weight"] for w in _weights()}
        option_scores = [{"option_id": s["option_id"], "criterion_id": s["criterion_id"], "score": s["value"]} for s in _scores()]
        direct_ranking = rank_options(weight_by_criterion, option_scores)
        self.assertEqual(analysis["ranking"], direct_ranking)

    def test_module_never_imports_normalize_scores(self):
        """Regression guard for the core due-diligence finding: this method's own module must never bind
        decision.mcda's own per-criterion normalization function into its namespace -- that is the real,
        textually-grounded reason it is not a duplicate (see module docstring). Checks the module's actual
        bound names, not source text -- the docstring itself mentions the name in prose contrasting the
        two methods, so a substring-in-source check would false-positive on that prose."""
        self.assertFalse(hasattr(wdm_module, "normalize_scores"))
        import_lines = [line for line in inspect.getsource(wdm_module).splitlines() if line.startswith("from ") or line.startswith("import ")]
        self.assertTrue(all("normalize_scores" not in line for line in import_lines))


class ConstructionTests(unittest.TestCase):
    def test_valid_analysis_constructs_successfully(self):
        analysis = _valid_analysis()
        self.assertEqual(analysis["id"], "WDM-T-001")
        self.assertEqual(analysis["generated_by_method"], METHOD_ID)

    def test_mutating_the_callers_own_inputs_after_construction_does_not_affect_the_stored_record(self):
        """critic finding, 2026-09-08: the record must deep-copy each input list's entries, not just the
        outer list, or a caller mutating its own dicts after the call silently corrupts the already-gated
        record (same bug class TOPSIS found and fixed in its own construction; mcda.py still has it,
        tracked separately, out of this batch's scope)."""
        options, criteria, scores, weights = _options(), _criteria(), _scores(), _weights()
        analysis = generate_weighted_decision_matrix_analysis(
            analysis_id="WDM-T-002",
            options=options,
            criteria=criteria,
            scores=scores,
            weights=weights,
            scale_min=1,
            scale_max=5,
            sensitivity_notes="n/a",
            provenance=make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
        )
        options[0]["label"] = "mutated"
        criteria[0]["label"] = "mutated"
        scores[0]["value"] = 999
        weights[0]["weight"] = 999
        self.assertEqual(analysis["options"][0]["label"], "供應商 A")
        self.assertEqual(analysis["criteria"][0]["label"], "價格")
        self.assertEqual(analysis["scores"][0]["value"], 4)
        self.assertEqual(analysis["weights"][0]["weight"], 0.3)

    def test_ranking_correctly_favors_o1_in_worked_example(self):
        # weights {C1:0.3, C2:0.4, C3:0.3}: O1 = 4*.3+3*.4+5*.3 = 3.9; O2 = 2*.3+5*.4+4*.3 = 3.8
        analysis = _valid_analysis()
        self.assertEqual(analysis["ranking"][0]["option_id"], "O1")
        self.assertAlmostEqual(analysis["ranking"][0]["weighted_score"], 3.9)
        self.assertAlmostEqual(analysis["ranking"][1]["weighted_score"], 3.8)

    def test_equal_weights_equal_scores_produce_a_tie_with_correct_totals(self):
        options = [{"id": "O1", "label": "a"}, {"id": "O2", "label": "b"}]
        criteria = [{"id": "C1", "label": "x"}]
        scores = [{"option_id": "O1", "criterion_id": "C1", "value": 3}, {"option_id": "O2", "criterion_id": "C1", "value": 3}]
        weights = [{"criterion_id": "C1", "weight": 1.0}]
        analysis = _valid_analysis(options=options, criteria=criteria, scores=scores, weights=weights)
        by_option = {r["option_id"]: r["weighted_score"] for r in analysis["ranking"]}
        self.assertEqual(by_option, {"O1": 3.0, "O2": 3.0})

    def test_three_option_ranking_is_correctly_sorted_descending(self):
        options = [{"id": "O1", "label": "a"}, {"id": "O2", "label": "b"}, {"id": "O3", "label": "c"}]
        criteria = [{"id": "C1", "label": "x"}]
        scores = [{"option_id": "O1", "criterion_id": "C1", "value": 2}, {"option_id": "O2", "criterion_id": "C1", "value": 5}, {"option_id": "O3", "criterion_id": "C1", "value": 3}]
        weights = [{"criterion_id": "C1", "weight": 1.0}]
        analysis = _valid_analysis(options=options, criteria=criteria, scores=scores, weights=weights)
        self.assertEqual([r["option_id"] for r in analysis["ranking"]], ["O2", "O3", "O1"])

    def test_invalid_record_id_empty_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_INVALID_RECORD_ID"):
            _valid_analysis(analysis_id="")

    def test_invalid_record_id_wrong_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_INVALID_RECORD_ID"):
            _valid_analysis(analysis_id="MCDA-T-001")

    def test_invalid_record_id_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_INVALID_RECORD_ID"):
            _valid_analysis(analysis_id=123)

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_INVALID_VERSION"):
            _valid_analysis(version=1.0)

    def test_too_few_options_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_INVALID_OPTIONS"):
            _valid_analysis(options=[{"id": "O1", "label": "solo"}], scores=[{"option_id": "O1", "criterion_id": c["id"], "value": 3} for c in _criteria()])

    def test_options_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_INVALID_OPTIONS"):
            _valid_analysis(options="not-a-list")

    def test_option_missing_label_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_INVALID_OPTIONS"):
            _valid_analysis(options=[{"id": "O1"}, {"id": "O2", "label": "b"}])

    def test_option_with_stray_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_INVALID_OPTIONS"):
            _valid_analysis(options=[{"id": "O1", "label": "a", "weight": 1}, {"id": "O2", "label": "b"}])

    def test_duplicate_option_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_DUPLICATE_OPTION_ID"):
            _valid_analysis(options=[{"id": "O1", "label": "a"}, {"id": "O1", "label": "b"}])

    def test_empty_criteria_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_INVALID_CRITERIA"):
            _valid_analysis(criteria=[], scores=[])

    def test_criteria_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_INVALID_CRITERIA"):
            _valid_analysis(criteria="not-a-list", scores=[])

    def test_criterion_with_direction_key_is_refused(self):
        """Proves the core distinguishing design decision is REAL and enforced, not just documented: a
        criterion carrying MCDA's own 'direction' field must be refused, not silently accepted."""
        criteria = [{"id": "C1", "label": "x", "direction": "maximize"}]
        with self.assertRaisesRegex(InvariantViolation, "WDM_INVALID_CRITERIA"):
            _valid_analysis(criteria=criteria, scores=[{"option_id": o["id"], "criterion_id": "C1", "value": 3} for o in _options()], weights=[{"criterion_id": "C1", "weight": 1.0}])

    def test_criterion_missing_label_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_INVALID_CRITERIA"):
            _valid_analysis(criteria=[{"id": "C1"}], scores=[{"option_id": o["id"], "criterion_id": "C1", "value": 3} for o in _options()], weights=[{"criterion_id": "C1", "weight": 1.0}])

    def test_duplicate_criterion_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_DUPLICATE_CRITERION_ID"):
            _valid_analysis(criteria=[{"id": "C1", "label": "x"}, {"id": "C1", "label": "y"}])

    def test_scores_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_INVALID_SCORES"):
            _valid_analysis(scores="not-a-list")

    def test_scores_empty_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_INVALID_SCORES"):
            _valid_analysis(scores=[])

    def test_score_entry_missing_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_INVALID_SCORES"):
            _valid_analysis(scores=[{"option_id": "O1", "criterion_id": "C1"}])

    def test_score_entry_non_numeric_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_INVALID_SCORES"):
            _valid_analysis(scores=[{"option_id": "O1", "criterion_id": "C1", "value": "high"}])

    def test_score_entry_with_stray_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_INVALID_SCORES"):
            _valid_analysis(scores=[dict(s, note="x") for s in _scores()])

    def test_score_referencing_unknown_option_is_refused(self):
        scores = [{"option_id": "O99", "criterion_id": "C1", "value": 3}, {"option_id": "O2", "criterion_id": "C1", "value": 3}]
        with self.assertRaisesRegex(InvariantViolation, "WDM_INCOMPLETE_SCORE_MATRIX"):
            _valid_analysis(criteria=[{"id": "C1", "label": "x"}], scores=scores, weights=[{"criterion_id": "C1", "weight": 1.0}])

    def test_score_referencing_unknown_criterion_is_refused(self):
        scores = [{"option_id": "O1", "criterion_id": "C99", "value": 3}, {"option_id": "O2", "criterion_id": "C1", "value": 3}]
        with self.assertRaisesRegex(InvariantViolation, "WDM_INCOMPLETE_SCORE_MATRIX"):
            _valid_analysis(criteria=[{"id": "C1", "label": "x"}], scores=scores, weights=[{"criterion_id": "C1", "weight": 1.0}])

    def test_incomplete_score_matrix_missing_cell_is_refused(self):
        # 2 options x 3 criteria = 6 required cells; only 5 supplied.
        with self.assertRaisesRegex(InvariantViolation, "WDM_INCOMPLETE_SCORE_MATRIX"):
            _valid_analysis(scores=_scores()[:-1])

    def test_score_matrix_duplicate_cell_is_refused(self):
        scores = _scores() + [{"option_id": "O1", "criterion_id": "C1", "value": 2}]
        with self.assertRaisesRegex(InvariantViolation, "WDM_INCOMPLETE_SCORE_MATRIX"):
            _valid_analysis(scores=scores)

    def test_score_out_of_declared_scale_is_refused_at_construction(self):
        scores = _scores()
        scores[0] = dict(scores[0], value=99)
        with self.assertRaisesRegex(InvariantViolation, "WDM_SCORE_OUT_OF_SCALE"):
            _valid_analysis(scores=scores)

    def test_scale_max_not_greater_than_scale_min_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_INVALID_SCALE_BOUNDS"):
            _valid_analysis(scale_min=5, scale_max=1)

    def test_weights_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_INVALID_WEIGHTS"):
            _valid_analysis(weights="not-a-list")

    def test_weight_entry_missing_weight_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_INVALID_WEIGHTS"):
            _valid_analysis(weights=[{"criterion_id": "C1"}, {"criterion_id": "C2", "weight": 0.5}, {"criterion_id": "C3", "weight": 0.5}])

    def test_weights_referencing_unknown_criterion_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MCDA_UNKNOWN_CRITERION_IN_WEIGHTS"):
            _valid_analysis(weights=[{"criterion_id": "C99", "weight": 1.0}])

    def test_negative_weight_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "MCDA_NEGATIVE_WEIGHT"):
            _valid_analysis(weights=[{"criterion_id": "C1", "weight": -0.5}, {"criterion_id": "C2", "weight": 1.0}, {"criterion_id": "C3", "weight": 0.5}])

    def test_weights_not_summing_to_one_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "MCDA_WEIGHTS_DO_NOT_SUM_TO_ONE"):
            _valid_analysis(weights=[{"criterion_id": "C1", "weight": 0.1}, {"criterion_id": "C2", "weight": 0.1}, {"criterion_id": "C3", "weight": 0.1}])

    def test_empty_sensitivity_notes_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_SENSITIVITY_NOTES_EMPTY"):
            _valid_analysis(sensitivity_notes="")

    def test_whitespace_only_sensitivity_notes_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_SENSITIVITY_NOTES_EMPTY"):
            _valid_analysis(sensitivity_notes="   ")

    def test_non_string_sensitivity_notes_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WDM_SENSITIVITY_NOTES_EMPTY"):
            _valid_analysis(sensitivity_notes=None)

    def test_custom_version_is_honored(self):
        analysis = _valid_analysis(version="2.3.1")
        self.assertEqual(analysis["version"], "2.3.1")

    def test_custom_generated_by_method_is_honored(self):
        analysis = _valid_analysis(generated_by_method="decision.weighted_decision_matrix.v2")
        self.assertEqual(analysis["generated_by_method"], "decision.weighted_decision_matrix.v2")

    def test_default_generated_by_method_is_method_id(self):
        analysis = _valid_analysis()
        self.assertEqual(analysis["generated_by_method"], "decision.weighted_decision_matrix")

    def test_record_persists_scale_bounds_for_gate_re_derivation(self):
        analysis = _valid_analysis()
        self.assertEqual(analysis["scale_min"], 1)
        self.assertEqual(analysis["scale_max"], 5)

    def test_record_engine_and_provenance_ref_are_set(self):
        analysis = _valid_analysis()
        self.assertEqual(analysis["engine"], "local_python_deterministic_compute")
        self.assertEqual(analysis["computation_provenance_ref"], "ai_lego.compute.weighted_decision_matrix.scoring.validate_scores_within_common_scale")


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_wdm_analysis_validates_against_the_real_schema(self):
        self.contracts.validate(WDM_ANALYSIS_SCHEMA, _valid_analysis(), "weighted decision matrix analysis")

    def test_schema_rejects_criterion_with_direction_field(self):
        tampered = _valid_analysis()
        tampered["criteria"][0] = dict(tampered["criteria"][0], direction="maximize")
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(WDM_ANALYSIS_SCHEMA, tampered, "criterion with stray direction field")

    def test_schema_rejects_missing_scale_min(self):
        tampered = _valid_analysis()
        del tampered["scale_min"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(WDM_ANALYSIS_SCHEMA, tampered, "missing scale_min")

    def test_schema_rejects_raw_scores_field(self):
        """This schema has no raw_scores/normalized_scores fields at all -- additionalProperties:false must
        refuse a caller trying to smuggle MCDA's own field names onto this method's own record."""
        tampered = _valid_analysis()
        tampered["raw_scores"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(WDM_ANALYSIS_SCHEMA, tampered, "stray raw_scores field")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_wdm_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID.replace('.', '.')}"):
            empty.require(METHOD_ID)

    def test_method_id_is_distinct_from_mcda_machine_id(self):
        self.assertNotEqual(METHOD_ID, "decision.mcda")
        self.assertEqual(METHOD_ID, "decision.weighted_decision_matrix")

    def test_wdm_and_mcda_both_resolve_as_separate_entries(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID, "decision.mcda"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim
        ('Validated against specs/cognitive/method.schema.yaml') true going forward, the same live check
        decision.impact_effort.contract.yaml's own test suite already establishes -- not just a one-time
        manual claim in prose."""
        contract_path = self.spec_root / "methods" / "contracts" / "decision.weighted_decision_matrix.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "decision.weighted_decision_matrix contract")


class DistinctnessFromMCDATests(unittest.TestCase):
    """Regression guard for this slice's own central due-diligence finding: Weighted Decision Matrix is
    NOT a decision.mcda duplicate. Fails if a future edit silently reshapes either contract/schema back
    toward the other without re-deriving the comparison documented in this contract's own `verification`
    section."""

    @classmethod
    def setUpClass(cls):
        spec_root = resolve_spec_root()
        contracts_dir = spec_root / "methods" / "contracts"
        cls.wdm_contract = yaml.safe_load((contracts_dir / "decision.weighted_decision_matrix.contract.yaml").read_text(encoding="utf-8"))
        cls.mcda_contract = yaml.safe_load((contracts_dir / "decision.mcda.contract.yaml").read_text(encoding="utf-8"))
        typed_objects_dir = spec_root / "specs" / "cognitive" / "typed-objects"
        cls.wdm_schema = yaml.safe_load((typed_objects_dir / "weighted-decision-matrix-record.schema.yaml").read_text(encoding="utf-8"))
        cls.mcda_schema = yaml.safe_load((typed_objects_dir / "mcda-analysis.schema.yaml").read_text(encoding="utf-8"))

    def test_wdm_contract_inputs_differ_from_mcda_contract_inputs(self):
        self.assertNotEqual(self.wdm_contract["inputs"]["required"], self.mcda_contract["inputs"]["required"])
        self.assertIn("RawScores", self.mcda_contract["inputs"]["required"])
        self.assertNotIn("RawScores", self.wdm_contract["inputs"]["required"])
        self.assertIn("Scores", self.wdm_contract["inputs"]["required"])

    def test_wdm_contract_outputs_differ_from_mcda_contract_outputs(self):
        self.assertNotEqual(self.wdm_contract["outputs"], self.mcda_contract["outputs"])
        self.assertEqual(self.wdm_contract["outputs"], ["WeightedDecisionMatrixAnalysis"])
        self.assertEqual(self.mcda_contract["outputs"], ["MCDAAnalysis"])

    def test_wdm_criteria_do_not_require_direction_unlike_mcda(self):
        wdm_criterion_required = self.wdm_schema["properties"]["criteria"]["items"]["required"]
        mcda_criterion_required = self.mcda_schema["properties"]["criteria"]["items"]["required"]
        self.assertNotIn("direction", wdm_criterion_required)
        self.assertIn("direction", mcda_criterion_required)

    def test_wdm_schema_has_no_normalized_scores_or_raw_scores_field(self):
        self.assertNotIn("normalized_scores", self.wdm_schema["properties"])
        self.assertNotIn("raw_scores", self.wdm_schema["properties"])
        self.assertIn("scores", self.wdm_schema["properties"])

    def test_wdm_schema_has_scale_bounds_fields_mcda_schema_lacks(self):
        self.assertIn("scale_min", self.wdm_schema["properties"])
        self.assertIn("scale_max", self.wdm_schema["properties"])
        self.assertNotIn("scale_min", self.mcda_schema["properties"])

    def test_wdm_ids_are_a_distinct_namespace_from_mcda_ids(self):
        self.assertEqual(self.wdm_schema["properties"]["id"]["pattern"], "^WDM-")
        self.assertEqual(self.mcda_schema["properties"]["id"]["pattern"], "^MCDA-")

    def test_wdm_contract_forbidden_transition_matches_module_enforcement(self):
        """The contract's own inferred forbidden_transition must match what the module actually enforces --
        same drift-detection class test_mcda.py's own architecture.trade_off_matrix regression test applies."""
        self.assertEqual(self.wdm_contract["forbidden_transition"], ["Automatic Authority"])


class NoAutomaticAuthorityTests(unittest.TestCase):
    """This method's own INFERRED (not table-cited) 'Automatic Authority' rule, proven at both independent
    layers -- same discipline test_mcda.py's own NoAutomaticAuthorityTests class already established for a
    table-cited sibling rule."""

    def test_top_level_authority_key_is_refused_at_construction(self):
        for key in sorted(FORBIDDEN_AUTHORITY_KEYS):
            with self.subTest(key=key):
                analysis = _valid_analysis()
                analysis[key] = True
                with self.assertRaisesRegex(InvariantViolation, "WDM_AUTOMATIC_AUTHORITY_CLAIM_FORBIDDEN"):
                    assert_no_automatic_authority_claim(analysis)

    def test_clean_record_passes_the_authority_check(self):
        assert_no_automatic_authority_claim(_valid_analysis())  # must not raise

    def test_non_dict_record_is_refused_not_crashed_by_the_authority_assert(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                with self.assertRaisesRegex(InvariantViolation, "WDM_AUTOMATIC_AUTHORITY_CLAIM_FORBIDDEN"):
                    assert_no_automatic_authority_claim(bad_record)

    def test_schema_layer_independently_refuses_a_hand_crafted_bypass(self):
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        tampered = _valid_analysis()
        tampered["approved"] = True
        with self.assertRaises(SchemaValidationError):
            contracts.validate(WDM_ANALYSIS_SCHEMA, tampered, "hand-crafted bypass")

    def test_gate_reuses_assert_no_automatic_authority_claim_and_fails_on_a_tampered_record(self):
        analysis = _valid_analysis()
        analysis["outcome"] = "O1"
        gate = evaluate_no_automatic_authority_gate(analysis, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_passes_on_a_clean_record(self):
        gate = evaluate_no_automatic_authority_gate(_valid_analysis(), "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_no_authority_gate_non_dict_input_is_refused_not_crashed(self):
        for bad_analysis in (None, "not-a-dict", [], 42):
            with self.subTest(bad_analysis=bad_analysis):
                gate = evaluate_no_automatic_authority_gate(bad_analysis, "test", "2026-09-08T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")


class GateReuseAndMutationTests(unittest.TestCase):
    def test_genuine_compute_gate_is_the_same_function_prior_slices_already_reuse(self):
        analysis = _valid_analysis()
        direct_pass, direct_evidence = evaluate_statistical_gate(analysis)
        gate = evaluate_genuine_compute_gate(analysis, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "PASS" if direct_pass else "FAIL")
        self.assertEqual(gate["evidence"], direct_evidence)

    def test_valid_analysis_passes_all_five_gates(self):
        results = evaluate_weighted_decision_matrix_gates(_valid_analysis(), "test", "2026-09-08T00:00:00Z")
        self.assertEqual(
            {r["gate_id"] for r in results},
            {"provenance_required", "genuine_compute", "sensitivity_disclosed", "no_automatic_authority_claim", "score_matrix_integrity"},
        )
        self.assertTrue(all_gates_pass(results))

    def test_provenance_required_gate_fails_on_missing_provenance(self):
        analysis = _valid_analysis()
        del analysis["provenance"]
        gate = evaluate_provenance_required_gate(analysis, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_invalid_provenance(self):
        analysis = _valid_analysis()
        analysis["provenance"] = {"epistemic_type": "NOT_A_REAL_TYPE"}
        gate = evaluate_provenance_required_gate(analysis, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_sensitivity_disclosed_gate_fails_on_blank_notes(self):
        analysis = _valid_analysis()
        analysis["sensitivity_notes"] = "   "
        gate = evaluate_sensitivity_disclosed_gate(analysis, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_sensitivity_disclosed_gate_passes_on_clean_record(self):
        gate = evaluate_sensitivity_disclosed_gate(_valid_analysis(), "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_score_matrix_integrity_gate_passes_on_untampered_record(self):
        gate = evaluate_score_matrix_integrity_gate(_valid_analysis(), "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_score_matrix_integrity_gate_fails_on_tampered_ranking_value(self):
        analysis = _valid_analysis()
        analysis["ranking"][0] = dict(analysis["ranking"][0], weighted_score=999.0)
        gate = evaluate_score_matrix_integrity_gate(analysis, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_score_matrix_integrity_gate_fails_on_tampered_ranking_order(self):
        analysis = _valid_analysis()
        analysis["ranking"] = list(reversed(analysis["ranking"]))
        gate = evaluate_score_matrix_integrity_gate(analysis, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_score_matrix_integrity_gate_fails_on_removed_score_entry(self):
        analysis = _valid_analysis()
        analysis["scores"] = analysis["scores"][:-1]
        gate = evaluate_score_matrix_integrity_gate(analysis, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_score_matrix_integrity_gate_fails_on_duplicated_score_entry(self):
        analysis = _valid_analysis()
        analysis["scores"] = analysis["scores"] + [dict(analysis["scores"][0])]
        gate = evaluate_score_matrix_integrity_gate(analysis, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_score_matrix_integrity_gate_fails_on_score_pushed_out_of_scale(self):
        analysis = _valid_analysis()
        analysis["scores"][0] = dict(analysis["scores"][0], value=42)
        gate = evaluate_score_matrix_integrity_gate(analysis, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_score_matrix_integrity_gate_fails_on_corrupted_scale_bounds(self):
        analysis = _valid_analysis()
        analysis["scale_max"] = analysis["scale_min"]
        gate = evaluate_score_matrix_integrity_gate(analysis, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_score_matrix_integrity_gate_fails_on_tampered_weights_not_summing_to_one(self):
        analysis = _valid_analysis()
        analysis["weights"][0] = dict(analysis["weights"][0], weight=0.99)
        gate = evaluate_score_matrix_integrity_gate(analysis, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_score_matrix_integrity_gate_fails_on_stray_direction_key_on_criterion(self):
        analysis = _valid_analysis()
        analysis["criteria"][0] = dict(analysis["criteria"][0], direction="maximize")
        gate = evaluate_score_matrix_integrity_gate(analysis, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_score_matrix_integrity_gate_fails_on_duplicate_option_id(self):
        analysis = _valid_analysis()
        analysis["options"][1] = dict(analysis["options"][1], id=analysis["options"][0]["id"])
        gate = evaluate_score_matrix_integrity_gate(analysis, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_score_matrix_integrity_gate_fails_on_too_few_options(self):
        analysis = _valid_analysis()
        analysis["options"] = analysis["options"][:1]
        gate = evaluate_score_matrix_integrity_gate(analysis, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_analysis_fails_all_gates_not_a_crash(self):
        """Every gate in this module's own aggregate must fail closed, not crash, on a non-dict top-level
        argument -- the same regression class root_cause.fault_tree's/decision.mcda's own equivalent
        proves for their own families."""
        for bad_analysis in (None, "not-a-dict", [], 42):
            with self.subTest(bad_analysis=bad_analysis):
                results = evaluate_weighted_decision_matrix_gates(bad_analysis, "test", "2026-09-08T00:00:00Z")  # must not raise
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))

    def test_score_matrix_integrity_gate_non_dict_input_fails_not_crashes(self):
        for bad_analysis in (None, "not-a-dict", [], 42):
            with self.subTest(bad_analysis=bad_analysis):
                gate = evaluate_score_matrix_integrity_gate(bad_analysis, "test", "2026-09-08T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_provenance_gate_non_dict_input_fails_not_crashes(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_sensitivity_gate_non_dict_input_fails_not_crashes(self):
        gate = evaluate_sensitivity_disclosed_gate(["not", "a", "dict"], "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_genuine_compute_gate_non_dict_input_fails_not_crashes(self):
        gate = evaluate_genuine_compute_gate(42, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
