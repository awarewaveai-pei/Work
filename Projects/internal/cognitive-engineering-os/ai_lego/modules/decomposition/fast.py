"""``decomposition.fast`` -- F02 decomposition family, one of 9 methods opening it in one batch (see
``ai_lego/modules/decomposition/issue_tree.py`` for this family's own first member, built in the same batch).

Atlas cites this method ONCE: the F02 tool table row (L369: "FAST｜用 Why/How 建功能鏈｜往左問 Why、往右問 How｜
找冗餘功能與替代方案｜Value Engineering"). Grep-confirmed the only real hit case-insensitively for the specific
strings "decomposition.fast"/"FastDiagram"/"FAST diagram" across the whole Atlas file and this whole
``ai_lego`` tree before writing any of this method's own files -- no dedicated section, no pre-existing
implementation.

**FAST (Function Analysis System Technique)** builds a function CHAIN: asking "why" walks toward the
higher-order function (left), asking "how" walks toward the lower-order function (right) -- the same edges
traversed in opposite directions. Each non-root function therefore carries exactly one ``why_ref`` pointer to
its own higher-order parent; the chain's unique root (the top-level function with no higher-order answer
within the diagram) carries ``why_ref: null``.

Two real invariants, both GENUINE_COMPUTE, enforced fail-closed by BOTH the builder (raises before
constructing a record) and an independent gate (re-derives from the record's own raw ``functions`` list, never
trusting a stored flag -- there is no stored boolean flag for either invariant, unlike ``causal.dag``'s own
``acyclic_verified`` field, see ``fast-diagram.schema.yaml``'s own compilation_decisions for why plain JSON
Schema cannot express either invariant as a structural constraint):

1. Exactly one ``functions[]`` entry has ``why_ref: null`` (the unique root); every other entry's ``why_ref``
   must be a real id of another entry in the same list (referential integrity) -- ``FAST_NO_ROOT``/
   ``FAST_MULTIPLE_ROOTS``/``FAST_DANGLING_WHY_REF``.
2. Following every function's ``why_ref`` chain must terminate at that root within a finite number of steps --
   no function may be its own transitive ancestor -- ``FAST_CYCLE_DETECTED``.

**Cycle detection reuses ``ai_lego.compute.graph.dag.find_cycle`` UNCHANGED**, disclosed per this task's own
instruction: that function is a genuinely general, non-causal-specific directed-graph cycle-detection utility
(three-color DFS) already extracted into ``ai_lego/compute/graph/`` and used by ``causal.dag`` -- not a
causal-specific module. FAST's own ``why_ref`` pointers reshape trivially into that utility's own
``nodes``/``edges`` input shape: one node per function, one edge per non-root function from its own id to its
``why_ref``. Referential integrity (invariant 1's dangling-reference half) and the exactly-one-root count are
FAST's own small, dedicated checks -- not general enough to belong in that shared utility, so written here.
(Critic finding, 2026-09-11: originally called the boolean-only ``is_acyclic`` and inferred the culprit node
via an unsound "first function with an outgoing edge" heuristic; switched to ``find_cycle``, which returns
the actual cycle path, so the reported culprit is always genuinely on the detected cycle -- see
``_find_cyclic_function_id``'s own docstring.)
"""

from __future__ import annotations

from typing import Any

from ai_lego.compute.graph.dag import find_cycle
from ai_lego.errors import InvariantViolation

METHOD_ID = "decomposition.fast"
RECORD_ID_PREFIX = "FAST-"
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.graph.dag.find_cycle"

_FUNCTION_KEYS = frozenset({"id", "name", "why_ref"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _function_entry_is_structurally_valid(entry: Any) -> bool:
    """Shared predicate: the fields every function entry must carry regardless of where it came from (builder
    input or a stored/hand-tampered record) -- exactly the 3 keys, non-empty id/name, why_ref either None or a
    non-empty string. Does NOT check referential integrity, root count, or acyclicity -- those are checked
    once, across the WHOLE list, by the callers below."""
    if not isinstance(entry, dict) or set(entry.keys()) != _FUNCTION_KEYS:
        return False
    if not _is_nonempty_str(entry.get("id")):
        return False
    if not _is_nonempty_str(entry.get("name")):
        return False
    why_ref = entry.get("why_ref")
    if why_ref is not None and not _is_nonempty_str(why_ref):
        return False
    return True


def fast_function(function_id: str, name: str, why_ref: str | None = None) -> dict[str, Any]:
    """One entry of ``generate_fast_diagram``'s own ``functions`` parameter. Convenience constructor only --
    does NOT itself enforce list-wide invariants (non-emptiness, referential integrity, single root,
    acyclicity); ``generate_fast_diagram`` validates whatever list of dicts it is handed, same convention
    ``ai_lego.modules.strategy.bcg_matrix``'s own ``portfolio_item`` already establishes."""
    if not _is_nonempty_str(function_id):
        raise InvariantViolation(f"FAST_EMPTY_FUNCTION_ID: function_id must be a non-empty string, got {function_id!r}")
    if not _is_nonempty_str(name):
        raise InvariantViolation(f"FAST_EMPTY_FUNCTION_NAME: name must be a non-empty string, got {name!r}")
    if why_ref is not None and not _is_nonempty_str(why_ref):
        raise InvariantViolation(f"FAST_INVALID_WHY_REF: why_ref must be None or a non-empty string, got {why_ref!r}")
    return {"id": function_id, "name": name, "why_ref": why_ref}


def _find_cyclic_function_id(functions: list[dict[str, Any]]) -> str | None:
    """GENUINE_COMPUTE: re-derives whether the why_ref-derived graph is acyclic, by delegating to
    ``ai_lego.compute.graph.dag.find_cycle`` (a real three-color DFS, not a heuristic) -- reused UNCHANGED, see
    module docstring. Reshapes ``functions`` into that utility's own ``nodes``/``edges`` shape: one node per
    function, one edge per non-root function (from its own id to its why_ref). Returns the id of a function
    genuinely ON the detected cycle (for a useful error message), else ``None`` if acyclic.

    Critic finding, 2026-09-11: this used to report "the first function in list order with a non-null
    why_ref", which wrongly assumes any node with an outgoing edge sits ON the cycle -- false whenever a
    legitimate, root-terminating branch happens to appear before the actual cyclic branch in list order
    (e.g. functions=[root, D(->root, legitimate), B(->C), C(->B)] would misreport "D", which is not part of
    the B<->C cycle at all). Fixed by using ``find_cycle``'s own returned cycle path directly -- every id in
    that path is genuinely, provably part of the detected cycle, not inferred from edge presence alone.

    Callers must have already confirmed every why_ref resolves to a real id in ``functions`` (referential
    integrity) before calling this -- otherwise ``find_cycle``'s own ``DAG_EDGE_REFERENCES_UNKNOWN_NODE``
    would fire instead, which is a different failure class than a cycle."""
    nodes = [{"id": entry["id"]} for entry in functions]
    edges = [{"from_node_id": entry["id"], "to_node_id": entry["why_ref"]} for entry in functions if entry["why_ref"] is not None]
    cycle = find_cycle(nodes, edges)
    if cycle is None:
        return None
    return cycle[0]  # cycle is e.g. ["FN-B", "FN-C", "FN-B"] -- every entry is genuinely on the cycle


def generate_fast_diagram(
    diagram_id: str,
    functions: list[dict[str, Any]],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/fast-diagram.schema.yaml``.

    Enforces both real invariants fail-closed, same family-wide "raise-before-construction" discipline every
    sibling module in this package already establishes. Checks run in a fixed order so each failure mode gets
    its own specific error code: structural shape -> duplicate ids -> root count -> referential integrity ->
    acyclicity.
    """
    if not _is_nonempty_str(diagram_id) or not diagram_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"FAST_INVALID_ID: diagram_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {diagram_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"FAST_INVALID_VERSION: version must be a string, got {version!r}")

    if not isinstance(functions, list) or not functions:
        raise InvariantViolation(
            f"FAST_EMPTY_FUNCTIONS: functions must be a non-empty list (a FAST diagram with zero functions has not actually built a function "
            f"chain -- Atlas L369's own '用 Why/How 建功能鏈' purpose), got {functions!r}"
        )
    if not all(_function_entry_is_structurally_valid(entry) for entry in functions):
        raise InvariantViolation(
            f"FAST_INVALID_FUNCTION_ENTRY: every entry must have exactly the keys {sorted(_FUNCTION_KEYS)}, non-empty id/name, and why_ref either "
            f"None or a non-empty string, got {functions!r}"
        )

    ids = [entry["id"] for entry in functions]
    duplicate_ids = sorted({fid for fid in ids if ids.count(fid) > 1})
    if duplicate_ids:
        raise InvariantViolation(f"FAST_DUPLICATE_FUNCTION_ID: functions[].id must be unique within the diagram, duplicates: {duplicate_ids!r}")

    roots = [entry for entry in functions if entry["why_ref"] is None]
    if not roots:
        raise InvariantViolation("FAST_NO_ROOT: exactly one functions[] entry must have why_ref: null (the chain's unique higher-order root); none found")
    if len(roots) > 1:
        raise InvariantViolation(
            f"FAST_MULTIPLE_ROOTS: exactly one functions[] entry must have why_ref: null (the chain's unique higher-order root); found "
            f"{len(roots)}: {sorted(entry['id'] for entry in roots)!r}"
        )

    id_set = set(ids)
    dangling = sorted(entry["id"] for entry in functions if entry["why_ref"] is not None and entry["why_ref"] not in id_set)
    if dangling:
        raise InvariantViolation(f"FAST_DANGLING_WHY_REF: these functions[].why_ref values do not resolve to any real id in the same list: {dangling!r}")

    cyclic_id = _find_cyclic_function_id(functions)
    if cyclic_id is not None:
        raise InvariantViolation(
            f"FAST_CYCLE_DETECTED: the why_ref chain starting at function {cyclic_id!r} does not terminate at the root -- a function may not be its "
            f"own transitive ancestor"
        )

    return {
        "id": diagram_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "functions": [{"id": entry["id"], "name": entry["name"], "why_ref": entry["why_ref"]} for entry in functions],
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_fast_diagram_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw ``functions`` field -- does not trust any
    stored value and does NOT call ``generate_fast_diagram``, so a hand-tampered record that bypassed the
    builder entirely is caught here exactly as a builder-refused one would have been. Fails closed on
    malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("fast_diagram_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("fast_diagram_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("fast_diagram_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    functions = record.get("functions")
    if not isinstance(functions, list) or not functions:
        return _result("fast_diagram_integrity", False, [{"reason": "functions missing, not a list, or empty"}], validator, timestamp)
    if not all(_function_entry_is_structurally_valid(entry) for entry in functions):
        return _result("fast_diagram_integrity", False, [{"reason": "a functions[] entry is malformed (wrong key set, empty id/name, or invalid why_ref)"}], validator, timestamp)

    ids = [entry["id"] for entry in functions]
    if len(set(ids)) != len(ids):
        return _result("fast_diagram_integrity", False, [{"reason": "duplicate functions[].id values"}], validator, timestamp)

    roots = [entry for entry in functions if entry["why_ref"] is None]
    if len(roots) != 1:
        return _result("fast_diagram_integrity", False, [{"reason": f"expected exactly 1 root (why_ref: null), found {len(roots)}"}], validator, timestamp)

    id_set = set(ids)
    if any(entry["why_ref"] is not None and entry["why_ref"] not in id_set for entry in functions):
        return _result("fast_diagram_integrity", False, [{"reason": "a functions[].why_ref does not resolve to any real id in the same list"}], validator, timestamp)

    if _find_cyclic_function_id(functions) is not None:
        return _result("fast_diagram_integrity", False, [{"reason": "the why_ref chain contains a cycle -- some function is its own transitive ancestor"}], validator, timestamp)

    return _result("fast_diagram_integrity", True, [{"function_count": len(functions)}], validator, timestamp)


def evaluate_fast_diagram_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """The contract's one real gate. No provenance_required/evidence_labeling_required gates -- the contract
    sets both quality flags to false (FastDiagram carries no provenance field anywhere, see contract's own
    compilation_decisions), same "only emit gates for what is actually declared true" discipline
    ``strategy.bcg_matrix``'s own ``evaluate_bcg_matrix_gates`` already establishes. Unlike that flag-gated
    pair, the structural integrity gate below is NOT conditional on any quality flag -- it enforces the
    method's own real invariants, same unconditional-emission precedent
    ``strategy.bcg_matrix.evaluate_bcg_matrix_integrity_gate`` already establishes."""
    return [evaluate_fast_diagram_integrity_gate(record, validator, timestamp)]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
