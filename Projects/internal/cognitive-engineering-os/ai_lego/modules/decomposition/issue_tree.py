"""``decomposition.issue_tree`` -- F02 "拆解與結構化" (Decomposition & Structuring) family, 1st member, opening
a brand-new family (grep-confirmed zero pre-existing ``ai_lego/modules/decomposition/`` before this file).

Atlas cites this method via the F02 tool table row (L363: "Issue Tree｜把大問題拆成可分析分支｜主問題→第一層→第二層→
檢查遺漏｜建立分析計畫｜MECE、Evidence Matrix") PLUS a dedicated worked-example section, §12.6 (L2604-2620): a
mermaid diagram showing one root question ("是否進入新市場?") branching into 5 first-level sub-questions
(市場吸引力/公司能力/財務可行性/法規可行性/執行風險), benefit line "研究範圍、責任與 Evidence Collection 都可以直接沿樹
展開". Grep-confirmed the only 2 real hits (table row + dedicated section) case-insensitively across the whole
Atlas file for "issue tree"/"issue_tree"/"議題樹"/"問題樹" -- no §14.1 legal-chain mention, no §22.3 gate-table
row.

**Differentiator from ``association.mind_map`` (read in full before writing this module)**: mind_map is a
FIXED exactly-4-level nested tree (central_topic -> main_branches -> sub_branches -> keywords), Atlas's own
citation naming that exact terminus. Issue Tree's own citation names NO fixed depth anywhere -- §12.6's own
diagram shows one worked depth (root -> first-level questions only), not a mandated maximum. This module
therefore uses OPEN, arbitrary-depth recursion, the same representation choice
``ai_lego/modules/decision/decision_tree.py`` already establishes for its own ``root``/``MAX_TREE_DEPTH``
bound (100, purely defensive -- real issue trees are shallow; this rejects only pathological input, never real
usage, and keeps recursive traversal well inside Python's own default recursion limit).

**The one real, GENUINE_COMPUTE-checkable invariant this module enforces beyond per-field shape**: every node
``id`` anywhere in the WHOLE tree (the root and every descendant, at ANY depth) is globally unique. This is a
real structural defect-catcher, not a stylistic preference -- a duplicate id would make a later cross-reference
to "the specific branch named X" ambiguous (Atlas's own §12.6 benefit line: "研究範圍、責任與 Evidence Collection
都可以直接沿樹展開" presumes each branch is addressable). Same invariant CLASS
``ai_lego/modules/association/mind_map.py``'s own ``MINDMAP_DUPLICATE_BRANCH_ID`` already establishes (there,
bounded to exactly 2 nesting levels; here, generalized to arbitrary recursive depth). Enforced BOTH at
construction (raise BEFORE any record is built, ``ISSUETREE_DUPLICATE_NODE_ID``) AND independently by a gate
that re-derives from the record's own raw fields, never trusting a stored flag -- same two-layer discipline
every sibling module in this suite already establishes. A second real invariant, non-empty ``question`` text on
every node (``ISSUETREE_INVALID_TREE_SHAPE``, folded into the same recursive shape check as node structure
itself), is enforced the same way.

**Node shape**: ``{id, question, children}`` -- ONE uniform recursive node type (not mind_map's two distinct
main_branch/sub_branch levels), because this method's own open-ended recursion needs no level-specific fields.
``children`` is ALWAYS a present key (never omitted) and MAY be an empty list -- an empty list IS the legal
leaf-node representation (a branch not yet further decomposed), not an omitted branch the way mind_map's own
optional ``sub_branches``/``keywords`` keys work.

**Provenance placement (compilation decision, see method contract)**: RECORD-LEVEL ONLY, matching
``decision.decision_tree``'s own placement, not ``bcg_matrix``/``mind_map``'s per-entry stamps -- an issue-tree
node is pure structural question text (Atlas's own §12.6 diagram shows plain question labels, no per-node
evidence/reasoning field), not a per-node judgment call. ``provenance`` is nonetheless REQUIRED at the record
level: grep-confirmed every one of this suite's 119 existing typed-object schemas carries a provenance field,
so omitting it entirely here would be inconsistent with every sibling method, not a citation-grounded choice.

Grepped the whole ``ai_lego`` tree (and the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` tree)
case-insensitively for "issue_tree"/"issue tree"/"IssueTree" before writing any of this method's own files:
zero pre-existing implementation.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "decomposition.issue_tree"
RECORD_ID_PREFIX = "ISSUETREE-"
MAX_TREE_DEPTH = 100
# Purely defensive bound, same class ai_lego/modules/decision/decision_tree.py's own MAX_TREE_DEPTH already
# establishes: real issue trees (Atlas's own §12.6 worked example is 2 levels) are shallow; this rejects only
# pathological input, never real usage.

_NODE_KEYS = frozenset({"id", "question", "children"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- NEVER a recursive ``repr()`` over caller-supplied
    input of unknown size/depth, same denial-of-service-in-an-error-path avoidance
    ``association.mind_map``'s own ``_shallow_describe`` already establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _node_is_valid(node: Any, depth: int = 0) -> bool:
    """Shared predicate (the recursive entry point), called by BOTH the builder and the gate -- one uniform
    node shape, no input-vs-stored distinction (unlike ``decision.decision_tree``'s own node, this method has
    no GENUINE_COMPUTE field attached to a node by the builder, so there is nothing for a "stored" shape to
    add). Bounded to ``MAX_TREE_DEPTH`` -- past that, refused as invalid rather than recursing further, same
    fail-closed-not-RecursionError discipline ``decision.decision_tree``'s own ``_node_is_valid`` already
    establishes."""
    if depth > MAX_TREE_DEPTH:
        return False
    if not isinstance(node, dict) or set(node.keys()) != _NODE_KEYS:
        return False
    if not _is_nonempty_str(node.get("id")) or not _is_nonempty_str(node.get("question")):
        return False
    children = node.get("children")
    if not isinstance(children, list):
        return False
    return all(_node_is_valid(child, depth + 1) for child in children)


def _collect_node_ids(node: dict[str, Any]) -> list[str]:
    """Every id in the WHOLE tree, in tree (pre-order) traversal order: this node's own id first, then each
    child's own subtree, recursively. Precondition: ``node`` (and every descendant) already passed
    ``_node_is_valid`` (id present, a non-empty string, ``children`` a list)."""
    ids: list[str] = [node["id"]]
    for child in node["children"]:
        ids.extend(_collect_node_ids(child))
    return ids


def _first_duplicate_id(ids: list[str]) -> str | None:
    seen: set[str] = set()
    for node_id in ids:
        if node_id in seen:
            return node_id
        seen.add(node_id)
    return None


def _rebuild_node(entry: dict[str, Any]) -> dict[str, Any]:
    """Deep, recursive rebuild -- every level of ``children`` is its own fresh dict/list, never aliased to
    caller-supplied structure. Precondition: ``entry`` already passed ``_node_is_valid``."""
    return {"id": entry["id"], "question": entry["question"], "children": [_rebuild_node(child) for child in entry["children"]]}


def issue_tree_node(node_id: str, question: str, *, children: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """One INPUT ``issue_tree_node`` (root or any descendant) for ``generate_issue_tree``'s own ``root``
    parameter (or nested inside another node's own ``children``). Convenience constructor only -- eager,
    minimal validation on this node's own two string fields; does NOT itself walk/validate ``children``'s own
    shape or check whole-tree id uniqueness (``generate_issue_tree`` validates whatever dict it is handed
    regardless of how it was built, same "helper is not the invariant boundary" discipline
    ``association.mind_map``'s own ``main_branch``/``sub_branch`` docstring already establishes -- mutation
    tests build nodes directly, bypassing this helper, to prove the builder itself enforces the invariants).
    ``children`` defaults to an empty list (a leaf node) when omitted or falsy."""
    if not _is_nonempty_str(node_id):
        raise InvariantViolation(f"ISSUETREE_EMPTY_NODE_ID: node id must be a non-empty string, got {node_id!r}")
    if not _is_nonempty_str(question):
        raise InvariantViolation(f"ISSUETREE_EMPTY_QUESTION: question must be a non-empty string, got {question!r}")
    return {"id": node_id, "question": question, "children": [_rebuild_node(child) for child in (children or [])]}


def generate_issue_tree(
    record_id: str,
    root: dict[str, Any],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/issue-tree.schema.yaml``. Enforces both real invariants fail-closed, in
    this order: id/version/provenance shape, THEN the full recursive tree-shape check (``root`` as
    CALLER-SUPPLIED, non-empty id/question on every node, ``children`` a list -- possibly empty -- of
    recursively well-shaped nodes, bounded to ``MAX_TREE_DEPTH``), THEN whole-tree id uniqueness. REBUILDS
    the entire tree recursively (``_rebuild_node``); ``provenance`` is stored by reference, same family-wide
    convention every prior module in this package already follows."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"ISSUETREE_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"ISSUETREE_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"ISSUETREE_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    if not _node_is_valid(root):
        raise InvariantViolation(
            f"ISSUETREE_INVALID_TREE_SHAPE: root must be a recursively well-shaped issue_tree_node (non-empty id/question, "
            f"children a list -- possibly empty -- of recursively well-shaped issue_tree_node entries, no unknown keys), "
            f"no deeper than MAX_TREE_DEPTH={MAX_TREE_DEPTH}; got {_shallow_describe(root)}"
        )

    duplicate_id = _first_duplicate_id(_collect_node_ids(root))
    if duplicate_id is not None:
        raise InvariantViolation(
            f"ISSUETREE_DUPLICATE_NODE_ID: node id {duplicate_id!r} is used more than once across the tree "
            f"(every node, at any depth, shares one id namespace)"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "root": _rebuild_node(root),
        "provenance": provenance,
    }


def all_questions(record: dict[str, Any]) -> list[str]:
    """Real derived view (recomputed fresh every call, never a stored field) -- every node's own ``question``
    anywhere in the record's own tree, in tree (pre-order) traversal order. Atlas's own §12.6 benefit line
    ("研究範圍...都可以直接沿樹展開", the research scope unrolled directly along the tree), made concrete: the full
    flattened list of sub-questions this decomposition pass produced, at a glance. SCOPE: operates on an
    ALREADY-VALID record (``generate_issue_tree``/``evaluate_issue_tree_integrity_gate`` already proved
    shape); does not re-validate and will raise on a malformed record, same ALREADY-VALID-record scope
    ``association.mind_map``'s own ``all_keywords`` already documents."""

    def _walk(node: dict[str, Any]) -> list[str]:
        questions = [node["question"]]
        for child in node["children"]:
            questions.extend(_walk(child))
        return questions

    return _walk(record["root"])


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own (record-level-only, see module
    docstring) provenance is schema-valid. Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_issue_tree_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_issue_tree``, so a hand-tampered record that bypassed the builder entirely is
    caught here exactly as a builder-refused one would have been. In particular, this is the ONLY place the
    WHOLE tree's own id uniqueness is re-walked and re-checked from scratch. Fails closed on malformed input
    rather than crashing."""
    if not isinstance(record, dict):
        return _result("issue_tree_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("issue_tree_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("issue_tree_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    root = record.get("root")
    if not _node_is_valid(root):
        return _result(
            "issue_tree_integrity",
            False,
            [{"reason": f"root invalid (malformed node, unknown/missing keys, non-list children, empty id/question, or deeper than MAX_TREE_DEPTH={MAX_TREE_DEPTH})"}],
            validator,
            timestamp,
        )

    duplicate_id = _first_duplicate_id(_collect_node_ids(root))
    if duplicate_id is not None:
        return _result("issue_tree_integrity", False, [{"reason": "ISSUETREE_DUPLICATE_NODE_ID", "duplicate_id": duplicate_id}], validator, timestamp)

    all_ids = _collect_node_ids(root)
    return _result("issue_tree_integrity", True, [{"total_node_count": len(all_ids)}], validator, timestamp)


def evaluate_issue_tree_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the one declared ``quality`` property, then the
    independent structural-integrity re-derivation. No ``evidence_labeling_required`` gate -- the contract
    sets that flag to ``false`` (see decomposition.issue_tree.contract.yaml's own ``quality``/
    ``compilation_decisions``), same "only emit gates for what is actually declared true" discipline
    ``strategy.bcg_matrix``'s own ``evaluate_bcg_matrix_gates`` already establishes."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_issue_tree_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
