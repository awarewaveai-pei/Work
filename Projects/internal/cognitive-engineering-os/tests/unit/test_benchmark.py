"""Mutation-style tests for ``experiment.benchmark`` (F15 experiment & validation family, Atlas L748).

Atlas L748's own "fixed workload/metrics/environment" pipeline stage is
proven at BOTH independent layers: the construction-time builder refuses a
candidate scored on a different metric set, too few candidates, and a
duplicate candidate_id, and the independent gates re-derive the same rules
directly from a raw (possibly hand-tampered) dict, never trusting that the
builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.experiment.benchmark import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_benchmark_gates,
    evaluate_fixed_metric_coverage_gate,
    evaluate_provenance_required_gate,
    evaluate_structural_shape_gate,
    generate_benchmark,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

BENCHMARK_RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/benchmark-record.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        workload={"description": "10k synthetic checkout requests, fixed seed", "parameters": {"request_count": 10000, "seed": 42}},
        environment={"description": "single c6i.xlarge, us-east-1, cold cache", "parameters": {"instance_type": "c6i.xlarge", "region": "us-east-1"}},
        metrics=["p95_latency_ms", "throughput_rps", "error_rate"],
        candidates=[
            {"candidate_id": "baseline-v1", "label": "Current production checkout", "results": {"p95_latency_ms": 420, "throughput_rps": 180, "error_rate": 0.004}},
            {"candidate_id": "candidate-v2", "label": "New checkout flow", "results": {"p95_latency_ms": 310, "throughput_rps": 240, "error_rate": 0.002}},
        ],
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_benchmark(*, record_id: str = "BENCH-T-001", **overrides: object):
    return generate_benchmark(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_benchmark_validates_against_the_real_schema(self):
        self.contracts.validate(BENCHMARK_RECORD_SCHEMA, _valid_benchmark(), "benchmark record")

    def test_three_candidates_all_covering_the_fixed_metric_set_validates(self):
        kwargs = _kwargs()
        kwargs["candidates"].append({"candidate_id": "candidate-v3", "label": "Third variant", "results": {"p95_latency_ms": 300, "throughput_rps": 250, "error_rate": 0.001}})
        record = generate_benchmark("BENCH-T-002", **kwargs)
        self.contracts.validate(BENCHMARK_RECORD_SCHEMA, record, "3-candidate benchmark")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, record = live.invoke(METHOD_ID, generate_benchmark, "BENCH-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/experiment.benchmark.contract.yaml")
        self.assertEqual(record["id"], "BENCH-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        record = _valid_benchmark()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BENCHMARK_RECORD_SCHEMA, record, "benchmark with a smuggled top-level key")

    def test_schema_rejects_a_single_candidate(self):
        record = _valid_benchmark()
        record["candidates"] = record["candidates"][:1]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BENCHMARK_RECORD_SCHEMA, record, "benchmark with 1 candidate")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "experiment.benchmark.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "experiment.benchmark contract")


class FixedMetricCoverageTests(unittest.TestCase):
    """Atlas L748's own "fixed ... metrics" rule -- the real invariant this method exists to enforce."""

    def test_candidate_missing_a_fixed_metric_is_refused(self):
        kwargs = _kwargs()
        del kwargs["candidates"][1]["results"]["error_rate"]
        with self.assertRaisesRegex(InvariantViolation, "BENCH_METRIC_MISMATCH"):
            generate_benchmark("BENCH-T-003", **kwargs)

    def test_candidate_with_an_extra_non_fixed_metric_is_refused(self):
        kwargs = _kwargs()
        kwargs["candidates"][0]["results"]["cpu_utilization_pct"] = 55
        with self.assertRaisesRegex(InvariantViolation, "BENCH_METRIC_MISMATCH"):
            generate_benchmark("BENCH-T-004", **kwargs)

    def test_mismatch_error_names_the_offending_candidate(self):
        kwargs = _kwargs()
        del kwargs["candidates"][1]["results"]["error_rate"]
        with self.assertRaises(InvariantViolation) as ctx:
            generate_benchmark("BENCH-T-005", **kwargs)
        self.assertIn("candidate-v2", str(ctx.exception))

    def test_complete_fixed_coverage_is_accepted(self):
        record = _valid_benchmark()
        for candidate in record["candidates"]:
            self.assertEqual(set(candidate["results"].keys()), set(record["metrics"]))


class CandidateCountTests(unittest.TestCase):
    def test_zero_candidates_is_refused(self):
        kwargs = _kwargs(candidates=[])
        with self.assertRaisesRegex(InvariantViolation, "BENCH_TOO_FEW_CANDIDATES"):
            generate_benchmark("BENCH-T-006", **kwargs)

    def test_one_candidate_is_refused(self):
        kwargs = _kwargs()
        kwargs["candidates"] = kwargs["candidates"][:1]
        with self.assertRaisesRegex(InvariantViolation, "BENCH_TOO_FEW_CANDIDATES"):
            generate_benchmark("BENCH-T-007", **kwargs)

    def test_duplicate_candidate_id_is_refused(self):
        kwargs = _kwargs()
        kwargs["candidates"].append(dict(kwargs["candidates"][0]))
        with self.assertRaisesRegex(InvariantViolation, "BENCH_DUPLICATE_CANDIDATE_ID"):
            generate_benchmark("BENCH-T-008", **kwargs)


class MetricsShapeTests(unittest.TestCase):
    def test_empty_metrics_is_refused(self):
        kwargs = _kwargs(metrics=[])
        with self.assertRaisesRegex(InvariantViolation, "BENCH_INVALID_METRICS"):
            generate_benchmark("BENCH-T-009", **kwargs)

    def test_duplicate_metric_name_is_refused(self):
        kwargs = _kwargs()
        kwargs["metrics"] = ["p95_latency_ms", "p95_latency_ms", "throughput_rps"]
        with self.assertRaisesRegex(InvariantViolation, "BENCH_INVALID_METRICS"):
            generate_benchmark("BENCH-T-010", **kwargs)


class WorkloadEnvironmentShapeTests(unittest.TestCase):
    def test_workload_missing_description_is_refused(self):
        kwargs = _kwargs()
        kwargs["workload"] = {"parameters": {}}
        with self.assertRaisesRegex(InvariantViolation, "BENCH_INVALID_WORKLOAD"):
            generate_benchmark("BENCH-T-011", **kwargs)

    def test_environment_unknown_key_is_refused(self):
        kwargs = _kwargs()
        kwargs["environment"] = {"description": "x", "extra": "y"}
        with self.assertRaisesRegex(InvariantViolation, "BENCH_INVALID_ENVIRONMENT"):
            generate_benchmark("BENCH-T-012", **kwargs)

    def test_no_per_candidate_workload_or_environment_field_exists(self):
        """Structural proof workload/environment cannot vary between candidates: candidate schema
        keys are exactly candidate_id/label/results -- there is no field to smuggle either into."""
        record = _valid_benchmark()
        for candidate in record["candidates"]:
            self.assertEqual(set(candidate.keys()), {"candidate_id", "label", "results"})


class ResultsValueTests(unittest.TestCase):
    def test_boolean_result_value_is_refused_not_silently_coerced(self):
        kwargs = _kwargs()
        kwargs["candidates"][0]["results"]["p95_latency_ms"] = True
        with self.assertRaisesRegex(InvariantViolation, "BENCH_INVALID_CANDIDATES"):
            generate_benchmark("BENCH-T-013", **kwargs)

    def test_nan_result_value_is_refused(self):
        kwargs = _kwargs()
        kwargs["candidates"][0]["results"]["p95_latency_ms"] = float("nan")
        with self.assertRaisesRegex(InvariantViolation, "BENCH_INVALID_CANDIDATES"):
            generate_benchmark("BENCH-T-014", **kwargs)

    def test_non_numeric_result_value_is_refused(self):
        kwargs = _kwargs()
        kwargs["candidates"][0]["results"]["p95_latency_ms"] = "fast"
        with self.assertRaisesRegex(InvariantViolation, "BENCH_INVALID_CANDIDATES"):
            generate_benchmark("BENCH-T-015", **kwargs)


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        record = generate_benchmark("BENCH-T-016", **kwargs)
        kwargs["candidates"][0]["results"]["p95_latency_ms"] = -1
        self.assertEqual(record["candidates"][0]["results"]["p95_latency_ms"], 420)
        self.assertIsNot(record["candidates"], kwargs["candidates"])


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_benchmark(self):
        results = evaluate_benchmark_gates(_valid_benchmark(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_fixed_metric_coverage_gate_catches_hand_tampered_missing_metric(self):
        record = copy.deepcopy(_valid_benchmark())
        del record["candidates"][0]["results"]["throughput_rps"]
        gate = evaluate_fixed_metric_coverage_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_fixed_metric_coverage_gate_catches_hand_tampered_extra_metric(self):
        record = copy.deepcopy(_valid_benchmark())
        record["candidates"][1]["results"]["memory_mb"] = 512
        gate = evaluate_fixed_metric_coverage_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_fixed_metric_coverage_gate_passes_a_genuinely_complete_benchmark(self):
        gate = evaluate_fixed_metric_coverage_gate(_valid_benchmark(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_structural_shape_gate_catches_hand_tampered_duplicate_candidate_id(self):
        record = copy.deepcopy(_valid_benchmark())
        record["candidates"].append(copy.deepcopy(record["candidates"][0]))
        gate = evaluate_structural_shape_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_structural_shape_gate_catches_hand_tampered_too_few_candidates(self):
        record = copy.deepcopy(_valid_benchmark())
        record["candidates"] = record["candidates"][:1]
        gate = evaluate_structural_shape_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_benchmark_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_benchmark(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_benchmark())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "BENCH-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BENCH_INVALID_ID"):
            _valid_benchmark(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BENCH_INVALID_VERSION"):
            generate_benchmark("BENCH-T-017", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BENCH_INVALID_PROVENANCE"):
            _valid_benchmark(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "experiment.benchmark")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_benchmark_gates(_valid_benchmark(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "structural_shape", "fixed_metric_coverage"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        record = _valid_benchmark()
        self.assertEqual(
            set(record.keys()),
            {"id", "version", "generated_by_method", "workload", "environment", "metrics", "candidates", "provenance"},
        )


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """Same defect class this corpus's own F13 batch found in 11/14 builders (see
    foresight.cross_impact_analysis's own regression test): a builder that returns the caller's
    ``provenance`` dict BY REFERENCE lets a post-construction mutation silently rewrite the
    already-'validated' record. This test proves ``experiment.benchmark`` does not repeat that
    defect."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_benchmark()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_benchmark(base["id"], base["workload"], base["environment"], base["metrics"], base["candidates"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()
