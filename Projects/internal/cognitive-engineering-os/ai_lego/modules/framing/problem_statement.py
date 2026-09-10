"""``framing.problem_statement`` -- F01 framing family, Atlas F01 table row L341: "描述現況、差距、影響｜跨人協作｜
Current→Expected→Gap→Impact→Constraints｜建立共同問題定義｜Issue Tree". 4th F01 member built
(methods/contracts/framing.problem_statement.contract.yaml).

REUSES the existing ``typed-objects/problem-statement.schema.yaml`` verbatim as ``outputs`` -- no second schema
minted. That file already models ``ProblemStatement`` as the real chain-origin type (its own description:
"ProblemStatement -> Fishbone -> CauseHypothesisSet -> ..."), already ``inputs.required: [ProblemStatement]``
for 5 sibling contracts (root_cause.event_tree/fault_tree/kepner_tregoe, decision.decision_tree,
root_cause.change_analysis) plus a status-only precondition for root_cause.fishbone -- but grep-confirmed no
existing contract had ``outputs: [ProblemStatement]`` before this one. This module is F01's first real producer.

Pre-existing, thinner, ungated duplicate found: ``ai_lego/modules/root_cause/fishbone.py::build_problem_statement``
is a plain dict constructor Fishbone's own tests use to build fixture inputs -- enforces nothing (an empty
current_state passes silently). Left untouched (different family, out of this module's ownership); this module
is the real, gated, canonical implementation (see the method contract's own OQ-PROBLEMSTATEMENT-1).

Two real invariants, both enforced at construction AND re-derived independently by a gate (same two-layer
discipline every sibling module in this package uses): (1) id/version/status/content.current_state/
expected_state/gap all present and valid; (2) content.expected_state must genuinely differ from
content.current_state (case/whitespace-insensitive) -- an identical pair means no real gap, same "echo"
invariant class framing.goal_statement's own success_condition != goal check already establishes.

Schema fix alongside this build: problem-statement.schema.yaml was missing additionalProperties:false (same gap
class critic review already found and fixed in 2 sibling schemas) and minLength on its 3 required content
strings (an empty current_state/expected_state/gap was schema-legal). Both closed in that file directly -- see
its own verification.note.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "framing.problem_statement"
RECORD_ID_PREFIX = "PROB-"
STATUS_ENUM = ("draft", "under_review", "validated", "rejected", "superseded")


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _normalize(value: str) -> str:
    """Case/whitespace-insensitive comparison key -- same helper role as framing.goal_statement's own
    ``_normalize``, reused for the identical echo-invariant purpose (see module docstring)."""
    return " ".join(value.strip().casefold().split())


def _optional_str_list(value: Any) -> bool:
    """None (absent) or a list of str items -- matches the schema's own permissive shape (no minItems/item
    minLength on affected_stakeholders/evidence/constraints), not an invented stricter rule."""
    return value is None or (isinstance(value, list) and all(isinstance(v, str) for v in value))


def _content_is_complete(current_state: Any, expected_state: Any, gap: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from
    the other -- same discipline framing.goal_statement's own ``_fields_are_complete`` establishes."""
    if not _is_nonempty_str(current_state):
        return False, "EMPTY_CURRENT_STATE"
    if not _is_nonempty_str(expected_state):
        return False, "EMPTY_EXPECTED_STATE"
    if not _is_nonempty_str(gap):
        return False, "EMPTY_GAP"
    return True, None


def generate_problem_statement(
    problem_id: str,
    current_state: str,
    expected_state: str,
    gap: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    status: str = "draft",
    affected_stakeholders: list[str] | None = None,
    impact: str | None = None,
    evidence: list[str] | None = None,
    constraints: list[str] | None = None,
    scope_non_goals: str | None = None,
    origin_method: str | None = None,
) -> dict[str, Any]:
    """Instance of ``typed-objects/problem-statement.schema.yaml``. Enforces both real invariants fail-closed --
    never a record that itself proves it was built illegally, same family-wide "raise-before-construction"
    discipline every sibling module in this package already establishes."""
    if not _is_nonempty_str(problem_id) or not problem_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"PROBLEMSTATEMENT_INVALID_ID: problem_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {problem_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"PROBLEMSTATEMENT_INVALID_VERSION: version must be a string, got {version!r}")
    if status not in STATUS_ENUM:
        raise InvariantViolation(f"PROBLEMSTATEMENT_INVALID_STATUS: status must be one of {STATUS_ENUM}, got {status!r}")

    complete, reason = _content_is_complete(current_state, expected_state, gap)
    if not complete:
        if reason == "EMPTY_CURRENT_STATE":
            raise InvariantViolation(f"PROBLEMSTATEMENT_EMPTY_CURRENT_STATE: current_state must be a non-empty string, got {current_state!r}")
        if reason == "EMPTY_EXPECTED_STATE":
            raise InvariantViolation(f"PROBLEMSTATEMENT_EMPTY_EXPECTED_STATE: expected_state must be a non-empty string, got {expected_state!r}")
        raise InvariantViolation(f"PROBLEMSTATEMENT_EMPTY_GAP: gap must be a non-empty string, got {gap!r}")

    if _normalize(expected_state) == _normalize(current_state):
        raise InvariantViolation(
            f"PROBLEMSTATEMENT_EXPECTED_ECHOES_CURRENT: expected_state must genuinely differ from current_state (case/whitespace-insensitive), "
            f"got current_state={current_state!r} expected_state={expected_state!r}"
        )
    if not _optional_str_list(affected_stakeholders):
        raise InvariantViolation(f"PROBLEMSTATEMENT_INVALID_AFFECTED_STAKEHOLDERS: affected_stakeholders must be a list of strings or None, got {affected_stakeholders!r}")
    if impact is not None and not isinstance(impact, str):
        raise InvariantViolation(f"PROBLEMSTATEMENT_INVALID_IMPACT: impact must be a string or None, got {impact!r}")
    if not _optional_str_list(evidence):
        raise InvariantViolation(f"PROBLEMSTATEMENT_INVALID_EVIDENCE: evidence must be a list of strings or None, got {evidence!r}")
    if not _optional_str_list(constraints):
        raise InvariantViolation(f"PROBLEMSTATEMENT_INVALID_CONSTRAINTS: constraints must be a list of strings or None, got {constraints!r}")
    if scope_non_goals is not None and not isinstance(scope_non_goals, str):
        raise InvariantViolation(f"PROBLEMSTATEMENT_INVALID_SCOPE_NON_GOALS: scope_non_goals must be a string or None, got {scope_non_goals!r}")
    if origin_method is not None and not _is_nonempty_str(origin_method):
        raise InvariantViolation(f"PROBLEMSTATEMENT_INVALID_ORIGIN_METHOD: origin_method must be a non-empty string or None, got {origin_method!r}")

    content: dict[str, Any] = {"current_state": current_state, "expected_state": expected_state, "gap": gap}
    if affected_stakeholders is not None:
        content["affected_stakeholders"] = list(affected_stakeholders)
    if impact is not None:
        content["impact"] = impact
    if evidence is not None:
        content["evidence"] = list(evidence)
    if constraints is not None:
        content["constraints"] = list(constraints)
    if scope_non_goals is not None:
        content["scope_non_goals"] = scope_non_goals

    record: dict[str, Any] = {"id": problem_id, "version": version, "status": status, "content": content, "provenance": provenance}
    if origin_method is not None:
        record["origin_method"] = origin_method
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance_record is schema-valid.
    Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"record_provenance_valid": passed}], validator, timestamp)


def evaluate_problem_statement_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives both real invariants from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_problem_statement``, so a hand-tampered record that bypassed the builder entirely
    is caught here exactly as a builder-refused one would have been. Fails closed on malformed input."""
    if not isinstance(record, dict):
        return _result("problem_statement_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("problem_statement_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("problem_statement_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if record.get("status") not in STATUS_ENUM:
        return _result("problem_statement_integrity", False, [{"reason": f"status missing or not one of {STATUS_ENUM}"}], validator, timestamp)

    content = record.get("content")
    if not isinstance(content, dict):
        return _result("problem_statement_integrity", False, [{"reason": "content missing or not a dict"}], validator, timestamp)

    complete, reason = _content_is_complete(content.get("current_state"), content.get("expected_state"), content.get("gap"))
    if not complete:
        return _result("problem_statement_integrity", False, [{"reason": f"content field invalid ({reason})"}], validator, timestamp)

    if _normalize(content["expected_state"]) == _normalize(content["current_state"]):
        return _result("problem_statement_integrity", False, [{"reason": "EXPECTED_ECHOES_CURRENT"}], validator, timestamp)

    for field_name in ("affected_stakeholders", "evidence", "constraints"):
        if field_name in content and not _optional_str_list(content.get(field_name)):
            return _result("problem_statement_integrity", False, [{"reason": f"{field_name} present but not a list of strings"}], validator, timestamp)
    for field_name in ("impact", "scope_non_goals"):
        if field_name in content and not isinstance(content.get(field_name), str):
            return _result("problem_statement_integrity", False, [{"reason": f"{field_name} present but not a string"}], validator, timestamp)

    ref = record.get("origin_method")
    if ref is not None and not _is_nonempty_str(ref):
        return _result("problem_statement_integrity", False, [{"reason": "origin_method present but not a non-empty string"}], validator, timestamp)

    return _result(
        "problem_statement_integrity",
        True,
        [{"status": record["status"], "has_impact": "impact" in content}],
        validator,
        timestamp,
    )


def evaluate_problem_statement_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_problem_statement_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
