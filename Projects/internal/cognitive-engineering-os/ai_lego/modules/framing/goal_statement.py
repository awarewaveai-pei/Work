"""``framing.goal_statement`` -- F01 "Goal & Problem Framing" family (Atlas F01 table row,
AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:334), first member of this family to get a real
contract (all 11 F01 rows carried has_contract:false in method-inventory.yaml:206-261 before this slice).
Atlas's ONLY citation is that one table row: "把模糊願望轉明確目標｜任務起始｜目標→受益者→時間→成功條件→限制｜
降低 scope 漂移｜Success Criteria、Decision Question" -- grep-confirmed no dedicated F01 section beyond the
table itself.

**Shape, due-diligence finding (real determination, not copied from the wrong sibling):** the 5-field
citation "目標→受益者→時間→成功條件→限制" is FIVE DIFFERENTLY-SHAPED named fields (string / list / string /
string / list), not a positionally-ordered array of SAME-shaped entries the way
``root_cause.kepner_tregoe``'s own 2x4 WHAT/WHERE/WHEN/EXTENT grid is -- modeled as a flat record, the same
shape class ``specs/cognitive/typed-objects/problem-statement.schema.yaml``'s own 8-field ``content`` object
already uses, not Kepner-Tregoe's ``dimensions[]`` array. The "→" arrows are a natural authoring/reading
sequence, not a re-orderable-and-checkable invariant -- so, unlike ``DIMENSION_ORDER``, this module defines
no positional-order constant.

**success_condition vs. learning.kill_criteria/learning.reversal_criteria (real determination, not assumed
from name similarity):** read both files in full before writing this module. Both pre-commit some notion of
"what success/stop looks like," but at a different STAGE and for a different PURPOSE: kill_criteria/
reversal_criteria are ONGOING MONITORING RULES (threshold + owner + action) re-evaluated over time against
an already-in-flight decision, specifically to block sunk-cost/motivated-reasoning bias mid-course.
``success_condition`` here is a STATIC description fixed once, at INITIAL goal framing, before any decision
or execution has begun -- Atlas's own benefit column for this row ("降低 scope 漂移", reduce scope drift) is
about preventing drift from an ambiguous START, not about monitoring an ongoing commitment. Genuinely
different concept, not a naming accident -- and Atlas's own best-paired column (L334) independently
corroborates this by naming a SEPARATE, unbuilt F01 sibling method ("Success Criteria",
Must/Should/Guardrail/Stop) as the fuller elaboration of this same field, not kill_criteria/reversal_criteria.

**"Decision Question" (Atlas's other best-paired citation, L334) -- due-diligence correction:** unlike
Success Criteria (a real F01 tool-table row, just unbuilt), "Decision Question" has NO tool-table row and NO
method-inventory.yaml entry anywhere (grep-confirmed, 4 total hits in the whole Atlas: L354's own F01
flowchart box, plus 3 unrelated recipe-chain starting labels at L3294/L3494/L3670). It is not a catalogued
method this or any future session could mint a contract for under that name -- disclosed here rather than
silently treated as equivalent to Success Criteria's real-but-unbuilt status. See the method contract's own
OQ-GOALSTATEMENT-2.

Two real invariants, each enforced BOTH at construction (raise BEFORE any record is built) AND
independently by a gate that re-derives from raw fields, same "shared predicate, reused by both layers"
discipline every sibling module in this package already establishes:

1. Every one of the 5 required fields must be present and genuinely non-empty (goal/timeframe/
   success_condition as non-blank strings; beneficiaries/constraints as non-empty lists of non-blank
   strings) -- an unfilled field is exactly the kind of vague wish this method exists to eliminate (Atlas's
   own benefit line, "降低 scope 漂移", presumes every field actually says something).
2. ``success_condition`` must genuinely differ from ``goal`` (case/whitespace-insensitive compare) -- an
   identical pair is an echo, not a checkable condition; same "identical pair is a no-op, not a comparison"
   invariant class ``root_cause.kepner_tregoe``'s own IS/IS-NOT check already establishes for this suite.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "framing.goal_statement"
RECORD_ID_PREFIX = "GOAL-"


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _normalize(value: str) -> str:
    """Case/whitespace-insensitive comparison key -- same helper role as root_cause.kepner_tregoe's own
    ``_normalize``, reused for the identical purpose (see module docstring, Invariant #2)."""
    return " ".join(value.strip().casefold().split())


def _nonempty_str_list(value: Any) -> bool:
    return isinstance(value, list) and bool(value) and all(_is_nonempty_str(v) for v in value)


def _fields_are_complete(goal: Any, beneficiaries: Any, timeframe: Any, success_condition: Any, constraints: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from
    the other -- same discipline root_cause.kepner_tregoe's own ``_dimensions_are_valid`` establishes."""
    if not _is_nonempty_str(goal):
        return False, "EMPTY_GOAL"
    if not _nonempty_str_list(beneficiaries):
        return False, "EMPTY_BENEFICIARIES"
    if not _is_nonempty_str(timeframe):
        return False, "EMPTY_TIMEFRAME"
    if not _is_nonempty_str(success_condition):
        return False, "EMPTY_SUCCESS_CONDITION"
    if not _nonempty_str_list(constraints):
        return False, "EMPTY_CONSTRAINTS"
    return True, None


def generate_goal_statement(
    goal_id: str,
    goal: str,
    beneficiaries: list[str],
    timeframe: str,
    success_condition: str,
    constraints: list[str],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
    success_criteria_ref: str | None = None,
) -> dict[str, Any]:
    """Instance of ``typed-objects/goal-statement-record.schema.yaml``. Enforces both real invariants
    fail-closed -- never a record that itself proves it was built illegally, same family-wide
    "raise-before-construction" discipline every sibling module in this package already establishes."""
    if not _is_nonempty_str(goal_id) or not goal_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"GOALSTATEMENT_INVALID_ID: goal_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {goal_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"GOALSTATEMENT_INVALID_VERSION: version must be a string, got {version!r}")

    complete, reason = _fields_are_complete(goal, beneficiaries, timeframe, success_condition, constraints)
    if not complete:
        if reason == "EMPTY_GOAL":
            raise InvariantViolation(f"GOALSTATEMENT_EMPTY_GOAL: goal must be a non-empty string, got {goal!r}")
        if reason == "EMPTY_BENEFICIARIES":
            raise InvariantViolation(f"GOALSTATEMENT_EMPTY_BENEFICIARIES: beneficiaries must be a non-empty list of non-empty strings, got {beneficiaries!r}")
        if reason == "EMPTY_TIMEFRAME":
            raise InvariantViolation(f"GOALSTATEMENT_EMPTY_TIMEFRAME: timeframe must be a non-empty string, got {timeframe!r}")
        if reason == "EMPTY_SUCCESS_CONDITION":
            raise InvariantViolation(f"GOALSTATEMENT_EMPTY_SUCCESS_CONDITION: success_condition must be a non-empty string, got {success_condition!r}")
        raise InvariantViolation(f"GOALSTATEMENT_EMPTY_CONSTRAINTS: constraints must be a non-empty list of non-empty strings, got {constraints!r}")

    if _normalize(success_condition) == _normalize(goal):
        raise InvariantViolation(
            f"GOALSTATEMENT_SUCCESS_ECHOES_GOAL: success_condition must genuinely differ from goal (case/whitespace-insensitive), "
            f"got goal={goal!r} success_condition={success_condition!r}"
        )
    if success_criteria_ref is not None and not _is_nonempty_str(success_criteria_ref):
        raise InvariantViolation(f"GOALSTATEMENT_INVALID_SUCCESS_CRITERIA_REF: success_criteria_ref must be a non-empty string or None, got {success_criteria_ref!r}")

    record: dict[str, Any] = {
        "id": goal_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "goal": goal,
        "beneficiaries": list(beneficiaries),
        "timeframe": timeframe,
        "success_condition": success_condition,
        "constraints": list(constraints),
        "provenance": provenance,
    }
    if success_criteria_ref is not None:
        record["success_criteria_ref"] = success_criteria_ref
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


def evaluate_goal_statement_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored value
    and does NOT call ``generate_goal_statement``, so a hand-tampered record that bypassed the builder
    entirely is caught here exactly as a builder-refused one would have been. Fails closed on malformed
    input rather than crashing."""
    if not isinstance(record, dict):
        return _result("goal_statement_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("goal_statement_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("goal_statement_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    complete, reason = _fields_are_complete(
        record.get("goal"), record.get("beneficiaries"), record.get("timeframe"), record.get("success_condition"), record.get("constraints")
    )
    if not complete:
        return _result("goal_statement_integrity", False, [{"reason": f"required field invalid ({reason})"}], validator, timestamp)

    success_condition = record["success_condition"]
    goal = record["goal"]
    if _normalize(success_condition) == _normalize(goal):
        return _result("goal_statement_integrity", False, [{"reason": "SUCCESS_ECHOES_GOAL"}], validator, timestamp)

    ref = record.get("success_criteria_ref")
    if ref is not None and not _is_nonempty_str(ref):
        return _result("goal_statement_integrity", False, [{"reason": "success_criteria_ref present but not a non-empty string"}], validator, timestamp)

    return _result(
        "goal_statement_integrity",
        True,
        [{"beneficiary_count": len(record["beneficiaries"]), "constraint_count": len(record["constraints"])}],
        validator,
        timestamp,
    )


def evaluate_goal_statement_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_goal_statement_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
