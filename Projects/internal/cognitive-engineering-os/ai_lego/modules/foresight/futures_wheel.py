"""``foresight.futures_wheel`` -- F13 foresight family (Atlas L668-685, this method's own row L682).

Atlas's own table row (L682, verbatim): "Futures Wheel | 展開 1/2/3 階影響 |
center event->direct->indirect->structural | 強制 second/third-order" (expand
a change into 1st/2nd/3rd-order effects; force second/third-order thinking).
Atlas gives this method a dedicated section, §11.28 (L1837-1860), whose own
mermaid graph (L1842-1851) fans one center event out to three order-1 nodes,
each of which fans out to its own order-2 node -- a literal tree, not a flat
tagged list.

Real invariant (structural order-parent consistency, enforced at TWO
independent layers via the ONE shared predicate ``_impact_problem`` both
``impact()`` and ``evaluate_order_parent_consistency_gate`` consult, same
discipline ``epistemic.evidence_matrix``'s own ``_link_problem`` and
``foresight.scenario_planning``'s own ``_scenario_problem`` establish):

  * An order-1 impact's ``parent_id`` must equal ``CENTER_EVENT_PARENT_ID``
    (this module's own reserved sentinel for "the center event", since
    ``center_event`` is a bare description string with no id of its own --
    disclosed compilation decision, see the contract's own
    ``compilation_decisions``).
  * An order-N impact (N in {2, 3}) must have a ``parent_id`` resolving to a
    DECLARED impact of order exactly N-1 -- no orphans, no skipped orders.
  * Impact ids must be unique. Because every order-N (N>1) parent reference
    must resolve to a strictly shallower order and ids are unique, a cycle
    (an impact being its own ancestor) is structurally impossible by
    construction, not merely discouraged -- no separate cycle-detection pass
    is needed.
  * At least one order-1 impact is required (Atlas's own fan-out, L1844-1847)
    -- a wheel with a center and nothing around it is not a wheel.

``order`` is a closed 3-value int enum {1, 2, 3} -- guarded against the
Python ``bool``-is-``int``-subclass trap (``isinstance(True, int)`` is
``True``) this batch's brief flags, since ``order`` is a genuine integer
field, not a boolean one.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "foresight.futures_wheel"
RECORD_ID_PREFIX = "FWHEEL-"
CENTER_EVENT_PARENT_ID = "CENTER"
VALID_ORDERS = frozenset({1, 2, 3})

_IMPACT_KEYS = frozenset({"id", "order", "parent_id", "description"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_valid_order(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value in VALID_ORDERS


def _impact_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped impact". Both ``impact()`` (construction layer) and
    ``evaluate_order_parent_consistency_gate`` (independent re-derivation layer) consult it, so the two layers
    cannot drift apart. Returns None when valid (shape only -- cross-item parent/order linkage is checked
    separately, once, over the full declared set)."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _IMPACT_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    missing = _IMPACT_KEYS - value.keys()
    if missing:
        return f"missing key(s) {sorted(missing, key=repr)}"
    if not _is_nonempty_str(value.get("id")):
        return f"id must be a non-empty string, got {value.get('id')!r}"
    if not _is_valid_order(value.get("order")):
        return f"order must be an int in {sorted(VALID_ORDERS)} (not bool), got {value.get('order')!r}"
    if not _is_nonempty_str(value.get("parent_id")):
        return f"parent_id must be a non-empty string, got {value.get('parent_id')!r}"
    if not _is_nonempty_str(value.get("description")):
        return f"description must be a non-empty string, got {value.get('description')!r}"
    return None


def impact(impact_id: str, order: int, parent_id: str, description: str) -> dict[str, Any]:
    """One item of ``typed-objects/futures-wheel.schema.yaml#/properties/impacts``. Does NOT itself check
    order-parent linkage against sibling impacts -- that cross-item check happens once, in
    ``generate_futures_wheel``, after every impact has been rebuilt (same division of labor
    ``evidence_matrix.link()``'s own docstring establishes for its own cross-field check)."""
    record = {"id": impact_id, "order": order, "parent_id": parent_id, "description": description}
    problem = _impact_problem(record)
    if problem is not None:
        raise InvariantViolation(f"FWHEEL_INVALID_IMPACT: {problem}")
    return record


def generate_futures_wheel(
    record_id: str,
    center_event: str,
    impacts: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/futures-wheel.schema.yaml``.

    Rebuilds every impact via ``impact()`` (never trusting the caller's raw dicts), then enforces the method's
    own real invariant fail-closed, in order: >=1 impact declared, no duplicate impact id, >=1 order-1 impact,
    every order-1 impact's ``parent_id`` is the ``CENTER_EVENT_PARENT_ID`` sentinel, and every order-N (N>1)
    impact's ``parent_id`` resolves to a declared impact of order exactly N-1 -- BEFORE returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"FWHEEL_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"FWHEEL_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("FWHEEL_INVALID_PROVENANCE: provenance must be a valid provenance_record")
    if not _is_nonempty_str(center_event):
        raise InvariantViolation(f"FWHEEL_INVALID_CENTER_EVENT: center_event must be a non-empty string, got {center_event!r}")

    if not isinstance(impacts, list) or not impacts:
        raise InvariantViolation("FWHEEL_NO_IMPACTS: at least one impact is required -- a wheel with a center and nothing around it is not a wheel")
    rebuilt_impacts: list[dict[str, Any]] = []
    for i, item in enumerate(impacts):
        problem = _impact_problem(item)
        if problem is not None:
            raise InvariantViolation(f"FWHEEL_INVALID_IMPACT: impacts[{i}]: {problem}")
        rebuilt_impacts.append(dict(item))

    ids = [i["id"] for i in rebuilt_impacts]
    duplicate_ids = sorted({iid for iid in ids if ids.count(iid) > 1})
    if duplicate_ids:
        raise InvariantViolation(f"FWHEEL_DUPLICATE_IMPACT_ID: impact id(s) {duplicate_ids} used more than once")

    by_order: dict[int, set[str]] = {1: set(), 2: set(), 3: set()}
    for i in rebuilt_impacts:
        by_order[i["order"]].add(i["id"])

    if not by_order[1]:
        raise InvariantViolation("FWHEEL_NO_FIRST_ORDER_IMPACT: at least one order-1 impact is required (Atlas §11.28's own fan-out, L1844-1847)")

    for i in rebuilt_impacts:
        if i["order"] == 1:
            if i["parent_id"] != CENTER_EVENT_PARENT_ID:
                raise InvariantViolation(
                    f"FWHEEL_FIRST_ORDER_PARENT_MUST_BE_CENTER: impact {i['id']!r} is order 1 but parent_id "
                    f"{i['parent_id']!r} != {CENTER_EVENT_PARENT_ID!r} -- an order-1 impact's parent is always the center event"
                )
        else:
            expected_order = i["order"] - 1
            if i["parent_id"] not in by_order[expected_order]:
                raise InvariantViolation(
                    f"FWHEEL_ORPHAN_OR_SKIPPED_ORDER: impact {i['id']!r} (order {i['order']}) has parent_id "
                    f"{i['parent_id']!r}, which does not resolve to a declared order-{expected_order} impact -- "
                    "no orphans, no skipped orders (Atlas §11.28's own 1/2/3 階 fan-out, L1837-1860)"
                )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "center_event": center_event,
        "impacts": rebuilt_impacts,
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


def evaluate_order_parent_consistency_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives the order-parent consistency invariant directly from raw fields, via the SAME
    ``_impact_problem`` predicate ``impact()`` uses -- not just trusting that ``generate_futures_wheel``'s own
    construction-time check already ran. Fails closed on malformed top-level input, malformed impact entries,
    duplicate ids, missing order-1, and orphan/skipped-order parent references, rather than crashing."""
    if not isinstance(record, dict):
        return _result("order_parent_consistency", False, [{"reason": "record is not a dict"}], validator, timestamp)
    impacts = record.get("impacts")
    if not isinstance(impacts, list) or not impacts:
        return _result("order_parent_consistency", False, [{"reason": "impacts must be a non-empty list"}], validator, timestamp)

    problems: list[str] = []
    malformed = [f"impacts[{i}]: {problem}" for i, problem in ((i, _impact_problem(item)) for i, item in enumerate(impacts)) if problem]
    problems.extend(malformed)
    well_shaped = [item for item in impacts if _impact_problem(item) is None]

    ids = [i["id"] for i in well_shaped]
    # key=repr: ids are always strings on well-shaped items, but this stays defensive against a future shape
    # change the same way evidence_matrix's own duplicate-pair check already is.
    duplicate_ids = sorted({iid for iid in ids if ids.count(iid) > 1}, key=repr)
    if duplicate_ids:
        problems.append(f"duplicate impact id(s): {duplicate_ids}")

    by_order: dict[int, set[str]] = {1: set(), 2: set(), 3: set()}
    for i in well_shaped:
        by_order[i["order"]].add(i["id"])

    if not by_order[1]:
        problems.append("no order-1 impact declared")

    for i in well_shaped:
        if i["order"] == 1:
            if i["parent_id"] != CENTER_EVENT_PARENT_ID:
                problems.append(f"impact {i['id']!r}: order-1 parent_id must be {CENTER_EVENT_PARENT_ID!r}, got {i['parent_id']!r}")
        else:
            expected_order = i["order"] - 1
            if i["parent_id"] not in by_order[expected_order]:
                problems.append(f"impact {i['id']!r}: order-{i['order']} parent_id {i['parent_id']!r} does not resolve to a declared order-{expected_order} impact")

    passed = not problems
    return _result("order_parent_consistency", passed, [{"impacts_checked": len(impacts), "problems": problems}], validator, timestamp)


def evaluate_futures_wheel_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_order_parent_consistency_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
