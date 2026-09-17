"""``root_cause.fault_tree`` -- Method Atlas slice, fourth member of the `root_cause` family (F05), after
`root_cause.fishbone`, `root_cause.five_whys`, and `root_cause.pareto`.

Atlas's own F05 tool table Fault Tree row (L437) is a single line: "AND/OR
邏輯分解 top event | top event→basic events→gates | 高風險可靠性分析 | 需清楚
邏輯與假設" -- no dedicated Atlas section exists beyond it (grep-confirmed
across all three normative documents; the only two other hits, L3413 and
L4473, are a Mermaid diagram node and a §28 scenario-routing row, both
naming "Fault Tree" as one of several applicable methods, not a protocol
section).

Same textbook AND/OR-tree STRUCTURE as `security.attack_tree` (the FIRST
F20 member to use one), but a genuinely different DOMAIN and root
semantics: a fault tree's root is a top EVENT that has already happened
(reliability/failure analysis, working backward from a failure to its
causes), not an attacker GOAL not yet achieved.
`security.attack_tree.contract.yaml`'s own description already drew this
exact distinction when it cross-checked "Fault Tree" while being built
(grep across the whole spec root, confirmed no existing typed object
implements it) -- independently re-confirmed here by a second full read of
`ai_lego/modules/security/attack_tree.py` plus a fresh grep across this
whole runtime tree (zero hits for fault_tree/FaultTree/FAULTTREE before
this module). Building a distinct module -- informed by, but not copied
from, `attack_tree.py` -- is the right call: Fault Tree's own
basic_event/gate/top_event vocabulary, its optional `probability` field
(reliability engineering has a real quantitative convention attack
techniques do not share the same way), and its flat-list-plus-id-reference
shape (see below) are all domain-specific, not a re-skin of the security
shape.

**Structural divergence from `security.attack_tree`, deliberate**: Attack
Tree embeds every child inline (a true recursive tree -- a technique can
only ever belong to one parent goal). A real fault tree routinely reuses
the SAME basic event under multiple gates (e.g. "power loss" is a common
cause feeding both the primary AND the backup subsystem's own failure
gate) -- embedding would force duplicating that basic event's own record
at every place it recurs, with no way to express "this is the same
underlying failure mode, not two". This module therefore represents
`basic_events`/`gates` as FLAT, id-cross-referenced lists (a DAG, not a
tree) -- which is also what makes a genuinely new bug class possible and
worth gating: a dangling reference (a child id that names no real node) is
structurally impossible in an embedded tree (every child IS the node), but
is a real, catchable defect in a flat cross-referenced shape.

TWO real, independently-enforced invariants (construction AND gate, same
"raise before any downstream write" / "re-derive, don't trust" two-layer
discipline every prior module in this package uses):

1. **Gate-mode consistency** (`FAULTTREE_GATE_MODE_MISMATCH`): a gate's
   own `required_count` (how many of its own children must occur for it to
   fire) must equal `len(children)` when `gate_type == AND` (an AND gate
   needs EVERY child) or exactly `1` when `gate_type == OR` (an OR gate
   needs ANY ONE child) -- Atlas's own L437 formula, "AND/OR 邏輯分解",
   operationalized as a real, hand-tamperable structural field rather than
   left as an unchecked label. `required_count` is caller-supplied (not
   derived) on purpose, so a genuine mismatch is representable and
   catchable, not structurally impossible by construction.
2. **Referential integrity** (`FAULTTREE_DANGLING_REFERENCE`) and its own
   cyclic sibling (`FAULTTREE_CYCLE_DETECTED`): every id referenced
   anywhere (the top event's own `gate_ref`, and every gate's own
   `children` entries) must resolve to a real `gates[].id` or
   `basic_events[].id` in the SAME record, and the resulting reference
   graph must be acyclic (a gate that transitively lists itself as its own
   child would need to have already fired to determine whether it fires)
   -- the same category of "malformed structure anywhere, not just at the
   top" bug `security.attack_tree`'s own recursive shape-validity check
   guards against, adapted here to a graph of id references instead of
   nested dicts.
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "root_cause.fault_tree"
RECORD_ID_PREFIX = "FAULTTREE-"
VALID_GATE_TYPES = frozenset({"AND", "OR"})
MAX_GATE_DEPTH = 100
# Same defensive-engineering lesson `security.attack_tree`'s own MAX_TREE_DEPTH
# comment establishes for a nested tree, applied here to a reference-graph
# traversal instead: real fault trees are shallow (Atlas's own worked
# examples across the whole spec root -- e.g. security.attack_tree's own
# 3-level §12.38 case -- never approach three digits of depth). This bound
# rejects only pathological/malicious input, not real usage. OQ-FAULTTREE-3
# (the former exponential-on-a-shared-DAG behaviour of `_cycle_violations`
# and `evaluate_top_event`'s own `fires`) is RESOLVED 2026-09-17: both are
# now O(V+E) -- see `_cycle_violations`'s own docstring for the three-color
# DFS + longest-path DP that replaced the old per-path re-exploration, and
# `evaluate_top_event`'s own `fires` for the memoization that replaced its
# unmemoized recursion. A 20-gate diamond-sharing graph that previously took
# ~6s now completes in the same order of magnitude as a non-shared graph of
# the same size.
_KNOWN_BASIC_EVENT_KEYS_REQUIRED = frozenset({"id", "description"})
_KNOWN_BASIC_EVENT_KEYS_ALL = frozenset({"id", "description", "probability"})
_KNOWN_GATE_KEYS = frozenset({"id", "description", "gate_type", "required_count", "children"})
_KNOWN_TOP_EVENT_KEYS = frozenset({"description", "gate_ref"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- NEVER Python's own recursive ``repr()``, same
    discipline ``security.attack_tree``'s own ``_shallow_describe`` uses (a bare recursive repr over
    caller-supplied input of unknown size is itself a small denial-of-service surface in an error path)."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _is_valid_probability(value: Any) -> bool:
    """Same bool/NaN/inf exclusion discipline ``security.attack_tree``'s own ``_is_nonnegative_number`` uses
    for ``cost``: ``probability=True`` must not silently pass an ``isinstance(value, (int, float))`` check as
    if it were 1.0, and ``probability=inf``/``nan`` are not valid RFC 8259 JSON and would make no sense as a
    [0,1] probability regardless of the bare range comparison."""
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and 0 <= value <= 1


def _basic_event_is_valid(event: Any) -> bool:
    if not isinstance(event, dict):
        return False
    keys = set(event.keys())
    if not _KNOWN_BASIC_EVENT_KEYS_REQUIRED.issubset(keys) or not keys.issubset(_KNOWN_BASIC_EVENT_KEYS_ALL):
        return False
    if not _is_nonempty_str(event["id"]) or not _is_nonempty_str(event["description"]):
        return False
    if "probability" in event and not _is_valid_probability(event["probability"]):
        return False
    return True


def _gate_shape_is_valid(gate: Any) -> bool:
    """Shape only (keys, types, enum membership). Gate-mode consistency (``required_count`` vs
    ``gate_type``) is checked separately by ``_gate_mode_is_consistent``, and referential integrity (whether
    ``children`` entries actually resolve) is checked separately again by
    ``_referential_integrity_violations`` -- three independent predicates, each with its own error code, so a
    failure always names the specific bug class, not a blurred "something about this gate is wrong"."""
    if not isinstance(gate, dict) or set(gate.keys()) != _KNOWN_GATE_KEYS:
        return False
    if not _is_nonempty_str(gate["id"]) or not _is_nonempty_str(gate["description"]):
        return False
    if gate["gate_type"] not in VALID_GATE_TYPES:
        return False
    required_count = gate["required_count"]
    if not isinstance(required_count, int) or isinstance(required_count, bool) or required_count < 1:
        return False
    children = gate["children"]
    if not isinstance(children, list) or not children:
        return False
    return all(_is_nonempty_str(c) for c in children)


def _top_event_is_valid(top_event: Any) -> bool:
    return isinstance(top_event, dict) and set(top_event.keys()) == _KNOWN_TOP_EVENT_KEYS and _is_nonempty_str(top_event.get("description")) and _is_nonempty_str(top_event.get("gate_ref"))


def _gate_mode_is_consistent(gate: dict[str, Any]) -> bool:
    """Invariant #1: AND means ``required_count == len(children)`` (every child required); OR means
    ``required_count == 1`` (any one child suffices). Precondition: ``gate`` has already passed
    ``_gate_shape_is_valid``."""
    expected = len(gate["children"]) if gate["gate_type"] == "AND" else 1
    return gate["required_count"] == expected


def _referential_integrity_violations(top_event: dict[str, Any], basic_events: list[dict[str, Any]], gates: list[dict[str, Any]]) -> list[str]:
    """Invariant #2, dangling-reference half: returns every id referenced (the top event's own ``gate_ref``,
    plus every gate's own ``children``) that does not resolve to a real ``basic_events[].id`` or
    ``gates[].id`` in the SAME record. Empty list means no dangling reference exists. The top event's own
    ``gate_ref`` must specifically resolve to a GATE id, not a basic_event id -- Atlas's own formula
    ("top event→basic events→gates") always decomposes the top event through a gate, never lets it BE a bare
    basic event."""
    known_ids = {e["id"] for e in basic_events} | {g["id"] for g in gates}
    gate_ids = {g["id"] for g in gates}
    violations: list[str] = []
    if top_event["gate_ref"] not in gate_ids:
        violations.append(f"top_event.gate_ref={top_event['gate_ref']!r} is not a real gates[].id")
    for g in gates:
        for child_id in g["children"]:
            if child_id not in known_ids:
                violations.append(f"gate {g['id']!r} references unknown child id {child_id!r}")
    return violations


def _cycle_violations(gates: list[dict[str, Any]]) -> list[str]:
    """Invariant #2, cyclic half: iterative three-color DFS (WHITE=unvisited, GRAY=on the current DFS stack,
    BLACK=fully explored and proven acyclic), an explicit stack rather than Python call recursion so this
    never raises RecursionError regardless of graph size. A gate id colored GRAY when reached again is a real
    cycle (it is an ancestor of itself on the active path). Run from every still-WHITE gate as a potential
    start -- an orphan cyclic sub-graph unreachable from the top event is still a malformed record, not
    merely a wasted one. Only GATE-to-GATE edges are pushed: a basic_event child is always a leaf (no
    ``children`` of its own), so it can never participate in a cycle.

    O(V+E), fixing the FORMER exponential behaviour (OQ-FAULTTREE-3, now resolved 2026-09-17): each gate is
    colored GRAY exactly once and BLACK exactly once across the ENTIRE call (a BLACK node reached again via a
    different parent -- legitimate DAG sharing, e.g. one basic event feeding two subsystems -- is recognized
    as already-proven-acyclic and never re-explored), and each edge is examined a constant number of times.
    The old plain path-tracking DFS re-explored a shared gate down every path that reached it, which measured
    ~6s on a 20-gate diamond-sharing graph; this version is linear in graph size.

    MAX_GATE_DEPTH (the longest chain of GATES, matching the parameter's own name -- the trailing
    basic_event leaf does not count) is enforced by computing, once the graph is proven acyclic, the longest
    downward gate-chain starting at each gate via a post-order dynamic-programming pass
    (``depth[node] = 1 + max(depth[child] for child in <its GATE children>, default=0)``) -- itself O(V+E)
    and exact (this is the classic longest-path-in-a-DAG recurrence, safe here specifically because
    acyclicity was just proven; it would be ill-defined on a cyclic graph). The overall worst-case reported
    reason (cycle vs. too-deep) can differ from the old implementation's on a record that is BOTH cyclic AND
    too deep in different branches simultaneously -- an edge case within an edge case; either reason means
    the record is invalid, and both are still 100% caught.

    Precondition: every id in the graph already resolves (call only after
    ``_referential_integrity_violations`` returns empty) -- this function does not itself guard against a
    dangling id, it silently treats an unresolvable id as a leaf (already reported elsewhere)."""
    gates_by_id = {g["id"]: g for g in gates}
    gate_children: dict[str, list[str]] = {gid: [c for c in g["children"] if c in gates_by_id] for gid, g in gates_by_id.items()}
    WHITE, GRAY, BLACK = 0, 1, 2
    color: dict[str, int] = {gid: WHITE for gid in gates_by_id}
    depth: dict[str, int] = {}

    for start in gates_by_id:
        if color[start] != WHITE:
            continue
        color[start] = GRAY
        path: list[str] = [start]
        # Each stack frame is [node_id, its resolvable gate-children, next-child-index-to-examine] -- a list
        # (not a tuple) so the index can be advanced in place without popping/re-pushing the frame.
        stack: list[list[Any]] = [[start, gate_children[start], 0]]
        while stack:
            frame = stack[-1]
            node_id, children, idx = frame
            if idx < len(children):
                frame[2] += 1
                child_id = children[idx]
                if color[child_id] == GRAY:
                    cycle_start = path.index(child_id)
                    return [f"cycle detected: {' -> '.join(path[cycle_start:])} -> {child_id}"]
                if color[child_id] == WHITE:
                    color[child_id] = GRAY
                    path.append(child_id)
                    stack.append([child_id, gate_children[child_id], 0])
                # BLACK: already fully explored and proven acyclic -- no cycle can run through it, skip.
            else:
                depth[node_id] = 1 + max((depth[c] for c in children), default=0)
                color[node_id] = BLACK
                stack.pop()
                path.pop()

    max_depth = max(depth.values(), default=0)
    if max_depth > MAX_GATE_DEPTH:
        return [f"gate chain exceeds MAX_GATE_DEPTH={MAX_GATE_DEPTH} (longest chain found: {max_depth} gates)"]
    return []


def generate_fault_tree_record(
    record_id: str,
    system_under_analysis: str,
    top_event: dict[str, Any],
    basic_events: list[dict[str, Any]],
    gates: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/fault-tree-record.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed, in this order: id/system_under_analysis/top_event/basic_events/gates shape,
    id-uniqueness across the COMBINED basic_events+gates namespace (a gate id and a basic_event id must never
    collide, since ``children`` references are resolved against that combined set), gate-mode consistency
    (invariant #1), then referential integrity and acyclicity (invariant #2). REBUILDS every nested
    list/dict it owns; ``provenance`` is stored by reference, the same family-wide convention every prior
    module in this package already follows."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"FAULTTREE_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not _is_nonempty_str(system_under_analysis):
        raise InvariantViolation(f"FAULTTREE_EMPTY_RECORD_FIELD: system_under_analysis must be a non-empty string, got {system_under_analysis!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"FAULTTREE_INVALID_VERSION: version must be a string, got {version!r}")
    if not _top_event_is_valid(top_event):
        raise InvariantViolation(f"FAULTTREE_INVALID_TOP_EVENT: top_event must be a dict with exactly 'description'/'gate_ref', both non-empty strings, got {_shallow_describe(top_event)}")

    if not isinstance(basic_events, list) or not basic_events or not all(_basic_event_is_valid(e) for e in basic_events):
        raise InvariantViolation(
            f"FAULTTREE_INVALID_BASIC_EVENTS: basic_events must be a non-empty list of well-shaped entries "
            f"(id/description non-empty strings, optional probability a finite number in [0,1]), got {_shallow_describe(basic_events)}"
        )
    if not isinstance(gates, list) or not gates or not all(_gate_shape_is_valid(g) for g in gates):
        raise InvariantViolation(
            f"FAULTTREE_INVALID_GATES: gates must be a non-empty list of well-shaped entries "
            f"(id/description non-empty strings, gate_type in {sorted(VALID_GATE_TYPES)}, required_count a positive int, "
            f"children a non-empty list of non-empty strings), got {_shallow_describe(gates)}"
        )

    basic_event_ids = [e["id"] for e in basic_events]
    gate_ids = [g["id"] for g in gates]
    all_ids = basic_event_ids + gate_ids
    if len(set(all_ids)) != len(all_ids):
        duplicates = sorted({i for i in all_ids if all_ids.count(i) > 1})
        raise InvariantViolation(f"FAULTTREE_DUPLICATE_ID: id(s) {duplicates} used more than once across basic_events/gates -- every id must be unique in the combined namespace")

    mode_violations = [g["id"] for g in gates if not _gate_mode_is_consistent(g)]
    if mode_violations:
        raise InvariantViolation(
            f"FAULTTREE_GATE_MODE_MISMATCH: gate(s) {mode_violations} have a required_count that disagrees with their own gate_type "
            f"(AND requires required_count == len(children); OR requires required_count == 1)"
        )

    dangling = _referential_integrity_violations(top_event, basic_events, gates)
    if dangling:
        raise InvariantViolation(f"FAULTTREE_DANGLING_REFERENCE: {'; '.join(dangling)}")
    cycles = _cycle_violations(gates)
    if cycles:
        raise InvariantViolation(f"FAULTTREE_CYCLE_DETECTED: {'; '.join(cycles)}")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "system_under_analysis": system_under_analysis,
        "top_event": {"description": top_event["description"], "gate_ref": top_event["gate_ref"]},
        "basic_events": [dict(e) for e in basic_events],
        "gates": [dict(g, children=list(g["children"])) for g in gates],
        "provenance": provenance,
    }


def basic_event(event_id: str, description: str, *, probability: float | None = None) -> dict[str, Any]:
    """Convenience constructor for one ``basic_events[]`` entry. Not itself an invariant boundary -- the
    real check happens inside ``generate_fault_tree_record``, which validates whatever dict it is handed
    regardless of how it was built."""
    record: dict[str, Any] = {"id": event_id, "description": description}
    if probability is not None:
        record["probability"] = probability
    return record


def gate(gate_id: str, description: str, gate_type: str, children: list[str]) -> dict[str, Any]:
    """Convenience constructor for one ``gates[]`` entry -- DERIVES ``required_count`` correctly from
    ``gate_type``/``children`` so a caller building a legitimate tree through this helper can never
    accidentally produce a mismatched gate. This is the honest-path helper; the mutation tests build the
    mismatched dict directly (bypassing this helper) to prove ``generate_fault_tree_record`` itself -- not
    merely this convenience wrapper -- is what actually enforces invariant #1."""
    if gate_type not in VALID_GATE_TYPES:
        raise InvariantViolation(f"FAULTTREE_INVALID_GATE_TYPE: gate_type must be one of {sorted(VALID_GATE_TYPES)}, got {gate_type!r}")
    required_count = len(children) if gate_type == "AND" else 1
    return {"id": gate_id, "description": description, "gate_type": gate_type, "required_count": required_count, "children": list(children)}


def evaluate_top_event(record: dict[str, Any], occurred_basic_event_ids: set[str] | frozenset[str]) -> bool:
    """Real bottom-up boolean propagation over the record's own gate graph -- GENUINE compute (recomputed
    fresh every call, never a stored field): a gate fires iff at least its own ``required_count`` children
    are individually true, where a basic_event child is true iff its id is in ``occurred_basic_event_ids``
    and a gate child is true iff it recursively fires. The top event occurs iff ``top_event.gate_ref``'s own
    gate fires. This directly exercises the SAME AND/OR semantics ``FAULTTREE_GATE_MODE_MISMATCH`` checks
    structurally, here evaluated dynamically against one caller-supplied scenario.

    SCOPE (same split ``ai_lego.compute.attack_tree.aggregate.aggregate_node`` establishes for its own
    family): this function performs ONLY the boolean evaluation over an ALREADY-VALID record -- referential
    integrity and acyclicity are the caller's own responsibility (``generate_fault_tree_record`` /
    ``evaluate_fault_tree_integrity_gate`` already proved both before this function is meant to run); it
    does not re-validate shape, and recurses with no depth guard on a record that skipped that validation
    (safe in practice: an already-valid record's gate-chain depth is bounded by ``MAX_GATE_DEPTH`` = 100,
    far under Python's default recursion limit).

    MEMOIZED (fixed 2026-09-17, OQ-FAULTTREE-3's second half): a shared gate reachable via more than one
    parent (legitimate DAG sharing) is evaluated exactly once and cached, not re-evaluated down every path
    that reaches it -- the same O(V+E) fix ``_cycle_violations`` received, applied to boolean propagation
    instead of cycle detection. Safe to cache unconditionally: this is a pure function of
    ``occurred_basic_event_ids`` alone (no hidden state), so a gate's fired/not-fired verdict cannot change
    between two occurrences within the same call."""
    gates_by_id = {g["id"]: g for g in record["gates"]}
    basic_event_ids = {e["id"] for e in record["basic_events"]}
    memo: dict[str, bool] = {}

    def fires(node_id: str) -> bool:
        if node_id in basic_event_ids:
            return node_id in occurred_basic_event_ids
        if node_id in memo:
            return memo[node_id]
        g = gates_by_id[node_id]
        true_children = sum(1 for child_id in g["children"] if fires(child_id))
        result = true_children >= g["required_count"]
        memo[node_id] = result
        return result

    return fires(record["top_event"]["gate_ref"])


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance is schema-valid."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_fault_tree_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- does not trust any
    stored consistency, including a gate's own required_count/gate_type pairing and every reference's own
    resolvability/acyclicity. Bundles both headline invariants under one gate_id, same shape
    ``evaluate_attack_tree_integrity_gate`` already uses for its own family (several distinct structural
    reasons, one gate_id, each with its own distinguishable evidence ``reason``). FAILS CLOSED on malformed
    input rather than crashing."""
    if not isinstance(record, dict):
        return _result("fault_tree_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("fault_tree_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("fault_tree_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("system_under_analysis")):
        return _result("fault_tree_integrity", False, [{"reason": "system_under_analysis missing or empty"}], validator, timestamp)
    if not _top_event_is_valid(record.get("top_event")):
        return _result("fault_tree_integrity", False, [{"reason": "top_event missing, malformed, or has an empty description/gate_ref"}], validator, timestamp)

    basic_events = record.get("basic_events")
    if not isinstance(basic_events, list) or not basic_events or not all(_basic_event_is_valid(e) for e in basic_events):
        return _result("fault_tree_integrity", False, [{"reason": "basic_events invalid (empty, malformed, or an entry with unknown/missing keys)"}], validator, timestamp)
    gates = record.get("gates")
    if not isinstance(gates, list) or not gates or not all(_gate_shape_is_valid(g) for g in gates):
        return _result("fault_tree_integrity", False, [{"reason": "gates invalid (empty, malformed, or an entry with unknown/missing keys)"}], validator, timestamp)

    basic_event_ids = [e["id"] for e in basic_events]
    gate_ids = [g["id"] for g in gates]
    all_ids = basic_event_ids + gate_ids
    if len(set(all_ids)) != len(all_ids):
        return _result("fault_tree_integrity", False, [{"reason": "duplicate id across basic_events/gates combined namespace"}], validator, timestamp)

    mode_violations = [g["id"] for g in gates if not _gate_mode_is_consistent(g)]
    if mode_violations:
        return _result("fault_tree_integrity", False, [{"reason": "stored required_count disagrees with gate_type", "gate_ids": mode_violations}], validator, timestamp)

    top_event = record["top_event"]
    dangling = _referential_integrity_violations(top_event, basic_events, gates)
    if dangling:
        return _result("fault_tree_integrity", False, [{"reason": "dangling reference", "details": dangling}], validator, timestamp)
    cycles = _cycle_violations(gates)
    if cycles:
        return _result("fault_tree_integrity", False, [{"reason": "cycle detected", "details": cycles}], validator, timestamp)

    referenced_basic_event_ids = {c for g in gates for c in g["children"]} & set(basic_event_ids)
    unreferenced = sorted(set(basic_event_ids) - referenced_basic_event_ids)
    return _result(
        "fault_tree_integrity",
        True,
        [{"basic_event_count": len(basic_events), "gate_count": len(gates), "unreferenced_basic_event_ids": unreferenced}],
        validator,
        timestamp,
    )


def evaluate_fault_tree_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_fault_tree_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
