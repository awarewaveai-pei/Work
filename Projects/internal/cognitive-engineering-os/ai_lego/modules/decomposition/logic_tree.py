"""``decomposition.logic_tree`` -- F02 decomposition & structuring family, opened in this same batch
(multiple methods built in parallel by independent agents; this module covers Logic Tree only, see
``ai_lego/modules/decomposition/__init__.py``. A sibling, ``decomposition.issue_tree``, landed in the same
batch from a different agent -- read only to avoid naming collisions, not imported from, not depended on;
see the "DIFFERENT invariant class" note below).

Atlas cites this method ONCE: the F02 tool table row (L364: "Logic Tree｜按單一邏輯分類｜先定分類規則再展開｜
防止維度混亂｜MECE"). Grep-confirmed the only real hit case-insensitively across the whole Atlas file -- no
dedicated section, same thin-citation class ``strategy.bcg_matrix``/``strategy.ansoff`` already establish.

Shape: a ``classification_rule`` declared ONCE at the top level (Atlas's own "先定分類規則再展開" -- declare
the rule FIRST, then expand) applies uniformly to the whole tree; ``root`` is a recursive, NESTED tree of
``logic_tree_node`` (``decision.decision_tree``'s own embedded-node precedent, not ``root_cause.fault_tree``'s
flat id-cross-referenced shape -- a logic-tree branch is path-dependent under its own parent's classification
step, no Atlas citation supports cross-node reuse).

**Real invariant** (Atlas's own "防止維度混亂", prevent dimension confusion): at EVERY level of the tree --
not only the root's own children, but every descendant node's own ``children[]`` -- no two siblings under
the same parent may repeat a ``category_value``. Two siblings sharing a category value under one
classification rule means the classification did not actually partition anything at that level, the
mechanical expression of Atlas's own benefit line. Checked recursively by a single depth-bounded predicate
(``_logic_tree_node_is_valid``, same ``MAX_TREE_DEPTH``-bounded discipline ``security.attack_tree``'s own
``_attack_node_is_valid`` establishes -- an actually-unbounded recursive validator raises Python's own
RecursionError on pathological input), at BOTH construction (``generate_logic_tree``) and an independent
gate that re-derives from a record's own raw fields and does not trust any stored shape
(``evaluate_logic_tree_integrity_gate``).

This is a DIFFERENT invariant class from ``decomposition.issue_tree`` (whole-tree id uniqueness, a
completely different structural property). A ``category_value`` MAY legitimately repeat across DIFFERENT
branches/levels of a logic tree -- only SIBLINGS under the SAME parent must differ. Node ``id`` itself
carries no uniqueness requirement at all in this method; that is ``decomposition.issue_tree``'s own concern,
not duplicated here.

Grepped the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and ``Projects/internal/cognitive-
engineering-os`` trees case-insensitively for "logic_tree"/"logic tree"/"LogicTree" before writing any of
this method's own files: zero pre-existing implementation (only Atlas/inventory row mentions).
"""

from __future__ import annotations

from typing import Any

from ai_lego.errors import InvariantViolation

METHOD_ID = "decomposition.logic_tree"
RECORD_ID_PREFIX = "LOGICTREE-"
MAX_TREE_DEPTH = 100
# Same defensive-engineering lesson security.attack_tree's own MAX_TREE_DEPTH comment establishes: an
# actually-unbounded recursive validator raises Python's own RecursionError past a few hundred levels. Real
# logic trees (Atlas's own L364 citation, a single bare table row) are shallow by nature -- this bound
# rejects only pathological/malicious input, never real usage.

_KNOWN_NODE_KEYS = frozenset({"id", "category_value", "children"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- NEVER Python's own recursive ``repr()``, same
    discipline ``security.attack_tree``'s own ``_shallow_describe`` uses (a bare recursive repr over
    caller-supplied input of unknown size is itself a small denial-of-service surface in an error path)."""
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    return repr(value)


def _sibling_category_values_are_unique(children: list[Any]) -> bool:
    """Precondition: every entry in ``children`` is already known to be a dict with a ``category_value`` key
    (call only after each child has individually passed ``_logic_tree_node_is_valid``)."""
    values = [c["category_value"] for c in children]
    return len(set(values)) == len(values)


def _logic_tree_node_is_valid(node: Any, depth: int = 0) -> bool:
    """The recursive entry point, called by BOTH the builder and the gate at every level of the tree. A node
    is valid iff: exactly the 3 known keys, non-empty ``id``/``category_value``, ``children`` a list of
    RECURSIVELY valid ``logic_tree_node`` entries with no duplicate ``category_value`` among THIS node's own
    direct children -- the sibling-uniqueness check therefore runs once per level, at every level, because
    it is applied inside the same recursive call that validates that level's own children list. Bounded to
    MAX_TREE_DEPTH levels -- past that, refused as invalid rather than recursing further, so a
    pathologically deep tree fails closed instead of raising RecursionError."""
    if depth > MAX_TREE_DEPTH:
        return False
    if not isinstance(node, dict) or set(node.keys()) != _KNOWN_NODE_KEYS:
        return False
    if not _is_nonempty_str(node.get("id")):
        return False
    if not _is_nonempty_str(node.get("category_value")):
        return False
    children = node.get("children")
    if not isinstance(children, list):
        return False
    if not all(_logic_tree_node_is_valid(c, depth + 1) for c in children):
        return False
    return _sibling_category_values_are_unique(children)


def _find_sibling_duplicate_violations(node: Any, _depth: int = 0) -> list[str]:
    """Diagnostic-only recursive walk (NOT itself an invariant boundary) -- collects one human-readable
    violation string per node whose own ``children[]`` repeat a ``category_value`` among siblings, anywhere
    in the tree. Used to distinguish a specific ``LOGICTREE_DUPLICATE_SIBLING_CATEGORY_VALUE`` refusal from
    the generic shape-invalid case, and to give gate evidence a concrete location rather than a bare
    boolean. Tolerant of malformed input (returns what it can rather than raising) -- the authoritative
    accept/reject decision is always ``_logic_tree_node_is_valid``, never this function. Bounded to the SAME
    ``MAX_TREE_DEPTH`` -- this function is called on caller-supplied input that has ALREADY failed
    ``_logic_tree_node_is_valid`` (which may be because it is too deep, not because of a duplicate), so it
    must not itself be an unbounded recursion a pathologically deep tree could turn into a RecursionError
    (same lesson ``security.attack_tree``'s own ``_shallow_describe`` establishes for a different helper)."""
    if _depth > MAX_TREE_DEPTH or not isinstance(node, dict):
        return []
    violations: list[str] = []
    children = node.get("children")
    if isinstance(children, list):
        values = [c.get("category_value") for c in children if isinstance(c, dict)]
        duplicates = sorted({v for v in values if v is not None and values.count(v) > 1})
        if duplicates:
            violations.append(f"node {node.get('id')!r} has sibling children with duplicate category_value(s) {duplicates}")
        for child in children:
            violations.extend(_find_sibling_duplicate_violations(child, _depth + 1))
    return violations


def _rebuild_node(node: dict[str, Any]) -> dict[str, Any]:
    """Recursively REBUILDS every node -- the same family-wide 'rebuild, don't alias' discipline every prior
    module in this package already follows. Precondition: node is already known-valid (call only after
    ``_logic_tree_node_is_valid`` has passed)."""
    return {"id": node["id"], "category_value": node["category_value"], "children": [_rebuild_node(c) for c in node["children"]]}


def _count_nodes(node: dict[str, Any]) -> tuple[int, int]:
    """Returns (leaf_count, total_node_count), recursively. Descriptive gate evidence only, not a
    correctness invariant."""
    if not node["children"]:
        return (1, 1)
    leaf_total, node_total = 0, 1
    for child in node["children"]:
        leaves, nodes = _count_nodes(child)
        leaf_total += leaves
        node_total += nodes
    return (leaf_total, node_total)


def logic_tree_node(node_id: str, category_value: str, children: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Convenience constructor for one node. Not itself an invariant boundary -- ``generate_logic_tree``
    validates whatever dict it is handed regardless of how it was built (same
    ``root_cause.fault_tree``'s own ``basic_event``/``gate`` convention). ``children`` defaults to an empty
    list (a leaf) -- unlike ``decision.decision_tree``'s own >=2-branch minimum, a logic tree node MAY have
    zero children (see method contract's own compilation_decisions)."""
    if not _is_nonempty_str(node_id):
        raise InvariantViolation(f"LOGICTREE_EMPTY_NODE_ID: id must be a non-empty string, got {node_id!r}")
    if not _is_nonempty_str(category_value):
        raise InvariantViolation(f"LOGICTREE_EMPTY_CATEGORY_VALUE: category_value must be a non-empty string, got {category_value!r}")
    return {"id": node_id, "category_value": category_value, "children": list(children) if children is not None else []}


def generate_logic_tree(
    record_id: str,
    classification_rule: str,
    root: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/logic-tree.schema.yaml``. Enforces the method contract's own preconditions
    fail-closed, in this order: id/version/classification_rule shape, then ``root``'s own recursive
    well-formedness INCLUDING sibling category_value uniqueness at every level (a single call to
    ``_logic_tree_node_is_valid`` covers the whole tree, at every depth). REBUILDS the entire nested tree it
    owns, same family-wide 'rebuild, don't alias' discipline every prior module in this package already
    follows."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"LOGICTREE_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"LOGICTREE_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(classification_rule):
        raise InvariantViolation(
            f"LOGICTREE_EMPTY_CLASSIFICATION_RULE: classification_rule must be a non-empty string -- Atlas's own '先定分類規則再展開' "
            f"(declare the rule BEFORE expanding) requires the rule to exist before any node can be judged well-formed, got {classification_rule!r}"
        )
    if not _logic_tree_node_is_valid(root):
        violations = _find_sibling_duplicate_violations(root) if isinstance(root, dict) else []
        if violations:
            raise InvariantViolation(f"LOGICTREE_DUPLICATE_SIBLING_CATEGORY_VALUE: {'; '.join(violations)}")
        raise InvariantViolation(
            f"LOGICTREE_INVALID_ROOT: root must be a recursively well-shaped logic_tree_node (id/category_value non-empty strings, "
            f"children a list of valid logic_tree_node entries), deeper than MAX_TREE_DEPTH={MAX_TREE_DEPTH}, or too deeply nested "
            f"to describe safely; got {_shallow_describe(root)}"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "classification_rule": classification_rule,
        "root": _rebuild_node(root),
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_logic_tree_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's OWN raw fields -- does not trust any
    stored shape, including sibling category_value uniqueness at every level, and does NOT call
    ``generate_logic_tree``, so a hand-tampered record that bypassed the builder entirely is caught here
    exactly as a builder-refused one would have been. FAILS CLOSED on malformed input rather than
    crashing."""
    if not isinstance(record, dict):
        return _result("logic_tree_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("logic_tree_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("logic_tree_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("classification_rule")):
        return _result("logic_tree_integrity", False, [{"reason": "classification_rule missing or empty"}], validator, timestamp)

    root = record.get("root")
    if not _logic_tree_node_is_valid(root):
        violations = _find_sibling_duplicate_violations(root) if isinstance(root, dict) else []
        if violations:
            return _result("logic_tree_integrity", False, [{"reason": "duplicate sibling category_value", "details": violations}], validator, timestamp)
        return _result(
            "logic_tree_integrity",
            False,
            [{"reason": f"root invalid (malformed node, unknown keys, empty id/category_value, non-list children, or deeper than MAX_TREE_DEPTH={MAX_TREE_DEPTH})"}],
            validator,
            timestamp,
        )

    leaf_count, node_count = _count_nodes(root)
    return _result("logic_tree_integrity", True, [{"node_count": node_count, "leaf_count": leaf_count}], validator, timestamp)


def evaluate_logic_tree_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """The contract's one real gate. No ``provenance_required`` gate -- the contract sets that flag to
    ``false`` (see ``decomposition.logic_tree.contract.yaml``'s own ``quality``/``compilation_decisions``:
    the task-mandated shape carries no provenance field anywhere), same "only emit gates for what is
    actually declared true" discipline ``strategy.bcg_matrix``'s own ``evaluate_bcg_matrix_gates`` already
    establishes for its own absent ``evidence_labeling_required`` gate."""
    return [evaluate_logic_tree_integrity_gate(record, validator, timestamp)]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
