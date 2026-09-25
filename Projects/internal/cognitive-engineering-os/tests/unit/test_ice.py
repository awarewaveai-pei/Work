"""Mutation-style tests for ``decision.ice`` (third member of the `decision` family, F16 -- after
`decision.ahp` and `decision.mcda`).

Due-diligence vs `decision.mcda` proven concretely, not just asserted in
prose: `test_single_item_backlog_is_legal` shows ICE needs only 1 item
(MCDA structurally requires >= 2 for its relative normalization to mean
anything), and the compute-layer tests show each item's score is an
ABSOLUTE function of only its own 3 dimensions (no cross-item
normalization, no caller-supplied weights).

Two-layer discipline proven for BOTH headline invariants:

1. Dimension range (``ICE_DIMENSION_OUT_OF_RANGE``) -- impact/confidence/
   ease must each be a finite, non-boolean number in [1, 10].
2. Score integrity (``ICE_SCORE_MISMATCH`` class) -- every item's own
   ``ice_score`` must equal the arithmetic mean of its own 3 raw
   dimensions, and every ``ranking[]`` entry must match its own item's
   own stored score, independently RE-DERIVED at the gate (a
   hand-tampered copy of an already-valid record must still be caught).
"""

from __future__ import annotations

import copy
import math
import unittest

from ai_lego import resolve_spec_root
from ai_lego.compute.ice.scoring import compute_ice_score, is_valid_dimension_score, score_matches
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.decision.ice import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_genuine_compute_gate,
    evaluate_ice_gates,
    evaluate_ice_integrity_gate,
    evaluate_provenance_required_gate,
    generate_ice_score_record,
)
from ai_lego.modules.research.gates import evaluate_statistical_gate
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/ice-score-record.schema.yaml"
TS = "2026-09-07T00:00:00Z"


def _prov():
    return make_provenance("CALCULATED_RESULT", "AI_GENERATED")


def _item(item_id="I1", label="idea", impact=6, confidence=8, ease=9):
    return {"id": item_id, "label": label, "impact": impact, "confidence": confidence, "ease": ease}


def _three_items():
    return [
        _item("I1", "trust badge", 6, 8, 9),
        _item("I2", "onboarding rewrite", 8, 6, 4),
        _item("I3", "referral program", 9, 5, 3),
    ]


def _build(record_id="ICE-T-001", context="test backlog", items=None, version="1.0.0"):
    return generate_ice_score_record(record_id, context, _three_items() if items is None else items, _prov(), version=version)


def _valid_record():
    return _build()


class ComputeLayerTests(unittest.TestCase):
    """Pure arithmetic tests against ``ai_lego/compute/ice/scoring.py`` -- hand-computed expected values,
    independent of the module's own shape validation."""

    # --- known mean cases ---
    def test_known_mean_case_one(self):
        self.assertAlmostEqual(compute_ice_score(6, 8, 9), 7.66666667, places=6)

    def test_known_mean_case_two(self):
        self.assertEqual(compute_ice_score(8, 6, 4), 6.0)

    def test_known_mean_case_three(self):
        self.assertAlmostEqual(compute_ice_score(9, 5, 3), 5.66666667, places=6)

    def test_all_dimensions_at_minimum_yields_minimum_score(self):
        self.assertEqual(compute_ice_score(1, 1, 1), 1.0)

    def test_all_dimensions_at_maximum_yields_maximum_score(self):
        self.assertEqual(compute_ice_score(10, 10, 10), 10.0)

    def test_mixed_min_and_max_yields_correct_midpoint(self):
        self.assertAlmostEqual(compute_ice_score(1, 10, 10), 7.0, places=6)

    def test_score_is_rounded_to_eight_decimal_places(self):
        score = compute_ice_score(1, 1, 2)
        # (1+1+2)/3 = 1.3333333333... -> rounded to 8 places
        self.assertEqual(score, round(4 / 3, 8))

    def test_float_dimensions_are_accepted(self):
        self.assertAlmostEqual(compute_ice_score(5.5, 6.5, 7.0), (5.5 + 6.5 + 7.0) / 3.0, places=6)

    def test_mixed_int_and_float_dimensions_are_accepted(self):
        self.assertAlmostEqual(compute_ice_score(5, 6.5, 7), (5 + 6.5 + 7) / 3.0, places=6)

    # --- dimension range refusals, one per dimension per direction ---
    def test_impact_below_minimum_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_DIMENSION_OUT_OF_RANGE"):
            compute_ice_score(0.9, 5, 5)

    def test_impact_above_maximum_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_DIMENSION_OUT_OF_RANGE"):
            compute_ice_score(10.1, 5, 5)

    def test_confidence_below_minimum_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_DIMENSION_OUT_OF_RANGE"):
            compute_ice_score(5, 0, 5)

    def test_confidence_above_maximum_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_DIMENSION_OUT_OF_RANGE"):
            compute_ice_score(5, 11, 5)

    def test_ease_below_minimum_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_DIMENSION_OUT_OF_RANGE"):
            compute_ice_score(5, 5, -1)

    def test_ease_above_maximum_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_DIMENSION_OUT_OF_RANGE"):
            compute_ice_score(5, 5, 100)

    def test_error_message_names_the_offending_dimension(self):
        with self.assertRaisesRegex(InvariantViolation, "confidence=15"):
            compute_ice_score(5, 15, 5)

    # --- boolean / NaN / inf exclusion, same discipline as fault_tree's probability check ---
    def test_impact_boolean_is_refused_not_silently_accepted(self):
        """Regression guard: bool is a subclass of int in Python -- impact=True must NOT silently pass an
        isinstance(value, (int, float)) check as if it were 1.0."""
        with self.assertRaisesRegex(InvariantViolation, "ICE_DIMENSION_OUT_OF_RANGE"):
            compute_ice_score(True, 5, 5)

    def test_confidence_boolean_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_DIMENSION_OUT_OF_RANGE"):
            compute_ice_score(5, False, 5)

    def test_ease_boolean_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_DIMENSION_OUT_OF_RANGE"):
            compute_ice_score(5, 5, True)

    def test_impact_nan_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_DIMENSION_OUT_OF_RANGE"):
            compute_ice_score(float("nan"), 5, 5)

    def test_confidence_nan_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_DIMENSION_OUT_OF_RANGE"):
            compute_ice_score(5, float("nan"), 5)

    def test_ease_infinite_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_DIMENSION_OUT_OF_RANGE"):
            compute_ice_score(5, 5, float("inf"))

    def test_impact_negative_infinite_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_DIMENSION_OUT_OF_RANGE"):
            compute_ice_score(float("-inf"), 5, 5)

    def test_non_numeric_string_dimension_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_DIMENSION_OUT_OF_RANGE"):
            compute_ice_score("high", 5, 5)

    def test_none_dimension_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_DIMENSION_OUT_OF_RANGE"):
            compute_ice_score(None, 5, 5)

    # --- boundary legality ---
    def test_boundary_value_one_is_legal_for_all_three_dimensions(self):
        self.assertEqual(compute_ice_score(1, 1, 1), 1.0)

    def test_boundary_value_ten_is_legal_for_all_three_dimensions(self):
        self.assertEqual(compute_ice_score(10, 10, 10), 10.0)

    # --- is_valid_dimension_score, directly ---
    def test_is_valid_dimension_score_accepts_int_and_float_in_range(self):
        self.assertTrue(is_valid_dimension_score(5))
        self.assertTrue(is_valid_dimension_score(5.5))

    def test_is_valid_dimension_score_rejects_bool(self):
        self.assertFalse(is_valid_dimension_score(True))
        self.assertFalse(is_valid_dimension_score(False))

    def test_is_valid_dimension_score_rejects_out_of_range(self):
        self.assertFalse(is_valid_dimension_score(0.99))
        self.assertFalse(is_valid_dimension_score(10.01))

    def test_is_valid_dimension_score_rejects_nan_and_inf(self):
        self.assertFalse(is_valid_dimension_score(float("nan")))
        self.assertFalse(is_valid_dimension_score(float("inf")))

    # --- score_matches (the tamper-detection re-derivation function) ---
    def test_score_matches_true_for_correctly_computed_score(self):
        self.assertTrue(score_matches(7.66666667, 6, 8, 9))

    def test_score_matches_false_for_tampered_score(self):
        self.assertFalse(score_matches(10.0, 6, 8, 9))

    def test_score_matches_true_within_tolerance_of_unrounded_mean(self):
        self.assertTrue(score_matches((6 + 8 + 9) / 3.0, 6, 8, 9))

    def test_score_matches_false_for_nan_stored_score(self):
        self.assertFalse(score_matches(float("nan"), 6, 8, 9))

    def test_score_matches_false_for_infinite_stored_score(self):
        self.assertFalse(score_matches(float("inf"), 6, 8, 9))

    def test_score_matches_false_for_boolean_stored_score(self):
        self.assertFalse(score_matches(True, 1, 1, 1))

    def test_score_matches_false_when_underlying_dimension_is_invalid(self):
        """A stored score cannot 'match' anything if its own claimed inputs are themselves out of range --
        score_matches must fail closed, not raise, so the gate layer can report a clean FAIL."""
        self.assertFalse(score_matches(5.0, 15, 5, 5))

    def test_score_matches_does_not_raise_on_malformed_dimensions(self):
        try:
            result = score_matches(5.0, "bad", 5, 5)
        except Exception as error:  # noqa: BLE001 -- explicitly asserting NO exception of any kind
            self.fail(f"score_matches raised {error!r} instead of returning False")
        self.assertFalse(result)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    # --- happy path / schema conformance ---
    def test_three_item_record_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "three-item ice score record")

    def test_single_item_backlog_is_legal(self):
        """The concrete due-diligence proof against decision.mcda: MCDA structurally requires >= 2 options
        for its relative normalization to mean anything (MCDA_TOO_FEW_OPTIONS), but ICE's per-item score is
        absolute -- a single item is already a complete, valid ICE run."""
        record = _build(items=[_item("I1", "solo idea", 5, 5, 5)])
        self.contracts.validate(RECORD_SCHEMA, record, "single-item ice score record")
        self.assertEqual(len(record["items"]), 1)
        self.assertEqual(len(record["ranking"]), 1)
        self.assertEqual(record["ranking"][0]["item_id"], "I1")

    def test_ranking_is_sorted_descending_for_distinct_scores(self):
        record = _valid_record()
        scores = [r["ice_score"] for r in record["ranking"]]
        self.assertEqual(scores, sorted(scores, reverse=True))
        self.assertEqual(record["ranking"][0]["item_id"], "I1")  # 7.667, the highest of the three

    def test_tied_scores_preserve_original_item_order_in_ranking(self):
        """Stable sort: A (impact=5,confidence=5,ease=5 -> 5.0) and B (impact=3,confidence=6,ease=6 -> 5.0)
        tie exactly; A appears before B in the input, so A must appear before B in the ranking too."""
        items = [_item("A", "a", 5, 5, 5), _item("B", "b", 3, 6, 6)]
        record = _build(items=items)
        self.assertEqual(record["items"][0]["ice_score"], record["items"][1]["ice_score"])
        self.assertEqual([r["item_id"] for r in record["ranking"]], ["A", "B"])

    def test_builder_round_trips_generated_by_method_and_version(self):
        record = generate_ice_score_record("ICE-T-005", "c", _three_items(), _prov(), version="2.3.4", generated_by_method="decision.ice@test")
        self.assertEqual(record["generated_by_method"], "decision.ice@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(_valid_record()["generated_by_method"], METHOD_ID)

    def test_each_item_ice_score_matches_its_own_hand_computed_mean(self):
        record = _valid_record()
        expected = {"I1": round((6 + 8 + 9) / 3.0, 8), "I2": round((8 + 6 + 4) / 3.0, 8), "I3": round((9 + 5 + 3) / 3.0, 8)}
        for item in record["items"]:
            self.assertEqual(item["ice_score"], expected[item["id"]])

    def test_schema_own_example_validates_and_passes_every_gate(self):
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "ice-score-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        examples = schema_doc.get("examples") or []
        self.assertTrue(examples, "ice-score-record.schema.yaml has no examples to check")
        for example in examples:
            with self.subTest(description=example.get("description")):
                value = example["value"]
                self.contracts.validate(RECORD_SCHEMA, value, f"schema example: {example.get('description')}")
                self.assertTrue(all_gates_pass(evaluate_ice_gates(value, "test", TS)), f"schema example failed a real gate: {example.get('description')}")

    # --- id / version / context ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_record_id_without_ice_prefix_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_INVALID_RECORD_ID"):
            _build(record_id="MCDA-1")

    def test_non_string_version_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_INVALID_VERSION"):
            generate_ice_score_record("ICE-T-V1", "c", _three_items(), _prov(), version=123)

    def test_empty_context_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_EMPTY_RECORD_FIELD"):
            _build(context="")

    def test_whitespace_only_context_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_EMPTY_RECORD_FIELD"):
            _build(context="   ")

    # --- items shape ---
    def test_empty_items_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_INVALID_ITEMS"):
            _build(items=[])

    def test_items_non_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_INVALID_ITEMS"):
            _build(items="not a list")

    def test_item_missing_label_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_INVALID_ITEMS"):
            _build(items=[{"id": "I1", "impact": 5, "confidence": 5, "ease": 5}])

    def test_item_missing_impact_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_INVALID_ITEMS"):
            _build(items=[{"id": "I1", "label": "x", "confidence": 5, "ease": 5}])

    def test_item_missing_confidence_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_INVALID_ITEMS"):
            _build(items=[{"id": "I1", "label": "x", "impact": 5, "ease": 5}])

    def test_item_missing_ease_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_INVALID_ITEMS"):
            _build(items=[{"id": "I1", "label": "x", "impact": 5, "confidence": 5}])

    def test_item_with_presupplied_ice_score_is_refused(self):
        """The core input-shape invariant: ice_score can never be smuggled in as an input, only ever appears
        in the OUTPUT this builder produces (see module docstring)."""
        with self.assertRaisesRegex(InvariantViolation, "ICE_INVALID_ITEMS"):
            _build(items=[{"id": "I1", "label": "x", "impact": 5, "confidence": 5, "ease": 5, "ice_score": 5.0}])

    def test_item_with_unrelated_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_INVALID_ITEMS"):
            _build(items=[{"id": "I1", "label": "x", "impact": 5, "confidence": 5, "ease": 5, "priority": "high"}])

    def test_item_empty_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_INVALID_ITEMS"):
            _build(items=[_item(item_id="")])

    def test_item_empty_label_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_INVALID_ITEMS"):
            _build(items=[_item(label="")])

    def test_item_non_dict_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_INVALID_ITEMS"):
            _build(items=["not a dict"])

    # --- dimension range, at construction, via the full builder (not just compute_ice_score directly) ---
    def test_item_impact_out_of_range_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_DIMENSION_OUT_OF_RANGE"):
            _build(items=[_item(impact=11)])

    def test_item_confidence_out_of_range_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_DIMENSION_OUT_OF_RANGE"):
            _build(items=[_item(confidence=0)])

    def test_item_ease_out_of_range_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_DIMENSION_OUT_OF_RANGE"):
            _build(items=[_item(ease=-5)])

    # --- duplicate item id ---
    def test_duplicate_item_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_DUPLICATE_ITEM_ID"):
            _build(items=[_item("I1", "a"), _item("I1", "b")])

    def test_duplicate_item_id_names_the_offending_id(self):
        with self.assertRaisesRegex(InvariantViolation, "'I1'"):
            _build(items=[_item("I1", "a"), _item("I1", "b")])

    # --- rebuild-not-alias ---
    def test_mutating_the_callers_own_input_items_after_construction_does_not_affect_the_stored_record(self):
        items = _three_items()
        record = generate_ice_score_record("ICE-T-010", "c", items, _prov())
        items[0]["label"] = "mutated"
        items[0]["impact"] = 1
        self.assertEqual(record["items"][0]["label"], "trust badge")
        self.assertEqual(record["items"][0]["impact"], 6)

    def test_provenance_is_deliberately_aliased_not_rebuilt(self):
        provenance = _prov()
        record = generate_ice_score_record("ICE-T-011", "c", _three_items(), provenance)
        provenance["epistemic_type"] = "AI_INFERENCE"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")

    # --- method resolution ---
    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        self.assertIsNone(live.resolve([METHOD_ID])["blocked"])

    def test_empty_catalog_blocks_ice_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    # --- schema-layer pins ---
    def test_schema_layer_rejects_an_id_without_the_ice_prefix(self):
        record = _valid_record()
        record["id"] = "MCDA-1"
        with self.assertRaisesRegex(Exception, "ICE-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema id prefix")

    def test_schema_layer_rejects_a_missing_required_top_level_field(self):
        record = _valid_record()
        del record["ranking"]
        with self.assertRaisesRegex(Exception, "ranking"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema top-level required")

    def test_schema_layer_rejects_an_impact_above_ten(self):
        record = _valid_record()
        record["items"][0]["impact"] = 10.5
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema impact bound")

    def test_schema_layer_rejects_an_impact_below_one(self):
        record = _valid_record()
        record["items"][0]["impact"] = 0.5
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema impact bound")

    def test_schema_layer_rejects_an_unexpected_top_level_key(self):
        record = _valid_record()
        record["extra_field"] = "not allowed"
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema additionalProperties")


class GateReuseAndMutationTests(unittest.TestCase):
    def _gate_result(self, record):
        return evaluate_ice_integrity_gate(record, "test", TS)

    # --- genuine-compute gate reuse ---
    def test_genuine_compute_gate_is_the_same_function_other_families_reuse(self):
        record = _valid_record()
        direct_pass, direct_evidence = evaluate_statistical_gate(record)
        results = evaluate_ice_gates(record, "test", TS)
        gate = next(g for g in results if g["gate_id"] == "genuine_compute")
        self.assertEqual(gate["status"], "PASS" if direct_pass else "FAIL")
        self.assertEqual(gate["evidence"], direct_evidence)

    def test_valid_record_passes_all_three_gates(self):
        results = evaluate_ice_gates(_valid_record(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "genuine_compute", "ice_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_single_item_record_passes_all_three_gates(self):
        record = _build(items=[_item("SOLO", "solo", 4, 4, 4)])
        self.assertTrue(all_gates_pass(evaluate_ice_gates(record, "test", TS)))

    def test_all_gates_pass_returns_false_when_a_gate_fails(self):
        record = _valid_record()
        record["id"] = ""
        self.assertFalse(all_gates_pass(evaluate_ice_gates(record, "test", TS)))

    # --- invariant #2 (score integrity), hand-tampered at the GATE layer only ---
    def test_hand_tampered_ice_score_fails_the_integrity_gate(self):
        """The core re-derived-not-trusted invariant: a copy of an already-VALID record, with one item's own
        stored ice_score hand-tampered afterward, must be caught by fresh recomputation, not accepted
        because the record merely looked well-formed when it was built."""
        record = _valid_record()
        self.assertAlmostEqual(record["items"][0]["ice_score"], 7.66666667, places=6)
        record["items"][0]["ice_score"] = 10.0
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "stored ice_score does not match recomputed mean")
        self.assertIn("I1", result["evidence"][0]["item_ids"])

    def test_hand_tampered_ice_score_lowered_also_fails(self):
        record = _valid_record()
        record["items"][1]["ice_score"] = 0.5
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "stored ice_score does not match recomputed mean")

    def test_honestly_matching_score_passes(self):
        """Sanity control: an untouched, correctly-computed record must pass -- proves the gate is not
        failing everything indiscriminately."""
        self.assertEqual(self._gate_result(_valid_record())["status"], "PASS")

    # --- invariant #1 (dimension range), hand-tampered at the GATE layer only ---
    def test_hand_tampered_dimension_out_of_range_fails_with_specific_reason(self):
        record = _valid_record()
        record["items"][0]["impact"] = 15
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "dimension out of range")
        self.assertIn("I1", result["evidence"][0]["item_ids"])

    def test_hand_tampered_dimension_reported_before_score_mismatch(self):
        """Ordering guarantee: when BOTH a dimension is out of range AND the (now-stale) stored ice_score no
        longer matches anything, the MORE SPECIFIC 'dimension out of range' reason must be reported, not the
        generic 'score does not match' -- proves the gate checks structural validity before re-derivation."""
        record = _valid_record()
        record["items"][0]["confidence"] = 999  # ice_score field is left untouched, now stale either way
        result = self._gate_result(record)
        self.assertEqual(result["evidence"][0]["reason"], "dimension out of range")

    def test_hand_tampered_boolean_dimension_fails_the_gate(self):
        record = _valid_record()
        record["items"][0]["ease"] = True
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "dimension out of range")

    def test_hand_tampered_nan_dimension_fails_the_gate(self):
        record = _valid_record()
        record["items"][0]["impact"] = float("nan")
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "dimension out of range")

    # --- shape / id / duplicate, hand-tampered at the GATE layer ---
    def test_hand_tampered_empty_id_fails_the_gate(self):
        record = _valid_record()
        record["id"] = ""
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}")

    def test_hand_tampered_non_string_version_fails_the_gate(self):
        record = _valid_record()
        record["version"] = 123
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "version missing or not a string")

    def test_hand_tampered_empty_context_fails_the_gate(self):
        record = _valid_record()
        record["context"] = " "
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "context missing or empty")

    def test_hand_tampered_empty_items_fails_the_gate(self):
        record = _valid_record()
        record["items"] = []
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "items invalid (empty, malformed, or an entry with unknown/missing keys)")

    def test_hand_tampered_malformed_item_fails_the_gate(self):
        record = _valid_record()
        del record["items"][0]["label"]
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "items invalid (empty, malformed, or an entry with unknown/missing keys)")

    def test_hand_tampered_duplicate_item_id_fails_the_gate(self):
        record = _valid_record()
        record["items"][1]["id"] = record["items"][0]["id"]
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "duplicate item id")

    # --- ranking integrity, hand-tampered at the GATE layer ---
    def test_hand_tampered_ranking_missing_an_item_fails_the_gate(self):
        record = _valid_record()
        record["ranking"].pop()
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "ranking malformed or wrong length")

    def test_hand_tampered_ranking_with_extra_entry_fails_the_gate(self):
        record = _valid_record()
        record["ranking"].append({"item_id": "GHOST", "ice_score": 5.0})
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "ranking malformed or wrong length")

    def test_hand_tampered_ranking_referencing_unknown_item_fails_the_gate(self):
        """Same length, but one entry swapped to reference an id that is not a real item -- caught by the
        item_id-SET check, not just the length check."""
        record = _valid_record()
        record["ranking"][0]["item_id"] = "GHOST"
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "ranking item_id set does not match items")

    def test_hand_tampered_ranking_duplicate_item_id_fails_the_gate(self):
        record = _valid_record()
        record["ranking"][1]["item_id"] = record["ranking"][0]["item_id"]
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "ranking item_id set does not match items")

    def test_hand_tampered_ranking_score_disagreeing_with_item_fails_the_gate(self):
        record = _valid_record()
        record["ranking"][0]["ice_score"] = 1.0  # item's own stored ice_score is untouched, still 7.667
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "ranking ice_score does not match item's own stored ice_score")

    def test_hand_tampered_ranking_score_nan_fails_the_gate_not_silently_passes(self):
        """The core NaN-comparison regression guard: a naive ``abs(a - b) <= tolerance`` treats every NaN
        comparison as 'not greater than tolerance', which would WRONGLY let a NaN-tampered ranking entry
        pass. This must fail closed instead."""
        record = _valid_record()
        record["ranking"][0]["ice_score"] = float("nan")
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "ranking ice_score does not match item's own stored ice_score")

    def test_hand_tampered_ranking_score_boolean_fails_the_gate(self):
        record = _valid_record()
        record["ranking"][0]["ice_score"] = True
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "ranking ice_score does not match item's own stored ice_score")

    def test_hand_tampered_ranking_out_of_order_fails_the_gate(self):
        record = _valid_record()
        record["ranking"][0], record["ranking"][1] = record["ranking"][1], record["ranking"][0]
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "ranking not sorted descending by ice_score")

    def test_hand_tampered_ranking_with_extra_key_fails_the_gate(self):
        record = _valid_record()
        record["ranking"][0]["confidence_in_ranking"] = "high"
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "ranking malformed or wrong length")

    # --- gate evidence content / non-mutation / crash-safety ---
    def test_gate_evidence_reports_accurate_item_count(self):
        result = self._gate_result(_valid_record())
        self.assertEqual(result["evidence"][0]["item_count"], 3)

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _valid_record()
        before = copy.deepcopy(record)
        self._gate_result(record)
        self.assertEqual(record, before)

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        """Regression guard for a real, live-confirmed bug (critic finding, 2026-09-08):
        evaluate_genuine_compute_gate previously had no isinstance guard and crashed with AttributeError on
        non-dict input instead of returning FAIL -- this test previously exercised only integrity/provenance,
        never genuine_compute, which is exactly why the crash shipped undetected. Now covers all three, plus
        the bundler (evaluate_ice_gates) that would otherwise propagate the same crash."""
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                self.assertEqual(self._gate_result(bad_record)["status"], "FAIL")
                self.assertEqual(evaluate_provenance_required_gate(bad_record, "test", TS)["status"], "FAIL")
                self.assertEqual(evaluate_genuine_compute_gate(bad_record, "test", TS)["status"], "FAIL")
                self.assertTrue(all(g["status"] == "FAIL" for g in evaluate_ice_gates(bad_record, "test", TS)))

    def test_missing_record_provenance_fails_the_provenance_gate_not_a_crash(self):
        record = _valid_record()
        record["provenance"] = None
        self.assertEqual(evaluate_provenance_required_gate(record, "test", TS)["status"], "FAIL")

    def test_items_wrong_type_fails_the_gate_not_a_crash(self):
        record = _valid_record()
        record["items"] = "not a list"
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "items invalid (empty, malformed, or an entry with unknown/missing keys)")

    def test_ranking_wrong_type_fails_the_gate_not_a_crash(self):
        record = _valid_record()
        record["ranking"] = "not a list"
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "ranking malformed or wrong length")


if __name__ == "__main__":
    unittest.main()
