"""``root_cause.event_tree`` -- Method Atlas slice, F05 root_cause family, 7th concrete entry (after
`root_cause.fishbone`, `root_cause.five_whys`, `root_cause.pareto`, `root_cause.fault_tree`,
`root_cause.bow_tie`, and `root_cause.kepner_tregoe`; remaining after this file: Change Analysis, Barrier
Analysis).

Atlas's own F05 tool table Event Tree row (L438) is a single line: "從起始事件推結果 | event→barriers
success/fail→outcomes | 評估防護層 | 不同於 Fault Tree" -- no dedicated Atlas section exists beyond it
(grep-confirmed case-insensitively across the whole Atlas file: L438 is the ONLY hit for "event tree" in any
casing). NOTE: the task that produced this file described Event Tree as "the 7th of 9" F05 table rows --
independently re-verified by direct grep before writing anything and found WRONG: Event Tree is row 5 of 9
(Fishbone / 5 Whys / Pareto / Fault Tree / **Event Tree** / Bow-Tie / Kepner-Tregoe / Change Analysis /
Barrier Analysis), not row 7. Recorded here and in the method contract's own OQ-EVENTTREE-1 per R4
claim-before-verify -- no downstream effect (nothing depends on the row's ordinal), but the AGENTS.md
instruction "do not trust a number told to you, verify it" is followed literally rather than silently
absorbed.

**Due diligence, Atlas's own misuse warning is literally "不同於 Fault Tree" (different from Fault Tree) --
`fault_tree.py` read in full first (per this task's own explicit instruction) before writing a single field
here.** Confirmed genuinely, structurally opposite, not a re-skin:

- **Direction of reasoning**: Fault Tree works BACKWARD -- it starts from a top event that has ALREADY
  OCCURRED and decomposes it, through AND/OR logic gates, DOWN into the more atomic basic_events that could
  have caused it (`fault_tree.py:14-16`: "working backward from a failure to its causes"). Event Tree works
  FORWARD -- it starts from a single `initiating_event` that has already occurred and walks FORWARD, in
  declared sequence order, through a barrier chain, asking at each step "did this protective layer hold or
  fail", to arrive at a terminal outcome. Backward decomposition vs forward propagation is the literal
  structural opposite Atlas's own misuse warning names.
- **Branching semantics**: Fault Tree's branching is LOGICAL (AND = every child required, OR = any one
  child suffices) over a graph that may legitimately SHARE a basic_event under multiple gates (a flat
  id-cross-referenced DAG, list order carries no meaning -- `fault_tree.py:33-43`). Event Tree's branching
  is SEQUENTIAL/POSITIONAL (at each barrier, exactly two branches, success or failure, and which barrier
  comes next depends on having already walked through every earlier one in order) -- there is no AND/OR
  gate concept anywhere in this module, and no shared-node graph; `barriers[]` is a flat ORDERED list whose
  own list INDEX is semantically its position, not a graph of gates.
- **What each evaluates**: Fault Tree evaluates CAUSATION (which combination of causes explains an event
  that happened) -- Atlas's own benefit column, "高風險可靠性分析" (high-risk reliability analysis,
  causal). Event Tree evaluates PROTECTION-LAYER EFFECTIVENESS going forward from an event -- Atlas's own
  benefit column here, "評估防護層" (evaluate protective layers) -- a genuinely different analytical
  QUESTION, not merely a different data shape for the same question.

**Second due-diligence check, against `bow_tie.py` (also read in full)**: Bow-Tie's own RIGHT side
(`consequences[]` + `mitigation`-side `controls[]`) also branches forward from a top event into multiple
terminal results, so it could plausibly look like a duplicate. Confirmed structurally distinct by direct
read: Bow-Tie's `controls[]` (`bow_tie.py:148-163`, `_controls_are_valid`) is a FLAT, UNORDERED list where
every entry independently names ONE `target_id` (a `consequences[].consequence_id`) with NO relationship to
any OTHER control -- there is no concept of "control B only applies if control A already fired a certain
way", no position, no sequence field anywhere in `bow_tie.py` or `bow-tie-analysis-record.schema.yaml`.
Event Tree's `barriers[]` is the opposite: an ORDERED sequence where a later barrier is only reachable
through a path that already traversed every earlier one (this module's own Invariant #1, below) -- Bow-Tie
cannot express "barrier 2 only matters if barrier 1 was reached a certain way" at all; Event Tree's entire
structure exists to express exactly that. Confirmed genuinely distinct, not a duplicate.

TWO real, independently-enforced invariants (construction AND gate, same "raise before any downstream
write" / "re-derive, don't trust" two-layer discipline every prior module in this family uses; checked in
this fixed order at BOTH layers, matching `fault_tree.py`'s own dangling-reference-before-cycle sequencing
and its docstring's explicit precondition language):

1. **Referential integrity** (`EVENTTREE_DANGLING_BARRIER_REFERENCE`): every `barrier_id` named anywhere in
   any `outcomes[].path` must resolve to a real `barriers[].barrier_id` in the SAME record -- the same class
   of bug `fault_tree.py`'s own `FAULTTREE_DANGLING_REFERENCE` guards against, adapted to this record's own
   flat ORDERED list shape instead of a graph of gates. Pure set-membership, position-agnostic.
2. **Ordered-prefix reachability, i.e. no phantom outcome** (`EVENTTREE_PATH_NOT_ORDERED_PREFIX`): every
   `outcomes[].path`, position by position, must equal an actual PREFIX of the declared `barriers[]`
   sequence (`path[i].barrier_id == barriers[i].barrier_id` for every `i` in `range(len(path))`) --
   operationalizing Atlas's own literal formula "event→barriers success/fail→outcomes" as a real structural
   check: you can only be asking about barrier `k` once you already walked through barriers `0..k-1`, in
   that exact order, in the SAME path. A path that skips a barrier, reorders two barriers, or starts
   anywhere but the first declared barrier is a PHANTOM outcome -- it claims to result from a walk the
   declared barrier sequence could never actually produce. Checked only after invariant #1 already holds
   (same "referential integrity first" sequencing `fault_tree.py`'s own `_cycle_violations` docstring
   establishes for its own second invariant), though a dangling id also always fails this check too (it
   cannot equal any real prefix entry) -- belt and suspenders, not a silent gap.

A path may terminate EARLY (length 1..len(barriers)) once its outcome is already determined -- a real,
disclosed pruned-event-tree practice (see method contract `compilation_decisions`): NOT every outcome needs
to walk every barrier, but every outcome that does walk `k` barriers must walk the SAME first `k`, in order.
Outcomes are NOT required to exhaustively cover every success/failure combination across all barriers
(OQ-EVENTTREE-2) -- out of scope for this contract's 2 structural invariants, same "nothing requires full
coverage" disclosed non-requirement `bow_tie.py`'s own module docstring establishes for its uncovered
consequence.
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "root_cause.event_tree"
RECORD_ID_PREFIX = "EVENTTREE-"
BARRIER_ID_PREFIX = "BAR-"
OUTCOME_ID_PREFIX = "OUT-"
VALID_RESULTS = frozenset({"success", "failure"})

_KNOWN_INITIATING_EVENT_KEYS = frozenset({"description"})
_KNOWN_BARRIER_KEYS = frozenset({"barrier_id", "description"})
_KNOWN_PATH_STEP_KEYS_REQUIRED = frozenset({"barrier_id", "result"})
_KNOWN_PATH_STEP_KEYS_ALL = frozenset({"barrier_id", "result", "probability"})
_KNOWN_OUTCOME_KEYS = frozenset({"outcome_id", "description", "path"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- NEVER Python's own recursive ``repr()``, same
    discipline every sibling module in this family already uses (``fault_tree.py``'s own
    ``_shallow_describe``: a bare recursive repr over caller-supplied input of unknown size is itself a
    small denial-of-service surface in an error path)."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _is_valid_probability(value: Any) -> bool:
    """Same bool/NaN/inf exclusion discipline ``fault_tree.py``'s own ``_is_valid_probability`` uses:
    ``probability=True`` must not silently pass an ``isinstance(value, (int, float))`` check as if it were
    1.0, and ``probability=inf``/``nan`` are not valid RFC 8259 JSON and would make no sense as a [0,1]
    probability regardless of the bare range comparison."""
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and 0 <= value <= 1


def _initiating_event_is_valid(value: Any) -> bool:
    return isinstance(value, dict) and set(value.keys()) == _KNOWN_INITIATING_EVENT_KEYS and _is_nonempty_str(value.get("description"))


def _barrier_is_valid(value: Any) -> bool:
    if not isinstance(value, dict) or set(value.keys()) != _KNOWN_BARRIER_KEYS:
        return False
    return _is_nonempty_str(value["barrier_id"]) and value["barrier_id"].startswith(BARRIER_ID_PREFIX) and _is_nonempty_str(value["description"])


def _barriers_are_valid(value: Any) -> tuple[bool, list[str]]:
    """Shared predicate (called by BOTH the builder and the gate): shape + barrier_id uniqueness. Returns
    (is_valid, ordered_barrier_ids) -- the SECOND element is the declared sequence, in list order, that
    invariant #2 checks every outcome's own path against."""
    if not isinstance(value, list) or not value or not all(_barrier_is_valid(b) for b in value):
        return False, []
    ids = [b["barrier_id"] for b in value]
    if len(set(ids)) != len(ids):
        return False, []
    return True, ids


def _path_step_is_valid(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    keys = set(value.keys())
    if not _KNOWN_PATH_STEP_KEYS_REQUIRED.issubset(keys) or not keys.issubset(_KNOWN_PATH_STEP_KEYS_ALL):
        return False
    if not _is_nonempty_str(value["barrier_id"]) or value["result"] not in VALID_RESULTS:
        return False
    if "probability" in value and not _is_valid_probability(value["probability"]):
        return False
    return True


def _outcome_shape_is_valid(value: Any, max_path_length: int) -> bool:
    """Shape only (keys, types, path-length bound). Dangling-reference (invariant #1) and ordered-prefix
    reachability (invariant #2) are checked separately -- see ``_dangling_barrier_violations`` /
    ``_phantom_outcome_violations`` -- three independent predicates, each its own error code, same
    discipline ``fault_tree.py``'s own ``_gate_shape_is_valid`` docstring establishes for this family."""
    if not isinstance(value, dict) or set(value.keys()) != _KNOWN_OUTCOME_KEYS:
        return False
    if not _is_nonempty_str(value["outcome_id"]) or not value["outcome_id"].startswith(OUTCOME_ID_PREFIX):
        return False
    if not _is_nonempty_str(value["description"]):
        return False
    path = value["path"]
    if not isinstance(path, list) or not path or len(path) > max_path_length:
        return False
    return all(_path_step_is_valid(step) for step in path)


def _outcomes_are_valid(value: Any, max_path_length: int) -> tuple[bool, list[dict[str, Any]]]:
    """Shared predicate (called by BOTH the builder and the gate): shape + outcome_id uniqueness.
    ``max_path_length`` is ``len(barriers)`` of the ALREADY-VALIDATED barrier list -- callers must validate
    barriers first."""
    if not isinstance(value, list) or not value or not all(_outcome_shape_is_valid(o, max_path_length) for o in value):
        return False, []
    ids = [o["outcome_id"] for o in value]
    if len(set(ids)) != len(ids):
        return False, []
    return True, value


def _dangling_barrier_violations(outcomes: list[dict[str, Any]], known_barrier_ids: set[str]) -> list[str]:
    """Invariant #1: every barrier_id referenced anywhere in any outcome's own path must resolve to a real
    barriers[].barrier_id in the SAME record. Pure set-membership, position-agnostic -- independent of
    invariant #2's own ordering check (a path can reference only real ids yet still be out of order; see
    ``_phantom_outcome_violations``)."""
    violations: list[str] = []
    for outcome_entry in outcomes:
        for step in outcome_entry["path"]:
            if step["barrier_id"] not in known_barrier_ids:
                violations.append(f"outcome {outcome_entry['outcome_id']!r} path references unknown barrier_id {step['barrier_id']!r}")
    return violations


def _phantom_outcome_violations(outcomes: list[dict[str, Any]], ordered_barrier_ids: list[str]) -> list[str]:
    """Invariant #2: every outcome's own path, position by position, must equal an actual PREFIX of the
    declared barriers[] sequence -- ``path[i].barrier_id == ordered_barrier_ids[i]`` for every ``i`` in
    ``range(len(path))``. Operationalizes Atlas's own literal formula ('event→barriers success/fail→
    outcomes'): barrier k only matters once barriers 0..k-1 were already walked, in that exact order, in
    THIS path. A path that skips, reorders, or starts anywhere but the first declared barrier is a PHANTOM
    outcome -- it claims a walk the declared barrier sequence could never actually produce.

    Precondition: dangling-reference already checked (call only after ``_dangling_barrier_violations``
    returns empty) -- same "referential integrity first" sequencing ``fault_tree.py``'s own
    ``_cycle_violations`` docstring establishes for its own second invariant. Does not itself guard against
    an unresolvable barrier_id; an id absent from ``ordered_barrier_ids`` simply cannot equal any prefix
    entry, so it is still caught here too (belt and suspenders), just without the specific
    dangling-reference diagnosis."""
    violations: list[str] = []
    for outcome_entry in outcomes:
        path = outcome_entry["path"]
        actual = [step["barrier_id"] for step in path]
        expected = ordered_barrier_ids[: len(path)]
        if actual != expected:
            violations.append(f"outcome {outcome_entry['outcome_id']!r} path {actual} is not an ordered prefix of the declared barrier sequence {ordered_barrier_ids} (expected {expected})")
    return violations


def generate_event_tree_record(
    record_id: str,
    system_under_analysis: str,
    initiating_event: dict[str, Any],
    barriers: list[dict[str, Any]],
    outcomes: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/event-tree-record.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed, in this order: id/system_under_analysis/initiating_event shape, THEN
    barriers shape+uniqueness, THEN outcomes shape+uniqueness (including per-outcome path length <=
    len(barriers)), THEN referential integrity (invariant #1), THEN ordered-prefix reachability (invariant
    #2) -- same "shape first, then cross-reference, then structural" ordering ``fault_tree.py``'s own
    builder uses. REBUILDS every nested list/dict it owns; ``provenance`` is stored by reference, the same
    family-wide convention every prior root_cause module already follows."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"EVENTTREE_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not _is_nonempty_str(system_under_analysis):
        raise InvariantViolation(f"EVENTTREE_EMPTY_RECORD_FIELD: system_under_analysis must be a non-empty string, got {system_under_analysis!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"EVENTTREE_INVALID_VERSION: version must be a string, got {version!r}")
    if not _initiating_event_is_valid(initiating_event):
        raise InvariantViolation(f"EVENTTREE_INVALID_INITIATING_EVENT: initiating_event must be a dict with exactly 'description', a non-empty string, got {_shallow_describe(initiating_event)}")

    barriers_ok, ordered_barrier_ids = _barriers_are_valid(barriers)
    if not barriers_ok:
        raise InvariantViolation(
            f"EVENTTREE_INVALID_BARRIERS: barriers must be a non-empty list of well-shaped, uniquely-identified "
            f"{{barrier_id ({BARRIER_ID_PREFIX} prefixed), description}} entries, got {_shallow_describe(barriers)}"
        )

    outcomes_ok, outcomes_list = _outcomes_are_valid(outcomes, len(ordered_barrier_ids))
    if not outcomes_ok:
        raise InvariantViolation(
            f"EVENTTREE_INVALID_OUTCOMES: outcomes must be a non-empty list of well-shaped, uniquely-identified "
            f"{{outcome_id ({OUTCOME_ID_PREFIX} prefixed), description, path}} entries, each path a non-empty list of at most "
            f"len(barriers)={len(ordered_barrier_ids)} {{barrier_id, result in {sorted(VALID_RESULTS)}, optional probability in [0,1]}} steps, "
            f"got {_shallow_describe(outcomes)}"
        )

    dangling = _dangling_barrier_violations(outcomes_list, set(ordered_barrier_ids))
    if dangling:
        raise InvariantViolation(f"EVENTTREE_DANGLING_BARRIER_REFERENCE: {'; '.join(dangling)}")

    phantom = _phantom_outcome_violations(outcomes_list, ordered_barrier_ids)
    if phantom:
        raise InvariantViolation(f"EVENTTREE_PATH_NOT_ORDERED_PREFIX: {'; '.join(phantom)}")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "system_under_analysis": system_under_analysis,
        "initiating_event": {"description": initiating_event["description"]},
        "barriers": [dict(b) for b in barriers],
        "outcomes": [dict(o, path=[dict(step) for step in o["path"]]) for o in outcomes],
        "provenance": provenance,
    }


def barrier(barrier_id: str, description: str) -> dict[str, Any]:
    """Convenience constructor for one ``barriers[]`` entry. Not itself an invariant boundary -- the real
    check happens inside ``generate_event_tree_record``, which validates whatever dict it is handed
    regardless of how it was built."""
    return {"barrier_id": barrier_id, "description": description}


def path_step(barrier_id: str, result: str, *, probability: float | None = None) -> dict[str, Any]:
    """Convenience constructor for one ``outcomes[].path`` entry."""
    if result not in VALID_RESULTS:
        raise InvariantViolation(f"EVENTTREE_INVALID_RESULT: result must be one of {sorted(VALID_RESULTS)}, got {result!r}")
    step: dict[str, Any] = {"barrier_id": barrier_id, "result": result}
    if probability is not None:
        step["probability"] = probability
    return step


def outcome(outcome_id: str, description: str, path: list[dict[str, Any]]) -> dict[str, Any]:
    """Convenience constructor for one ``outcomes[]`` entry."""
    return {"outcome_id": outcome_id, "description": description, "path": list(path)}


def outcome_probability(record: dict[str, Any], outcome_id: str) -> float | None:
    """Real compute, genuinely recomputed fresh every call (never a stored field): the product of every path
    step's own ``probability`` for the named outcome, directly serving Atlas's own '評估防護層' (evaluate
    protective layers) benefit line -- the quantitative half of Event Tree's own purpose, same "bonus
    scenario-evaluation helper, not one of this contract's declared structural invariants" scope split
    ``fault_tree.py``'s own ``evaluate_top_event`` docstring establishes for its own family. Returns
    ``None`` (never 0.0, never an exception) when the outcome id is unknown OR any of its own path steps
    omits ``probability`` -- an unspecified probability is a real "cannot compute" state, not a silent zero.

    SCOPE: like ``evaluate_top_event``, operates on an ALREADY-VALID record -- does not itself re-validate
    shape or referential integrity; call only after ``generate_event_tree_record`` /
    ``evaluate_event_tree_integrity_gate`` already proved both."""
    for candidate in record["outcomes"]:
        if candidate["outcome_id"] == outcome_id:
            probabilities = [step.get("probability") for step in candidate["path"]]
            if any(p is None for p in probabilities):
                return None
            product = 1.0
            for p in probabilities:
                product *= p
            return product
    return None


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance is schema-valid."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_event_tree_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- does not trust any
    stored consistency, including whether a path's own barrier_ids resolve or stay in order. Bundles both
    headline invariants under one gate_id, same shape ``evaluate_fault_tree_integrity_gate`` /
    ``evaluate_bow_tie_integrity_gate`` already use for their own families (several distinct structural
    reasons, one gate_id, each with its own distinguishable evidence ``reason``). FAILS CLOSED on malformed
    input rather than crashing."""
    if not isinstance(record, dict):
        return _result("event_tree_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("event_tree_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("event_tree_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("system_under_analysis")):
        return _result("event_tree_integrity", False, [{"reason": "system_under_analysis missing or empty"}], validator, timestamp)
    if not _initiating_event_is_valid(record.get("initiating_event")):
        return _result("event_tree_integrity", False, [{"reason": "initiating_event missing, malformed, or has an empty description"}], validator, timestamp)

    barriers_ok, ordered_barrier_ids = _barriers_are_valid(record.get("barriers"))
    if not barriers_ok:
        return _result("event_tree_integrity", False, [{"reason": "barriers invalid (empty, malformed, or a duplicate/missing/wrongly-prefixed barrier_id)"}], validator, timestamp)

    outcomes_ok, outcomes_list = _outcomes_are_valid(record.get("outcomes"), len(ordered_barrier_ids))
    if not outcomes_ok:
        return _result("event_tree_integrity", False, [{"reason": "outcomes invalid (empty, malformed, a duplicate/missing/wrongly-prefixed outcome_id, or a path step malformed/too long)"}], validator, timestamp)

    dangling = _dangling_barrier_violations(outcomes_list, set(ordered_barrier_ids))
    if dangling:
        return _result("event_tree_integrity", False, [{"reason": "dangling barrier reference", "details": dangling}], validator, timestamp)

    phantom = _phantom_outcome_violations(outcomes_list, ordered_barrier_ids)
    if phantom:
        return _result("event_tree_integrity", False, [{"reason": "phantom outcome (path not an ordered prefix of barriers)", "details": phantom}], validator, timestamp)

    referenced_barrier_ids = {step["barrier_id"] for o in outcomes_list for step in o["path"]}
    unreferenced = sorted(set(ordered_barrier_ids) - referenced_barrier_ids)
    return _result(
        "event_tree_integrity",
        True,
        [{"barrier_count": len(ordered_barrier_ids), "outcome_count": len(outcomes_list), "unreferenced_barrier_ids": unreferenced}],
        validator,
        timestamp,
    )


def evaluate_event_tree_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_event_tree_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
