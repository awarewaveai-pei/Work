"""``decomposition.problem_tree`` -- F02 decomposition & structuring family, opening member (1 of 9 F02
methods built in this same parallel batch: issue_tree/logic_tree/mece/objective_tree/
functional_decomposition/fast/hierarchical_task_analysis/wbs are the other 8, each its own sibling agent's
slice under this same ``ai_lego/modules/decomposition/`` package).

Atlas cites this method TWICE: the F02 tool table row (L366: "Problem Tree｜原因→核心問題→後果｜問題置中、
原因向下、效果向上｜分離症狀與原因｜Objective Tree") and a dedicated §12.8 (L2633-2639: 用途 "把核心問題、
原因與後果分開"; 效益 "政策、NGO、教育、公共問題非常實用"; 搭配 "Problem Tree → Objective Tree → Theory of
Change"). Grep-confirmed these are the only 2 real hits case-insensitively across the whole Atlas file --
no §4 composition formula, no §14.1 legal-chain mention beyond ``causal.theory_of_change``'s own
corroborating reference to this section's own 搭配 line.

**Shape is DELIBERATELY flat, not a deep recursive tree**: Atlas's own citation names exactly 3 tiers
("問題置中、原因向下、效果向上" -- problem centered, causes downward, effects upward). Contrast with
``decomposition.issue_tree`` (a SIBLING method in this same batch, see ``issue_tree.py``), whose own
citation ("主問題→第一層→第二層→檢查遺漏") explicitly describes open-ended recursive branching -- Problem
Tree's citation names no such depth, so ``causes``/``effects`` here are plain flat lists of leaf nodes,
never nested sub-causes.

**Contrast with ``root_cause.fishbone``** (see ``ai_lego/modules/root_cause/fishbone.py``, read in full
before writing this module): Fishbone's causes are grouped into caller-disclosed CATEGORIES -- a
single-sided "what caused this" taxonomy exercise (Atlas §11.4). Problem Tree's own citation asks a
structurally different, SYMMETRIC question: both what causes this problem AND what this problem itself
causes ("分離症狀與原因" -- separate symptoms/effects from causes). This module therefore does NOT
categorize anything; ``causes``/``effects`` are two flat, uncategorized lists on opposite sides of one
``core_problem`` -- a differentiation, not a shallower reimplementation of Fishbone.

**Real invariants (GENUINE_COMPUTE-checkable), directly grounded in the method's own stated benefit**:
1. ``causes[].id`` and ``effects[].id`` must be DISJOINT sets. If any id appeared in both lists, the tree
   would not have actually separated anything -- defeating Atlas's own stated benefit for this method
   ("分離症狀與原因").
2. ``causes[].id`` must be unique WITHIN ``causes`` itself, and likewise ``effects[].id`` WITHIN
   ``effects`` (critic finding, 2026-09-11: originally missing -- the disjointness check alone built a
   ``set()`` from each list before comparing, which silently absorbed a within-list duplicate without ever
   surfacing it; two causes sharing one id makes "the specific cause" ambiguous, the same separation
   purpose failure as invariant #1).

Both enforced fail-closed at construction (``generate_problem_tree`` raises BEFORE building any record)
and independently re-checked by ``evaluate_problem_tree_integrity_gate`` directly from the record's own
raw ``causes``/``effects`` id sets -- never trusting a stored flag or the builder's own prior work, same
"re-derive from raw fields, do not call the builder" discipline
``strategy.bcg_matrix.evaluate_bcg_matrix_integrity_gate`` already establishes.

**Per-item provenance (critic finding, 2026-09-11)**: each cause/effect ``statement`` is a CLAIM (e.g.
"客服回應時間拉長" asserts a specific factor caused the problem) -- the same kind of content
``root_cause.fishbone``'s own sibling ``cause-hypothesis-set.schema.yaml`` already stamps with a per-item
``provenance_record`` for exactly this reason. The original design brief omitted this field entirely
(unlike ``decomposition.fast``'s bare function names or ``decomposition.logic_tree``'s category labels,
which remain legitimate exceptions as pure structural, non-claim content) -- added post-critic-review,
disclosed as a correction, not a silent addition.

Grepped the whole Atlas file case-insensitively for "problem tree"/"problem_tree" before writing any of
this method's own files: confirmed exactly the 2 citations above. Grepped the whole ``ai_lego`` tree
case-insensitively for "problem_tree"/"ProblemTree"/"PROBTREE" before writing: zero pre-existing
implementation.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "decomposition.problem_tree"
RECORD_ID_PREFIX = "PROBTREE-"

_NODE_KEYS = frozenset({"id", "statement", "provenance"})
# Shared shape for both a cause node and an effect node -- see module docstring: Problem Tree does not
# categorize (unlike root_cause.fishbone), so there is no structural difference between the two node types
# other than which list (causes vs effects) they live in.


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _node_is_valid(entry: Any) -> bool:
    """Shared predicate for one causes[] OR effects[] entry: exactly the keys {id, statement, provenance},
    id/statement non-empty strings, provenance schema-valid. Called by BOTH the builder and the gate (same
    predicate, no drift possible)."""
    if not isinstance(entry, dict) or set(entry.keys()) != _NODE_KEYS:
        return False
    if not _is_nonempty_str(entry.get("id")) or not _is_nonempty_str(entry.get("statement")):
        return False
    return provenance_is_valid(entry.get("provenance"))


def _duplicate_ids(items: list[dict[str, Any]]) -> list[str]:
    seen: set[str] = set()
    duplicates: set[str] = set()
    for item in items:
        item_id = item["id"]
        if item_id in seen:
            duplicates.add(item_id)
        seen.add(item_id)
    return sorted(duplicates)


def tree_node(node_id: str, statement: str, provenance: dict[str, Any]) -> dict[str, Any]:
    """One INPUT entry for either ``generate_problem_tree``'s ``causes`` or ``effects`` parameter.
    Convenience constructor only -- emits exactly ``{id, statement, provenance}``, same convention
    ``strategy.bcg_matrix``'s own ``portfolio_item`` already establishes for its own entries. Does NOT
    itself check cross-list id disjointness or within-list uniqueness: both are whole-tree invariants only
    checkable once ALL causes/effects are known, so they are enforced solely by ``generate_problem_tree``
    (and re-derived by the gate), never here."""
    if not _is_nonempty_str(node_id):
        raise InvariantViolation(f"PROBTREE_EMPTY_NODE_ID: id must be a non-empty string, got {node_id!r}")
    if not _is_nonempty_str(statement):
        raise InvariantViolation(f"PROBTREE_EMPTY_NODE_STATEMENT: statement must be a non-empty string, got {statement!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"PROBTREE_INVALID_NODE_PROVENANCE: provenance failed schema validation, got {provenance!r}")
    return {"id": node_id, "statement": statement, "provenance": provenance}


def generate_problem_tree(
    tree_id: str,
    core_problem: str,
    causes: list[dict[str, Any]],
    effects: list[dict[str, Any]],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/problem-tree.schema.yaml``.

    Enforces, fail-closed, BEFORE constructing any record:
      1. ``core_problem`` is a non-empty string (Atlas's own "問題置中").
      2. ``causes``/``effects`` are each non-empty lists of well-formed ``{id, statement, provenance}``
         entries -- a problem tree with zero disclosed causes or zero disclosed effects has not actually
         separated anything (Atlas's own benefit "分離症狀與原因").
      3. ``causes[].id`` is unique WITHIN ``causes``, and ``effects[].id`` is unique WITHIN ``effects`` --
         a caller who repeats an id within one list is refused outright, never silently deduplicated.
      4. ``causes[].id`` and ``effects[].id`` are DISJOINT sets -- the method's own core invariant (see
         module docstring). A caller who reuses the same id in both lists is refused outright, never
         silently deduplicated or renamed.
    """
    if not _is_nonempty_str(tree_id) or not tree_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"PROBTREE_INVALID_ID: tree_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {tree_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"PROBTREE_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(core_problem):
        raise InvariantViolation(f"PROBTREE_EMPTY_CORE_PROBLEM: core_problem must be a non-empty string, got {core_problem!r}")

    if not isinstance(causes, list) or not causes:
        raise InvariantViolation(
            f"PROBTREE_EMPTY_CAUSES: causes must be a non-empty list (Atlas §12.8's own '把核心問題、原因與後果分開' purpose "
            f"presumes at least one disclosed cause), got {causes!r}"
        )
    if not isinstance(effects, list) or not effects:
        raise InvariantViolation(
            f"PROBTREE_EMPTY_EFFECTS: effects must be a non-empty list (same purpose, at least one disclosed effect), got {effects!r}"
        )
    if not all(_node_is_valid(item) for item in causes):
        raise InvariantViolation(f"PROBTREE_INVALID_CAUSE: every causes[] entry must have exactly the keys {sorted(_NODE_KEYS)} with non-empty id/statement and schema-valid provenance, got {causes!r}")
    if not all(_node_is_valid(item) for item in effects):
        raise InvariantViolation(f"PROBTREE_INVALID_EFFECT: every effects[] entry must have exactly the keys {sorted(_NODE_KEYS)} with non-empty id/statement and schema-valid provenance, got {effects!r}")

    duplicate_causes = _duplicate_ids(causes)
    if duplicate_causes:
        raise InvariantViolation(f"PROBTREE_DUPLICATE_CAUSE_ID: id(s) {duplicate_causes!r} appear more than once within causes[] -- every cause id must be unique within its own list")
    duplicate_effects = _duplicate_ids(effects)
    if duplicate_effects:
        raise InvariantViolation(f"PROBTREE_DUPLICATE_EFFECT_ID: id(s) {duplicate_effects!r} appear more than once within effects[] -- every effect id must be unique within its own list")

    cause_ids = {item["id"] for item in causes}
    effect_ids = {item["id"] for item in effects}
    overlap = cause_ids & effect_ids
    if overlap:
        raise InvariantViolation(
            f"PROBTREE_CAUSE_EFFECT_ID_COLLISION: id(s) {sorted(overlap)!r} appear in BOTH causes and effects -- Atlas §12.8's "
            f"own core benefit ('分離症狀與原因' / separate symptoms from causes) requires causes[].id and effects[].id to be "
            f"disjoint sets; a shared id means the tree has not actually separated anything"
        )

    return {
        "id": tree_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "core_problem": core_problem,
        "causes": [dict(item) for item in causes],
        "effects": [dict(item) for item in effects],
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_problem_tree_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives every real invariant from the record's OWN raw fields -- does not trust any stored value
    and does NOT call ``generate_problem_tree``, so a hand-tampered record that bypassed the builder
    entirely (e.g. a directly-constructed dict with a colliding id spliced into ``effects``) is caught here
    exactly as a builder-refused one would have been. In particular, this is the ONLY place the
    ``causes``/``effects`` id-disjointness invariant is re-checked independently of construction-time
    enforcement. Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("problem_tree_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("problem_tree_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("problem_tree_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("core_problem")):
        return _result("problem_tree_integrity", False, [{"reason": "core_problem missing or empty"}], validator, timestamp)

    causes = record.get("causes")
    effects = record.get("effects")
    if not isinstance(causes, list) or not causes:
        return _result("problem_tree_integrity", False, [{"reason": "causes missing, not a list, or empty"}], validator, timestamp)
    if not isinstance(effects, list) or not effects:
        return _result("problem_tree_integrity", False, [{"reason": "effects missing, not a list, or empty"}], validator, timestamp)
    if not all(_node_is_valid(item) for item in causes):
        return _result("problem_tree_integrity", False, [{"reason": "causes contains a malformed entry (bad shape, empty id/statement, or invalid provenance)"}], validator, timestamp)
    if not all(_node_is_valid(item) for item in effects):
        return _result("problem_tree_integrity", False, [{"reason": "effects contains a malformed entry (bad shape, empty id/statement, or invalid provenance)"}], validator, timestamp)

    duplicate_causes = _duplicate_ids(causes)
    if duplicate_causes:
        return _result("problem_tree_integrity", False, [{"reason": "duplicate id(s) within causes[]", "duplicate_ids": duplicate_causes}], validator, timestamp)
    duplicate_effects = _duplicate_ids(effects)
    if duplicate_effects:
        return _result("problem_tree_integrity", False, [{"reason": "duplicate id(s) within effects[]", "duplicate_ids": duplicate_effects}], validator, timestamp)

    cause_ids = {item["id"] for item in causes}
    effect_ids = {item["id"] for item in effects}
    overlap = cause_ids & effect_ids
    if overlap:
        return _result(
            "problem_tree_integrity",
            False,
            [{"reason": "causes/effects id sets are not disjoint", "colliding_ids": sorted(overlap)}],
            validator,
            timestamp,
        )

    return _result("problem_tree_integrity", True, [{"cause_count": len(causes), "effect_count": len(effects)}], validator, timestamp)


def evaluate_problem_tree_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """The contract's one real gate, re-deriving all four real invariants (shape, within-list uniqueness x2,
    cross-list disjointness). ``quality.evidence_labeling_required`` is ``false`` (see
    decomposition.problem_tree.contract.yaml's own ``quality``/``compilation_decisions`` -- thin §12.8
    citation, no explicit unevidenced-claim caution cited), so no separate evidence-labeling gate is
    emitted, same "only emit gates for what is actually declared true" discipline
    ``strategy.bcg_matrix``'s own ``evaluate_bcg_matrix_gates`` already establishes. Provenance is checked
    PER-ITEM inside ``evaluate_problem_tree_integrity_gate`` itself (via ``_node_is_valid``), not as a
    separate top-level ``provenance_required`` gate -- there is no single record-level provenance field to
    check (see module docstring: provenance lives on each cause/effect claim, not the container record)."""
    return [evaluate_problem_tree_integrity_gate(record, validator, timestamp)]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
