"""``experiment.pilot`` -- F15 experiment & validation family (Atlas L734-753).

Atlas's own table row (L747, verbatim): "Pilot | 小規模真實試行 | limited
scope->criteria->monitor->review | 降 rollout 爆炸半徑" (small-scope real-world
trial; reduces the rollout blast radius). Atlas's own dedicated section §12.31
(L2945-2953) adds an explicit 強制 (MANDATORY) rule, verbatim: "Pilot 開始前
定義 Success / Stop / Rollback criteria" (Success/Stop/Rollback criteria MUST
be defined before the pilot starts).

Real invariants, enforced at TWO independent layers, same belt-and-
suspenders discipline every prior slice in this corpus establishes:

1. **THE CRITERIA MANDATE, the real invariant this method exists to enforce**
   (``PILOT_CRITERIA_MANDATE_VIOLATION``) -- Atlas §12.31's own 強制 word made
   structural: ``success_criteria``, ``stop_criteria``, and
   ``rollback_criteria`` must each be a non-empty list of non-empty strings.
   A Pilot record cannot be constructed at all unless all three are declared
   -- this is deliberately NOT diluted to "recommended".
2. **Scope/monitoring/review shape** (``PILOT_INVALID_SCOPE`` /
   ``PILOT_INVALID_MONITORING_METRICS`` / ``PILOT_INCONSISTENT_REVIEW``) --
   the other 3 pipeline stages (limited scope, monitor, review) are
   well-formed, and a review cannot claim ``conducted: true`` without a
   ``verdict`` and non-empty ``notes``.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for
"experiment.pilot"/"pilot-record"/"PilotRecord"/"success criteria"/"stop
criteria"/"rollback criteria" before writing any of this method's own files:
zero pre-existing implementation or schema title overlap.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "experiment.pilot"
RECORD_ID_PREFIX = "PILOT-"
_SCOPE_KEYS = frozenset({"description", "boundaries"})
_REVIEW_KEYS = frozenset({"conducted", "verdict", "notes"})
_REVIEW_VERDICTS = frozenset({"CONTINUE", "STOP", "ROLLBACK", "EXPAND"})
_CRITERIA_FIELDS = ("success_criteria", "stop_criteria", "rollback_criteria")


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _nonempty_string_list_problem(value: Any, *, min_items: int = 1) -> str | None:
    """The single definition of "is this a well-shaped non-empty string list". Shared by
    ``success_criteria``/``stop_criteria``/``rollback_criteria``/``scope.boundaries``/
    ``monitoring_metrics`` -- both the builder and the gates consult it, same single-shared-
    predicate discipline ``foresight.cross_impact_analysis``'s own ``_event_problem`` establishes."""
    if not isinstance(value, list):
        return f"must be a list, got {type(value).__name__}"
    if len(value) < min_items:
        return f"must have at least {min_items} item(s), got {len(value)}"
    bad = [item for item in value if not _is_nonempty_str(item)]
    if bad:
        return f"every item must be a non-empty string, found {bad!r}"
    return None


def _scope_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped scope object" -- consulted by both the
    builder and the gate."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _SCOPE_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _SCOPE_KEYS <= value.keys():
        return f"missing key(s) {sorted(_SCOPE_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("description")):
        return f"description must be a non-empty string, got {value.get('description')!r}"
    boundaries_problem = _nonempty_string_list_problem(value.get("boundaries"))
    if boundaries_problem is not None:
        return f"boundaries: {boundaries_problem}"
    return None


def _review_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped, internally consistent review object" --
    ``conducted: true`` requires a real ``verdict`` and non-empty ``notes`` (a review cannot claim
    it was conducted with nothing to show for it). Consulted by both the builder and the gate."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _REVIEW_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if "conducted" not in value:
        return "missing key 'conducted'"
    conducted = value.get("conducted")
    if not isinstance(conducted, bool):
        return f"conducted must be a bool, got {conducted!r}"
    if conducted:
        verdict = value.get("verdict")
        if verdict not in _REVIEW_VERDICTS:
            return f"conducted=true requires verdict to be one of {sorted(_REVIEW_VERDICTS)}, got {verdict!r}"
        if not _is_nonempty_str(value.get("notes")):
            return f"conducted=true requires non-empty notes, got {value.get('notes')!r}"
    else:
        if "verdict" in value and value.get("verdict") not in _REVIEW_VERDICTS:
            return f"verdict, if present, must be one of {sorted(_REVIEW_VERDICTS)}, got {value.get('verdict')!r}"
        if "notes" in value and not isinstance(value.get("notes"), str):
            return f"notes, if present, must be a string, got {value.get('notes')!r}"
    return None


def _criteria_mandate_problems(
    success_criteria: Any, stop_criteria: Any, rollback_criteria: Any
) -> dict[str, str]:
    """THE shared predicate for Atlas §12.31's own 強制 mandate -- consulted by both the builder
    and the dedicated ``criteria_mandate`` gate, never re-derived differently in two places."""
    problems: dict[str, str] = {}
    for name, value in zip(_CRITERIA_FIELDS, (success_criteria, stop_criteria, rollback_criteria)):
        problem = _nonempty_string_list_problem(value)
        if problem is not None:
            problems[name] = problem
    return problems


def generate_pilot(
    record_id: str,
    scope: dict[str, Any],
    success_criteria: list[str],
    stop_criteria: list[str],
    rollback_criteria: list[str],
    monitoring_metrics: list[str],
    provenance: dict[str, Any],
    *,
    review: dict[str, Any] | None = None,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/pilot-record.schema.yaml``.

    Enforces the method contract's own real invariants fail-closed, in order: id/version/
    provenance shape, scope well-formed -- THE MANDATE (success_criteria/stop_criteria/
    rollback_criteria each a non-empty list of non-empty strings, Atlas §12.31's own 強制 word) --
    monitoring_metrics well-formed, and (if supplied) review internally consistent -- BEFORE
    returning. ``review`` is OPTIONAL: omitting it means the pilot has not yet been reviewed.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"PILOT_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"PILOT_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("PILOT_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    scope_problem = _scope_problem(scope)
    if scope_problem is not None:
        raise InvariantViolation(f"PILOT_INVALID_SCOPE: {scope_problem}")

    # THE MANDATE. Atlas §12.31: "Pilot 開始前定義 Success / Stop / Rollback criteria" -- 強制.
    criteria_problems = _criteria_mandate_problems(success_criteria, stop_criteria, rollback_criteria)
    if criteria_problems:
        raise InvariantViolation(
            "PILOT_CRITERIA_MANDATE_VIOLATION: Atlas §12.31's own 強制 (MANDATORY) rule requires "
            f"success_criteria, stop_criteria, AND rollback_criteria before a pilot can be defined; "
            f"problem(s): {criteria_problems}"
        )

    monitoring_problem = _nonempty_string_list_problem(monitoring_metrics)
    if monitoring_problem is not None:
        raise InvariantViolation(f"PILOT_INVALID_MONITORING_METRICS: {monitoring_problem}")

    rebuilt_review: dict[str, Any] | None = None
    if review is not None:
        review_problem = _review_problem(review)
        if review_problem is not None:
            raise InvariantViolation(f"PILOT_INCONSISTENT_REVIEW: {review_problem}")
        rebuilt_review = copy.deepcopy(review)

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "scope": copy.deepcopy(scope),
        "success_criteria": list(success_criteria),
        "stop_criteria": list(stop_criteria),
        "rollback_criteria": list(rollback_criteria),
        "monitoring_metrics": list(monitoring_metrics),
        "provenance": copy.deepcopy(provenance),
    }
    if rebuilt_review is not None:
        record["review"] = rebuilt_review
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record carries a schema-valid provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_structural_shape_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives scope/monitoring_metrics/review shape directly from raw fields using the SAME
    ``_scope_problem``/``_nonempty_string_list_problem``/``_review_problem`` predicates the builder
    uses -- without this the gate could pass records the builder refuses. Fails closed on malformed
    entries rather than crashing. Does NOT re-check the criteria mandate -- that is
    ``evaluate_criteria_mandate_gate``'s own, dedicated job."""
    if not isinstance(record, dict):
        return _result("structural_shape", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems: list[str] = []

    scope_problem = _scope_problem(record.get("scope"))
    if scope_problem is not None:
        problems.append(f"scope: {scope_problem}")

    monitoring_problem = _nonempty_string_list_problem(record.get("monitoring_metrics"))
    if monitoring_problem is not None:
        problems.append(f"monitoring_metrics: {monitoring_problem}")

    if "review" in record:
        review_problem = _review_problem(record.get("review"))
        if review_problem is not None:
            problems.append(f"review: {review_problem}")

    passed = not problems
    return _result("structural_shape", passed, [{"problems": problems}], validator, timestamp)


def evaluate_criteria_mandate_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas §12.31's own 強制 (MANDATORY) rule directly from raw fields -- THE real
    invariant this method exists to enforce. Does NOT assume the builder already ran; a hand-
    tampered record with an emptied or removed criteria field is caught here independently."""
    if not isinstance(record, dict):
        return _result("criteria_mandate", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems = _criteria_mandate_problems(
        record.get("success_criteria"), record.get("stop_criteria"), record.get("rollback_criteria")
    )
    passed = not problems
    return _result("criteria_mandate", passed, [{"problems": problems}], validator, timestamp)


def evaluate_pilot_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_structural_shape_gate(record, validator, timestamp),
        evaluate_criteria_mandate_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
