"""``decomposition.hierarchical_task_analysis`` -- F02 decomposition & structuring family, 1st member
(family previously entirely unbuilt; 9 concurrent siblings open this same family in this batch, zero
shared files with any of them).

Atlas cites this method ONCE: the F02 tool table row (L370: "Hierarchical Task Analysis｜拆人類工作
步驟｜Goal→Task→Subtask→Plan｜找操作負擔與錯誤點｜Journey、Service Blueprint"). Grep-confirmed the only
real hit case-insensitively across the whole Atlas file -- no dedicated section, same thin-citation
class ``strategy.bcg_matrix`` already establishes.

Unlike every flat-array F08 method built so far, this method's object of analysis is a RECURSIVE,
self-referential ``TaskNode`` tree (``goal: TaskNode``, ``TaskNode.children: TaskNode[]``), open depth
-- ``typed-objects/hierarchical-task-analysis.schema.yaml`` expresses this via a ``$defs/task_node``
self-``$ref``, the first recursive typed-object schema in this corpus (grep-confirmed: no sibling
schema used ``$defs`` for self-reference before this slice).

**Real, well-known Hierarchical Task Analysis domain discipline (independently verified, not
obscure)**: a node's ``plan`` describes the execution order/condition under which that node's OWN
children run (e.g. "do 1, then either 2 or 3"). A plan only has meaning where there is more than one
child to sequence -- a leaf (0 children) or single-child node has nothing to sequence, so a plan there
would be meaningless; a multi-child (>=2) node without a stated plan hides real ambiguity about
execution order, exactly the "操作負擔與錯誤點" (operational burden and error points) Atlas's own
benefit line names. ``plan`` is therefore GENUINE_STRUCTURAL in its requiredness (never in its
content, which is always a disclosed, REPORTED judgment): REQUIRED (non-empty string) iff
``len(children) >= 2``, and MUST be ``None`` iff ``len(children) in (0, 1)``. Same asymmetric
if/then/else CLASS ``strategy.blue_ocean``'s own ``industry_standard_level``
(required-for-ELIMINATE/REDUCE/RAISE, forbidden-for-CREATE) already establishes, applied here to an
array-length condition instead of an enum-vs-enum split, and to a PRESENT-as-``null`` forbidden
encoding instead of blue_ocean's ABSENT-key encoding (TaskNode's shape always carries exactly 4 keys:
id/task_name/plan/children -- see module-level constant ``_NODE_KEYS``).

Two directions of the same rule are checked (and can be independently violated), each with its own
error code, mirroring ``strategy.blue_ocean``'s own
``BLUEOCEAN_MISSING_INDUSTRY_STANDARD_LEVEL``/``BLUEOCEAN_UNEXPECTED_INDUSTRY_STANDARD_LEVEL_FOR_CREATE``
split:

* ``HTA_MISSING_PLAN_FOR_MULTI_CHILD`` -- a node with >=2 children whose plan is missing/empty.
* ``HTA_UNEXPECTED_PLAN_FOR_LEAF_OR_SINGLE_CHILD`` -- a node with 0 or 1 children whose plan is not
  ``None``.

Both directions are enforced recursively at TWO layers, same two-layer discipline every sibling module
in this package already establishes: construction time (``task_node``/``generate_hierarchical_task_
analysis`` raise BEFORE any record is built) AND an independent gate that re-derives from a record's
own raw fields (catching a hand-tampered record that bypassed the builder entirely, walking the WHOLE
tree, not just the root).

Grepped the whole ``ai_lego`` tree case-insensitively for "hierarchical_task_analysis"/"hierarchical
task analysis" before writing any of this method's own files: zero pre-existing implementation (only
a pre-existing sibling-created placeholder ``ai_lego/modules/decomposition/__init__.py``, not edited by
this module).
"""

from __future__ import annotations

from typing import Any

from ai_lego.errors import InvariantViolation

METHOD_ID = "decomposition.hierarchical_task_analysis"
RECORD_ID_PREFIX = "HTA-"

_NODE_KEYS = frozenset({"id", "task_name", "plan", "children"})
# Constant across BOTH branches of the plan if/then/else -- unlike strategy.blue_ocean's
# industry_standard_level (key absent under CREATE), TaskNode always carries all 4 keys; only
# `plan`'s VALUE differs (non-empty string vs None). See module docstring.


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _children_count(node: dict[str, Any]) -> int:
    """Real children count for a node whose `children` field may not yet be known to be a list
    (defense in depth for hand-tampered/malformed input) -- treats anything other than a real list
    as 0 children so the plan-forbidden direction is the one exercised (fails closed, never silently
    treats malformed children as satisfying the multi-child requirement)."""
    children = node.get("children")
    return len(children) if isinstance(children, list) else 0


def plan_is_required(children_count: int) -> bool:
    """GENUINE_STRUCTURAL rule, shared by the builder and the gate so neither can drift from the
    other: a plan is required iff there are >=2 children to sequence (module docstring)."""
    return children_count >= 2


def _missing_plan_violations(node: Any, path: str = "goal") -> list[str]:
    """Direction 1 (``HTA_MISSING_PLAN_FOR_MULTI_CHILD``): recursively collects the path of every
    node with >=2 children whose plan is not a non-empty string. Re-derives from the node's OWN raw
    `children`/`plan` fields -- does not trust any stored invariant. Non-dict/malformed nodes are
    reported by `_node_shape_violations` instead; this function treats them as contributing no
    plan-direction-1 violation of their own (fails closed via `_node_shape_violations`, not silently
    here)."""
    if not isinstance(node, dict):
        return []
    children = node.get("children")
    children = children if isinstance(children, list) else []
    violations = [path] if plan_is_required(len(children)) and not _is_nonempty_str(node.get("plan")) else []
    for index, child in enumerate(children):
        violations.extend(_missing_plan_violations(child, f"{path}.children[{index}]"))
    return violations


def _unexpected_plan_violations(node: Any, path: str = "goal") -> list[str]:
    """Direction 2 (``HTA_UNEXPECTED_PLAN_FOR_LEAF_OR_SINGLE_CHILD``): recursively collects the path
    of every node with 0 or 1 children whose plan is not ``None``. Mirrors
    `_missing_plan_violations`'s own recursion shape exactly."""
    if not isinstance(node, dict):
        return []
    children = node.get("children")
    children = children if isinstance(children, list) else []
    violations = [path] if not plan_is_required(len(children)) and node.get("plan") is not None else []
    for index, child in enumerate(children):
        violations.extend(_unexpected_plan_violations(child, f"{path}.children[{index}]"))
    return violations


def _node_shape_violations(node: Any, path: str = "goal") -> list[str]:
    """Recursively collects the path of every node whose SHAPE (exact key set, non-empty id/task_name,
    children is a list) is invalid -- a concern kept deliberately separate from the plan invariant
    (`_missing_plan_violations`/`_unexpected_plan_violations`), same split
    ``strategy.blue_ocean``'s own ``errc_action_valid`` vs ``industry_standard_level_consistency``
    gates already establish. Does NOT itself check the plan value."""
    if not isinstance(node, dict) or set(node.keys()) != _NODE_KEYS:
        return [path]
    violations = []
    if not _is_nonempty_str(node.get("id")):
        violations.append(path)
    if not _is_nonempty_str(node.get("task_name")):
        violations.append(path)
    children = node.get("children")
    if not isinstance(children, list):
        violations.append(path)
        return violations
    for index, child in enumerate(children):
        violations.extend(_node_shape_violations(child, f"{path}.children[{index}]"))
    return violations


def _rebuild_node(node: dict[str, Any]) -> dict[str, Any]:
    """Recursively reconstructs a clean copy of an already-shape-validated node -- same
    "never trust the caller's exact object, rebuild from validated raw fields" discipline
    ``strategy.bcg_matrix``'s own ``rebuilt_items`` establishes, generalized here to recursion."""
    return {
        "id": node["id"],
        "task_name": node["task_name"],
        "plan": node["plan"],
        "children": [_rebuild_node(child) for child in node["children"]],
    }


def task_node(
    node_id: str,
    task_name: str,
    children: list[dict[str, Any]],
    plan: str | None = None,
) -> dict[str, Any]:
    """One TaskNode, built bottom-up: ``children`` is expected to already be a list of TaskNode dicts
    (each previously built via this same function, or the tree's own leaves). Convenience constructor
    only -- enforces THIS node's own 2 real invariants (non-empty id/task_name; plan-vs-children-count
    asymmetry) at construction, same "raise before any record is built" discipline every sibling
    module in this package already establishes. Does NOT itself recursively re-validate already-built
    children (same "does not itself enforce list-level invariants of its own inputs" convention
    ``strategy.bcg_matrix``'s own ``portfolio_item`` docstring establishes) -- the true recursive
    gatekeeper for a WHOLE tree, however it was assembled, is ``generate_hierarchical_task_analysis``
    below.
    """
    if not _is_nonempty_str(node_id):
        raise InvariantViolation(f"HTA_EMPTY_NODE_ID: node_id must be a non-empty string, got {node_id!r}")
    if not _is_nonempty_str(task_name):
        raise InvariantViolation(f"HTA_EMPTY_TASK_NAME: task_name must be a non-empty string, got {task_name!r}")
    if not isinstance(children, list):
        raise InvariantViolation(f"HTA_INVALID_CHILDREN: children must be a list, got {children!r}")

    count = len(children)
    if plan_is_required(count) and not _is_nonempty_str(plan):
        raise InvariantViolation(
            f"HTA_MISSING_PLAN_FOR_MULTI_CHILD: node {node_id!r} has {count} children (>=2) but plan is {plan!r} -- "
            "a multi-child task without a stated execution order hides real ambiguity (Atlas F02 L370 '找操作負擔與錯誤點')"
        )
    if not plan_is_required(count) and plan is not None:
        raise InvariantViolation(
            f"HTA_UNEXPECTED_PLAN_FOR_LEAF_OR_SINGLE_CHILD: node {node_id!r} has {count} children (0 or 1) but plan is {plan!r} "
            "(must be null) -- a leaf or single-child task has nothing to sequence"
        )

    return {"id": node_id, "task_name": task_name, "plan": plan, "children": list(children)}


def generate_hierarchical_task_analysis(
    record_id: str,
    goal: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/hierarchical-task-analysis.schema.yaml``.

    THE recursive gatekeeper: re-validates the WHOLE ``goal`` tree from its own raw fields --
    regardless of whether every node was built via ``task_node`` above or assembled as raw dicts --
    same "top-level generate_* function is the true authority" discipline every sibling module in this
    package already establishes, generalized here to recursion. Enforces all 3 real invariants
    fail-closed (shape, then both plan directions) BEFORE constructing any output, never a record that
    itself proves it was built illegally.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"HTA_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"HTA_INVALID_VERSION: version must be a string, got {version!r}")

    shape_violations = _node_shape_violations(goal)
    if shape_violations:
        raise InvariantViolation(
            f"HTA_INVALID_NODE_SHAPE: node(s) at {shape_violations} do not have exactly the keys {sorted(_NODE_KEYS)} with a "
            f"non-empty id/task_name and a list children, got goal={goal!r}"
        )

    missing = _missing_plan_violations(goal)
    if missing:
        raise InvariantViolation(
            f"HTA_MISSING_PLAN_FOR_MULTI_CHILD: node(s) at {missing} have >=2 children but plan is missing/empty -- "
            "a multi-child task without a stated execution order hides real ambiguity (Atlas F02 L370 '找操作負擔與錯誤點')"
        )

    unexpected = _unexpected_plan_violations(goal)
    if unexpected:
        raise InvariantViolation(
            f"HTA_UNEXPECTED_PLAN_FOR_LEAF_OR_SINGLE_CHILD: node(s) at {unexpected} have 0 or 1 children but plan is not null -- "
            "a leaf or single-child task has nothing to sequence"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "goal": _rebuild_node(goal),
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_tree_shape_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives the record's own id/version validity plus the WHOLE tree's shape from raw fields --
    does not trust any stored value and does NOT call ``generate_hierarchical_task_analysis``, so a
    hand-tampered record that bypassed the builder entirely is caught here exactly as a
    builder-refused one would have been. Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("tree_shape", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("tree_shape", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("tree_shape", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    goal = record.get("goal")
    violations = _node_shape_violations(goal)
    passed = isinstance(goal, dict) and not violations
    return _result("tree_shape", passed, [{"shape_violation_paths": violations}], validator, timestamp)


def evaluate_plan_required_for_multi_child_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Direction 1 (``HTA_MISSING_PLAN_FOR_MULTI_CHILD``) from the record's OWN raw `goal`
    tree, independent of the builder. Fails closed on malformed input."""
    if not isinstance(record, dict):
        return _result("plan_required_for_multi_child", False, [{"reason": "record is not a dict"}], validator, timestamp)
    goal = record.get("goal")
    violations = _missing_plan_violations(goal)
    passed = isinstance(goal, dict) and not violations
    return _result("plan_required_for_multi_child", passed, [{"violation_paths": violations}], validator, timestamp)


def evaluate_plan_forbidden_for_leaf_or_single_child_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Direction 2 (``HTA_UNEXPECTED_PLAN_FOR_LEAF_OR_SINGLE_CHILD``) from the record's OWN
    raw `goal` tree, independent of the builder. Fails closed on malformed input."""
    if not isinstance(record, dict):
        return _result("plan_forbidden_for_leaf_or_single_child", False, [{"reason": "record is not a dict"}], validator, timestamp)
    goal = record.get("goal")
    violations = _unexpected_plan_violations(goal)
    passed = isinstance(goal, dict) and not violations
    return _result("plan_forbidden_for_leaf_or_single_child", passed, [{"violation_paths": violations}], validator, timestamp)


def evaluate_hierarchical_task_analysis_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """All 3 real invariants, in catalog order. No ``provenance_required``/``evidence_labeling_required``
    gates -- the contract sets both flags to ``false`` (see decomposition.hierarchical_task_analysis.
    contract.yaml's own ``quality``/``compilation_decisions``: this design carries no per-node
    provenance field), same "only emit gates for what is actually declared true" discipline
    ``strategy.bcg_matrix``'s own ``evaluate_bcg_matrix_gates`` already establishes."""
    return [
        evaluate_tree_shape_gate(record, validator, timestamp),
        evaluate_plan_required_for_multi_child_gate(record, validator, timestamp),
        evaluate_plan_forbidden_for_leaf_or_single_child_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
