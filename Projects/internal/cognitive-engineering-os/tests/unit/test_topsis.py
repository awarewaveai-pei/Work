"""Mutation-style tests for ``decision.topsis`` (7th member of the `decision` family, F16, after
ahp/mcda/impact_effort/ice/rice/moscow).

The compute layer (``ai_lego/compute/topsis/distance.py``) is checked
against a HAND-VERIFIED 3-option, 2-criterion example (see that module's own
docstring for the full worked derivation: closeness_coefficient =
{V1: 0.6, V2: 0.5, V3: 0.4}) plus a property-based single-criterion case
(with exactly one criterion, closeness_coefficient reduces algebraically to
the option's own weighted_value -- verified for arbitrary raw inputs, not
just one fixed example) and several degenerate/edge cases (all-tied
options, missing scores, a criterion weights forgets entirely).

Two-layer discipline is proven for all three headline invariants, same
"raise before construction" / "gate re-derives, never trusts a stored
value" pattern every prior module in this package establishes:

1. Ideal/anti-ideal points are GENUINE_COMPUTE.
2. The closeness_coefficient ranking is GENUINE_COMPUTE.
3. TOPSIS_TOO_FEW_OPTIONS (adapted from decision.mcda's own MCDA_TOO_FEW_OPTIONS).
"""

from __future__ import annotations

import copy
import math
import unittest

from ai_lego import resolve_spec_root
from ai_lego.compute.mcda.scoring import normalize_scores, validate_weights_sum_to_one
from ai_lego.compute.topsis.distance import compute_ideal_points, compute_topsis_ranking, compute_weighted_normalized_values
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.decision.topsis import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_genuine_compute_gate,
    evaluate_provenance_required_gate,
    evaluate_topsis_gates,
    evaluate_topsis_structure_gate,
    generate_topsis_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

TOPSIS_ANALYSIS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/topsis-analysis.schema.yaml"
TS = "2026-09-08T00:00:00Z"


# --------------------------------------------------------------------------
# Shared fixtures -- the hand-verified 3-vendor scenario (identical to
# run_topsis_slice.py's own CLI scenario, so both artifacts cross-check).
# --------------------------------------------------------------------------


def _options():
    return [{"id": "V1", "label": "Vendor A"}, {"id": "V2", "label": "Vendor B"}, {"id": "V3", "label": "Vendor C"}]


def _criteria():
    return [{"id": "COST", "label": "Monthly cost (USD)", "direction": "minimize"}, {"id": "QUALITY", "label": "Support quality (1-10)", "direction": "maximize"}]


def _raw_scores():
    return [
        {"option_id": "V1", "criterion_id": "COST", "raw_value": 1000},
        {"option_id": "V1", "criterion_id": "QUALITY", "raw_value": 1},
        {"option_id": "V2", "criterion_id": "COST", "raw_value": 2000},
        {"option_id": "V2", "criterion_id": "QUALITY", "raw_value": 5},
        {"option_id": "V3", "criterion_id": "COST", "raw_value": 3000},
        {"option_id": "V3", "criterion_id": "QUALITY", "raw_value": 9},
    ]


def _weights():
    return [{"criterion_id": "COST", "weight": 0.6}, {"criterion_id": "QUALITY", "weight": 0.4}]


def _prov():
    return make_provenance("CALCULATED_RESULT", "AI_GENERATED")


def _valid_analysis():
    return generate_topsis_analysis("TOPSIS-T-001", _options(), _criteria(), _raw_scores(), _weights(), _prov())


class ComputeLayerTests(unittest.TestCase):
    """Real arithmetic, not just 'does it run' -- see module docstring for the full hand-derivation."""

    def test_hand_verified_three_option_two_criterion_example(self):
        """THE anchor test: closeness_coefficient = {V1: 0.6, V2: 0.5, V3: 0.4}, worked by hand (see
        ai_lego/compute/topsis/distance.py's own module docstring) BEFORE this suite was written, then
        cross-checked against a live Python run. V2's own 0.5 is a real symmetry proof, not a coincidence:
        its weighted vector (0.3, 0.2) is exactly half of the positive ideal (0.6, 0.4), so its distance to
        the negative ideal (0,0) and to the positive ideal are provably identical."""
        normalized = normalize_scores(_raw_scores(), _criteria())
        computed = compute_topsis_ranking(normalized, _weights(), ["V1", "V2", "V3"], ["COST", "QUALITY"])

        weighted_by_key = {(e["option_id"], e["criterion_id"]): e["weighted_value"] for e in computed["weighted_normalized_scores"]}
        self.assertAlmostEqual(weighted_by_key[("V1", "COST")], 0.6)
        self.assertAlmostEqual(weighted_by_key[("V1", "QUALITY")], 0.0)
        self.assertAlmostEqual(weighted_by_key[("V2", "COST")], 0.3)
        self.assertAlmostEqual(weighted_by_key[("V2", "QUALITY")], 0.2)
        self.assertAlmostEqual(weighted_by_key[("V3", "COST")], 0.0)
        self.assertAlmostEqual(weighted_by_key[("V3", "QUALITY")], 0.4)

        ideal_by_criterion = {e["criterion_id"]: (e["positive_ideal"], e["negative_ideal"]) for e in computed["ideal_points"]}
        self.assertEqual(ideal_by_criterion["COST"], (0.6, 0.0))
        self.assertEqual(ideal_by_criterion["QUALITY"], (0.4, 0.0))

        closeness = {e["option_id"]: e["closeness_coefficient"] for e in computed["ranking"]}
        self.assertAlmostEqual(closeness["V1"], 0.6)
        self.assertAlmostEqual(closeness["V2"], 0.5)
        self.assertAlmostEqual(closeness["V3"], 0.4)

        distances = {e["option_id"]: (e["distance_to_ideal"], e["distance_to_anti_ideal"]) for e in computed["ranking"]}
        self.assertAlmostEqual(distances["V1"], (0.4, 0.6))
        self.assertAlmostEqual(distances["V2"][0], distances["V2"][1])  # the equidistant symmetry proof
        self.assertAlmostEqual(distances["V2"][0], math.sqrt(0.13))
        self.assertAlmostEqual(distances["V3"], (0.6, 0.4))

        # Ranking sorted DESCENDING by closeness -- V1 first, V3 last.
        self.assertEqual([e["option_id"] for e in computed["ranking"]], ["V1", "V2", "V3"])

    def test_single_criterion_closeness_equals_weighted_value_algebraically(self):
        """PROPERTY-based cross-check, not just one fixed example: with exactly ONE criterion, the closeness
        formula reduces algebraically to closeness = weighted_value (weight=1.0 for the sole criterion, so
        weighted_value == normalized_value; distance_to_ideal = |v - 1|, distance_to_anti = |v - 0| = v,
        closeness = v / ((1-v) + v) = v for any v in [0,1]). Verified here for 4 arbitrary raw inputs, not
        hand-picked to work."""
        criteria = [{"id": "C1", "label": "x", "direction": "maximize"}]
        raw = [
            {"option_id": "O1", "criterion_id": "C1", "raw_value": 3},
            {"option_id": "O2", "criterion_id": "C1", "raw_value": 17},
            {"option_id": "O3", "criterion_id": "C1", "raw_value": 42},
            {"option_id": "O4", "criterion_id": "C1", "raw_value": 100},
        ]
        weights = [{"criterion_id": "C1", "weight": 1.0}]
        normalized = normalize_scores(raw, criteria)
        computed = compute_topsis_ranking(normalized, weights, ["O1", "O2", "O3", "O4"], ["C1"])
        normalized_by_option = {e["option_id"]: e["normalized_value"] for e in normalized}
        for entry in computed["ranking"]:
            with self.subTest(option_id=entry["option_id"]):
                self.assertAlmostEqual(entry["closeness_coefficient"], normalized_by_option[entry["option_id"]], places=7)

    def test_two_option_boundary_case_winner_gets_closeness_one_loser_gets_zero(self):
        """A 2-option, 1-criterion boundary case verifiable by inspection: the winner's weighted_value is
        exactly the positive ideal (distance_to_ideal=0) and exactly as far as possible from the negative
        ideal -- closeness=1.0. The loser is the mirror image -- closeness=0.0."""
        criteria = [{"id": "C1", "label": "x", "direction": "maximize"}]
        raw = [{"option_id": "WINNER", "criterion_id": "C1", "raw_value": 10}, {"option_id": "LOSER", "criterion_id": "C1", "raw_value": 0}]
        weights = [{"criterion_id": "C1", "weight": 1.0}]
        normalized = normalize_scores(raw, criteria)
        computed = compute_topsis_ranking(normalized, weights, ["WINNER", "LOSER"], ["C1"])
        closeness = {e["option_id"]: e["closeness_coefficient"] for e in computed["ranking"]}
        self.assertAlmostEqual(closeness["WINNER"], 1.0)
        self.assertAlmostEqual(closeness["LOSER"], 0.0)

    def test_all_tied_options_produce_closeness_of_one_half_not_a_crash(self):
        """Degenerate case: every option identical on every criterion -> ideal == anti-ideal == that shared
        value -> both distances are 0 for every option -> 0/0 is avoided by the documented 0.5 convention
        (equidistant / no discrimination possible), not silently zeroed, not a ZeroDivisionError."""
        criteria = [{"id": "C1", "label": "x", "direction": "maximize"}]
        raw = [{"option_id": "O1", "criterion_id": "C1", "raw_value": 5}, {"option_id": "O2", "criterion_id": "C1", "raw_value": 5}]
        weights = [{"criterion_id": "C1", "weight": 1.0}]
        normalized = normalize_scores(raw, criteria)
        computed = compute_topsis_ranking(normalized, weights, ["O1", "O2"], ["C1"])
        for entry in computed["ranking"]:
            with self.subTest(option_id=entry["option_id"]):
                self.assertEqual(entry["distance_to_ideal"], 0.0)
                self.assertEqual(entry["distance_to_anti_ideal"], 0.0)
                self.assertEqual(entry["closeness_coefficient"], 0.5)

    def test_mixed_direction_normalization_is_direction_aware(self):
        """Confirms normalize_scores (reused unchanged) really is direction-aware inside this method's own
        pipeline -- lowest cost normalizes to 1.0 (best), lowest quality normalizes to 0.0 (worst)."""
        normalized = normalize_scores(_raw_scores(), _criteria())
        by_key = {(e["option_id"], e["criterion_id"]): e["normalized_value"] for e in normalized}
        self.assertAlmostEqual(by_key[("V1", "COST")], 1.0)  # cheapest -> best under minimize
        self.assertAlmostEqual(by_key[("V3", "COST")], 0.0)  # priciest -> worst under minimize
        self.assertAlmostEqual(by_key[("V1", "QUALITY")], 0.0)  # lowest quality -> worst under maximize
        self.assertAlmostEqual(by_key[("V3", "QUALITY")], 1.0)  # highest quality -> best under maximize

    def test_compute_weighted_normalized_values_multiplies_correctly(self):
        normalized = [{"option_id": "O1", "criterion_id": "C1", "normalized_value": 0.5}, {"option_id": "O1", "criterion_id": "C2", "normalized_value": 0.8}]
        weights = [{"criterion_id": "C1", "weight": 0.3}, {"criterion_id": "C2", "weight": 0.7}]
        weighted = {e["criterion_id"]: e["weighted_value"] for e in compute_weighted_normalized_values(normalized, weights)}
        self.assertAlmostEqual(weighted["C1"], 0.15)
        self.assertAlmostEqual(weighted["C2"], 0.56)

    def test_compute_weighted_normalized_values_rounds_to_eight_decimal_places(self):
        normalized = [{"option_id": "O1", "criterion_id": "C1", "normalized_value": 1 / 3}]
        weights = [{"criterion_id": "C1", "weight": 1 / 3}]
        weighted = compute_weighted_normalized_values(normalized, weights)[0]["weighted_value"]
        self.assertEqual(weighted, round(weighted, 8))

    def test_compute_weighted_normalized_values_unknown_criterion_in_weights_is_refused(self):
        """A defensive check that catches a real gap validate_weights_sum_to_one alone does not: a weights[]
        list that simply OMITS a criterion entirely (rather than referencing an unknown one) still sums to
        1.0 and passes that reused function -- this module's own extra check is what actually catches it,
        once normalize_scores has already produced a normalized_scores entry for the omitted criterion."""
        with self.assertRaisesRegex(InvariantViolation, "TOPSIS_UNKNOWN_CRITERION_IN_WEIGHTS"):
            compute_weighted_normalized_values([{"option_id": "O1", "criterion_id": "C1", "normalized_value": 0.5}], [{"criterion_id": "C2", "weight": 1.0}])

    def test_weights_missing_a_criterion_entirely_is_refused_even_though_validate_weights_sum_to_one_passes(self):
        """Integration-level proof of the same gap, reached through the real builder: criteria has 3 entries,
        weights covers only 2 of them (summing to 1.0 -- validate_weights_sum_to_one has nothing to object
        to), but raw_scores supplies real values for all 3 -- so normalize_scores produces a normalized_scores
        entry for the criterion weights forgot, and compute_weighted_normalized_values is what actually
        catches the gap."""
        criteria = [{"id": "C1", "label": "a", "direction": "maximize"}, {"id": "C2", "label": "b", "direction": "maximize"}, {"id": "C3", "label": "c", "direction": "maximize"}]
        raw_scores = [
            {"option_id": "O1", "criterion_id": "C1", "raw_value": 1},
            {"option_id": "O1", "criterion_id": "C2", "raw_value": 1},
            {"option_id": "O1", "criterion_id": "C3", "raw_value": 1},
            {"option_id": "O2", "criterion_id": "C1", "raw_value": 2},
            {"option_id": "O2", "criterion_id": "C2", "raw_value": 2},
            {"option_id": "O2", "criterion_id": "C3", "raw_value": 2},
        ]
        weights = [{"criterion_id": "C1", "weight": 0.5}, {"criterion_id": "C2", "weight": 0.5}]  # C3 entirely omitted
        validate_weights_sum_to_one(weights, ["C1", "C2", "C3"])  # confirms the reused function sees nothing wrong
        options = [{"id": "O1", "label": "a"}, {"id": "O2", "label": "b"}]
        with self.assertRaisesRegex(InvariantViolation, "TOPSIS_UNKNOWN_CRITERION_IN_WEIGHTS"):
            generate_topsis_analysis("TOPSIS-T-002", options, criteria, raw_scores, weights, _prov())

    def test_compute_ideal_points_picks_max_and_min_per_criterion(self):
        weighted = [
            {"option_id": "O1", "criterion_id": "C1", "weighted_value": 0.1},
            {"option_id": "O2", "criterion_id": "C1", "weighted_value": 0.9},
            {"option_id": "O3", "criterion_id": "C1", "weighted_value": 0.5},
        ]
        points = compute_ideal_points(weighted, ["C1"])
        self.assertEqual(points, [{"criterion_id": "C1", "positive_ideal": 0.9, "negative_ideal": 0.1}])

    def test_compute_ideal_points_missing_criterion_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOPSIS_INCOMPLETE_WEIGHTED_VALUES"):
            compute_ideal_points([{"option_id": "O1", "criterion_id": "C1", "weighted_value": 0.5}], ["C1", "C2"])

    def test_compute_topsis_ranking_missing_option_scores_is_refused(self):
        """An option with zero weighted-value coverage for a criterion (a gap upstream raw_scores left) must
        raise TOPSIS_INCOMPLETE_SCORES, not silently vanish from the ranking or KeyError."""
        normalized = [{"option_id": "O1", "criterion_id": "C1", "normalized_value": 0.5}]  # O2 has NO entry at all
        weights = [{"criterion_id": "C1", "weight": 1.0}]
        with self.assertRaisesRegex(InvariantViolation, "TOPSIS_INCOMPLETE_SCORES"):
            compute_topsis_ranking(normalized, weights, ["O1", "O2"], ["C1"])

    def test_incomplete_raw_scores_is_refused_through_the_real_builder(self):
        """Same gap, reached through generate_topsis_analysis directly: raw_scores omits one (option,
        criterion) pair entirely."""
        options = [{"id": "O1", "label": "a"}, {"id": "O2", "label": "b"}]
        criteria = [{"id": "C1", "label": "x", "direction": "maximize"}]
        raw_scores = [{"option_id": "O1", "criterion_id": "C1", "raw_value": 5}]  # O2/C1 never supplied
        weights = [{"criterion_id": "C1", "weight": 1.0}]
        with self.assertRaisesRegex(InvariantViolation, "TOPSIS_INCOMPLETE_SCORES"):
            generate_topsis_analysis("TOPSIS-T-003", options, criteria, raw_scores, weights, _prov())

    def test_ranking_sorted_descending_by_closeness_coefficient(self):
        analysis = _valid_analysis()
        closeness_values = [e["closeness_coefficient"] for e in analysis["ranking"]]
        self.assertEqual(closeness_values, sorted(closeness_values, reverse=True))

    def test_ranking_entries_have_the_expected_keys(self):
        analysis = _valid_analysis()
        for entry in analysis["ranking"]:
            self.assertEqual(set(entry.keys()), {"option_id", "distance_to_ideal", "distance_to_anti_ideal", "closeness_coefficient"})

    def test_normalize_scores_is_reused_unchanged_not_reimplemented(self):
        """The Normalize stage is not reimplemented -- it is the exact same function decision.mcda already
        uses, same cross-family reuse proof test_mcda.py's own test_score_stage_reuses_rank_options_unchanged
        establishes for a different reused function."""
        analysis = _valid_analysis()
        direct = normalize_scores(_raw_scores(), _criteria())
        self.assertEqual(analysis["normalized_scores"], direct)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    # --- happy path / schema conformance ---
    def test_topsis_analysis_validates_against_the_real_schema(self):
        self.contracts.validate(TOPSIS_ANALYSIS_SCHEMA, _valid_analysis(), "topsis analysis")

    def test_schema_own_example_validates_and_passes_every_gate(self):
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "topsis-analysis.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        examples = schema_doc.get("examples") or []
        self.assertTrue(examples, "topsis-analysis.schema.yaml has no examples to check")
        for example in examples:
            with self.subTest(description=example.get("description")):
                value = example["value"]
                self.contracts.validate(TOPSIS_ANALYSIS_SCHEMA, value, f"schema example: {example.get('description')}")
                self.assertTrue(all_gates_pass(evaluate_topsis_gates(value, "test", TS)), f"schema example failed a real gate: {example.get('description')}")

    def test_builder_round_trips_generated_by_method_and_version(self):
        analysis = generate_topsis_analysis("TOPSIS-T-004", _options(), _criteria(), _raw_scores(), _weights(), _prov(), version="2.3.4", generated_by_method="decision.topsis@test")
        self.assertEqual(analysis["generated_by_method"], "decision.topsis@test")
        self.assertEqual(analysis["version"], "2.3.4")
        self.assertEqual(_valid_analysis()["generated_by_method"], METHOD_ID)

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        self.assertIsNone(live.resolve([METHOD_ID])["blocked"])

    def test_empty_catalog_blocks_topsis_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    # --- id / version shape ---
    def test_empty_analysis_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOPSIS_INVALID_RECORD_ID"):
            generate_topsis_analysis("", _options(), _criteria(), _raw_scores(), _weights(), _prov())

    def test_analysis_id_without_topsis_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOPSIS_INVALID_RECORD_ID"):
            generate_topsis_analysis("MCDA-1", _options(), _criteria(), _raw_scores(), _weights(), _prov())

    def test_whitespace_only_analysis_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOPSIS_INVALID_RECORD_ID"):
            generate_topsis_analysis("   ", _options(), _criteria(), _raw_scores(), _weights(), _prov())

    def test_non_string_version_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOPSIS_INVALID_VERSION"):
            generate_topsis_analysis("TOPSIS-T-005", _options(), _criteria(), _raw_scores(), _weights(), _prov(), version=123)

    # --- options shape / invariant #3 (TOPSIS_TOO_FEW_OPTIONS) ---
    def test_zero_options_is_refused_as_too_few(self):
        with self.assertRaisesRegex(InvariantViolation, "TOPSIS_TOO_FEW_OPTIONS"):
            generate_topsis_analysis("TOPSIS-T-006", [], _criteria(), _raw_scores(), _weights(), _prov())

    def test_one_option_is_refused_as_too_few(self):
        with self.assertRaisesRegex(InvariantViolation, "TOPSIS_TOO_FEW_OPTIONS"):
            generate_topsis_analysis(
                "TOPSIS-T-007",
                [{"id": "SOLO", "label": "only one"}],
                _criteria(),
                [{"option_id": "SOLO", "criterion_id": "COST", "raw_value": 1}, {"option_id": "SOLO", "criterion_id": "QUALITY", "raw_value": 1}],
                _weights(),
                _prov(),
            )

    def test_options_non_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOPSIS_INVALID_OPTIONS"):
            generate_topsis_analysis("TOPSIS-T-008", "not a list", _criteria(), _raw_scores(), _weights(), _prov())

    def test_option_missing_label_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOPSIS_INVALID_OPTIONS"):
            generate_topsis_analysis("TOPSIS-T-009", [{"id": "V1"}, {"id": "V2", "label": "b"}], _criteria(), _raw_scores(), _weights(), _prov())

    def test_option_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOPSIS_INVALID_OPTIONS"):
            generate_topsis_analysis("TOPSIS-T-010", [dict(o, extra="x") for o in _options()[:2]], _criteria(), _raw_scores(), _weights(), _prov())

    def test_option_empty_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOPSIS_INVALID_OPTIONS"):
            generate_topsis_analysis("TOPSIS-T-011", [{"id": "", "label": "a"}, {"id": "V2", "label": "b"}], _criteria(), _raw_scores(), _weights(), _prov())

    def test_option_empty_label_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOPSIS_INVALID_OPTIONS"):
            generate_topsis_analysis("TOPSIS-T-012", [{"id": "V1", "label": "  "}, {"id": "V2", "label": "b"}], _criteria(), _raw_scores(), _weights(), _prov())

    def test_option_non_dict_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOPSIS_INVALID_OPTIONS"):
            generate_topsis_analysis("TOPSIS-T-013", ["not a dict", {"id": "V2", "label": "b"}], _criteria(), _raw_scores(), _weights(), _prov())

    def test_duplicate_option_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOPSIS_DUPLICATE_OPTION_ID"):
            generate_topsis_analysis("TOPSIS-T-014", [{"id": "V1", "label": "a"}, {"id": "V1", "label": "a again"}], _criteria(), _raw_scores(), _weights(), _prov())

    # --- criteria shape ---
    def test_empty_criteria_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOPSIS_NO_CRITERIA"):
            generate_topsis_analysis("TOPSIS-T-015", _options(), [], _raw_scores(), _weights(), _prov())

    def test_criteria_non_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOPSIS_NO_CRITERIA"):
            generate_topsis_analysis("TOPSIS-T-016", _options(), "not a list", _raw_scores(), _weights(), _prov())

    def test_criterion_missing_direction_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOPSIS_INVALID_CRITERIA"):
            generate_topsis_analysis("TOPSIS-T-017", _options(), [{"id": "C1", "label": "x"}], _raw_scores(), _weights(), _prov())

    def test_criterion_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOPSIS_INVALID_CRITERIA"):
            generate_topsis_analysis("TOPSIS-T-018", _options(), [dict(_criteria()[0], extra="x")], _raw_scores(), _weights(), _prov())

    def test_criterion_empty_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOPSIS_INVALID_CRITERIA"):
            generate_topsis_analysis("TOPSIS-T-019", _options(), [{"id": "", "label": "x", "direction": "maximize"}], _raw_scores(), _weights(), _prov())

    def test_criterion_empty_direction_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOPSIS_INVALID_CRITERIA"):
            generate_topsis_analysis("TOPSIS-T-020", _options(), [{"id": "C1", "label": "x", "direction": ""}], _raw_scores(), _weights(), _prov())

    def test_duplicate_criterion_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOPSIS_DUPLICATE_CRITERION_ID"):
            generate_topsis_analysis(
                "TOPSIS-T-021", _options(), [{"id": "C1", "label": "a", "direction": "maximize"}, {"id": "C1", "label": "b", "direction": "minimize"}], _raw_scores(), _weights(), _prov()
            )

    # --- cross-family passthrough from the REUSED ai_lego.compute.mcda.scoring functions ---
    def test_invalid_direction_value_surfaces_as_mcda_prefixed_error(self):
        """direction's own enum membership is deliberately NOT re-checked by this module (see topsis.py's
        own module docstring) -- normalize_scores (reused) owns it, and its own MCDA_-prefixed code is
        expected to surface unchanged, the same cross-family passthrough decision.mcda itself already
        accepts from its own reuse of ai_lego.compute.ahp.weights.rank_options."""
        criteria = [{"id": "COST", "label": "x", "direction": "higher_is_better"}, {"id": "QUALITY", "label": "y", "direction": "maximize"}]
        with self.assertRaisesRegex(InvariantViolation, "MCDA_INVALID_DIRECTION"):
            generate_topsis_analysis("TOPSIS-T-022", _options(), criteria, _raw_scores(), _weights(), _prov())

    def test_weights_not_summing_to_one_surfaces_as_mcda_prefixed_error(self):
        with self.assertRaisesRegex(InvariantViolation, "MCDA_WEIGHTS_DO_NOT_SUM_TO_ONE"):
            generate_topsis_analysis("TOPSIS-T-023", _options(), _criteria(), _raw_scores(), [{"criterion_id": "COST", "weight": 0.5}, {"criterion_id": "QUALITY", "weight": 0.6}], _prov())

    def test_negative_weight_surfaces_as_mcda_prefixed_error(self):
        with self.assertRaisesRegex(InvariantViolation, "MCDA_NEGATIVE_WEIGHT"):
            generate_topsis_analysis("TOPSIS-T-024", _options(), _criteria(), _raw_scores(), [{"criterion_id": "COST", "weight": -0.4}, {"criterion_id": "QUALITY", "weight": 1.4}], _prov())

    def test_unknown_criterion_in_raw_scores_surfaces_as_mcda_prefixed_error(self):
        bad_raw = _raw_scores() + [{"option_id": "V1", "criterion_id": "DOES_NOT_EXIST", "raw_value": 1}]
        with self.assertRaisesRegex(InvariantViolation, "MCDA_UNKNOWN_CRITERION_IN_RAW_SCORE"):
            generate_topsis_analysis("TOPSIS-T-025", _options(), _criteria(), bad_raw, _weights(), _prov())

    def test_unknown_criterion_in_weights_surfaces_as_mcda_prefixed_error(self):
        with self.assertRaisesRegex(InvariantViolation, "MCDA_UNKNOWN_CRITERION_IN_WEIGHTS"):
            generate_topsis_analysis("TOPSIS-T-026", _options(), _criteria(), _raw_scores(), [{"criterion_id": "DOES_NOT_EXIST", "weight": 1.0}], _prov())

    # --- rebuild-not-alias ---
    def test_mutating_the_callers_own_inputs_after_construction_does_not_affect_the_stored_record(self):
        options, criteria, raw_scores, weights = _options(), _criteria(), _raw_scores(), _weights()
        analysis = generate_topsis_analysis("TOPSIS-T-027", options, criteria, raw_scores, weights, _prov())
        options[0]["label"] = "mutated"
        criteria[0]["label"] = "mutated"
        raw_scores[0]["raw_value"] = 999999
        weights[0]["weight"] = 999
        self.assertEqual(analysis["options"][0]["label"], "Vendor A")
        self.assertEqual(analysis["criteria"][0]["label"], "Monthly cost (USD)")
        self.assertEqual(analysis["raw_scores"][0]["raw_value"], 1000)
        self.assertEqual(analysis["weights"][0]["weight"], 0.6)

    def test_provenance_is_deliberately_aliased_not_rebuilt(self):
        provenance = _prov()
        analysis = generate_topsis_analysis("TOPSIS-T-028", _options(), _criteria(), _raw_scores(), _weights(), provenance)
        provenance["epistemic_type"] = "AI_INFERENCE"
        self.assertEqual(analysis["provenance"]["epistemic_type"], "AI_INFERENCE")

    def test_ranking_computed_never_accepted_as_a_parameter(self):
        """generate_topsis_analysis has no parameter through which a caller could inject a fabricated
        ranking/ideal_points -- confirmed by signature inspection, same class of structural guarantee every
        genuine-compute builder in this package provides."""
        import inspect

        params = set(inspect.signature(generate_topsis_analysis).parameters)
        self.assertNotIn("ranking", params)
        self.assertNotIn("ideal_points", params)
        self.assertNotIn("weighted_normalized_scores", params)
        self.assertNotIn("normalized_scores", params)


class GateMutationTests(unittest.TestCase):
    def test_valid_analysis_passes_all_three_gates(self):
        results = evaluate_topsis_gates(_valid_analysis(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "topsis_structure", "genuine_compute"})
        self.assertTrue(all_gates_pass(results))

    def test_all_gates_pass_returns_false_when_a_gate_fails(self):
        analysis = _valid_analysis()
        analysis["id"] = ""
        self.assertFalse(all_gates_pass(evaluate_topsis_gates(analysis, "test", TS)))

    def test_non_dict_analysis_fails_all_gates_not_a_crash(self):
        for bad_analysis in (None, "not-a-dict", [], 42):
            with self.subTest(bad_analysis=bad_analysis):
                results = evaluate_topsis_gates(bad_analysis, "test", TS)  # must not raise
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        analysis = _valid_analysis()
        before = copy.deepcopy(analysis)
        evaluate_topsis_gates(analysis, "test", TS)
        self.assertEqual(analysis, before)

    # --- provenance_required ---
    def test_missing_provenance_fails_the_provenance_gate_not_a_crash(self):
        analysis = _valid_analysis()
        analysis["provenance"] = None
        self.assertEqual(evaluate_provenance_required_gate(analysis, "test", TS)["status"], "FAIL")

    def test_malformed_provenance_fails_the_provenance_gate(self):
        analysis = _valid_analysis()
        analysis["provenance"] = {"epistemic_type": "NOT_A_REAL_TYPE", "authorship_state": "AI_GENERATED", "locked": None}
        self.assertEqual(evaluate_provenance_required_gate(analysis, "test", TS)["status"], "FAIL")

    # --- topsis_structure, invariant #3 re-derived at the GATE layer ---
    def test_hand_tampered_id_without_prefix_fails_the_structure_gate(self):
        analysis = _valid_analysis()
        analysis["id"] = "MCDA-1"
        result = evaluate_topsis_structure_gate(analysis, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["evidence"][0]["id_has_topsis_prefix"])

    def test_hand_stripped_to_one_option_fails_the_structure_gate(self):
        """The core re-derived-not-trusted invariant #3: a copy of an already-VALID record with an option
        hand-removed afterward must be caught by real re-derivation, not accepted because the record merely
        looked well-formed when it was built (TOPSIS_TOO_FEW_OPTIONS's own construction-time check alone
        would never see this)."""
        analysis = _valid_analysis()
        analysis["options"] = analysis["options"][:1]
        result = evaluate_topsis_structure_gate(analysis, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["evidence"][0]["at_least_two_options"])

    def test_hand_emptied_criteria_fails_the_structure_gate(self):
        analysis = _valid_analysis()
        analysis["criteria"] = []
        result = evaluate_topsis_structure_gate(analysis, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["evidence"][0]["at_least_one_criterion"])

    def test_hand_injected_duplicate_option_id_fails_the_structure_gate(self):
        analysis = _valid_analysis()
        analysis["options"][1]["id"] = analysis["options"][0]["id"]
        result = evaluate_topsis_structure_gate(analysis, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["evidence"][0]["option_ids_unique"])

    def test_hand_injected_duplicate_criterion_id_fails_the_structure_gate(self):
        analysis = _valid_analysis()
        analysis["criteria"][1]["id"] = analysis["criteria"][0]["id"]
        result = evaluate_topsis_structure_gate(analysis, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["evidence"][0]["criterion_ids_unique"])

    def test_hand_malformed_option_fails_the_structure_gate(self):
        analysis = _valid_analysis()
        analysis["options"][0] = {"id": "V1"}  # missing label
        result = evaluate_topsis_structure_gate(analysis, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["evidence"][0]["options_well_shaped"])

    def test_hand_malformed_criterion_fails_the_structure_gate(self):
        analysis = _valid_analysis()
        analysis["criteria"][0] = {"id": "COST"}  # missing label/direction
        result = evaluate_topsis_structure_gate(analysis, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["evidence"][0]["criteria_well_shaped"])

    def test_valid_record_passes_the_structure_gate_with_all_checks_true(self):
        result = evaluate_topsis_structure_gate(_valid_analysis(), "test", TS)
        self.assertEqual(result["status"], "PASS")
        self.assertTrue(all(result["evidence"][0].values()))

    # --- genuine_compute, invariants #1 and #2 re-derived at the GATE layer ---
    def test_hand_tampered_closeness_coefficient_fails_the_genuine_compute_gate(self):
        """Invariant #2, re-derived: a copy of an already-VALID record with its own stored
        closeness_coefficient hand-tampered afterward must be caught, not accepted."""
        analysis = _valid_analysis()
        analysis["ranking"][0]["closeness_coefficient"] = 0.99
        result = evaluate_genuine_compute_gate(analysis, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["evidence"][0]["stored_ranking_matches_recomputed"])

    def test_hand_tampered_ideal_point_fails_the_genuine_compute_gate(self):
        """Invariant #1, re-derived: a hand-tampered ideal_points entry must be caught."""
        analysis = _valid_analysis()
        analysis["ideal_points"][0]["positive_ideal"] = 0.999
        result = evaluate_genuine_compute_gate(analysis, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["evidence"][0]["stored_ideal_points_matches_recomputed"])

    def test_hand_tampered_weighted_normalized_scores_fails_the_genuine_compute_gate(self):
        analysis = _valid_analysis()
        analysis["weighted_normalized_scores"][0]["weighted_value"] = 0.123456
        result = evaluate_genuine_compute_gate(analysis, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["evidence"][0]["stored_weighted_normalized_scores_matches_recomputed"])

    def test_hand_tampered_engine_field_fails_the_genuine_compute_gate(self):
        analysis = _valid_analysis()
        analysis["engine"] = "llm_mental_arithmetic"
        result = evaluate_genuine_compute_gate(analysis, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["evidence"][0]["engine_is_deterministic_compute_not_llm"])

    def test_unresolvable_computation_provenance_ref_fails_the_genuine_compute_gate(self):
        analysis = _valid_analysis()
        analysis["computation_provenance_ref"] = "ai_lego.compute.topsis.distance.this_function_does_not_exist"
        result = evaluate_genuine_compute_gate(analysis, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["evidence"][0]["computation_provenance_ref_resolves"])

    def test_computation_provenance_ref_outside_compute_namespace_fails_the_genuine_compute_gate(self):
        analysis = _valid_analysis()
        analysis["computation_provenance_ref"] = "os.system"
        result = evaluate_genuine_compute_gate(analysis, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["evidence"][0]["computation_provenance_ref_resolves"])

    def test_missing_normalized_scores_fails_the_genuine_compute_gate_not_a_crash(self):
        analysis = _valid_analysis()
        del analysis["normalized_scores"]
        result = evaluate_genuine_compute_gate(analysis, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["evidence"][0]["recompute_succeeded"])

    def test_missing_weights_fails_the_genuine_compute_gate_not_a_crash(self):
        analysis = _valid_analysis()
        del analysis["weights"]
        result = evaluate_genuine_compute_gate(analysis, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["evidence"][0]["recompute_succeeded"])

    def test_malformed_options_fails_the_genuine_compute_gate_not_a_crash(self):
        analysis = _valid_analysis()
        analysis["options"] = "not a list"
        result = evaluate_genuine_compute_gate(analysis, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["evidence"][0]["recompute_succeeded"])

    def test_malformed_criteria_fails_the_genuine_compute_gate_not_a_crash(self):
        analysis = _valid_analysis()
        analysis["criteria"] = [{"id": "COST"}]  # missing label/direction
        result = evaluate_genuine_compute_gate(analysis, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["evidence"][0]["recompute_succeeded"])

    def test_normalized_scores_missing_a_criterion_fails_the_genuine_compute_gate_not_a_crash(self):
        """A stored normalized_scores that no longer covers every option x criterion (TOPSIS_INCOMPLETE_SCORES
        inside the recompute) must fail closed, not crash the gate."""
        analysis = _valid_analysis()
        analysis["normalized_scores"] = [e for e in analysis["normalized_scores"] if not (e["option_id"] == "V2" and e["criterion_id"] == "COST")]
        result = evaluate_genuine_compute_gate(analysis, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["evidence"][0]["recompute_succeeded"])

    def test_genuine_compute_gate_reports_recomputed_ranking_as_evidence(self):
        result = evaluate_genuine_compute_gate(_valid_analysis(), "test", TS)
        self.assertEqual(result["status"], "PASS")
        self.assertIn("recomputed_ranking", result["evidence"][1])
        self.assertEqual({e["option_id"] for e in result["evidence"][1]["recomputed_ranking"]}, {"V1", "V2", "V3"})

    def test_valid_record_genuine_compute_gate_all_checks_true(self):
        result = evaluate_genuine_compute_gate(_valid_analysis(), "test", TS)
        self.assertEqual(result["status"], "PASS")
        self.assertTrue(all(result["evidence"][0].values()))


class SchemaLayerIndependentRejectionTests(unittest.TestCase):
    """Confirms the schema (additionalProperties: false, closed key sets) independently rejects the same
    malformations the runtime layer already refuses -- two independent layers, same discipline every sibling
    typed-object schema's own conformance tests establish."""

    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_schema_rejects_an_id_without_the_topsis_prefix(self):
        analysis = _valid_analysis()
        analysis["id"] = "MCDA-1"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TOPSIS_ANALYSIS_SCHEMA, analysis, "schema id prefix")

    def test_schema_rejects_a_missing_required_top_level_field(self):
        analysis = _valid_analysis()
        del analysis["ideal_points"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TOPSIS_ANALYSIS_SCHEMA, analysis, "schema top-level required")

    def test_schema_rejects_an_unknown_top_level_field(self):
        """additionalProperties: false at the top level -- a hand-crafted extra key must be refused."""
        analysis = _valid_analysis()
        analysis["ranked_by_llm"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TOPSIS_ANALYSIS_SCHEMA, analysis, "schema additionalProperties")

    def test_schema_rejects_a_closeness_coefficient_above_one(self):
        analysis = _valid_analysis()
        analysis["ranking"][0]["closeness_coefficient"] = 1.5
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TOPSIS_ANALYSIS_SCHEMA, analysis, "schema closeness bound")

    def test_schema_rejects_options_below_minitems(self):
        analysis = _valid_analysis()
        analysis["options"] = analysis["options"][:1]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TOPSIS_ANALYSIS_SCHEMA, analysis, "schema options minItems")

    def test_schema_rejects_a_wrong_engine_literal(self):
        analysis = _valid_analysis()
        analysis["engine"] = "some_other_engine"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TOPSIS_ANALYSIS_SCHEMA, analysis, "schema engine const")

    def test_schema_rejects_a_non_compute_provenance_ref(self):
        analysis = _valid_analysis()
        analysis["computation_provenance_ref"] = "not_a_compute_path"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TOPSIS_ANALYSIS_SCHEMA, analysis, "schema computation_provenance_ref pattern")


if __name__ == "__main__":
    unittest.main()
