"""``experiment.benchmark`` -- F15 experiment & validation family (Atlas L734-753).

Atlas's own table row (L748, verbatim): "Benchmark | 與 baseline/competitor
比較 | fixed workload/metrics/environment | 避免憑印象選型" (compare against a
baseline/competitor, under a fixed workload/metrics/environment, to avoid
choosing by impression).

Real invariants, enforced at TWO independent layers, same belt-and-
suspenders discipline every prior slice in this corpus establishes:

1. **Fixed workload/environment, by construction** -- ``workload`` and
   ``environment`` are each declared exactly once at record level; this
   module exposes no per-candidate override, so they cannot vary between
   candidates in the first place.
2. **FIXED METRIC COVERAGE, the real invariant this method exists to
   enforce** (``BENCH_METRIC_MISMATCH``) -- Atlas's own pipeline says "fixed
   ... metrics"; every candidate's ``results`` must cover EXACTLY the
   declared ``metrics`` set (no missing metric, no extra metric) -- a
   candidate scored on a different metric set is exactly the "憑印象選型"
   (choosing by impression) this method's own benefit column exists to
   prevent.
3. **At least 2 candidates** (``BENCH_TOO_FEW_CANDIDATES``) -- a benchmark of
   1 candidate has nothing to compare against.
4. **No duplicate candidate_id** (``BENCH_DUPLICATE_CANDIDATE_ID``), **no
   duplicate metric name** (``BENCH_DUPLICATE_METRIC``), **finite numeric
   results** (``BENCH_INVALID_CANDIDATES``, ``bool`` excluded -- Python's
   ``bool`` is an ``int`` subclass, the same documented trap
   ``epistemic.bayesian_updating``'s own ``_is_valid_probability`` guards
   against).

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for
"experiment.benchmark"/"benchmark-record"/"BenchmarkRecord"/"fixed
workload"/"fixed metrics" before writing any of this method's own files:
zero pre-existing implementation or schema title overlap.
"""

from __future__ import annotations

import copy
import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "experiment.benchmark"
RECORD_ID_PREFIX = "BENCH-"
_FIXED_BLOCK_KEYS = frozenset({"description", "parameters"})
_CANDIDATE_KEYS = frozenset({"candidate_id", "label", "results"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_finite_number(value: Any) -> bool:
    """A results[] value must be a real, finite number. ``bool`` excluded (Python's ``bool`` is an
    ``int`` subclass -- see this corpus's own ``epistemic.bayesian_updating`` documented trap).
    ``int`` is unconditionally finite in Python and is accepted directly rather than passed through
    ``math.isfinite`` (that function raises ``OverflowError`` on a huge ``int``, a trap only
    reachable via the ``float`` branch below)."""
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    return False


def _fixed_block_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped fixed workload/environment block" -- shared
    by ``workload`` and ``environment``, both the builder and the gate consult it, same single-
    shared-predicate discipline ``foresight.cross_impact_analysis``'s own ``_event_problem``
    establishes."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _FIXED_BLOCK_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if "description" not in value:
        return "missing key 'description'"
    if not _is_nonempty_str(value.get("description")):
        return f"description must be a non-empty string, got {value.get('description')!r}"
    if "parameters" in value and not isinstance(value.get("parameters"), dict):
        return f"parameters, if present, must be a dict, got {value.get('parameters')!r}"
    return None


def _metrics_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped, duplicate-free metrics[] list"."""
    if not isinstance(value, list):
        return f"must be a list, got {type(value).__name__}"
    if len(value) < 1:
        return "must have at least 1 item"
    bad = [item for item in value if not _is_nonempty_str(item)]
    if bad:
        return f"every item must be a non-empty string, found {bad!r}"
    if len(value) != len(set(value)):
        duplicate = sorted({m for m in value if value.count(m) > 1})
        return f"duplicate metric name(s) {duplicate}"
    return None


def _candidate_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped candidates[] entry" -- shape/results-value-
    type only, NOT metric-set coverage against the sibling ``metrics[]`` list, which needs the
    sibling array and is checked once in ``generate_benchmark``/the gate (same division of labor
    ``foresight.cross_impact_analysis``'s ``_pair_problem``/matrix-completeness split establishes)."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _CANDIDATE_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _CANDIDATE_KEYS <= value.keys():
        return f"missing key(s) {sorted(_CANDIDATE_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("candidate_id")):
        return f"candidate_id must be a non-empty string, got {value.get('candidate_id')!r}"
    if not _is_nonempty_str(value.get("label")):
        return f"label must be a non-empty string, got {value.get('label')!r}"
    results = value.get("results")
    if not isinstance(results, dict):
        return f"results must be a dict, got {results!r}"
    bad_keys = [k for k in results.keys() if not _is_nonempty_str(k)]
    if bad_keys:
        return f"results keys must be non-empty strings, found {bad_keys!r}"
    bad_values = {k: v for k, v in results.items() if not _is_finite_number(v)}
    if bad_values:
        return f"every results value must be a real finite number (bool excluded), found {bad_values!r}"
    return None


def _fixed_metric_coverage_problems(metrics: list[str], well_shaped_candidates: list[dict[str, Any]]) -> dict[str, dict[str, list[str]]]:
    """THE shared predicate for Atlas L748's own "fixed ... metrics" rule -- consulted by both the
    builder and the dedicated ``fixed_metric_coverage`` gate. Returns, per offending
    ``candidate_id``, the missing and/or extra metric names relative to the FIXED ``metrics`` set."""
    metric_set = set(metrics)
    problems: dict[str, dict[str, list[str]]] = {}
    for candidate in well_shaped_candidates:
        result_keys = set(candidate["results"].keys())
        missing = sorted(metric_set - result_keys)
        extra = sorted(result_keys - metric_set)
        if missing or extra:
            problems[candidate["candidate_id"]] = {"missing": missing, "extra": extra}
    return problems


def generate_benchmark(
    record_id: str,
    workload: dict[str, Any],
    environment: dict[str, Any],
    metrics: list[str],
    candidates: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/benchmark-record.schema.yaml``.

    Rebuilds every ``candidates[]`` entry (never trusting the caller's raw dicts), then enforces
    the method contract's own real invariants fail-closed, in order: id/version/provenance shape,
    workload/environment/metrics well-formed, >=2 distinct candidates with no duplicate
    candidate_id, and -- the invariant Atlas's own "fixed workload/metrics/environment" pipeline
    stage exists to enforce -- every candidate's results[] covers EXACTLY the declared metrics set
    (no missing metric, no extra metric) -- BEFORE returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"BENCH_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"BENCH_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("BENCH_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    workload_problem = _fixed_block_problem(workload)
    if workload_problem is not None:
        raise InvariantViolation(f"BENCH_INVALID_WORKLOAD: {workload_problem}")
    environment_problem = _fixed_block_problem(environment)
    if environment_problem is not None:
        raise InvariantViolation(f"BENCH_INVALID_ENVIRONMENT: {environment_problem}")
    metrics_problem = _metrics_problem(metrics)
    if metrics_problem is not None:
        raise InvariantViolation(f"BENCH_INVALID_METRICS: {metrics_problem}")

    if not isinstance(candidates, list):
        raise InvariantViolation(f"BENCH_INVALID_CANDIDATES: candidates must be a list, got {type(candidates).__name__}")
    rebuilt_candidates: list[dict[str, Any]] = []
    for i, c in enumerate(candidates):
        problem = _candidate_problem(c)
        if problem is not None:
            raise InvariantViolation(f"BENCH_INVALID_CANDIDATES: candidates[{i}]: {problem}")
        rebuilt_candidates.append({"candidate_id": c["candidate_id"], "label": c["label"], "results": dict(c["results"])})

    if len(rebuilt_candidates) < 2:
        raise InvariantViolation(f"BENCH_TOO_FEW_CANDIDATES: at least 2 candidates are required, got {len(rebuilt_candidates)} -- a benchmark over fewer than 2 candidates has nothing to compare against")
    candidate_ids = [c["candidate_id"] for c in rebuilt_candidates]
    if len(candidate_ids) != len(set(candidate_ids)):
        duplicate = sorted({cid for cid in candidate_ids if candidate_ids.count(cid) > 1})
        raise InvariantViolation(f"BENCH_DUPLICATE_CANDIDATE_ID: candidate_id(s) {duplicate} declared more than once")

    # THE real invariant. Atlas L748: "fixed workload/metrics/environment" -- every candidate MUST
    # be scored on exactly the same, declared metric set.
    coverage_problems = _fixed_metric_coverage_problems(list(metrics), rebuilt_candidates)
    if coverage_problems:
        raise InvariantViolation(
            f"BENCH_METRIC_MISMATCH: every candidate must report results for EXACTLY the fixed "
            f"metrics set {sorted(metrics)} -- a candidate scored on a different metric set is not "
            f"a benchmark, it is 憑印象選型 (choosing by impression). Mismatch(es): {coverage_problems}"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "workload": copy.deepcopy(workload),
        "environment": copy.deepcopy(environment),
        "metrics": list(metrics),
        "candidates": rebuilt_candidates,
        "provenance": copy.deepcopy(provenance),
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record carries a schema-valid provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_structural_shape_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives workload/environment/metrics/candidates shape, candidate-count minimum, and
    duplicate-id/duplicate-metric checks directly from raw fields using the SAME
    ``_fixed_block_problem``/``_metrics_problem``/``_candidate_problem`` predicates the builder
    uses -- without this the gate could pass records the builder refuses. Fails closed on
    malformed entries rather than crashing. Does NOT re-check metric coverage -- that is
    ``evaluate_fixed_metric_coverage_gate``'s own, dedicated job."""
    if not isinstance(record, dict):
        return _result("structural_shape", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems: list[str] = []

    workload_problem = _fixed_block_problem(record.get("workload"))
    if workload_problem is not None:
        problems.append(f"workload: {workload_problem}")
    environment_problem = _fixed_block_problem(record.get("environment"))
    if environment_problem is not None:
        problems.append(f"environment: {environment_problem}")

    metrics = record.get("metrics")
    metrics_problem = _metrics_problem(metrics)
    if metrics_problem is not None:
        problems.append(f"metrics: {metrics_problem}")

    candidates = record.get("candidates")
    if isinstance(candidates, list):
        malformed = [f"candidates[{i}]: {problem}" for i, problem in ((i, _candidate_problem(c)) for i, c in enumerate(candidates)) if problem]
        problems.extend(malformed)
        well_shaped = [c for c in candidates if _candidate_problem(c) is None]
        candidate_ids = [c["candidate_id"] for c in well_shaped]
        if not malformed and len(well_shaped) < 2:
            problems.append(f"fewer than 2 well-shaped candidates: {candidate_ids!r}")
        if len(candidate_ids) != len(set(candidate_ids)):
            duplicate = sorted({cid for cid in candidate_ids if candidate_ids.count(cid) > 1})
            problems.append(f"duplicate candidate_id(s): {duplicate}")
    else:
        problems.append("candidates must be a list")

    passed = not problems
    return _result("structural_shape", passed, [{"problems": problems}], validator, timestamp)


def evaluate_fixed_metric_coverage_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas L748's own "fixed ... metrics" requirement directly from raw fields -- THE
    real invariant this method exists to enforce. Does NOT assume the builder already ran; a
    hand-tampered record with a candidate missing or adding a metric key is caught here
    independently. Fails closed on malformed entries rather than crashing, and does not assume
    ``structural_shape`` already passed (recomputes against well-shaped candidates only)."""
    if not isinstance(record, dict):
        return _result("fixed_metric_coverage", False, [{"reason": "record is not a dict"}], validator, timestamp)
    metrics = record.get("metrics")
    candidates = record.get("candidates")
    if _metrics_problem(metrics) is not None or not isinstance(candidates, list):
        return _result("fixed_metric_coverage", False, [{"reason": "metrics and candidates must both be well-shaped to evaluate coverage"}], validator, timestamp)

    well_shaped_candidates = [c for c in candidates if _candidate_problem(c) is None]
    problems: list[str] = []
    if len(well_shaped_candidates) != len(candidates):
        problems.append("one or more candidates[] entries are malformed")
    coverage_problems = _fixed_metric_coverage_problems(list(metrics), well_shaped_candidates)
    if coverage_problems:
        problems.append(f"metric-coverage mismatch(es): {coverage_problems}")
    passed = not problems
    return _result("fixed_metric_coverage", passed, [{"fixed_metrics": list(metrics) if isinstance(metrics, list) else None, "problems": problems}], validator, timestamp)


def evaluate_benchmark_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_structural_shape_gate(record, validator, timestamp),
        evaluate_fixed_metric_coverage_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
