"""``security.attack_tree`` -- forty-sixth Method Atlas slice, THIRD member of the `security` family (F20),
after `security.stride` (44th) and `security.linddun` (45th).

Atlas's own F20 tool table Attack Tree row (L883) AND dedicated §12.38
section (L3046-3062: a worked AND/OR tree example) name a recursive
goal TREE ("root goal→AND/OR subgoals→cost/skill/detectability"), NOT
a DFD substrate -- the FIRST F20 member to structurally diverge from
`stride.py`/`linddun.py`'s own shared DFD shape (see the method
contract's own description: this closes `OQ-LINDDUN-4` specifically,
NOT `OQ-STRIDE-4`, which is a different question about a different
sub-shape and remains open). Execution Contract §32 Security Change
Contract (L1231-1260, naming Attack Tree) grounds `assets`/
`trust_boundaries`/`entry_points`, kept identically shaped to the two
siblings' own fields (the confirmed method-agnostic part of EC §32 --
`OQ-STRIDE-4`'s own subject, still open, see the method contract).

The FIRST F20 `genuine_compute` module: `root_aggregate` is a real
bottom-up AND/OR aggregation (see `ai_lego.compute.attack_tree
.aggregate.aggregate_node`), NOT a structural set-difference (STRIDE/
LINDDUN's own `elements_with_no_recorded_threats` class). Two-layer
discipline preserved: shape validity (id/version/assets/trust_boundaries
/entry_points/tree-shape) AND the aggregate VALUE itself are both
checked at construction (builder) and independently RE-DERIVED at the
gate (which does not trust any stored value, including the stored
aggregate).
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.compute.attack_tree.aggregate import aggregate_node
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "security.attack_tree"
RECORD_ID_PREFIX = "ATTACKTREE-"
MAX_TREE_DEPTH = 100
# Caught by critic review: an actually-unbounded recursive validator raises Python's own RecursionError past
# a few hundred levels (measured at depth 332 with the default recursion limit), silently violating this
# package's own "fails closed, never crashes" discipline. Real attack trees are shallow by their own nature
# (Atlas's own §12.38 worked example is 3 levels) -- 100 levels rejects only pathological input, never real
# usage.
VALID_NODE_TYPES = frozenset({"AND", "OR"})
VALID_SKILL_LEVELS = frozenset({"low", "medium", "high"})
VALID_DETECTABILITY_LEVELS = frozenset({"low", "medium", "high"})
_KNOWN_TRUST_BOUNDARY_KEYS = frozenset({"name", "description"})
_KNOWN_INTERNAL_NODE_KEYS = frozenset({"name", "node_type", "children"})
_KNOWN_LEAF_NODE_KEYS = frozenset({"name", "cost", "skill", "detectability", "control", "residual_risk", "test_evidence"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """A one-level-deep description for error messages -- NEVER Python's own recursive ``repr()``, which
    would itself raise RecursionError on a pathologically deep tree (the exact input MAX_TREE_DEPTH exists
    to reject). Caught by the same critic review that found the MAX_TREE_DEPTH gap: the validity check
    itself stopped recursing safely, but the ORIGINAL error message still called ``repr()`` on the whole,
    still-deeply-nested caller input to describe the failure."""
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    return repr(value)


def _is_nonnegative_number(value: Any) -> bool:
    """bool is a subclass of int in Python -- True/False must be explicitly excluded, or a caller-supplied
    ``cost: true`` would silently pass an isinstance(value, (int, float)) check. ``math.isfinite`` excludes
    both NaN and +/-infinity -- an infinite cost would make 'cheapest path' meaningless and is not valid
    JSON (RFC 8259 has no infinity/NaN literal), so a caller-supplied ``inf`` must be refused, not silently
    accepted the way a bare ``>= 0`` comparison alone would (``float('inf') >= 0`` is True)."""
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0


def _nonempty_str_list_is_valid(value: Any) -> bool:
    return isinstance(value, list) and all(_is_nonempty_str(v) for v in value)


def _assets_are_valid(value: Any) -> bool:
    return isinstance(value, list) and bool(value) and _nonempty_str_list_is_valid(value)


def _trust_boundary_is_valid(entry: Any) -> bool:
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_TRUST_BOUNDARY_KEYS:
        return False
    return _is_nonempty_str(entry["name"]) and _is_nonempty_str(entry["description"])


def _trust_boundaries_are_valid(value: Any) -> bool:
    return isinstance(value, list) and all(_trust_boundary_is_valid(e) for e in value)


def _leaf_node_is_valid(node: dict[str, Any]) -> bool:
    """Shared predicate: exactly the seven known leaf keys, name/control/residual_risk/test_evidence
    non-empty strings, cost a non-negative real number, skill/detectability legal ordinal enum values."""
    if set(node.keys()) != _KNOWN_LEAF_NODE_KEYS:
        return False
    if not _is_nonempty_str(node["name"]):
        return False
    if not _is_nonnegative_number(node["cost"]):
        return False
    if node["skill"] not in VALID_SKILL_LEVELS or node["detectability"] not in VALID_DETECTABILITY_LEVELS:
        return False
    return all(_is_nonempty_str(node[field]) for field in ("control", "residual_risk", "test_evidence"))


def _internal_node_is_valid(node: dict[str, Any], depth: int) -> bool:
    """Shared predicate: exactly the three known internal-node keys, name non-empty, node_type a legal
    AND/OR value, children a non-empty list of RECURSIVELY valid attack_node entries."""
    if set(node.keys()) != _KNOWN_INTERNAL_NODE_KEYS:
        return False
    if not _is_nonempty_str(node["name"]):
        return False
    if node["node_type"] not in VALID_NODE_TYPES:
        return False
    children = node["children"]
    if not isinstance(children, list) or not children:
        return False
    return all(_attack_node_is_valid(child, depth + 1) for child in children)


def _attack_node_is_valid(node: Any, depth: int = 0) -> bool:
    """Shared predicate (the recursive entry point): a node is valid iff it is a dict shaped as EXACTLY one
    of leaf_node or internal_node -- never both, never neither. Called by BOTH the builder and the gate, at
    every level of the tree. Bounded to MAX_TREE_DEPTH levels (see its own module-level comment) -- past that,
    refused as invalid rather than recursing further, so a pathologically deep tree fails closed instead of
    raising RecursionError."""
    if depth > MAX_TREE_DEPTH:
        return False
    if not isinstance(node, dict):
        return False
    if "children" in node:
        return _internal_node_is_valid(node, depth)
    return _leaf_node_is_valid(node)


def _rebuild_node(node: dict[str, Any]) -> dict[str, Any]:
    """Recursively REBUILDS every node -- the same family-wide 'rebuild, don't alias' discipline every
    prior security module already follows, applied down the whole tree so no nested dict from the caller's
    own input is retained by reference. Precondition: node is already known-valid (call only after
    _attack_node_is_valid has passed)."""
    if "children" in node:
        return {"name": node["name"], "node_type": node["node_type"], "children": [_rebuild_node(c) for c in node["children"]]}
    return {
        "name": node["name"],
        "cost": node["cost"],
        "skill": node["skill"],
        "detectability": node["detectability"],
        "control": node["control"],
        "residual_risk": node["residual_risk"],
        "test_evidence": node["test_evidence"],
    }


def _count_nodes(node: dict[str, Any]) -> tuple[int, int]:
    """Returns (leaf_count, internal_count), recursively. Used only for gate evidence -- not a correctness
    invariant, purely descriptive."""
    if "children" not in node:
        return (1, 0)
    leaf_total, internal_total = 0, 1
    for child in node["children"]:
        leaves, internals = _count_nodes(child)
        leaf_total += leaves
        internal_total += internals
    return (leaf_total, internal_total)


def generate_attack_tree_record(
    record_id: str,
    system_or_component: str,
    assets: list[str],
    trust_boundaries: list[dict[str, Any]],
    entry_points: list[str],
    root: dict[str, Any],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/attack-tree-record.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed: record_id (ATTACKTREE- prefix)/system_or_component non-empty, version a real
    string, assets a non-empty list of non-empty strings, trust_boundaries/entry_points lists (may be empty)
    of well-shaped entries, and root a recursively well-shaped attack_node (internal or leaf, never mixed).
    ``root_aggregate`` is NOT a parameter -- always computed fresh via real bottom-up AND/OR aggregation.
    REBUILDS every nested object it owns, including the whole tree; provenance is stored by reference, the
    same family-wide convention every prior security module already follows."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"ATTACKTREE_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not _is_nonempty_str(system_or_component):
        raise InvariantViolation(f"ATTACKTREE_EMPTY_RECORD_FIELD: system_or_component must be a non-empty string, got {system_or_component!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"ATTACKTREE_INVALID_VERSION: version must be a string, got {version!r}")
    if not _assets_are_valid(assets):
        raise InvariantViolation(f"ATTACKTREE_INVALID_ASSETS: assets must be a non-empty list of non-empty strings, got {assets!r}")
    if not _trust_boundaries_are_valid(trust_boundaries):
        raise InvariantViolation(f"ATTACKTREE_INVALID_TRUST_BOUNDARIES: every entry must have known keys (name/description), both non-empty, got {trust_boundaries!r}")
    if not _nonempty_str_list_is_valid(entry_points):
        raise InvariantViolation(f"ATTACKTREE_INVALID_ENTRY_POINTS: entry_points must be a list of non-empty strings, got {entry_points!r}")
    if not _attack_node_is_valid(root):
        raise InvariantViolation(
            f"ATTACKTREE_INVALID_ROOT: root must be a recursively well-shaped attack_node -- either an internal node "
            f"(name/node_type in {sorted(VALID_NODE_TYPES)}/children, a non-empty list of valid attack_node) or a leaf node "
            f"(name/cost>=0/skill/detectability in {sorted(VALID_SKILL_LEVELS)}/control/residual_risk/test_evidence, all non-empty), "
            f"deeper than MAX_TREE_DEPTH={MAX_TREE_DEPTH}, or too deeply nested to describe safely; got {_shallow_describe(root)}"
        )

    rebuilt_root = _rebuild_node(root)

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "system_or_component": system_or_component,
        "assets": list(assets),
        "trust_boundaries": [{"name": tb["name"], "description": tb["description"]} for tb in trust_boundaries],
        "entry_points": list(entry_points),
        "root": rebuilt_root,
        "root_aggregate": aggregate_node(rebuilt_root),
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance is schema-valid."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_attack_tree_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- valid id (non-empty,
    ATTACKTREE- prefix), a real string version, system_or_component, well-shaped assets/trust_boundaries
    /entry_points, a recursively well-shaped root, AND RECOMPUTES ``root_aggregate`` fresh via the real
    AND/OR aggregation algorithm, comparing against the stored value. Does not trust any stored value,
    including the stored aggregate -- the ``genuine_compute`` guarantee this gate exists to prove. FAILS
    CLOSED on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("attack_tree_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("attack_tree_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("attack_tree_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("system_or_component")):
        return _result("attack_tree_integrity", False, [{"reason": "system_or_component missing or empty"}], validator, timestamp)

    if not _assets_are_valid(record.get("assets")):
        return _result("attack_tree_integrity", False, [{"reason": "assets invalid (empty, malformed, or non-string entry)"}], validator, timestamp)
    if not _trust_boundaries_are_valid(record.get("trust_boundaries")):
        return _result("attack_tree_integrity", False, [{"reason": "trust_boundaries invalid (malformed entry or unknown keys)"}], validator, timestamp)
    if not _nonempty_str_list_is_valid(record.get("entry_points")):
        return _result("attack_tree_integrity", False, [{"reason": "entry_points invalid (not a list, or contains a non-string/empty entry)"}], validator, timestamp)

    root = record.get("root")
    if not _attack_node_is_valid(root):
        return _result(
            "attack_tree_integrity",
            False,
            [{"reason": f"root invalid (malformed node, unknown keys, mixed leaf/internal shape, illegal node_type, illegal skill/detectability, non-numeric/negative/non-finite cost, or deeper than MAX_TREE_DEPTH={MAX_TREE_DEPTH})"}],
            validator,
            timestamp,
        )

    recomputed = aggregate_node(root)
    if "root_aggregate" not in record:
        return _result("attack_tree_integrity", False, [{"reason": "root_aggregate missing", "recomputed": recomputed}], validator, timestamp)
    if record["root_aggregate"] != recomputed:
        return _result(
            "attack_tree_integrity",
            False,
            [{"reason": "stored root_aggregate disagrees with recomputation", "stored": record["root_aggregate"], "recomputed": recomputed}],
            validator,
            timestamp,
        )

    leaf_count, internal_node_count = _count_nodes(root)
    return _result(
        "attack_tree_integrity",
        True,
        [{"asset_count": len(record["assets"]), "leaf_count": leaf_count, "internal_node_count": internal_node_count, "root_aggregate": recomputed}],
        validator,
        timestamp,
    )


def evaluate_attack_tree_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_attack_tree_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
