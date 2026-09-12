"""``experiment.mvp`` -- F15 experiment & validation family (Atlas L734-752, §12.29 L2913-2922).

Atlas's own table row (L739, verbatim): "MVP | 驗證核心價值 | critical
assumption->minimal product->real usage | 縮短 learning cycle" (validate the
core value proposition, via the critical assumption, a minimal product, and
real usage; shorten the learning cycle). Dedicated §12.29 (L2913-2922) adds:
用途「驗證最重要的 value assumption」；不是「把正式產品做爛一點」；正確
問題「最少做什麼，才能得到足以改變決策的 evidence？」.

Real invariants, enforced at TWO independent layers, same belt-and-
suspenders discipline every prior slice in this corpus establishes:

1. **Decision-changing threshold** (``MVP_THRESHOLD_NOT_DECISION_CHANGING``)
   -- ``decision_threshold.decision_if_met`` must differ from
   ``decision_if_not_met``. §12.29's own "正確問題" ("what is the least you
   can do to get evidence sufficient to CHANGE A DECISION?") is meaningless
   if both arms of the threshold lead to the same action -- that is exactly
   the "把正式產品做爛一點" anti-pattern §12.29 names, wearing an MVP label
   without ever being able to change anything.
2. **Decision consistency, THE real invariant this method exists to
   enforce** (``MVP_DECISION_INCONSISTENT_WITH_THRESHOLD``) --
   ``outcome.metric_met``/``outcome.decision_taken`` must equal the
   mechanical recomputation of ``real_usage_result`` against
   ``decision_threshold``, not an asserted narrative. This is this family's
   core principle (Atlas L750-752: "而不是讓 AI 主觀打 8.7/10") made
   structural for the VALUE-assumption case specifically: the pre-
   registered rule, not a post-hoc override, decides.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for
"experiment\\.", "mvp-record", "family: experiment" before writing any of
this method's own files: zero pre-existing implementation or schema title
overlap.
"""

from __future__ import annotations

import copy
import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "experiment.mvp"
RECORD_ID_PREFIX = "MVP-"
_COMPARISONS = frozenset({"GTE", "LTE", "GT", "LT", "EQ"})
_THRESHOLD_KEYS = frozenset({"metric", "target_value", "comparison", "decision_if_met", "decision_if_not_met"})
_USAGE_KEYS = frozenset({"actual_value", "real_users_count", "usage_context"})
_ASSUMPTION_KEYS = frozenset({"statement", "falsifiable_if"})
_OUTCOME_KEYS = frozenset({"metric_met", "decision_taken"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_finite_number(value: Any) -> bool:
    """A real, finite number. ``bool`` excluded (Python's ``bool`` is an ``int`` subclass -- same documented
    trap this corpus's ``foresight.cross_impact_analysis``/``epistemic.bayesian_updating`` already guard."""
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
    raise InvariantViolation(f"MVP_INVALID_COMPARISON: comparison must be one of {sorted(_COMPARISONS)}, got {comparison!r}")


def _assumption_problem(value: Any) -> str | None:
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    if set(value.keys()) != _ASSUMPTION_KEYS:
        return f"keys must be exactly {sorted(_ASSUMPTION_KEYS)}, got {sorted(value.keys())}"
    if not _is_nonempty_str(value.get("statement")):
        return f"statement must be a non-empty string, got {value.get('statement')!r}"
    if not _is_nonempty_str(value.get("falsifiable_if")):
        return f"falsifiable_if must be a non-empty string, got {value.get('falsifiable_if')!r}"
    return None


def _threshold_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped decision_threshold", INCLUDING the decision-changing
    invariant -- both ``decision_threshold()`` (construction layer) and the gate (independent re-derivation
    layer) consult it."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    if set(value.keys()) != _THRESHOLD_KEYS:
        return f"keys must be exactly {sorted(_THRESHOLD_KEYS)}, got {sorted(value.keys())}"
    if not _is_nonempty_str(value.get("metric")):
        return f"metric must be a non-empty string, got {value.get('metric')!r}"
    if not _is_finite_number(value.get("target_value")):
        return f"target_value must be a real finite number (bool excluded), got {value.get('target_value')!r}"
    if value.get("comparison") not in _COMPARISONS:
        return f"comparison must be one of {sorted(_COMPARISONS)}, got {value.get('comparison')!r}"
    if not _is_nonempty_str(value.get("decision_if_met")):
        return f"decision_if_met must be a non-empty string, got {value.get('decision_if_met')!r}"
    if not _is_nonempty_str(value.get("decision_if_not_met")):
        return f"decision_if_not_met must be a non-empty string, got {value.get('decision_if_not_met')!r}"
    if value.get("decision_if_met") == value.get("decision_if_not_met"):
        return f"decision_if_met and decision_if_not_met must differ, both are {value.get('decision_if_met')!r} -- a threshold with identical arms cannot change any decision (§12.29)"
    return None


def _usage_problem(value: Any) -> str | None:
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    if set(value.keys()) != _USAGE_KEYS:
        return f"keys must be exactly {sorted(_USAGE_KEYS)}, got {sorted(value.keys())}"
    if not _is_finite_number(value.get("actual_value")):
        return f"actual_value must be a real finite number (bool excluded), got {value.get('actual_value')!r}"
    real_users_count = value.get("real_users_count")
    if isinstance(real_users_count, bool) or not isinstance(real_users_count, int) or real_users_count < 1:
        return f"real_users_count must be an int >= 1 (bool excluded), got {real_users_count!r}"
    if not _is_nonempty_str(value.get("usage_context")):
        return f"usage_context must be a non-empty string, got {value.get('usage_context')!r}"
    return None


def _outcome_problem(value: Any) -> str | None:
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    if set(value.keys()) != _OUTCOME_KEYS:
        return f"keys must be exactly {sorted(_OUTCOME_KEYS)}, got {sorted(value.keys())}"
    if not isinstance(value.get("metric_met"), bool):
        return f"metric_met must be a bool, got {value.get('metric_met')!r}"
    if not _is_nonempty_str(value.get("decision_taken")):
        return f"decision_taken must be a non-empty string, got {value.get('decision_taken')!r}"
    return None


def critical_assumption(statement: str, falsifiable_if: str) -> dict[str, Any]:
    """One instance of ``typed-objects/mvp-record.schema.yaml#/properties/critical_assumption``."""
    record = {"statement": statement, "falsifiable_if": falsifiable_if}
    problem = _assumption_problem(record)
    if problem is not None:
        raise InvariantViolation(f"MVP_INVALID_CRITICAL_ASSUMPTION: {problem}")
    return record


def decision_threshold(metric: str, target_value: float, comparison: str, decision_if_met: str, decision_if_not_met: str) -> dict[str, Any]:
    """One instance of ``typed-objects/mvp-record.schema.yaml#/properties/decision_threshold``."""
    record = {"metric": metric, "target_value": target_value, "comparison": comparison, "decision_if_met": decision_if_met, "decision_if_not_met": decision_if_not_met}
    problem = _threshold_problem(record)
    if problem is not None:
        # ``_threshold_problem`` checks the identical-arms invariant LAST -- tagging the code purely off
        # ``decision_if_met == decision_if_not_met`` (without confirming every earlier-checked field is
        # ALSO individually valid) would mislabel an unrelated failure (e.g. an empty ``metric``) as
        # MVP_THRESHOLD_NOT_DECISION_CHANGING whenever the arms happen to coincide too. Critic-caught
        # 2026-09-12 (F15 batch review), same bug class as this corpus's other conditional-error-code sites.
        other_fields_valid = (
            _is_nonempty_str(metric)
            and _is_finite_number(target_value)
            and comparison in _COMPARISONS
            and _is_nonempty_str(decision_if_met)
            and _is_nonempty_str(decision_if_not_met)
        )
        code = "MVP_THRESHOLD_NOT_DECISION_CHANGING" if other_fields_valid and decision_if_met == decision_if_not_met else "MVP_INVALID_THRESHOLD"
        raise InvariantViolation(f"{code}: {problem}")
    return record


def real_usage_result(actual_value: float, real_users_count: int, usage_context: str) -> dict[str, Any]:
    """One instance of ``typed-objects/mvp-record.schema.yaml#/properties/real_usage_result``."""
    record = {"actual_value": actual_value, "real_users_count": real_users_count, "usage_context": usage_context}
    problem = _usage_problem(record)
    if problem is not None:
        raise InvariantViolation(f"MVP_INVALID_REAL_USAGE_RESULT: {problem}")
    return record


def generate_mvp(
    record_id: str,
    critical_assumption_: dict[str, Any],
    decision_threshold_: dict[str, Any],
    real_usage_result_: dict[str, Any],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/mvp-record.schema.yaml``.

    Rebuilds ``critical_assumption``/``decision_threshold``/``real_usage_result`` via their own builders (never
    trusting the caller's raw dicts), then enforces the method contract's own real invariants fail-closed, in
    order: id/version/provenance shape, decision-changing threshold (via ``decision_threshold``'s own builder),
    and -- the invariant this method exists to enforce -- the ``outcome`` this function DERIVES (never accepted
    from the caller) mechanically recomputes ``metric_met``/``decision_taken`` from ``real_usage_result`` against
    ``decision_threshold``, so the returned record can never carry a narrative override of its own measurement.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"MVP_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"MVP_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("MVP_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    if not isinstance(critical_assumption_, dict):
        raise InvariantViolation(f"MVP_INVALID_CRITICAL_ASSUMPTION: critical_assumption must be a dict, got {critical_assumption_!r}")
    rebuilt_assumption = critical_assumption(critical_assumption_.get("statement"), critical_assumption_.get("falsifiable_if"))

    if not isinstance(decision_threshold_, dict):
        raise InvariantViolation(f"MVP_INVALID_THRESHOLD: decision_threshold must be a dict, got {decision_threshold_!r}")
    rebuilt_threshold = decision_threshold(
        decision_threshold_.get("metric"),
        decision_threshold_.get("target_value"),
        decision_threshold_.get("comparison"),
        decision_threshold_.get("decision_if_met"),
        decision_threshold_.get("decision_if_not_met"),
    )

    if not isinstance(real_usage_result_, dict):
        raise InvariantViolation(f"MVP_INVALID_REAL_USAGE_RESULT: real_usage_result must be a dict, got {real_usage_result_!r}")
    rebuilt_usage = real_usage_result(real_usage_result_.get("actual_value"), real_usage_result_.get("real_users_count"), real_usage_result_.get("usage_context"))

    metric_met = _compare(rebuilt_usage["actual_value"], rebuilt_threshold["target_value"], rebuilt_threshold["comparison"])
    decision_taken = rebuilt_threshold["decision_if_met"] if metric_met else rebuilt_threshold["decision_if_not_met"]
    outcome = {"metric_met": metric_met, "decision_taken": decision_taken}

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "critical_assumption": rebuilt_assumption,
        "decision_threshold": rebuilt_threshold,
        "real_usage_result": rebuilt_usage,
        "outcome": outcome,
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


def evaluate_decision_changing_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives the decision-changing-threshold invariant directly from raw fields using the SAME
    ``_threshold_problem`` predicate the builder uses -- without this the gate could pass a hand-tampered
    record whose two decision arms were made identical after construction."""
    if not isinstance(record, dict):
        return _result("decision_changing_threshold", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problem = _threshold_problem(record.get("decision_threshold"))
    return _result("decision_changing_threshold", problem is None, [{"problem": problem}], validator, timestamp)


def evaluate_decision_consistency_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives §12.29's own decision-follows-the-measurement rule directly from raw fields -- recomputes
    metric_met/decision_taken from real_usage_result against decision_threshold and compares against the
    record's own claimed outcome. Fails closed on malformed entries rather than crashing, and does NOT trust
    that the builder's own recomputation already ran (a hand-tampered outcome bypasses the builder entirely)."""
    if not isinstance(record, dict):
        return _result("decision_consistency", False, [{"reason": "record is not a dict"}], validator, timestamp)
    threshold = record.get("decision_threshold")
    usage = record.get("real_usage_result")
    outcome = record.get("outcome")
    problems: list[str] = []

    if _threshold_problem(threshold) is not None:
        problems.append("decision_threshold is missing or malformed")
    if _usage_problem(usage) is not None:
        problems.append("real_usage_result is missing or malformed")
    if _outcome_problem(outcome) is not None:
        problems.append("outcome is missing or malformed")

    if not problems:
        expected_metric_met = _compare(usage["actual_value"], threshold["target_value"], threshold["comparison"])
        expected_decision = threshold["decision_if_met"] if expected_metric_met else threshold["decision_if_not_met"]
        if outcome["metric_met"] != expected_metric_met:
            problems.append(f"outcome.metric_met={outcome['metric_met']!r} but recomputation gives {expected_metric_met!r}")
        if outcome["decision_taken"] != expected_decision:
            problems.append(f"outcome.decision_taken={outcome['decision_taken']!r} but the pre-registered rule dictates {expected_decision!r}")

    passed = not problems
    return _result("decision_consistency", passed, [{"problems": problems}], validator, timestamp)


def evaluate_mvp_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_decision_changing_gate(record, validator, timestamp),
        evaluate_decision_consistency_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
