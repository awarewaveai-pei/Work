"""``decomposition.wbs`` -- F02 "拆解與結構化" (Decomposition & Structuring) family, one of 9 concurrent members
opening this family in the same batch (``decomposition.issue_tree``/``logic_tree``/``problem_tree``/
``functional_decomposition`` confirmed to already exist mid-batch -- ``issue_tree.py`` read in full before
writing this module as the closest structural template; zero overlap, distinct node shapes and invariants).

Atlas cites this method ONCE: the F02 tool table row (L371: "WBS｜把交付拆工作包｜Deliverable→Work package→
owner/estimate｜降低遺漏｜Critical Path、RACI"). Grep-confirmed the only real hit case-insensitively across the
whole Atlas file -- no dedicated section, same thin-citation class ``decomposition.issue_tree`` already
establishes for this family.

**Node shape and the leaf/non-leaf tier rule**: Atlas's own citation is a strict left-to-right progression,
"Deliverable→Work package→owner/estimate" -- a deliverable (non-leaf node) decomposes into work packages
(leaf nodes), and owner/estimate are a WORK-PACKAGE-tier property, not a deliverable-tier one. This module
enforces, at every ``WbsNode`` (``{id, name, owner, estimate_hours, total_estimate_hours, children}``), TWO
real invariants, each checked BOTH at construction (raise BEFORE any record is built) AND independently by a
gate that re-derives from raw fields, same two-layer discipline every sibling module in this suite already
establishes:

1. **Leaf/non-leaf owner+estimate placement** (``WBS_LEAF_MISSING_OWNER_OR_ESTIMATE`` /
   ``WBS_NONLEAF_HAS_OWNER_OR_ESTIMATE``): a LEAF node (``children == []``) MUST carry a non-null ``owner``
   AND a non-null ``estimate_hours``; a NON-LEAF node MUST carry ``owner=None`` AND ``estimate_hours=None``.
   Real invariant, not a stylistic preference -- a parent claiming its own separate estimate would double-count
   against its own children's real work.
2. **``total_estimate_hours`` GENUINE_COMPUTE rollup** (``WBS_TOTAL_ESTIMATE_MISMATCH``, re-derived by
   ``evaluate_wbs_rollup_integrity_gate``): the real, external WBS "100% rule" -- a parent's total work equals
   the sum of its parts. At every node, ``total_estimate_hours`` is mechanically the sum of ``estimate_hours``
   over every LEAF DESCENDANT of that node (a leaf's own ``estimate_hours``, for a leaf). NEVER a builder
   parameter -- no code path lets a caller supply it; the builder always computes it via ``_roll_up_wbs_node``
   (below), and the gate independently RE-DERIVES it via the SAME function, called fresh on the record's own
   raw fields, never trusting whatever is already stored -- same "one rollup implementation, reused by both
   layers, never a second that could drift" discipline ``ai_lego/compute/decision_tree/rollup.py``'s own
   ``roll_up_node`` already establishes for a different arithmetic (max / probability-weighted-sum there,
   plain sum here).

Open, arbitrary recursion depth (Atlas's own citation names no fixed depth), defensively bounded to
``MAX_TREE_DEPTH=100`` -- same purely-defensive bound every tree-shaped sibling module in this package already
establishes (``decomposition.issue_tree`` / ``ai_lego/modules/decision/decision_tree.py``): real WBS trees are
shallow; this rejects only pathological input, never real usage.

**Global node-id uniqueness across the whole tree is deliberately NOT enforced here** (unlike
``decomposition.issue_tree``'s own ``ISSUETREE_DUPLICATE_NODE_ID``) -- not one of this method's own 2 real,
task-mandated invariants; inventing a third would be fabricated scope (disclosed gap, see method contract's
own OQ-WBS-4).

**Provenance placement (disclosed ADDITION beyond this task's own literal design spec, which named no
provenance field anywhere)**: RECORD-LEVEL ONLY, same placement ``decomposition.issue_tree``'s own module
already establishes -- a WBS node here is pure structural/estimate content, not a per-node judgment call
needing its own evidentiary stamp. Added because every one of this suite's existing typed-object schemas
carries a provenance field (grep-confirmed by ``decomposition.issue_tree.py``'s own module docstring, itself
re-confirmed here); omitting it entirely would be inconsistent with every sibling method, not a
citation-grounded choice. See method contract's own OQ-WBS-3.

Grepped the whole ``ai_lego`` tree (and the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` tree)
case-insensitively for "decomposition.wbs" / "WorkBreakdownStructure" / "work_breakdown" before writing any of
this method's own files: zero pre-existing implementation.
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "decomposition.wbs"
RECORD_ID_PREFIX = "WBS-"
MAX_TREE_DEPTH = 100
# Purely defensive bound, same class decomposition.issue_tree.py's own MAX_TREE_DEPTH /
# ai_lego/modules/decision/decision_tree.py's own MAX_TREE_DEPTH already establish: real WBS trees are
# shallow; this rejects only pathological input, never real usage.

_INPUT_NODE_KEYS = frozenset({"id", "name", "owner", "estimate_hours", "children"})
_STORED_NODE_KEYS = _INPUT_NODE_KEYS | frozenset({"total_estimate_hours"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- NEVER a recursive ``repr()`` over caller-supplied
    input of unknown size/depth, same denial-of-service-in-an-error-path avoidance every tree module in this
    package already establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _is_finite_nonnegative_number(value: Any) -> bool:
    """Same bool/NaN/inf exclusion discipline every numeric check in this codebase uses (see
    ``ai_lego/modules/decision/decision_tree.py``'s own ``_is_finite_number``): ``True``/``False`` must not
    silently pass as if it were 1/0, and NaN/Infinity are not valid RFC 8259 JSON. Additionally excludes
    negative numbers -- an hours estimate below zero is not a real quantity."""
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0


def _node_is_valid(node: Any, depth: int = 0, *, stored: bool) -> bool:
    """Shared shape predicate (the recursive entry point), called by BOTH the builder (``stored=False`` -- a
    caller-supplied raw node must NEVER carry ``total_estimate_hours``, there is no parameter for it) and the
    gate (``stored=True`` -- a record's own stored node MUST carry it, correctly typed; whether it holds the
    CORRECT VALUE is ``evaluate_wbs_rollup_integrity_gate``'s own separate, stronger concern). Bounded to
    ``MAX_TREE_DEPTH`` -- past that, refused as invalid rather than recursing further, same
    fail-closed-not-RecursionError discipline every tree module in this package already establishes. Does NOT
    itself check the leaf/non-leaf owner+estimate placement invariant (a separate, distinctly-coded concern --
    see ``_leaf_discipline_violations``) -- only generic per-field TYPE shape."""
    if depth > MAX_TREE_DEPTH:
        return False
    if not isinstance(node, dict):
        return False
    expected_keys = _STORED_NODE_KEYS if stored else _INPUT_NODE_KEYS
    if set(node.keys()) != expected_keys:
        return False
    if not _is_nonempty_str(node.get("id")) or not _is_nonempty_str(node.get("name")):
        return False
    owner = node.get("owner")
    if owner is not None and not _is_nonempty_str(owner):
        return False
    estimate_hours = node.get("estimate_hours")
    if estimate_hours is not None and not _is_finite_nonnegative_number(estimate_hours):
        return False
    if stored and not _is_finite_nonnegative_number(node.get("total_estimate_hours")):
        return False
    children = node.get("children")
    if not isinstance(children, list):
        return False
    return all(_node_is_valid(child, depth + 1, stored=stored) for child in children)


def _leaf_discipline_violations(node: dict[str, Any], path: str = "deliverable") -> list[str]:
    """Invariant #1, re-derivable from a node's own raw ``owner``/``estimate_hours``/``children`` fields alone
    -- works identically on BOTH input-shaped and stored-shaped nodes (neither check depends on
    ``total_estimate_hours``). Returns EVERY violation found anywhere in the tree (not just the first), each
    tagged with a breadcrumb ``path`` and one of the two distinct error codes, same "name the specific bug
    class and location, don't stop at the first" evidence discipline
    ``ai_lego/compute/decision_tree/rollup.py``'s own ``probability_sum_violations`` already establishes.
    Precondition: ``node`` (and every descendant) already passed ``_node_is_valid`` (owner/estimate_hours/
    children are confirmed well-typed)."""
    violations: list[str] = []
    is_leaf = node["children"] == []
    owner = node.get("owner")
    estimate_hours = node.get("estimate_hours")
    if is_leaf and (owner is None or estimate_hours is None):
        violations.append(
            f"WBS_LEAF_MISSING_OWNER_OR_ESTIMATE: leaf node at {path!r} (id={node['id']!r}) must carry a non-null owner AND non-null "
            f"estimate_hours (Atlas's own 'Work package→owner/estimate' tier), got owner={owner!r} estimate_hours={estimate_hours!r}"
        )
    if not is_leaf and (owner is not None or estimate_hours is not None):
        violations.append(
            f"WBS_NONLEAF_HAS_OWNER_OR_ESTIMATE: non-leaf node at {path!r} (id={node['id']!r}) must carry owner=None AND "
            f"estimate_hours=None (owner/estimate belong only to leaf work packages, not the deliverable tier), got "
            f"owner={owner!r} estimate_hours={estimate_hours!r}"
        )
    for index, child in enumerate(node["children"]):
        violations.extend(_leaf_discipline_violations(child, f"{path}.children[{index}]"))
    return violations


def _roll_up_wbs_node(node: dict[str, Any]) -> dict[str, Any]:
    """THE rollup: returns a NEW node dict, recursively rebuilt bottom-up with ``total_estimate_hours``
    computed fresh and baked in (the real external WBS "100% rule": a parent's total work equals the sum of
    its parts). Never aliases anything from ``node`` -- every dict/list returned is new, same "rebuild, don't
    alias" discipline every prior tree module in this codebase follows. Reads ONLY ``id``/``name``/``owner``/
    ``estimate_hours``/``children`` -- any existing ``total_estimate_hours`` already on ``node`` (e.g. a
    STORED node handed to this function by the gate) is deliberately ignored and overwritten, never trusted,
    so this ONE function serves both callers identically: construction (an INPUT node, which never has the
    key at all) and the gate (a STORED node, re-deriving from scratch) -- same reuse discipline
    ``ai_lego/compute/decision_tree/rollup.py``'s own ``roll_up_node`` already establishes. Precondition:
    ``node`` (and every descendant) already passed ``_node_is_valid`` and has zero
    ``_leaf_discipline_violations`` -- a leaf's own ``estimate_hours`` is therefore guaranteed non-null here."""
    rolled_children = [_roll_up_wbs_node(child) for child in node["children"]]
    total = node["estimate_hours"] if not rolled_children else sum(child["total_estimate_hours"] for child in rolled_children)
    return {
        "id": node["id"],
        "name": node["name"],
        "owner": node["owner"],
        "estimate_hours": node["estimate_hours"],
        "total_estimate_hours": total,
        "children": rolled_children,
    }


# --------------------------------------------------------------------------
# Convenience constructor -- eager, minimal validation, same discipline every prior module's own constructors
# use. NOT the invariant boundary: generate_wbs validates whatever dict it is handed regardless of how it was
# built.
# --------------------------------------------------------------------------


def wbs_node(
    node_id: str,
    name: str,
    *,
    owner: str | None = None,
    estimate_hours: float | None = None,
    children: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """One INPUT ``WbsNode`` (the deliverable root, or any descendant) for ``generate_wbs``'s own
    ``deliverable`` parameter (or nested inside another node's own ``children``). Convenience constructor
    only -- eager, minimal validation on this node's own scalar fields; deliberately emits ONLY the input keys
    (NO ``total_estimate_hours`` parameter -- see module docstring's GENUINE_COMPUTE discipline). Does NOT
    itself check the leaf/non-leaf owner+estimate placement invariant or walk ``children``'s own shape --
    ``generate_wbs`` validates whatever dict it is handed regardless of how it was built, same "helper is not
    the invariant boundary" discipline every sibling module in this suite already establishes (mutation tests
    build nodes directly, bypassing this helper, to prove the builder itself -- not merely this convenience
    wrapper -- enforces the invariants). ``children`` defaults to an empty list (a leaf node) when omitted."""
    if not _is_nonempty_str(node_id):
        raise InvariantViolation(f"WBS_EMPTY_NODE_ID: node id must be a non-empty string, got {node_id!r}")
    if not _is_nonempty_str(name):
        raise InvariantViolation(f"WBS_EMPTY_NODE_NAME: name must be a non-empty string, got {name!r}")
    if owner is not None and not _is_nonempty_str(owner):
        raise InvariantViolation(f"WBS_INVALID_OWNER: owner must be None or a non-empty string, got {owner!r}")
    if estimate_hours is not None and not _is_finite_nonnegative_number(estimate_hours):
        raise InvariantViolation(f"WBS_INVALID_ESTIMATE_HOURS: estimate_hours must be None or a finite non-negative number, got {estimate_hours!r}")
    return {
        "id": node_id,
        "name": name,
        "owner": owner,
        "estimate_hours": estimate_hours,
        "children": list(children) if children is not None else [],
    }


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_wbs(
    record_id: str,
    deliverable: dict[str, Any],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/work-breakdown-structure.schema.yaml``. Enforces both real invariants
    fail-closed, in this order: id/version/provenance shape, THEN the full recursive tree-shape check
    (``deliverable`` as CALLER-SUPPLIED -- ``stored=False``), THEN the leaf/non-leaf owner+estimate placement
    invariant (invariant #1) over the WHOLE tree. Only THEN calls ``_roll_up_wbs_node`` to compute
    ``total_estimate_hours`` at every node (invariant #2) -- never a parameter here, so a caller cannot
    supply, and therefore cannot corrupt, it."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"WBS_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"WBS_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"WBS_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    if not _node_is_valid(deliverable, stored=False):
        raise InvariantViolation(
            f"WBS_INVALID_TREE_SHAPE: deliverable must be a recursively well-shaped WbsNode (non-empty id/name, owner None-or-non-empty-string, "
            f"estimate_hours None-or-finite-non-negative-number, children a list -- possibly empty -- of recursively well-shaped WbsNode entries, "
            f"no unknown keys, no total_estimate_hours), no deeper than MAX_TREE_DEPTH={MAX_TREE_DEPTH}; got {_shallow_describe(deliverable)}"
        )

    violations = _leaf_discipline_violations(deliverable)
    if violations:
        raise InvariantViolation("; ".join(violations))

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "deliverable": _roll_up_wbs_node(deliverable),
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Bonus helper -- real compute over an ALREADY-VALID record, not one of the declared structural invariants
# (same scope split decomposition.issue_tree's own all_questions / decision.decision_tree's own
# list_decision_points use).
# --------------------------------------------------------------------------


def list_leaf_work_packages(record: dict[str, Any]) -> list[dict[str, Any]]:
    """Real derived view (recomputed fresh every call, never a stored field) -- every LEAF node
    (``children == []``) anywhere in the record's own ``deliverable`` tree, flattened into ``{path, id, name,
    owner, estimate_hours}``, in tree (pre-order) traversal order. Atlas's own "Work package→owner/estimate"
    benefit, made concrete: the full flattened work-package list this decomposition pass produced, at a
    glance. SCOPE: operates on an ALREADY-VALID record (``generate_wbs``/``evaluate_wbs_rollup_integrity_gate``
    already proved shape); does not re-validate and will raise a bare ``KeyError`` on a malformed record, same
    ALREADY-VALID-record scope every sibling module's own derived-view helper already documents."""

    def _walk(node: dict[str, Any], path: str) -> list[dict[str, Any]]:
        if not node["children"]:
            return [{"path": path, "id": node["id"], "name": node["name"], "owner": node["owner"], "estimate_hours": node["estimate_hours"]}]
        packages: list[dict[str, Any]] = []
        for child in node["children"]:
            packages.extend(_walk(child, f"{path}.{child['id']}"))
        return packages

    return _walk(record["deliverable"], record["deliverable"]["id"])


# --------------------------------------------------------------------------
# Gates -- independently re-derive both invariants from raw fields, fail-closed on malformed input.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own (record-level-only, see module
    docstring) provenance is schema-valid. Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_wbs_structural_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives the tree-shape AND leaf/non-leaf owner+estimate placement invariants (invariant #1) from the
    record's own raw fields -- does not trust any stored value, does NOT call ``generate_wbs``. Fails closed
    on malformed input rather than crashing. Deliberately does NOT check ``total_estimate_hours``'s own
    correctness (``evaluate_wbs_rollup_integrity_gate``'s own separate, stronger job) -- same
    gate-per-distinguishable-concern split ``ai_lego/modules/decision/decision_tree.py``'s own
    ``tree_shape_integrity``/``expected_value_integrity`` pair already establishes."""
    if not isinstance(record, dict):
        return _result("wbs_structural_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("wbs_structural_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("wbs_structural_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    deliverable = record.get("deliverable")
    if not _node_is_valid(deliverable, stored=True):
        return _result(
            "wbs_structural_integrity",
            False,
            [{"reason": f"deliverable invalid (malformed node, unknown/missing keys, non-list children, empty id/name, invalid owner/estimate_hours/total_estimate_hours type, or deeper than MAX_TREE_DEPTH={MAX_TREE_DEPTH})"}],
            validator,
            timestamp,
        )

    violations = _leaf_discipline_violations(deliverable)
    if violations:
        return _result("wbs_structural_integrity", False, [{"violations": violations}], validator, timestamp)

    return _result("wbs_structural_integrity", True, [{"leaf_work_package_count": len(list_leaf_work_packages(record))}], validator, timestamp)


def _total_estimate_mismatches(stored: dict[str, Any], recomputed: dict[str, Any], path: str) -> list[str]:
    """Structural DIFF only -- no arithmetic lives here (that is entirely ``_roll_up_wbs_node``'s own job,
    called once by the caller before this walk begins). Walks ``stored`` (the record's own tree) and
    ``recomputed`` (fresh output of ``_roll_up_wbs_node`` over that same tree's raw fields) IN PARALLEL,
    reporting every ``total_estimate_hours`` disagreement with a path breadcrumb naming the specific node.
    Precondition: both trees already share the same shape (``recomputed`` was derived FROM ``stored``'s own
    structural fields, so a shape mismatch here would itself be a bug in this function, not a legitimate
    finding about the record)."""
    violations: list[str] = []
    if stored.get("total_estimate_hours") != recomputed.get("total_estimate_hours"):
        violations.append(
            f"{path} (node {stored.get('id')!r} {stored.get('name')!r}): stored total_estimate_hours={stored.get('total_estimate_hours')!r} "
            f"does not match recomputed={recomputed.get('total_estimate_hours')!r}"
        )
    for index, (stored_child, recomputed_child) in enumerate(zip(stored["children"], recomputed["children"])):
        violations.extend(_total_estimate_mismatches(stored_child, recomputed_child, f"{path}.children[{index}]"))
    return violations


def evaluate_wbs_rollup_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Invariant #2, THE real differentiator: re-derives shape and leaf/non-leaf placement FIRST (own
    preconditions, re-checked, not trusted -- recomputing a rollup over a malformed tree would be
    meaningless), then calls ``_roll_up_wbs_node`` fresh on the record's own raw ``id``/``name``/``owner``/
    ``estimate_hours``/``children`` fields (deliberately ignoring whatever ``total_estimate_hours`` is
    currently stored) and walks the result against whatever is actually stored
    (``_total_estimate_mismatches``) -- at EVERY node, not just the root. Never trusts any stored value. FAILS
    CLOSED on malformed input rather than crashing. THIS is the gate the CLI's own hand-tampering proof
    exercises: a tampered ``total_estimate_hours`` bypasses the builder entirely, but cannot bypass this
    independent re-derivation."""
    if not isinstance(record, dict):
        return _result("wbs_rollup_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    deliverable = record.get("deliverable")
    if not _node_is_valid(deliverable, stored=True):
        return _result("wbs_rollup_integrity", False, [{"reason": "deliverable invalid -- cannot evaluate rollup integrity"}], validator, timestamp)
    if _leaf_discipline_violations(deliverable):
        return _result("wbs_rollup_integrity", False, [{"reason": "deliverable violates leaf/non-leaf owner+estimate placement -- cannot evaluate rollup integrity"}], validator, timestamp)

    recomputed = _roll_up_wbs_node(deliverable)
    violations = _total_estimate_mismatches(deliverable, recomputed, record.get("id", "deliverable"))
    return _result(
        "wbs_rollup_integrity",
        not violations,
        [{"violations": violations, "recomputed_deliverable_total_estimate_hours": recomputed["total_estimate_hours"]}],
        validator,
        timestamp,
    )


def evaluate_wbs_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """All 3 of the contract's real gates, in catalog order: the one declared ``quality`` property, then the
    two independent structural/rollup re-derivations (one gate_id per distinguishable concern, same split
    ``ai_lego/modules/decision/decision_tree.py``'s own 3-way tree_shape/probability_sum/expected_value split
    already establishes). No ``evidence_labeling_required`` gate -- the contract sets that flag to ``false``
    (see decomposition.wbs.contract.yaml's own ``quality``/``compilation_decisions``), same "only emit gates
    for what is actually declared true" discipline every sibling module in this suite already establishes."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_wbs_structural_integrity_gate(record, validator, timestamp),
        evaluate_wbs_rollup_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
