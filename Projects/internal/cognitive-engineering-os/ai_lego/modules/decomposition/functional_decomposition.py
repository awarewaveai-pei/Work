"""``decomposition.functional_decomposition`` -- F02 decomposition family, 2nd member (after
``decomposition.issue_tree``, built concurrently in this same batch by a separate agent; read in full for tone --
its own whole-tree id-uniqueness invariant class and record-level-only-provenance reasoning -- but NOT imported
from, per this task's own instruction: this module is fully self-contained).

Atlas cites this method ONCE: the F02 tool table row (L368: "Functional Decomposition｜按功能拆系統｜Top function→
subfunctions→interfaces｜強化模組與責任邊界｜C4、DDD"). Grep-confirmed the only real hit case-insensitively across the
whole Atlas file -- no dedicated section, same thin-citation class ``strategy.bcg_matrix``/``decomposition.issue_tree``
already establish for this Wave.

Two real invariants, BOTH re-derived independently at construction time and at gate time (never trusting a stored
flag):

1. **Whole-tree id uniqueness** (``FUNCDECOMP_DUPLICATE_NODE_ID``): every ``function_node`` id anywhere in the
   ``top_function`` tree (root + all descendants, at any depth) must be globally unique -- same invariant class
   ``decomposition.issue_tree``'s own ``ISSUETREE_DUPLICATE_NODE_ID`` establishes for this same family,
   defensively bounded to ``MAX_TREE_DEPTH`` (100, same bound ``ai_lego.modules.decision.decision_tree``/
   ``security.attack_tree`` already establish, for the same reason: real functional decompositions are shallow,
   this rejects only pathological input, never real usage).

2. **Referential integrity** (``FUNCDECOMP_DANGLING_INTERFACE_REF``): every ``interfaces[].from_function_ref``/
   ``to_function_ref`` must resolve to a real ``function_node`` id that actually exists somewhere in
   ``top_function`` -- directly grounded in Atlas's own literal "interfaces" concept (L368's own "Top function→
   subfunctions→interfaces"): an interface connecting to a nonexistent function is a real structural defect (a
   dangling reference), not a legal record. Same class ``ai_lego.modules.architecture.ddd``'s own
   ``DDD_CONTEXT_MAP_UNKNOWN_BOUNDED_CONTEXT`` already establishes for ``context_map`` entries referencing
   ``bounded_contexts`` -- reused here for ``interfaces`` referencing function nodes, not imported (that module's
   ids are flat, this one's are scattered across a recursive tree, so the "collect every real id first" walk
   differs even though the check-membership shape is the same idea).

Record-level-only provenance (NOT per-node/per-interface) -- 100% universal field across every typed-object schema
in this suite (same reasoning ``decomposition.issue_tree.contract.yaml``'s own ``compilation_decisions`` already
discloses for this exact family; a ``function_name``/interface ``description`` is reported structural content, not
a per-item judgment call needing its own epistemic stamp).

Grepped the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and ``Projects/internal/cognitive-engineering-os``
trees case-insensitively for "functional_decomposition"/"functional decomposition"/"FunctionalDecomposition" before
writing any of this method's own files: zero pre-existing implementation.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "decomposition.functional_decomposition"
RECORD_ID_PREFIX = "FUNCDECOMP-"
MAX_TREE_DEPTH = 100
# Same defensive bound decomposition.issue_tree.py/decision.decision_tree.py/security.attack_tree.py's own
# MAX_TREE_DEPTH establishes, for the same reason: real functional decompositions (Atlas's own citation is a
# handful of levels) are shallow; this rejects only pathological input, never real usage, and keeps recursive
# traversal (shape check, id collection, dangling-ref check) well inside Python's own default recursion limit.

_FUNCTION_NODE_KEYS = frozenset({"id", "function_name", "children"})
_INTERFACE_KEYS = frozenset({"id", "from_function_ref", "to_function_ref", "description"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- NEVER Python's own recursive ``repr()`` (would itself
    risk trouble on a pathologically deep/wide tree), same discipline every prior tree module in this codebase
    (``fault_tree``/``attack_tree``/``decision_tree``) already establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _function_node_is_valid(node: Any, depth: int = 0) -> bool:
    """Shared recursive shape predicate -- called by BOTH the builder and the gate (there is no separate
    ``stored`` shape here, unlike ``decision.decision_tree``'s own decision/chance/terminal split: a
    ``function_node`` carries no computed field, so its input shape and its stored shape are identical).
    Bounded to ``MAX_TREE_DEPTH`` -- past that, refused as invalid rather than recursing further, same
    fail-closed-not-RecursionError discipline every prior tree module in this codebase already establishes."""
    if depth > MAX_TREE_DEPTH:
        return False
    if not isinstance(node, dict) or set(node.keys()) != _FUNCTION_NODE_KEYS:
        return False
    if not _is_nonempty_str(node.get("id")):
        return False
    if not _is_nonempty_str(node.get("function_name")):
        return False
    children = node.get("children")
    if not isinstance(children, list):
        return False
    return all(_function_node_is_valid(child, depth + 1) for child in children)


def _interface_entry_is_valid(entry: Any) -> bool:
    """Per-field shape only -- does NOT check referential integrity (whether the refs actually resolve to a
    real function id); that is invariant #2's own job, checked separately once the whole tree's real ids are
    known (see ``_dangling_interface_refs`` below)."""
    if not isinstance(entry, dict) or set(entry.keys()) != _INTERFACE_KEYS:
        return False
    return (
        _is_nonempty_str(entry.get("id"))
        and _is_nonempty_str(entry.get("from_function_ref"))
        and _is_nonempty_str(entry.get("to_function_ref"))
        and _is_nonempty_str(entry.get("description"))
    )


def _rebuild_node(node: dict[str, Any]) -> dict[str, Any]:
    """Deep, recursive rebuild -- every level of ``children`` is its own fresh dict/list, never aliased to
    caller-supplied structure. Precondition: ``node`` already passed ``_function_node_is_valid``. Same fix
    class ``decomposition.issue_tree``/``decomposition.logic_tree``'s own ``_rebuild_node`` already establish
    for this same family -- ``functional_decomposition.py`` was missing it (critic finding, 2026-09-11): without
    a rebuild, ``generate_functional_decomposition`` returned the caller's own ``top_function`` object by
    reference, so a caller retaining a reference to its input could mutate an already-validated record in place
    with no error and no re-validation."""
    return {"id": node["id"], "function_name": node["function_name"], "children": [_rebuild_node(child) for child in node["children"]]}


def _rebuild_interface(entry: dict[str, Any]) -> dict[str, Any]:
    """Same aliasing fix, applied to one ``interfaces[]`` entry -- flat, but still a fresh dict, not the
    caller's own object."""
    return {"id": entry["id"], "from_function_ref": entry["from_function_ref"], "to_function_ref": entry["to_function_ref"], "description": entry["description"]}


def collect_function_ids(node: dict[str, Any]) -> list[str]:
    """Pre-order walk collecting every ``id`` in the tree (the node itself, then every descendant, depth-first).
    PURE -- no validation performed here; callers must have already confirmed ``node`` is
    ``_function_node_is_valid`` before relying on this list for an integrity check (both call sites below do).
    The single shared traversal invariant #1 (duplicate detection) and invariant #2 (dangling-ref resolution)
    both build on, so neither invariant can drift from a different notion of "every id in the tree"."""
    ids = [node["id"]]
    for child in node["children"]:
        ids.extend(collect_function_ids(child))
    return ids


def _duplicate_ids(ids: list[str]) -> list[str]:
    seen: set[str] = set()
    duplicates: set[str] = set()
    for node_id in ids:
        if node_id in seen:
            duplicates.add(node_id)
        seen.add(node_id)
    return sorted(duplicates)


def _dangling_interface_refs(interfaces: list[dict[str, Any]], valid_ids: set[str]) -> list[dict[str, Any]]:
    dangling: list[dict[str, Any]] = []
    for entry in interfaces:
        missing = sorted({entry["from_function_ref"], entry["to_function_ref"]} - valid_ids)
        if missing:
            dangling.append({"interface_id": entry["id"], "from_function_ref": entry["from_function_ref"], "to_function_ref": entry["to_function_ref"], "missing": missing})
    return dangling


# --------------------------------------------------------------------------
# Convenience constructors -- eager, minimal validation, same discipline every prior module's own constructors
# use. NOT the invariant boundary: generate_functional_decomposition validates whatever dicts it is handed
# regardless of how they were built (a raw hand-built dict is exercised the same way in the CLI slice/tests).
# --------------------------------------------------------------------------


def function_node(node_id: str, function_name: str, children: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    if not _is_nonempty_str(node_id):
        raise InvariantViolation(f"FUNCDECOMP_EMPTY_NODE_ID: id must be a non-empty string, got {node_id!r}")
    if not _is_nonempty_str(function_name):
        raise InvariantViolation(f"FUNCDECOMP_EMPTY_FUNCTION_NAME: function_name must be a non-empty string, got {function_name!r}")
    children = children if children is not None else []
    if not isinstance(children, list):
        raise InvariantViolation(f"FUNCDECOMP_INVALID_CHILDREN: children must be a list, got {children!r}")
    return {"id": node_id, "function_name": function_name, "children": list(children)}


def interface(interface_id: str, from_function_ref: str, to_function_ref: str, description: str) -> dict[str, Any]:
    """One INPUT entry for ``generate_functional_decomposition``'s own ``interfaces`` parameter. Convenience
    constructor only -- does NOT itself check that the refs resolve to a real function id (that requires
    knowing the whole tree, which this function is never handed); ``generate_functional_decomposition`` performs
    that check once both the tree and the interfaces are both in hand."""
    if not _is_nonempty_str(interface_id):
        raise InvariantViolation(f"FUNCDECOMP_EMPTY_INTERFACE_ID: id must be a non-empty string, got {interface_id!r}")
    if not _is_nonempty_str(from_function_ref):
        raise InvariantViolation(f"FUNCDECOMP_EMPTY_FROM_FUNCTION_REF: from_function_ref must be a non-empty string, got {from_function_ref!r}")
    if not _is_nonempty_str(to_function_ref):
        raise InvariantViolation(f"FUNCDECOMP_EMPTY_TO_FUNCTION_REF: to_function_ref must be a non-empty string, got {to_function_ref!r}")
    if not _is_nonempty_str(description):
        raise InvariantViolation(f"FUNCDECOMP_EMPTY_INTERFACE_DESCRIPTION: description must be a non-empty string, got {description!r}")
    return {"id": interface_id, "from_function_ref": from_function_ref, "to_function_ref": to_function_ref, "description": description}


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_functional_decomposition(
    record_id: str,
    top_function: dict[str, Any],
    provenance: dict[str, Any],
    *,
    interfaces: list[dict[str, Any]] | None = None,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/functional-decomposition.schema.yaml``.

    Enforces BOTH real invariants fail-closed, in this order: id/version/provenance shape, tree shape (recursive,
    ``MAX_TREE_DEPTH``-bounded), invariant #1 (whole-tree id uniqueness -- computed from the tree's own raw ids
    BEFORE any interface is even looked at), interface per-field shape, THEN invariant #2 (referential integrity --
    walks the tree's own real ids fresh, never trusts that invariant #1's own pass already proved anything about
    interfaces). A dangling reference is refused at construction time, never silently stored.
    """
    interfaces = interfaces if interfaces is not None else []

    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"FUNCDECOMP_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"FUNCDECOMP_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"FUNCDECOMP_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    if not _function_node_is_valid(top_function):
        raise InvariantViolation(
            f"FUNCDECOMP_INVALID_TREE_SHAPE: top_function must be a recursively well-shaped function_node "
            f"(non-empty id, non-empty function_name, children a list of recursively well-shaped function_node entries), "
            f"deeper than MAX_TREE_DEPTH={MAX_TREE_DEPTH}, or too deeply nested to describe safely; got {_shallow_describe(top_function)}"
        )

    all_ids = collect_function_ids(top_function)
    duplicate_ids = _duplicate_ids(all_ids)
    if duplicate_ids:
        raise InvariantViolation(f"FUNCDECOMP_DUPLICATE_NODE_ID: {duplicate_ids} appear more than once in the whole top_function tree -- every id must be globally unique")

    if not isinstance(interfaces, list) or not all(_interface_entry_is_valid(entry) for entry in interfaces):
        raise InvariantViolation(
            f"FUNCDECOMP_INVALID_INTERFACE: every interfaces[] entry must have exactly the keys {sorted(_INTERFACE_KEYS)}, "
            f"non-empty id/from_function_ref/to_function_ref/description; got {_shallow_describe(interfaces)}"
        )

    valid_ids = set(all_ids)
    dangling = _dangling_interface_refs(interfaces, valid_ids)
    if dangling:
        raise InvariantViolation(f"FUNCDECOMP_DANGLING_INTERFACE_REF: {dangling} reference(s) a function id not present anywhere in top_function")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "top_function": _rebuild_node(top_function),
        "interfaces": [_rebuild_interface(entry) for entry in interfaces],
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive both invariants from raw fields, fail-closed on malformed input. Never call
# generate_functional_decomposition -- a hand-tampered record that bypassed the builder entirely must be caught
# exactly as a builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance is schema-valid.
    Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_tree_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Invariant #1, re-derived independently and fully: re-checks ``id``/``version`` plus a full recursive
    ``_function_node_is_valid`` pass over the record's own stored ``top_function``, then re-derives whole-tree id
    uniqueness from those same raw ids. Does NOT call ``generate_functional_decomposition`` and does not trust
    any stored flag -- a hand-tampered record (e.g. a duplicate id spliced in after construction) is caught here
    exactly as a builder-refused one would have been. FAILS CLOSED on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("tree_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("tree_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("tree_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    top_function = record.get("top_function")
    if not _function_node_is_valid(top_function):
        return _result("tree_integrity", False, [{"reason": f"top_function missing, malformed, or exceeds MAX_TREE_DEPTH={MAX_TREE_DEPTH}"}], validator, timestamp)

    all_ids = collect_function_ids(top_function)
    duplicate_ids = _duplicate_ids(all_ids)
    return _result("tree_integrity", not duplicate_ids, [{"duplicate_ids": duplicate_ids, "total_node_count": len(all_ids)}], validator, timestamp)


def evaluate_interface_referential_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Invariant #2, THE real differentiator, re-derived independently: re-walks the record's OWN raw
    ``top_function`` tree to collect every real function id (never trusts that ``evaluate_tree_integrity_gate``
    already ran, or that the builder ever ran at all), then checks every ``interfaces[]`` entry's own
    ``from_function_ref``/``to_function_ref`` against that fresh set. Same class
    ``ai_lego.modules.architecture.ddd``'s own ``evaluate_context_map_integrity_gate`` already establishes for an
    analogous edge-referencing-node problem, generalized here from a flat id set to a recursive tree's own ids.
    FAILS CLOSED on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("interface_referential_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)

    top_function = record.get("top_function")
    if not _function_node_is_valid(top_function):
        return _result("interface_referential_integrity", False, [{"reason": "top_function invalid -- cannot evaluate interface references"}], validator, timestamp)

    interfaces = record.get("interfaces")
    if not isinstance(interfaces, list) or not all(_interface_entry_is_valid(entry) for entry in interfaces):
        return _result("interface_referential_integrity", False, [{"reason": "interfaces missing, not a list, or contains a malformed entry"}], validator, timestamp)

    valid_ids = set(collect_function_ids(top_function))
    dangling = _dangling_interface_refs(interfaces, valid_ids)
    return _result("interface_referential_integrity", not dangling, [{"dangling_interfaces": dangling, "interface_count": len(interfaces)}], validator, timestamp)


def evaluate_functional_decomposition_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """All 3 of the contract's real gates, in catalog order: the one declared ``quality`` property, then both
    independent structural-integrity re-derivations. No ``evidence_labeling_required`` gate -- the contract sets
    that flag to ``false``, same "only emit gates for what is actually declared true" discipline
    ``strategy.bcg_matrix``'s own ``evaluate_bcg_matrix_gates`` already establishes."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_tree_integrity_gate(record, validator, timestamp),
        evaluate_interface_referential_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
