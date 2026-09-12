"""``foresight.backcasting`` -- F13 foresight family (Atlas L668-685, this method's own row L683).

Atlas's own table row (L683, verbatim): "Backcasting | 從理想未來倒推 |
future state->milestones backward->today actions | 長期 roadmap" (work
backward from an ideal future state; long-term roadmap). No dedicated
Atlas section exists for this method (only the F13 table row itself) --
disclosed, same honesty-gap class every other table-row-only contract in
this corpus already flags.

Real invariant: Atlas's own pipeline is "future state -> milestones
backward -> today actions", i.e. the chain must actually REACH the present,
not merely gesture at a distant future. Enforced at TWO independent layers
via the ONE shared predicate ``_milestone_problem`` both ``milestone()`` and
``evaluate_milestone_chain_gate`` consult (same discipline
``epistemic.evidence_matrix``'s own ``_link_problem`` establishes):

  (a) ``milestones[]`` must be strictly ordered from the future state
      backwards toward today -- horizon values strictly DECREASING from the
      first milestone (nearest the future state) to the last (nearest
      today), with no duplicate or out-of-order horizon anywhere in the
      list. Horizon representation: a plain ordinal int (larger = further
      in the future, 0 implicitly reserved for "today" -- not itself a
      milestone; see ``today_actions`` below), NOT an ISO date string --
      disclosed compilation decision, see the contract's own
      ``compilation_decisions``. A non-int horizon (e.g. an ISO date mixed
      in) is a non-orderable value under this representation and is
      refused fail-closed (``BCAST_INVALID_HORIZON``), never crashed on via
      a raw ``<`` comparison between incompatible types.
  (b) At least one ``today_actions`` entry is required. A backcast that
      stops at a distant milestone and never lands on a present-day action
      is a wish, not a roadmap -- and that landing is this method's own
      entire stated output (長期 roadmap).

``horizon`` is guarded against the Python ``bool``-is-``int``-subclass trap
(``isinstance(True, int)`` is ``True``) this batch's brief flags, since it
is a genuine integer field, not a boolean one.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "foresight.backcasting"
RECORD_ID_PREFIX = "BCAST-"

_MILESTONE_KEYS = frozenset({"id", "description", "horizon"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_nonempty_str_list(value: Any) -> bool:
    return isinstance(value, list) and bool(value) and all(_is_nonempty_str(item) for item in value)


def _is_valid_horizon(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _milestone_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped milestone". Both ``milestone()`` (construction layer)
    and ``evaluate_milestone_chain_gate`` (independent re-derivation layer) consult it, so the two layers
    cannot drift apart. Returns None when valid (shape only -- cross-item chain ordering is checked separately,
    once, over the full declared, ordered list)."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _MILESTONE_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    missing = _MILESTONE_KEYS - value.keys()
    if missing:
        return f"missing key(s) {sorted(missing, key=repr)}"
    if not _is_nonempty_str(value.get("id")):
        return f"id must be a non-empty string, got {value.get('id')!r}"
    if not _is_nonempty_str(value.get("description")):
        return f"description must be a non-empty string, got {value.get('description')!r}"
    if not _is_valid_horizon(value.get("horizon")):
        return f"horizon must be an int ordinal (not bool, not a date string), got {value.get('horizon')!r}"
    return None


def milestone(milestone_id: str, description: str, horizon: int) -> dict[str, Any]:
    """One item of ``typed-objects/backcasting-plan.schema.yaml#/properties/milestones``. Does NOT itself check
    chain ordering against sibling milestones -- that cross-item check happens once, in
    ``generate_backcasting_plan``, after every milestone has been rebuilt (same division of labor
    ``evidence_matrix.link()``'s own docstring establishes for its own cross-field check)."""
    record = {"id": milestone_id, "description": description, "horizon": horizon}
    problem = _milestone_problem(record)
    if problem is not None:
        raise InvariantViolation(f"BCAST_INVALID_MILESTONE: {problem}")
    return record


def generate_backcasting_plan(
    record_id: str,
    future_state: str,
    milestones: list[dict[str, Any]],
    today_actions: list[str],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/backcasting-plan.schema.yaml``.

    Rebuilds every milestone via ``milestone()`` (never trusting the caller's raw dicts), then enforces the
    method's own real invariant fail-closed, in order: >=1 milestone declared, no duplicate milestone id,
    milestone horizons strictly decreasing in the order given (future state backward to today, no duplicate or
    out-of-order horizon), and >=1 ``today_actions`` entry -- BEFORE returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"BCAST_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"BCAST_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("BCAST_INVALID_PROVENANCE: provenance must be a valid provenance_record")
    if not _is_nonempty_str(future_state):
        raise InvariantViolation(f"BCAST_INVALID_FUTURE_STATE: future_state must be a non-empty string, got {future_state!r}")

    if not isinstance(milestones, list) or not milestones:
        raise InvariantViolation("BCAST_NO_MILESTONES: at least one milestone is required -- Atlas's own pipeline is 'future state->milestones backward->today actions'")
    rebuilt_milestones: list[dict[str, Any]] = []
    for i, m in enumerate(milestones):
        problem = _milestone_problem(m)
        if problem is not None:
            raise InvariantViolation(f"BCAST_INVALID_MILESTONE: milestones[{i}]: {problem}")
        rebuilt_milestones.append(dict(m))

    ids = [m["id"] for m in rebuilt_milestones]
    duplicate_ids = sorted({mid for mid in ids if ids.count(mid) > 1})
    if duplicate_ids:
        raise InvariantViolation(f"BCAST_DUPLICATE_MILESTONE_ID: milestone id(s) {duplicate_ids} used more than once")

    for i in range(len(rebuilt_milestones) - 1):
        current, following = rebuilt_milestones[i], rebuilt_milestones[i + 1]
        if current["horizon"] <= following["horizon"]:
            raise InvariantViolation(
                f"BCAST_MILESTONES_OUT_OF_ORDER: milestones[{i}] ({current['id']!r}, horizon={current['horizon']}) must have a "
                f"strictly greater horizon than milestones[{i + 1}] ({following['id']!r}, horizon={following['horizon']}) -- "
                "the chain must run strictly backward from the future state toward today, no duplicate or out-of-order horizon"
            )

    if not _is_nonempty_str_list(today_actions):
        raise InvariantViolation(
            f"BCAST_NO_TODAY_ACTIONS: at least one today_actions entry is required -- a backcast that never lands "
            f"on a present-day action is a wish, not a roadmap, got {today_actions!r}"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "future_state": future_state,
        "milestones": rebuilt_milestones,
        "today_actions": list(today_actions),
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


def evaluate_milestone_chain_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives invariant (a) directly from raw fields, via the SAME ``_milestone_problem`` predicate
    ``milestone()`` uses -- not just trusting that ``generate_backcasting_plan``'s own construction-time check
    already ran. Fails closed on malformed top-level input, malformed milestone entries, duplicate ids, and
    out-of-order/duplicate horizons, rather than crashing (a bare ``<=`` comparison across a non-int horizon
    would raise TypeError -- only well-shaped, already-int-checked entries are compared)."""
    if not isinstance(record, dict):
        return _result("milestone_chain", False, [{"reason": "record is not a dict"}], validator, timestamp)
    milestones = record.get("milestones")
    if not isinstance(milestones, list) or not milestones:
        return _result("milestone_chain", False, [{"reason": "milestones must be a non-empty list"}], validator, timestamp)

    problems: list[str] = []
    malformed = [f"milestones[{i}]: {problem}" for i, problem in ((i, _milestone_problem(m)) for i, m in enumerate(milestones)) if problem]
    problems.extend(malformed)
    well_shaped = [m for m in milestones if _milestone_problem(m) is None]

    ids = [m["id"] for m in well_shaped]
    duplicate_ids = sorted({mid for mid in ids if ids.count(mid) > 1}, key=repr)
    if duplicate_ids:
        problems.append(f"duplicate milestone id(s): {duplicate_ids}")

    # Ordering is only checkable across the well-shaped, contiguous, ORIGINAL-position subsequence -- a
    # malformed entry already reported above must not also be silently skipped over in the ordering check
    # (that would hide an out-of-order pair straddling the malformed entry). Ordering is checked only when
    # every declared milestone is well-shaped, same "don't compound a defect into a false pass" posture the
    # duplicate-pair check above already takes.
    if not malformed:
        for i in range(len(well_shaped) - 1):
            if well_shaped[i]["horizon"] <= well_shaped[i + 1]["horizon"]:
                problems.append(
                    f"milestones[{i}] ({well_shaped[i]['id']!r}, horizon={well_shaped[i]['horizon']}) is not strictly "
                    f"greater than milestones[{i + 1}] ({well_shaped[i + 1]['id']!r}, horizon={well_shaped[i + 1]['horizon']})"
                )

    passed = not problems
    return _result("milestone_chain", passed, [{"milestones_checked": len(milestones), "problems": problems}], validator, timestamp)


def evaluate_lands_on_today_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives invariant (b) directly from raw fields -- the method's own entire stated output (長期
    roadmap) is exactly this landing on >=1 present-day action. Fails closed on malformed entries."""
    if not isinstance(record, dict):
        return _result("lands_on_today", False, [{"reason": "record is not a dict"}], validator, timestamp)
    today_actions = record.get("today_actions")
    passed = _is_nonempty_str_list(today_actions)
    return _result("lands_on_today", passed, [{"today_actions": today_actions if isinstance(today_actions, list) else None}], validator, timestamp)


def evaluate_backcasting_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_milestone_chain_gate(record, validator, timestamp),
        evaluate_lands_on_today_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
