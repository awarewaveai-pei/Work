"""``decomposition.objective_tree`` -- F02 decomposition family, FIRST member (family previously
entirely unbuilt; grep-confirmed zero pre-existing ``ai_lego/modules/decomposition/`` directory
before writing this file).

Atlas cites this method ONCE: the F02 tool table row (L367: "Objective Tree｜把 Problem Tree 轉目標｜
負面狀態逐項轉正向｜直接連到方案設計｜Theory of Change"). Grep-confirmed the only real hit
case-insensitively across the whole Atlas file (plus the Problem Tree row's own L366 最佳搭配 column,
which names Objective Tree as ITS downstream) -- no dedicated section, same thin-citation class
``strategy.bcg_matrix`` already establishes.

**Deliberately no hard import of ``decomposition.problem_tree``**: that sibling method is being
built concurrently by a different agent in this same parallel batch and may not exist at build/run
time. ``source_problem_items`` is therefore a self-contained, structurally-compatible Problem-Tree-
shaped input (id/statement/polarity) -- NOT the actual ``ProblemTree`` record type -- avoiding any
build-order race while still faithfully implementing "把 Problem Tree 轉目標" as a real
transformation. See ``decomposition.objective_tree.contract.yaml``'s own
``compilation_decisions``/``open_questions``.

**Real invariant #1 (GENUINE_COMPUTE bijective coverage)**: the set of
``objectives[].source_item_ref`` values must equal EXACTLY the set of ``source_problem_items[].id``
values -- every source item covered by exactly one objective (no duplicates, no missing, no
dangling reference). Directly grounded in Atlas's own "負面狀態逐項轉正向" (each negative state
converted to positive, ITEM BY ITEM). Enforced at BOTH construction (``generate_objective_tree``
raises before any record is built) AND an independent gate
(``evaluate_objective_tree_integrity_gate``, re-derives from the record's OWN raw
``source_problem_items``/``objectives``, never trusts a stored flag) -- same two-layer discipline
every sibling module in this package establishes, generalized from
``ai_lego.modules.strategy.tows``'s own referential-integrity check into a stricter BIJECTIVE
version (there: every pairing must reference a real SWOT factor; here: every source item must ALSO
be referenced, and referenced EXACTLY once).

**Real invariant #2 (anti-passthrough guard)**: every objective's ``positive_statement`` must be
non-empty AND must NOT be character-for-character identical to its referenced source item's own
``statement`` -- a "conversion" that copies the negative statement verbatim has not actually
converted anything to positive (Atlas's own point is transformation, not passthrough). Cheap,
structural, task-mandated (see contract's own compilation_decisions on why this is not a semantic
check).

No provenance field exists anywhere in this record's shape (top-level or per-item) -- task-mandated
exact shape, disclosed in the contract's own open_questions, not an oversight of this module.

Grepped the whole ``ai_lego`` tree case-insensitively for "objective_tree"/"objective tree" before
writing any of this method's own files: zero pre-existing implementation.
"""

from __future__ import annotations

from typing import Any

from ai_lego.errors import InvariantViolation

METHOD_ID = "decomposition.objective_tree"
RECORD_ID_PREFIX = "OBJTREE-"

VALID_POLARITIES: frozenset[str] = frozenset({"CAUSE", "EFFECT"})
# Atlas's own Problem-Tree structure (L366): causes feed the problem, effects flow from it.
# DISCLOSED per-item, not computed.

_SOURCE_ITEM_KEYS = frozenset({"id", "statement", "polarity"})
_OBJECTIVE_KEYS = frozenset({"id", "source_item_ref", "positive_statement"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def source_problem_item(item_id: str, statement: str, polarity: str) -> dict[str, Any]:
    """One entry of ``generate_objective_tree``'s own ``source_problem_items`` parameter. Convenience
    constructor, fails closed on malformed input. Does NOT itself check cross-item id uniqueness or
    coverage by ``objectives`` -- both need the full list, checked only by
    ``generate_objective_tree``/the gate."""
    if not _is_nonempty_str(item_id):
        raise InvariantViolation(f"OBJTREE_EMPTY_SOURCE_ITEM_ID: id must be a non-empty string, got {item_id!r}")
    if not _is_nonempty_str(statement):
        raise InvariantViolation(f"OBJTREE_EMPTY_SOURCE_STATEMENT: statement must be a non-empty string, got {statement!r}")
    if polarity not in VALID_POLARITIES:
        raise InvariantViolation(f"OBJTREE_INVALID_POLARITY: {polarity!r} is not one of {sorted(VALID_POLARITIES)}")
    return {"id": item_id, "statement": statement, "polarity": polarity}


def objective(objective_id: str, source_item_ref: str, positive_statement: str) -> dict[str, Any]:
    """One entry of ``generate_objective_tree``'s own ``objectives`` parameter. Convenience
    constructor only -- fails closed on malformed input, but does NOT itself check that
    ``source_item_ref`` resolves to a real source item, or the anti-passthrough guard against that
    item's own statement: both need the full ``source_problem_items`` list, checked only by
    ``generate_objective_tree``/the gate."""
    if not _is_nonempty_str(objective_id):
        raise InvariantViolation(f"OBJTREE_EMPTY_OBJECTIVE_ID: id must be a non-empty string, got {objective_id!r}")
    if not _is_nonempty_str(source_item_ref):
        raise InvariantViolation(f"OBJTREE_EMPTY_SOURCE_ITEM_REF: source_item_ref must be a non-empty string, got {source_item_ref!r}")
    if not _is_nonempty_str(positive_statement):
        raise InvariantViolation(f"OBJTREE_EMPTY_POSITIVE_STATEMENT: positive_statement must be a non-empty string, got {positive_statement!r}")
    return {"id": objective_id, "source_item_ref": source_item_ref, "positive_statement": positive_statement}


def _source_item_entry_is_valid(entry: Any) -> bool:
    if not isinstance(entry, dict) or set(entry.keys()) != _SOURCE_ITEM_KEYS:
        return False
    if not _is_nonempty_str(entry.get("id")):
        return False
    if not _is_nonempty_str(entry.get("statement")):
        return False
    return entry.get("polarity") in VALID_POLARITIES


def _objective_entry_is_valid(entry: Any) -> bool:
    if not isinstance(entry, dict) or set(entry.keys()) != _OBJECTIVE_KEYS:
        return False
    if not _is_nonempty_str(entry.get("id")):
        return False
    if not _is_nonempty_str(entry.get("source_item_ref")):
        return False
    return _is_nonempty_str(entry.get("positive_statement"))


def _source_item_map(source_problem_items: Any) -> dict[str, dict[str, Any]]:
    """Validates ``source_problem_items`` is a real non-empty list of well-formed, UNIQUELY-id'd
    entries and returns its ``id -> entry`` map. Shared by the builder and the gate so neither can
    drift from the other. Raises with a specific code on every distinct failure mode."""
    if not isinstance(source_problem_items, list) or not source_problem_items:
        raise InvariantViolation(
            f"OBJTREE_EMPTY_SOURCE_ITEMS: source_problem_items must be a non-empty list (Atlas L367's own "
            f"'把 Problem Tree 轉目標' presumes a real Problem Tree to convert), got {source_problem_items!r}"
        )
    if not all(_source_item_entry_is_valid(entry) for entry in source_problem_items):
        raise InvariantViolation(
            f"OBJTREE_INVALID_SOURCE_ITEM: every entry must have exactly the keys {sorted(_SOURCE_ITEM_KEYS)}, non-empty id/statement, "
            f"and polarity in {sorted(VALID_POLARITIES)}, got {source_problem_items!r}"
        )
    mapping: dict[str, dict[str, Any]] = {}
    for entry in source_problem_items:
        if entry["id"] in mapping:
            raise InvariantViolation(f"OBJTREE_DUPLICATE_SOURCE_ITEM_ID: source_problem_items id {entry['id']!r} appears more than once")
        mapping[entry["id"]] = entry
    return mapping


def _verify_bijective_coverage(source_item_ids: set[str], objectives: list[dict[str, Any]]) -> None:
    """Real invariant #1 core, shared by the builder and the gate. Raises with a specific code on
    every distinct failure mode -- never silently guesses. ``objectives`` entries are assumed already
    shape-valid (called only after ``_objective_entry_is_valid``-equivalent checks)."""
    refs = [entry["source_item_ref"] for entry in objectives]

    dangling = sorted({ref for ref in refs if ref not in source_item_ids})
    if dangling:
        raise InvariantViolation(f"OBJTREE_DANGLING_SOURCE_REF: source_item_ref(s) {dangling} do not resolve to any source_problem_items[].id")

    seen: set[str] = set()
    duplicates: set[str] = set()
    for ref in refs:
        if ref in seen:
            duplicates.add(ref)
        else:
            seen.add(ref)
    if duplicates:
        raise InvariantViolation(
            f"OBJTREE_DUPLICATE_SOURCE_REF: source_item_ref(s) {sorted(duplicates)} are each covered by more than one objective "
            "(Atlas's own '逐項' requires exactly one objective per source item)"
        )

    missing = sorted(source_item_ids - set(refs))
    if missing:
        raise InvariantViolation(f"OBJTREE_MISSING_COVERAGE: source_problem_items id(s) {missing} are not converted by any objective (Atlas's own '逐項轉正向' requires every item converted)")


def generate_objective_tree(
    tree_id: str,
    source_problem_items: list[dict[str, Any]],
    objectives: list[dict[str, Any]],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/objective-tree.schema.yaml``. Enforces both real invariants
    fail-closed, same family-wide "raise-before-construction" discipline every sibling module in
    this package already establishes."""
    if not _is_nonempty_str(tree_id) or not tree_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"OBJTREE_INVALID_ID: tree_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {tree_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"OBJTREE_INVALID_VERSION: version must be a string, got {version!r}")

    source_item_map = _source_item_map(source_problem_items)

    if not isinstance(objectives, list) or not objectives:
        raise InvariantViolation(f"OBJTREE_EMPTY_OBJECTIVES: objectives must be a non-empty list, got {objectives!r}")
    if not all(_objective_entry_is_valid(entry) for entry in objectives):
        raise InvariantViolation(
            f"OBJTREE_INVALID_OBJECTIVE: every entry must have exactly the keys {sorted(_OBJECTIVE_KEYS)} with non-empty "
            f"id/source_item_ref/positive_statement, got {objectives!r}"
        )
    seen_objective_ids: set[str] = set()
    for entry in objectives:
        if entry["id"] in seen_objective_ids:
            raise InvariantViolation(f"OBJTREE_DUPLICATE_OBJECTIVE_ID: objectives id {entry['id']!r} appears more than once")
        seen_objective_ids.add(entry["id"])

    _verify_bijective_coverage(set(source_item_map.keys()), objectives)

    for entry in objectives:
        source_statement = source_item_map[entry["source_item_ref"]]["statement"]
        if entry["positive_statement"] == source_statement:
            raise InvariantViolation(
                f"OBJTREE_PASSTHROUGH_STATEMENT: objective {entry['id']!r}'s positive_statement is character-for-character identical to its "
                f"referenced source item {entry['source_item_ref']!r}'s own statement -- Atlas's own point is transformation, not passthrough"
            )

    return {
        "id": tree_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "source_problem_items": [dict(entry) for entry in source_problem_items],
        "objectives": [dict(entry) for entry in objectives],
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_objective_tree_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored
    value and does NOT call ``generate_objective_tree``, so a hand-tampered record that bypassed the
    builder entirely is caught here exactly as a builder-refused one would have been. Fails closed on
    malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("objective_tree_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("objective_tree_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("objective_tree_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    try:
        source_item_map = _source_item_map(record.get("source_problem_items"))
    except InvariantViolation as error:
        return _result("objective_tree_integrity", False, [{"reason": str(error)}], validator, timestamp)

    objectives = record.get("objectives")
    if not isinstance(objectives, list) or not objectives:
        return _result("objective_tree_integrity", False, [{"reason": "OBJTREE_EMPTY_OBJECTIVES: objectives missing, not a list, or empty"}], validator, timestamp)
    if not all(_objective_entry_is_valid(entry) for entry in objectives):
        return _result("objective_tree_integrity", False, [{"reason": "OBJTREE_INVALID_OBJECTIVE: malformed entry"}], validator, timestamp)

    seen_objective_ids: set[str] = set()
    for entry in objectives:
        if entry["id"] in seen_objective_ids:
            return _result("objective_tree_integrity", False, [{"reason": f"OBJTREE_DUPLICATE_OBJECTIVE_ID: {entry['id']!r}"}], validator, timestamp)
        seen_objective_ids.add(entry["id"])

    try:
        _verify_bijective_coverage(set(source_item_map.keys()), objectives)
    except InvariantViolation as error:
        return _result("objective_tree_integrity", False, [{"reason": str(error)}], validator, timestamp)

    for entry in objectives:
        source_statement = source_item_map[entry["source_item_ref"]]["statement"]
        if entry["positive_statement"] == source_statement:
            return _result(
                "objective_tree_integrity",
                False,
                [{"reason": f"OBJTREE_PASSTHROUGH_STATEMENT: objective {entry['id']!r} copies its source item's statement verbatim"}],
                validator,
                timestamp,
            )

    return _result(
        "objective_tree_integrity",
        True,
        [{"source_item_count": len(record["source_problem_items"]), "objective_count": len(objectives)}],
        validator,
        timestamp,
    )


def evaluate_objective_tree_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """The contract's one real gate. No provenance/evidence-labeling gate -- the contract sets both
    ``quality`` flags to ``false`` and this record's own shape carries no provenance field anywhere
    (see decomposition.objective_tree.contract.yaml's own ``quality``/``compilation_decisions``),
    same "only emit gates for what is actually declared true" discipline ``strategy.ansoff``'s own
    ``evaluate_ansoff_gates`` already establishes."""
    return [evaluate_objective_tree_integrity_gate(record, validator, timestamp)]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
