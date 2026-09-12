"""``experiment.proof_of_concept`` -- F15 experiment & validation family (Atlas L734-752).

Atlas's own table row (L740, verbatim): "Proof of Concept | 驗證技術可行 |
technical success->isolated implementation->benchmark | 先去除技術未知"
(validate technical feasibility, via a technical-success criterion, an
isolated implementation, and a benchmark; resolve technical unknowns first).

Real invariants, enforced at TWO independent layers, same belt-and-
suspenders discipline every prior slice in this corpus establishes:

1. **Isolation, THE real invariant this method exists to enforce**
   (``POC_NOT_ISOLATED``) -- ``implementation.isolated`` must be true AND
   ``implementation.production_integration`` must be false. Atlas's own
   pipeline names "isolated implementation" as a distinct stage before
   "benchmark" -- a PoC silently wired into production has already
   committed before the technical unknown is resolved, exactly the
   opposite of "先去除技術未知" (resolve the unknown FIRST).
2. **Verdict consistency** (``POC_VERDICT_INCONSISTENT_WITH_BENCHMARK``) --
   ``feasibility_verdict`` must equal the mechanical recomputation of
   ``benchmark_result`` against ``success_criteria``. This family's core
   principle (Atlas L750-752: "而不是讓 AI 主觀打 8.7/10") made structural
   for the TECHNICAL-feasibility case: the benchmark number decides, not a
   narrative claim of feasibility.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for
"experiment\\.", "proof-of-concept-record", "family: experiment" before
writing any of this method's own files: zero pre-existing implementation or
schema title overlap.
"""

from __future__ import annotations

import copy
import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "experiment.proof_of_concept"
RECORD_ID_PREFIX = "POC-"
_COMPARISONS = frozenset({"GTE", "LTE", "GT", "LT", "EQ"})
_UNKNOWN_KEYS = frozenset({"statement"})
_CRITERIA_KEYS = frozenset({"metric", "threshold", "comparison"})
_IMPLEMENTATION_KEYS = frozenset({"description", "isolated", "production_integration"})
_BENCHMARK_KEYS = frozenset({"measured_value", "environment", "methodology"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_finite_number(value: Any) -> bool:
    """A real, finite number. ``bool`` excluded (Python's ``bool`` is an ``int`` subclass -- same documented
    trap this corpus's ``foresight.cross_impact_analysis``/``experiment.mvp`` already guard."""
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    return False


def _compare(actual: float, target: float, comparison: str) -> bool:
    if comparison == "GTE":
        return actual >= target
    if comparison == "LTE":
        return actual <= target
    if comparison == "GT":
        return actual > target
    if comparison == "LT":
        return actual < target
    if comparison == "EQ":
        return actual == target
    raise InvariantViolation(f"POC_INVALID_COMPARISON: comparison must be one of {sorted(_COMPARISONS)}, got {comparison!r}")


def _unknown_problem(value: Any) -> str | None:
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    if set(value.keys()) != _UNKNOWN_KEYS:
        return f"keys must be exactly {sorted(_UNKNOWN_KEYS)}, got {sorted(value.keys())}"
    if not _is_nonempty_str(value.get("statement")):
        return f"statement must be a non-empty string, got {value.get('statement')!r}"
    return None


def _criteria_problem(value: Any) -> str | None:
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    if set(value.keys()) != _CRITERIA_KEYS:
        return f"keys must be exactly {sorted(_CRITERIA_KEYS)}, got {sorted(value.keys())}"
    if not _is_nonempty_str(value.get("metric")):
        return f"metric must be a non-empty string, got {value.get('metric')!r}"
    if not _is_finite_number(value.get("threshold")):
        return f"threshold must be a real finite number (bool excluded), got {value.get('threshold')!r}"
    if value.get("comparison") not in _COMPARISONS:
        return f"comparison must be one of {sorted(_COMPARISONS)}, got {value.get('comparison')!r}"
    return None


def _implementation_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped implementation block", INCLUDING the isolation
    invariant -- both ``implementation()`` (construction layer) and the gate (independent re-derivation
    layer) consult it."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    if set(value.keys()) != _IMPLEMENTATION_KEYS:
        return f"keys must be exactly {sorted(_IMPLEMENTATION_KEYS)}, got {sorted(value.keys())}"
    if not _is_nonempty_str(value.get("description")):
        return f"description must be a non-empty string, got {value.get('description')!r}"
    if not isinstance(value.get("isolated"), bool):
        return f"isolated must be a bool, got {value.get('isolated')!r}"
    if not isinstance(value.get("production_integration"), bool):
        return f"production_integration must be a bool, got {value.get('production_integration')!r}"
    if value.get("isolated") is not True or value.get("production_integration") is not False:
        return (
            f"implementation.isolated must be true AND production_integration must be false, "
            f"got isolated={value.get('isolated')!r} production_integration={value.get('production_integration')!r} "
            "-- Atlas's own 'isolated implementation' pipeline stage requires the PoC to run outside production"
        )
    return None


def _benchmark_problem(value: Any) -> str | None:
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    if set(value.keys()) != _BENCHMARK_KEYS:
        return f"keys must be exactly {sorted(_BENCHMARK_KEYS)}, got {sorted(value.keys())}"
    if not _is_finite_number(value.get("measured_value")):
        return f"measured_value must be a real finite number (bool excluded), got {value.get('measured_value')!r}"
    if not _is_nonempty_str(value.get("environment")):
        return f"environment must be a non-empty string, got {value.get('environment')!r}"
    if not _is_nonempty_str(value.get("methodology")):
        return f"methodology must be a non-empty string, got {value.get('methodology')!r}"
    return None


def technical_unknown(statement: str) -> dict[str, Any]:
    """One instance of ``typed-objects/proof-of-concept-record.schema.yaml#/properties/technical_unknown``."""
    record = {"statement": statement}
    problem = _unknown_problem(record)
    if problem is not None:
        raise InvariantViolation(f"POC_INVALID_TECHNICAL_UNKNOWN: {problem}")
    return record


def success_criteria(metric: str, threshold: float, comparison: str) -> dict[str, Any]:
    """One instance of ``typed-objects/proof-of-concept-record.schema.yaml#/properties/success_criteria``."""
    record = {"metric": metric, "threshold": threshold, "comparison": comparison}
    problem = _criteria_problem(record)
    if problem is not None:
        raise InvariantViolation(f"POC_INVALID_SUCCESS_CRITERIA: {problem}")
    return record


def implementation(description: str, isolated: bool, production_integration: bool) -> dict[str, Any]:
    """One instance of ``typed-objects/proof-of-concept-record.schema.yaml#/properties/implementation``."""
    record = {"description": description, "isolated": isolated, "production_integration": production_integration}
    problem = _implementation_problem(record)
    if problem is not None:
        # ``_implementation_problem`` checks the isolation invariant LAST -- tagging the code purely off
        # the isolated/production_integration VALUES (without confirming ``description`` is ALSO
        # individually valid) would mislabel an unrelated failure (e.g. an empty ``description``) as
        # POC_NOT_ISOLATED whenever the flags happen to be non-isolating too. Critic-caught 2026-09-12
        # (F15 batch review), same bug class as this corpus's other conditional-error-code sites.
        other_fields_valid = _is_nonempty_str(description) and isinstance(isolated, bool) and isinstance(production_integration, bool)
        code = "POC_NOT_ISOLATED" if other_fields_valid and (isolated is not True or production_integration is not False) else "POC_INVALID_IMPLEMENTATION"
        raise InvariantViolation(f"{code}: {problem}")
    return record


def benchmark_result(measured_value: float, environment: str, methodology: str) -> dict[str, Any]:
    """One instance of ``typed-objects/proof-of-concept-record.schema.yaml#/properties/benchmark_result``."""
    record = {"measured_value": measured_value, "environment": environment, "methodology": methodology}
    problem = _benchmark_problem(record)
    if problem is not None:
        raise InvariantViolation(f"POC_INVALID_BENCHMARK_RESULT: {problem}")
    return record


def generate_proof_of_concept(
    record_id: str,
    technical_unknown_: dict[str, Any],
    success_criteria_: dict[str, Any],
    implementation_: dict[str, Any],
    benchmark_result_: dict[str, Any],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/proof-of-concept-record.schema.yaml``.

    Rebuilds every sub-object via its own builder (never trusting the caller's raw dicts), then enforces the
    method contract's own real invariants fail-closed, in order: id/version/provenance shape, isolation (via
    ``implementation``'s own builder), and -- the invariant Atlas's own "benchmark" pipeline stage exists to
    enforce -- the ``feasibility_verdict`` this function DERIVES (never accepted from the caller) mechanically
    recomputes from ``benchmark_result`` against ``success_criteria``, so the returned record can never carry a
    narrative feasibility claim that contradicts its own benchmark.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"POC_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"POC_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("POC_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    if not isinstance(technical_unknown_, dict):
        raise InvariantViolation(f"POC_INVALID_TECHNICAL_UNKNOWN: technical_unknown must be a dict, got {technical_unknown_!r}")
    rebuilt_unknown = technical_unknown(technical_unknown_.get("statement"))

    if not isinstance(success_criteria_, dict):
        raise InvariantViolation(f"POC_INVALID_SUCCESS_CRITERIA: success_criteria must be a dict, got {success_criteria_!r}")
    rebuilt_criteria = success_criteria(success_criteria_.get("metric"), success_criteria_.get("threshold"), success_criteria_.get("comparison"))

    if not isinstance(implementation_, dict):
        raise InvariantViolation(f"POC_INVALID_IMPLEMENTATION: implementation must be a dict, got {implementation_!r}")
    rebuilt_implementation = implementation(implementation_.get("description"), implementation_.get("isolated"), implementation_.get("production_integration"))

    if not isinstance(benchmark_result_, dict):
        raise InvariantViolation(f"POC_INVALID_BENCHMARK_RESULT: benchmark_result must be a dict, got {benchmark_result_!r}")
    rebuilt_benchmark = benchmark_result(benchmark_result_.get("measured_value"), benchmark_result_.get("environment"), benchmark_result_.get("methodology"))

    feasibility_verdict = _compare(rebuilt_benchmark["measured_value"], rebuilt_criteria["threshold"], rebuilt_criteria["comparison"])

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "technical_unknown": rebuilt_unknown,
        "success_criteria": rebuilt_criteria,
        "implementation": rebuilt_implementation,
        "benchmark_result": rebuilt_benchmark,
        "feasibility_verdict": feasibility_verdict,
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


def evaluate_isolation_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives the isolation invariant directly from raw fields using the SAME ``_implementation_problem``
    predicate the builder uses -- without this the gate could pass a hand-tampered record that flipped
    production_integration to true after construction."""
    if not isinstance(record, dict):
        return _result("isolation", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problem = _implementation_problem(record.get("implementation"))
    return _result("isolation", problem is None, [{"problem": problem}], validator, timestamp)


def evaluate_verdict_consistency_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas L740's own 'benchmark decides feasibility' rule directly from raw fields -- recomputes
    feasibility from benchmark_result against success_criteria and compares against the record's own claimed
    feasibility_verdict. Fails closed on malformed entries rather than crashing, and does NOT trust that the
    builder's own recomputation already ran (a hand-tampered verdict bypasses the builder entirely)."""
    if not isinstance(record, dict):
        return _result("verdict_consistency", False, [{"reason": "record is not a dict"}], validator, timestamp)
    criteria = record.get("success_criteria")
    benchmark = record.get("benchmark_result")
    verdict = record.get("feasibility_verdict")
    problems: list[str] = []

    if _criteria_problem(criteria) is not None:
        problems.append("success_criteria is missing or malformed")
    if _benchmark_problem(benchmark) is not None:
        problems.append("benchmark_result is missing or malformed")
    if not isinstance(verdict, bool):
        problems.append(f"feasibility_verdict must be a bool, got {verdict!r}")

    if not problems:
        expected_verdict = _compare(benchmark["measured_value"], criteria["threshold"], criteria["comparison"])
        if verdict != expected_verdict:
            problems.append(f"feasibility_verdict={verdict!r} but recomputation of benchmark_result against success_criteria gives {expected_verdict!r}")

    passed = not problems
    return _result("verdict_consistency", passed, [{"problems": problems}], validator, timestamp)


def evaluate_proof_of_concept_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_isolation_gate(record, validator, timestamp),
        evaluate_verdict_consistency_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
