"""Mutation-style tests for ``learning.build_measure_learn`` (F17 learning family member, built alongside
``learning.pdca``/``learning.ooda`` this batch).

Covers: happy path (minimal + multi-metric + the real grounded scenario), both real invariants
(connectedness: measure->build and learn->measure references; disclosed minimalism: build.cut_scope)
violated at construction with distinct error codes, each invariant violated via hand-tampering a dict after
construction and caught only by the independent gate, fail-closed behavior on malformed input, cross-gate
independence, and the bonus helper.
"""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.learning.build_measure_learn import (
    ARTIFACT_ID_PREFIX,
    METHOD_ID,
    METRIC_ID_PREFIX,
    RECORD_ID_PREFIX,
    all_gates_pass,
    build_stage,
    evaluate_build_measure_learn_gates,
    evaluate_connectedness_gate,
    evaluate_disclosed_minimalism_gate,
    evaluate_provenance_required_gate,
    generate_build_measure_learn_record,
    learn_stage,
    measure_stage,
    metric,
    resolve_learned_metrics,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

BUILD_MEASURE_LEARN_CYCLE_SCHEMA = "ai-lego://specs/cognitive/typed-objects/build-measure-learn-cycle.schema.yaml"
T = "2026-09-07T00:00:00Z"


def _prov():
    return make_provenance("DECISION", "HUMAN_APPROVED")


def _calc_prov():
    return make_provenance("CALCULATED_RESULT", "AI_GENERATED")


def _metric(mid="METRIC-001", name="throughput", value=7.0, unit="x_realtime"):
    return metric(mid, name, value, unit, _calc_prov())


def _build(cut_scope=None, artifact_id="ARTIFACT-001"):
    if cut_scope is None:
        cut_scope = ["downstream stage not built"]
    return build_stage("built the smallest test", artifact_id, cut_scope, _prov())


def _measure(build_ref="ARTIFACT-001", metrics=None):
    if metrics is None:
        metrics = [_metric()]
    return measure_stage("measured the build", build_ref, metrics, _calc_prov())


def _learn(metric_refs=None, conclusion="learned something"):
    if metric_refs is None:
        metric_refs = ["METRIC-001"]
    return learn_stage(conclusion, metric_refs, _prov())


def _valid_record(record_id="BML-T-001", product="test product", cut_scope=None, metrics=None, metric_refs=None):
    return generate_build_measure_learn_record(record_id, product, _build(cut_scope=cut_scope), _measure(metrics=metrics), _learn(metric_refs=metric_refs), _prov())


class MetricConstructorTests(unittest.TestCase):
    def test_valid_metric_builds(self):
        m = metric("METRIC-001", "speed", 7.0, "x_realtime", _calc_prov())
        self.assertEqual(m["id"], "METRIC-001")
        self.assertEqual(m["value"], 7.0)

    def test_empty_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_METRIC_ID"):
            metric("", "speed", 1.0, "x", _calc_prov())

    def test_whitespace_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_METRIC_ID"):
            metric("   ", "speed", 1.0, "x", _calc_prov())

    def test_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_METRIC_ID"):
            metric("M-001", "speed", 1.0, "x", _calc_prov())

    def test_empty_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_EMPTY_METRIC_NAME"):
            metric("METRIC-001", "", 1.0, "x", _calc_prov())

    def test_bool_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_METRIC_VALUE"):
            metric("METRIC-001", "speed", True, "x", _calc_prov())

    def test_nan_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_METRIC_VALUE"):
            metric("METRIC-001", "speed", float("nan"), "x", _calc_prov())

    def test_inf_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_METRIC_VALUE"):
            metric("METRIC-001", "speed", float("inf"), "x", _calc_prov())

    def test_non_number_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_METRIC_VALUE"):
            metric("METRIC-001", "speed", "7.0", "x", _calc_prov())

    def test_empty_unit_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_EMPTY_METRIC_UNIT"):
            metric("METRIC-001", "speed", 1.0, "", _calc_prov())


class BuildStageConstructorTests(unittest.TestCase):
    def test_valid_build_stage_shape(self):
        b = build_stage("desc", "ARTIFACT-001", ["cut1"], _prov())
        self.assertEqual(set(b.keys()), {"description", "artifact_id", "cut_scope", "provenance"})

    def test_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_EMPTY_BUILD_DESCRIPTION"):
            build_stage("", "ARTIFACT-001", ["cut1"], _prov())

    def test_whitespace_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_EMPTY_BUILD_DESCRIPTION"):
            build_stage("   ", "ARTIFACT-001", ["cut1"], _prov())

    def test_empty_artifact_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_ARTIFACT_ID"):
            build_stage("desc", "", ["cut1"], _prov())

    def test_artifact_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_ARTIFACT_ID"):
            build_stage("desc", "A-001", ["cut1"], _prov())

    def test_cut_scope_copied_not_same_list(self):
        scope = ["cut1"]
        b = build_stage("desc", "ARTIFACT-001", scope, _prov())
        scope.append("cut2")
        self.assertEqual(len(b["cut_scope"]), 1)

    def test_build_stage_allows_empty_cut_scope_at_this_layer(self):
        """Constructor is not the invariant boundary -- generate_build_measure_learn_record enforces
        non-empty cut_scope (invariant #2), not this convenience constructor."""
        b = build_stage("desc", "ARTIFACT-001", [], _prov())
        self.assertEqual(b["cut_scope"], [])


class MeasureStageConstructorTests(unittest.TestCase):
    def test_valid_measure_stage_shape(self):
        m = measure_stage("desc", "ARTIFACT-001", [_metric()], _calc_prov())
        self.assertEqual(set(m.keys()), {"description", "build_ref", "metrics", "provenance"})

    def test_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_EMPTY_MEASURE_DESCRIPTION"):
            measure_stage("", "ARTIFACT-001", [_metric()], _calc_prov())

    def test_empty_build_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_BUILD_REF"):
            measure_stage("desc", "", [_metric()], _calc_prov())

    def test_build_ref_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_BUILD_REF"):
            measure_stage("desc", "A-001", [_metric()], _calc_prov())

    def test_metrics_copied_not_same_list(self):
        metrics = [_metric()]
        m = measure_stage("desc", "ARTIFACT-001", metrics, _calc_prov())
        metrics.append(_metric("METRIC-002"))
        self.assertEqual(len(m["metrics"]), 1)

    def test_measure_stage_allows_empty_metrics_at_this_layer(self):
        m = measure_stage("desc", "ARTIFACT-001", [], _calc_prov())
        self.assertEqual(m["metrics"], [])


class LearnStageConstructorTests(unittest.TestCase):
    def test_valid_learn_stage_shape(self):
        learn = learn_stage("conclusion", ["METRIC-001"], _prov())
        self.assertEqual(set(learn.keys()), {"conclusion", "metric_refs", "provenance"})

    def test_empty_conclusion_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_EMPTY_CONCLUSION"):
            learn_stage("", ["METRIC-001"], _prov())

    def test_whitespace_conclusion_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_EMPTY_CONCLUSION"):
            learn_stage("   ", ["METRIC-001"], _prov())

    def test_metric_refs_copied_not_same_list(self):
        refs = ["METRIC-001"]
        learn = learn_stage("conclusion", refs, _prov())
        refs.append("METRIC-002")
        self.assertEqual(len(learn["metric_refs"]), 1)

    def test_learn_stage_allows_empty_metric_refs_at_this_layer(self):
        learn = learn_stage("conclusion", [], _prov())
        self.assertEqual(learn["metric_refs"], [])


class RecordFieldConstructionTests(unittest.TestCase):
    def test_valid_record_top_level_fields(self):
        record = _valid_record()
        self.assertEqual(record["id"], "BML-T-001")
        self.assertEqual(record["version"], "1.0.0")
        self.assertEqual(record["generated_by_method"], METHOD_ID)
        self.assertEqual(record["product_under_exploration"], "test product")

    def test_custom_version_and_generated_by_method_stored(self):
        record = generate_build_measure_learn_record("BML-T-002", "proc", _build(), _measure(), _learn(), _prov(), version="2.0.0", generated_by_method="learning.build_measure_learn_custom")
        self.assertEqual(record["version"], "2.0.0")
        self.assertEqual(record["generated_by_method"], "learning.build_measure_learn_custom")

    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_RECORD_ID"):
            generate_build_measure_learn_record("", "proc", _build(), _measure(), _learn(), _prov())

    def test_record_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_RECORD_ID"):
            generate_build_measure_learn_record("WRONG-001", "proc", _build(), _measure(), _learn(), _prov())

    def test_whitespace_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_RECORD_ID"):
            generate_build_measure_learn_record("   ", "proc", _build(), _measure(), _learn(), _prov())

    def test_empty_product_under_exploration_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_EMPTY_RECORD_FIELD"):
            generate_build_measure_learn_record("BML-T-003", "", _build(), _measure(), _learn(), _prov())

    def test_whitespace_product_under_exploration_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_EMPTY_RECORD_FIELD"):
            generate_build_measure_learn_record("BML-T-003", "   ", _build(), _measure(), _learn(), _prov())

    def test_non_string_version_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_VERSION"):
            generate_build_measure_learn_record("BML-T-004", "proc", _build(), _measure(), _learn(), _prov(), version=1.0)

    def test_missing_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_PROVENANCE"):
            generate_build_measure_learn_record("BML-T-005", "proc", _build(), _measure(), _learn(), None)

    def test_malformed_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_PROVENANCE"):
            generate_build_measure_learn_record("BML-T-005", "proc", _build(), _measure(), _learn(), {"epistemic_type": "NOT_REAL", "authorship_state": "HUMAN_APPROVED"})


class BuildShapeConstructionTests(unittest.TestCase):
    def test_build_not_a_dict_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_BUILD"):
            generate_build_measure_learn_record("BML-T-010", "proc", "not-a-dict", _measure(), _learn(), _prov())

    def test_build_missing_key_is_refused(self):
        bad = {"description": "x", "artifact_id": "ARTIFACT-001", "provenance": _prov()}  # missing cut_scope
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_BUILD"):
            generate_build_measure_learn_record("BML-T-011", "proc", bad, _measure(), _learn(), _prov())

    def test_build_extra_key_is_refused(self):
        bad = dict(_build(), extra="nope")
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_BUILD"):
            generate_build_measure_learn_record("BML-T-012", "proc", bad, _measure(), _learn(), _prov())

    def test_build_empty_description_is_refused(self):
        bad = dict(_build(), description="")
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_BUILD"):
            generate_build_measure_learn_record("BML-T-013", "proc", bad, _measure(), _learn(), _prov())

    def test_build_artifact_id_missing_prefix_is_refused(self):
        bad = dict(_build(), artifact_id="A-001")
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_BUILD"):
            generate_build_measure_learn_record("BML-T-014", "proc", bad, _measure(), _learn(), _prov())

    def test_build_cut_scope_not_a_list_is_refused(self):
        bad = dict(_build(), cut_scope="not-a-list")
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_BUILD"):
            generate_build_measure_learn_record("BML-T-015", "proc", bad, _measure(), _learn(), _prov())

    def test_build_cut_scope_with_empty_string_entry_is_refused(self):
        bad = dict(_build(), cut_scope=["real cut", ""])
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_BUILD"):
            generate_build_measure_learn_record("BML-T-016", "proc", bad, _measure(), _learn(), _prov())

    def test_build_provenance_not_a_dict_is_refused(self):
        bad = dict(_build(), provenance="not-a-dict")
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_BUILD"):
            generate_build_measure_learn_record("BML-T-017", "proc", bad, _measure(), _learn(), _prov())


class MeasureShapeConstructionTests(unittest.TestCase):
    def test_measure_not_a_dict_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_MEASURE"):
            generate_build_measure_learn_record("BML-T-020", "proc", _build(), "not-a-dict", _learn(), _prov())

    def test_measure_missing_key_is_refused(self):
        bad = {"description": "x", "build_ref": "ARTIFACT-001", "provenance": _calc_prov()}  # missing metrics
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_MEASURE"):
            generate_build_measure_learn_record("BML-T-021", "proc", _build(), bad, _learn(), _prov())

    def test_measure_extra_key_is_refused(self):
        bad = dict(_measure(), extra="nope")
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_MEASURE"):
            generate_build_measure_learn_record("BML-T-022", "proc", _build(), bad, _learn(), _prov())

    def test_measure_empty_description_is_refused(self):
        bad = dict(_measure(), description="")
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_MEASURE"):
            generate_build_measure_learn_record("BML-T-023", "proc", _build(), bad, _learn(), _prov())

    def test_measure_build_ref_missing_prefix_is_refused(self):
        bad = dict(_measure(), build_ref="A-001")
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_MEASURE"):
            generate_build_measure_learn_record("BML-T-024", "proc", _build(), bad, _learn(), _prov())

    def test_measure_metrics_not_a_list_is_refused(self):
        bad = dict(_measure(), metrics="not-a-list")
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_MEASURE"):
            generate_build_measure_learn_record("BML-T-025", "proc", _build(), bad, _learn(), _prov())

    def test_measure_metrics_empty_list_is_refused(self):
        bad = dict(_measure(), metrics=[])
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_MEASURE"):
            generate_build_measure_learn_record("BML-T-026", "proc", _build(), bad, _learn(), _prov())

    def test_measure_metrics_with_malformed_entry_is_refused(self):
        bad = dict(_measure(), metrics=[{"id": "METRIC-001"}])  # missing name/value/unit/provenance
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_MEASURE"):
            generate_build_measure_learn_record("BML-T-027", "proc", _build(), bad, _learn(), _prov())

    def test_measure_provenance_not_a_dict_is_refused(self):
        bad = dict(_measure(), provenance="not-a-dict")
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_MEASURE"):
            generate_build_measure_learn_record("BML-T-028", "proc", _build(), bad, _learn(), _prov())


class LearnShapeConstructionTests(unittest.TestCase):
    def test_learn_not_a_dict_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_LEARN"):
            generate_build_measure_learn_record("BML-T-030", "proc", _build(), _measure(), "not-a-dict", _prov())

    def test_learn_missing_key_is_refused(self):
        bad = {"conclusion": "x", "provenance": _prov()}  # missing metric_refs
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_LEARN"):
            generate_build_measure_learn_record("BML-T-031", "proc", _build(), _measure(), bad, _prov())

    def test_learn_extra_key_is_refused(self):
        bad = dict(_learn(), extra="nope")
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_LEARN"):
            generate_build_measure_learn_record("BML-T-032", "proc", _build(), _measure(), bad, _prov())

    def test_learn_empty_conclusion_is_refused(self):
        bad = dict(_learn(), conclusion="")
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_LEARN"):
            generate_build_measure_learn_record("BML-T-033", "proc", _build(), _measure(), bad, _prov())

    def test_learn_metric_refs_not_a_list_is_refused(self):
        bad = dict(_learn(), metric_refs="METRIC-001")
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_LEARN"):
            generate_build_measure_learn_record("BML-T-034", "proc", _build(), _measure(), bad, _prov())

    def test_learn_metric_refs_with_unprefixed_entry_is_refused(self):
        bad = dict(_learn(), metric_refs=["M-001"])
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_LEARN"):
            generate_build_measure_learn_record("BML-T-035", "proc", _build(), _measure(), bad, _prov())

    def test_learn_provenance_not_a_dict_is_refused(self):
        bad = dict(_learn(), provenance="not-a-dict")
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_INVALID_LEARN"):
            generate_build_measure_learn_record("BML-T-036", "proc", _build(), _measure(), bad, _prov())


class DuplicateMetricIdConstructionTests(unittest.TestCase):
    def test_duplicate_metric_ids_is_refused(self):
        metrics = [_metric("METRIC-001", value=1.0), _metric("METRIC-001", value=2.0)]
        measure = dict(_measure(metrics=metrics))
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_DUPLICATE_METRIC_ID"):
            generate_build_measure_learn_record("BML-T-040", "proc", _build(), measure, _learn(metric_refs=["METRIC-001"]), _prov())

    def test_duplicate_error_names_the_specific_id(self):
        metrics = [_metric("METRIC-009", value=1.0), _metric("METRIC-009", value=2.0), _metric("METRIC-010", value=3.0)]
        measure = dict(_measure(metrics=metrics))
        with self.assertRaisesRegex(InvariantViolation, "METRIC-009"):
            generate_build_measure_learn_record("BML-T-041", "proc", _build(), measure, _learn(metric_refs=["METRIC-009"]), _prov())

    def test_unique_ids_pass(self):
        metrics = [_metric("METRIC-001", value=1.0), _metric("METRIC-002", value=2.0)]
        measure = dict(_measure(metrics=metrics))
        record = generate_build_measure_learn_record("BML-T-042", "proc", _build(), measure, _learn(metric_refs=["METRIC-001", "METRIC-002"]), _prov())
        self.assertEqual(len(record["measure"]["metrics"]), 2)


class DisclosedMinimalismConstructionTests(unittest.TestCase):
    """Invariant #2 -- grounded in Atlas L803's own literal word 'smallest'."""

    def test_empty_cut_scope_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_UNDISCLOSED_CUTS"):
            generate_build_measure_learn_record("BML-T-050", "proc", _build(cut_scope=[]), _measure(), _learn(), _prov())

    def test_single_cut_item_passes(self):
        record = generate_build_measure_learn_record("BML-T-051", "proc", _build(cut_scope=["one thing cut"]), _measure(), _learn(), _prov())
        self.assertEqual(record["build"]["cut_scope"], ["one thing cut"])

    def test_multiple_cut_items_pass(self):
        scope = ["cut A", "cut B", "cut C"]
        record = generate_build_measure_learn_record("BML-T-052", "proc", _build(cut_scope=scope), _measure(), _learn(), _prov())
        self.assertEqual(record["build"]["cut_scope"], scope)


class ConnectednessConstructionTests(unittest.TestCase):
    """Invariant #1 -- measure must reference build; learn must reference measure's actual data."""

    def test_measure_build_ref_mismatch_is_refused(self):
        measure = dict(_measure(build_ref="ARTIFACT-999"))
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_MEASURE_BUILD_REF_UNRESOLVED"):
            generate_build_measure_learn_record("BML-T-060", "proc", _build(artifact_id="ARTIFACT-001"), measure, _learn(), _prov())

    def test_measure_build_ref_matching_passes(self):
        record = generate_build_measure_learn_record("BML-T-061", "proc", _build(artifact_id="ARTIFACT-777"), _measure(build_ref="ARTIFACT-777"), _learn(), _prov())
        self.assertEqual(record["measure"]["build_ref"], record["build"]["artifact_id"])

    def test_learn_metric_refs_empty_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_LEARN_CITES_NOTHING_MEASURED"):
            generate_build_measure_learn_record("BML-T-062", "proc", _build(), _measure(), _learn(metric_refs=[]), _prov())

    def test_learn_metric_refs_unknown_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BUILDMEASURELEARN_LEARN_CITES_NOTHING_MEASURED"):
            generate_build_measure_learn_record("BML-T-063", "proc", _build(), _measure(), _learn(metric_refs=["METRIC-999"]), _prov())

    def test_learn_metric_refs_partial_unresolved_names_only_bad_id(self):
        metrics = [_metric("METRIC-001"), _metric("METRIC-002")]
        measure = dict(_measure(metrics=metrics))
        with self.assertRaisesRegex(InvariantViolation, r"METRIC-999"):
            generate_build_measure_learn_record("BML-T-064", "proc", _build(), measure, _learn(metric_refs=["METRIC-001", "METRIC-999"]), _prov())

    def test_learn_metric_refs_subset_of_measured_is_legal(self):
        """Not every measured metric must be cited -- a subset is real, honest content."""
        metrics = [_metric("METRIC-001"), _metric("METRIC-002")]
        measure = dict(_measure(metrics=metrics))
        record = generate_build_measure_learn_record("BML-T-065", "proc", _build(), measure, _learn(metric_refs=["METRIC-002"]), _prov())
        self.assertEqual(record["learn"]["metric_refs"], ["METRIC-002"])

    def test_learn_metric_refs_all_measured_is_legal(self):
        metrics = [_metric("METRIC-001"), _metric("METRIC-002")]
        measure = dict(_measure(metrics=metrics))
        record = generate_build_measure_learn_record("BML-T-066", "proc", _build(), measure, _learn(metric_refs=["METRIC-001", "METRIC-002"]), _prov())
        self.assertEqual(record["learn"]["metric_refs"], ["METRIC-001", "METRIC-002"])


class HappyPathConstructionTests(unittest.TestCase):
    def test_minimal_valid_record(self):
        record = _valid_record()
        self.assertEqual(len(record["measure"]["metrics"]), 1)
        self.assertEqual(len(record["learn"]["metric_refs"]), 1)

    def test_multi_metric_record(self):
        metrics = [_metric("METRIC-001", value=1.0), _metric("METRIC-002", value=2.0), _metric("METRIC-003", value=3.0)]
        record = generate_build_measure_learn_record("BML-T-070", "proc", _build(), dict(_measure(metrics=metrics)), _learn(metric_refs=["METRIC-001", "METRIC-002", "METRIC-003"]), _prov())
        self.assertEqual(len(record["measure"]["metrics"]), 3)
        self.assertEqual(len(record["learn"]["metric_refs"]), 3)

    def test_returned_record_is_independent_of_input_build(self):
        b = _build()
        record = generate_build_measure_learn_record("BML-T-071", "proc", b, _measure(), _learn(), _prov())
        b["cut_scope"].append("mutated after the fact")
        self.assertEqual(len(record["build"]["cut_scope"]), 1)

    def test_returned_record_is_independent_of_input_measure(self):
        m = _measure()
        record = generate_build_measure_learn_record("BML-T-072", "proc", _build(), m, _learn(), _prov())
        m["metrics"].append(_metric("METRIC-002"))
        self.assertEqual(len(record["measure"]["metrics"]), 1)

    def test_returned_record_is_independent_of_input_learn(self):
        learn = _learn()
        record = generate_build_measure_learn_record("BML-T-073", "proc", _build(), _measure(), learn, _prov())
        learn["metric_refs"].append("METRIC-999")
        self.assertEqual(len(record["learn"]["metric_refs"]), 1)

    def test_default_version_and_method_id_applied(self):
        record = _valid_record()
        self.assertEqual(record["version"], "1.0.0")
        self.assertEqual(record["generated_by_method"], "learning.build_measure_learn")

    def test_real_scenario_end_to_end(self):
        """Grounded in memory note project_meeting_to_ppt_pipeline (2026-08-17): real 60-minute recording,
        GPU/CPU transcription+diarization benchmark, real numbers."""
        calc = _calc_prov()
        decision = _prov()
        build = build_stage(
            "以真實 60 分鐘餐敘錄音（BU5.m4a）跑 faster-whisper large-v3 轉錄 + pyannote 3.1 講者分離，GPU／CPU 各跑一次。",
            "ARTIFACT-2026-08-17-BU5-RUN",
            ["PPT/報告教練產出階段未測", "多語言/多講者規模未涵蓋", "180 秒短切片 benchmark 刻意排除"],
            decision,
        )
        measure = measure_stage(
            "量測轉錄與講者分離在 GPU／CPU 兩種硬體路徑下的 realtime 倍率。",
            "ARTIFACT-2026-08-17-BU5-RUN",
            [
                metric("METRIC-001", "whisper_transcription_speed_gpu", 7.0, "x_realtime", calc),
                metric("METRIC-002", "pyannote_diarization_speed_gpu", 24.4, "x_realtime", calc),
                metric("METRIC-003", "whisper_transcription_speed_cpu", 0.3, "x_realtime", calc),
            ],
            calc,
        )
        learn = learn_stage(
            "GPU 路線本機零費用且夠快；CPU-only 0.3x 不可行 -- EU VPS 純 CPU 自架路線判死。",
            ["METRIC-001", "METRIC-002", "METRIC-003"],
            decision,
        )
        record = generate_build_measure_learn_record("BML-2026-08-17-001", "會議錄音 pipeline -- CPU vs GPU", build, measure, learn, decision)
        self.assertEqual(record["measure"]["metrics"][2]["value"], 0.3)
        gates = evaluate_build_measure_learn_gates(record, "test", T)
        self.assertTrue(all_gates_pass(gates))


class GateProvenanceTests(unittest.TestCase):
    def test_valid_record_passes_provenance_gate(self):
        self.assertEqual(evaluate_provenance_required_gate(_valid_record(), "test", T)["status"], "PASS")

    def test_hand_tampered_top_level_provenance_fails_only_this_gate(self):
        record = _valid_record()
        record["provenance"] = None
        self.assertEqual(evaluate_provenance_required_gate(record, "test", T)["status"], "FAIL")
        self.assertEqual(evaluate_connectedness_gate(record, "test", T)["status"], "PASS")

    def test_hand_tampered_build_provenance_fails(self):
        record = _valid_record()
        record["build"] = {**record["build"], "provenance": None}
        self.assertEqual(evaluate_provenance_required_gate(record, "test", T)["status"], "FAIL")

    def test_hand_tampered_measure_provenance_fails(self):
        record = _valid_record()
        record["measure"] = {**record["measure"], "provenance": None}
        self.assertEqual(evaluate_provenance_required_gate(record, "test", T)["status"], "FAIL")

    def test_hand_tampered_learn_provenance_fails(self):
        record = _valid_record()
        record["learn"] = {**record["learn"], "provenance": None}
        self.assertEqual(evaluate_provenance_required_gate(record, "test", T)["status"], "FAIL")

    def test_hand_tampered_metric_provenance_fails_and_is_identified(self):
        record = _valid_record()
        tampered_metric = {**record["measure"]["metrics"][0], "provenance": None}
        record["measure"] = {**record["measure"], "metrics": [tampered_metric]}
        gate = evaluate_provenance_required_gate(record, "test", T)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("METRIC-001", gate["evidence"][0]["invalid_metric_provenance_ids"])

    def test_malformed_record_fails_closed(self):
        for bad in (None, [], "not-a-dict", 42):
            self.assertEqual(evaluate_provenance_required_gate(bad, "test", T)["status"], "FAIL")

    def test_non_dict_metric_entry_is_flagged_not_skipped(self):
        record = _valid_record()
        record["measure"] = {**record["measure"], "metrics": [None]}
        gate = evaluate_provenance_required_gate(record, "test", T)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["malformed_metric_indices"], [0])


class GateConnectednessTests(unittest.TestCase):
    def test_valid_record_passes(self):
        self.assertEqual(evaluate_connectedness_gate(_valid_record(), "test", T)["status"], "PASS")

    def test_hand_tampered_build_ref_mismatch_fails(self):
        record = _valid_record()
        record["measure"] = {**record["measure"], "build_ref": "ARTIFACT-999"}
        gate = evaluate_connectedness_gate(record, "test", T)
        self.assertEqual(gate["status"], "FAIL")
        self.assertFalse(gate["evidence"][0]["measure_build_ref_resolved"])

    def test_hand_tampered_metric_refs_emptied_fails(self):
        """Bypasses the constructor entirely -- proves the gate, not just generate_*, enforces the invariant."""
        record = _valid_record()
        record["learn"] = {**record["learn"], "metric_refs": []}
        gate = evaluate_connectedness_gate(record, "test", T)
        self.assertEqual(gate["status"], "FAIL")
        self.assertTrue(gate["evidence"][0]["learn_metric_ref_violations"])

    def test_hand_tampered_metric_refs_unknown_id_fails(self):
        record = _valid_record()
        record["learn"] = {**record["learn"], "metric_refs": ["METRIC-999"]}
        self.assertEqual(evaluate_connectedness_gate(record, "test", T)["status"], "FAIL")

    def test_hand_tampered_build_malformed_fails_not_crashes(self):
        record = _valid_record()
        record["build"] = "garbage"
        self.assertEqual(evaluate_connectedness_gate(record, "test", T)["status"], "FAIL")

    def test_hand_tampered_measure_malformed_fails_not_crashes(self):
        record = _valid_record()
        record["measure"] = "garbage"
        self.assertEqual(evaluate_connectedness_gate(record, "test", T)["status"], "FAIL")

    def test_hand_tampered_learn_malformed_fails_not_crashes(self):
        record = _valid_record()
        record["learn"] = "garbage"
        self.assertEqual(evaluate_connectedness_gate(record, "test", T)["status"], "FAIL")

    def test_malformed_record_types_fail_closed(self):
        for bad in (None, [], "not-a-dict", 42, 3.14, True):
            self.assertEqual(evaluate_connectedness_gate(bad, "test", T)["status"], "FAIL", f"did not fail closed on {bad!r}")

    def test_top_level_provenance_tamper_does_not_affect_this_gate(self):
        record = _valid_record()
        record["provenance"] = None
        self.assertEqual(evaluate_connectedness_gate(record, "test", T)["status"], "PASS")


class GateDisclosedMinimalismTests(unittest.TestCase):
    def test_valid_record_passes(self):
        self.assertEqual(evaluate_disclosed_minimalism_gate(_valid_record(), "test", T)["status"], "PASS")

    def test_hand_tampered_cut_scope_emptied_fails(self):
        record = _valid_record()
        record["build"] = {**record["build"], "cut_scope": []}
        self.assertEqual(evaluate_disclosed_minimalism_gate(record, "test", T)["status"], "FAIL")

    def test_hand_tampered_cut_scope_removed_key_fails(self):
        record = _valid_record()
        without_key = {k: v for k, v in record["build"].items() if k != "cut_scope"}
        record["build"] = without_key
        self.assertEqual(evaluate_disclosed_minimalism_gate(record, "test", T)["status"], "FAIL")

    def test_build_missing_fails_closed(self):
        record = {"provenance": _prov()}
        self.assertEqual(evaluate_disclosed_minimalism_gate(record, "test", T)["status"], "FAIL")

    def test_malformed_record_types_fail_closed(self):
        for bad in (None, [], "not-a-dict", 42, 3.14, True):
            self.assertEqual(evaluate_disclosed_minimalism_gate(bad, "test", T)["status"], "FAIL", f"did not fail closed on {bad!r}")

    def test_harmless_description_tamper_does_not_affect_this_gate(self):
        record = _valid_record()
        record["build"] = {**record["build"], "description": "changed, harmless"}
        self.assertEqual(evaluate_disclosed_minimalism_gate(record, "test", T)["status"], "PASS")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "BML-")

    def test_artifact_id_prefix_constant(self):
        self.assertEqual(ARTIFACT_ID_PREFIX, "ARTIFACT-")

    def test_metric_id_prefix_constant(self):
        self.assertEqual(METRIC_ID_PREFIX, "METRIC-")

    def test_resolve_learned_metrics_returns_full_dicts(self):
        record = _valid_record()
        resolved = resolve_learned_metrics(record)
        self.assertEqual(resolved, [{"id": "METRIC-001", "name": "throughput", "value": 7.0, "unit": "x_realtime", "provenance": resolved[0]["provenance"]}])

    def test_resolve_learned_metrics_preserves_order(self):
        metrics = [_metric("METRIC-001", value=1.0), _metric("METRIC-002", value=2.0)]
        measure = dict(_measure(metrics=metrics))
        record = generate_build_measure_learn_record("BML-T-080", "proc", _build(), measure, _learn(metric_refs=["METRIC-002", "METRIC-001"]), _prov())
        resolved = resolve_learned_metrics(record)
        self.assertEqual([m["id"] for m in resolved], ["METRIC-002", "METRIC-001"])

    def test_resolve_learned_metrics_defensively_filters_unresolvable_ids(self):
        """Operates on an already-valid record per its own docstring, but does not crash on a hand-tampered
        one either -- silently omits an id that no longer resolves rather than raising."""
        record = _valid_record()
        record["learn"] = {**record["learn"], "metric_refs": ["METRIC-001", "METRIC-999"]}
        resolved = resolve_learned_metrics(record)
        self.assertEqual([m["id"] for m in resolved], ["METRIC-001"])


class AllGatesPassAndAggregateTests(unittest.TestCase):
    def test_evaluate_gates_returns_three_gates_with_expected_ids(self):
        results = evaluate_build_measure_learn_gates(_valid_record(), "test", T)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "connectedness", "disclosed_minimalism"})

    def test_all_gates_pass_true_when_all_pass(self):
        results = evaluate_build_measure_learn_gates(_valid_record(), "test", T)
        self.assertTrue(all_gates_pass(results))

    def test_all_gates_pass_false_when_one_fails(self):
        record = _valid_record()
        record["provenance"] = None
        results = evaluate_build_measure_learn_gates(record, "test", T)
        self.assertFalse(all_gates_pass(results))

    def test_all_gates_pass_treats_not_applicable_as_passing(self):
        fake = [{"gate_id": "x", "status": "PASS"}, {"gate_id": "y", "status": "NOT_APPLICABLE"}]
        self.assertTrue(all_gates_pass(fake))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_minimal_record_validates_against_schema(self):
        self.contracts.validate(BUILD_MEASURE_LEARN_CYCLE_SCHEMA, _valid_record(), "build-measure-learn record")

    def test_multi_metric_record_validates_against_schema(self):
        metrics = [_metric("METRIC-001", value=1.0), _metric("METRIC-002", value=2.0)]
        record = generate_build_measure_learn_record("BML-T-090", "proc", _build(), dict(_measure(metrics=metrics)), _learn(metric_refs=["METRIC-001", "METRIC-002"]), _prov())
        self.contracts.validate(BUILD_MEASURE_LEARN_CYCLE_SCHEMA, record, "build-measure-learn record")

    def test_real_scenario_record_validates_against_schema(self):
        calc = _calc_prov()
        decision = _prov()
        build = build_stage("desc", "ARTIFACT-2026-08-17-BU5-RUN", ["cut A"], decision)
        measure = measure_stage(
            "desc",
            "ARTIFACT-2026-08-17-BU5-RUN",
            [
                metric("METRIC-001", "whisper_transcription_speed_gpu", 7.0, "x_realtime", calc),
                metric("METRIC-002", "pyannote_diarization_speed_gpu", 24.4, "x_realtime", calc),
                metric("METRIC-003", "whisper_transcription_speed_cpu", 0.3, "x_realtime", calc),
            ],
            calc,
        )
        learn = learn_stage("conclusion", ["METRIC-001", "METRIC-002", "METRIC-003"], decision)
        record = generate_build_measure_learn_record("BML-2026-08-17-001", "proc", build, measure, learn, decision)
        self.contracts.validate(BUILD_MEASURE_LEARN_CYCLE_SCHEMA, record, "build-measure-learn record")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_build_measure_learn_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


if __name__ == "__main__":
    unittest.main()
