"""``decision.decision_tree`` -- Method Atlas slice, 7th member of the ``decision`` family (F16), after
``decision.ahp``/``decision.mcda``/``decision.impact_effort``/``decision.ice``/``decision.rice``/``decision.moscow``.

Atlas F16 tool table, Decision Tree row (L770, grep-confirmed sole citation, whole doc): "決策/機率/payoff
分支 | decision nodes→chance→probability→payoff | 呈現 uncertainty". No dedicated section beyond the table
row (grep-confirmed for "決策樹" too -- zero hits anywhere in the spec root), no §22.3 Method-specific Gate
row (grep-confirmed: that table's 10 rows are Fishbone/Persona/Scenario Planning/SWOT/AI Expert Lens/LLM
Arithmetic/Red Team/Monte Carlo/MCDA/Jurisdiction Inference -- Decision Tree absent, unlike
``decision.mcda``'s own table-cited L4154 row or ``decision.impact_effort``'s own inferred-from-prose one;
no prose caution exists here to infer from either) -- ``forbidden_transition`` is left genuinely empty, not
invented.

CRITICAL DUE DILIGENCE (task-mandated, before writing a field): read ``root_cause.fault_tree`` and
``root_cause.event_tree`` in full first. Confirmed genuinely distinct, not a re-skin:

- **fault_tree**: flat id-cross-referenced AND/OR logic gates, backward failure-decomposition, NO
  probability/payoff arithmetic (probability is an optional, uncombined per-basic-event annotation).
- **event_tree**: forward ordered-barrier-sequence walk to outcomes, NO explicit payoff/utility, and
  probability (when present) is a simple PRODUCT along one path, not a rolled-up expected value with
  interspersed choices.
- **decision_tree** (this module): TWO node types with real semantic weight -- ``decision`` (a human choice
  among >=2 alternatives, no probability) and ``chance`` (a probabilistic branch, siblings' probabilities
  MUST sum to 1.0) -- plus ``terminal`` leaves carrying an explicit ``payoff``. The real analytical content
  is EXPECTED VALUE computed bottom-up (``ai_lego.compute.decision_tree.rollup.roll_up_node``): decision
  analysis, not failure analysis. None of fault_tree/event_tree has a chance/decision node distinction, a
  probability-sums-to-1 invariant, or a payoff/expected-value rollup -- structurally and analytically a
  different method, not a duplicate.

Also checked against Atlas's own ADJACENT F16 row, Expected Value (L771: "機率×結果 | states→probabilities
→outcomes | 概率決策基線"): grepped this whole runtime tree for ``decision.expected_value`` / ``ExpectedValue``
at drafting time -- ZERO hits, not yet built. Distinction drawn from Atlas's own text alone at that point
(see compilation_decisions): Expected Value is Atlas's own FLAT, non-branching probability×payoff sum over
ONE outcome set (no choices, no multi-stage structure -- its own formula names no "decision" stage at all);
Decision Tree is the BRANCHING, multi-stage structure that computes expected value recursively AT EVERY
chance node as one step of a larger structure with real decision nodes interspersed. Decision Tree is the
more general/structural method; Expected Value would be the arithmetic primitive a single chance node's own
rollup already exercises as a special case -- not a duplicate, a superset relationship.

**Follow-up cross-check (``decision.expected_value`` landed later in this same batch -- a concurrent agent,
per this task's own brief -- and was read in full afterward):** independently reaches the IDENTICAL
conclusion above, unprompted, AND its own module docstring explicitly cross-checked THIS file back, naming
``OQ-DECISIONTREE-2`` by id and confirming no contradiction. One real, disclosed gap remains, not silently
implied as already solved: ``roll_up_node``'s own chance-node arithmetic (below) does not call
``ai_lego.compute.expected_value.calculation.compute_expected_value`` today -- this module's own chance-node
child is a nested pointer, that module's own ``states`` is a flat caller-enumerated list; reconciling them
is a real reshape, not a trivial import swap (tracked, not silently dropped, as the revised
OQ-DECISIONTREE-2).

Representation choice (due diligence vs a THIRD sibling, ``security.attack_tree``, also read in full):
NESTED/EMBEDDED tree (attack_tree's own shape), not fault_tree/event_tree's flat id-cross-referenced shape
-- a decision-tree node is inherently PATH-DEPENDENT (a chance node's own meaning depends on which decision
already led to it), unlike fault_tree's basic events, which legitimately recur under multiple gates. Same
"a node can only ever belong to one parent" rationale attack_tree's own module docstring already
establishes; also means cross-reference bug classes (dangling reference, cycle) are structurally
IMPOSSIBLE here, same as attack_tree, not merely unlikely.

Family-consistency compilation decision (see method contract): despite the structural resemblance to
attack_tree/fault_tree/event_tree (Pattern B: bespoke integrity gate only, no ``engine``
/``computation_provenance_ref`` fields), this module follows its OWN family's existing convention instead
(Pattern A: ``ahp``/``mcda``/``impact_effort``/``ice`` ALL carry ``engine``/``computation_provenance_ref``
and reuse ``modules.research.gates.evaluate_statistical_gate`` as a generic layer ALONGSIDE a bespoke
integrity gate) -- chosen so a ``decision`` family record looks uniform to any code iterating the family,
not because the tree SHAPE demands it.

THREE real, independently-enforced invariants (construction AND gate, same "raise before any downstream
write" / "re-derive, don't trust" two-layer discipline every prior module in this package uses):

1. **Tree shape** (``DECISIONTREE_INVALID_TREE_SHAPE``): every node is a dict shaped as EXACTLY one of
   ``decision``/``chance``/``terminal`` (closed key sets, never mixed); a decision/chance node has >=2
   branches (matches ``decision.mcda``'s own ``MCDA_TOO_FEW_OPTIONS`` precedent -- a "choice"/"chance" needs
   at least 2 real alternatives to be meaningful); a decision branch NEVER carries a ``probability`` key
   (structurally impossible, not merely unchecked); bounded to ``MAX_TREE_DEPTH`` (100, same defensive bound
   ``security.attack_tree``'s own ``MAX_TREE_DEPTH`` already establishes and for the same reason -- rejects
   only pathological input).
2. **Probability-sum** (``DECISIONTREE_PROBABILITY_SUM_MISMATCH``,
   ``ai_lego.compute.decision_tree.rollup.probability_sum_violations``): every chance node's own
   ``branches[].probability``, ANYWHERE in the tree, sums to 1.0 (tolerance 1e-6, same convention
   ``ai_lego.compute.mcda.scoring.validate_weights_sum_to_one`` already uses) -- a chance node whose
   branches don't exhaust the probability space is malformed, Atlas's own real textbook requirement.
3. **Expected-value genuine-compute** (``DECISIONTREE_EXPECTED_VALUE_MISMATCH``,
   ``evaluate_expected_value_integrity_gate``): ``expected_value`` at every decision/chance node, and
   ``optimal_branch_label`` at every decision node, are NEVER caller-supplied (no constructor parameter for
   either -- same "no parameter, so a legitimately-built record cannot carry a wrong one"
   discipline ``decision.impact_effort``'s own ``quadrant`` establishes) and are independently RE-DERIVED at
   the gate via the SAME ``roll_up_node`` pure function construction uses (never a second, parallel
   arithmetic implementation that could drift).

Gate style: isinstance-first / safe-``.get()``, per ``root_cause.fault_tree``. 5 gates total:
``provenance_required`` + ``genuine_compute`` (generic, reused per the family-consistency decision above) +
``tree_shape_integrity`` + ``probability_sum_integrity`` + ``expected_value_integrity`` (bespoke, the real
differentiator) -- one gate_id per distinguishable concern, matching ``learning.pdca``'s own
``stage_order_integrity``/``learning_continuity`` split rather than fault_tree's single bundled gate_id,
since decision_tree's 3 structural concerns are each independently meaningful and independently testable.
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.compute.decision_tree.rollup import probability_sum_violations, resolved_value, roll_up_node
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.gates import evaluate_statistical_gate, genuine_compute_provenance

METHOD_ID = "decision.decision_tree"
RECORD_ID_PREFIX = "DECISIONTREE-"
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.decision_tree.rollup.roll_up_node"
MAX_TREE_DEPTH = 100
# Same defensive bound security.attack_tree.py's own MAX_TREE_DEPTH establishes, for the same reason: real
# decision trees (Atlas's own formula is a handful of stages) are shallow; this rejects only pathological
# input, never real usage, and keeps recursive traversal (shape check, rollup, probability-sum check) well
# inside Python's own default recursion limit.
MIN_BRANCHES = 2
# A "choice" or "chance" needs at least 2 real alternatives to be meaningful -- same precedent
# decision.mcda.py's own MCDA_TOO_FEW_OPTIONS ("at least 2 required to rank") already establishes for this
# family.
VALID_NODE_TYPES = frozenset({"decision", "chance", "terminal"})

_KNOWN_TERMINAL_NODE_KEYS = frozenset({"node_type", "label", "payoff"})
_KNOWN_DECISION_NODE_INPUT_KEYS = frozenset({"node_type", "label", "branches"})
_KNOWN_DECISION_NODE_STORED_KEYS = _KNOWN_DECISION_NODE_INPUT_KEYS | {"expected_value", "optimal_branch_label"}
_KNOWN_CHANCE_NODE_INPUT_KEYS = frozenset({"node_type", "label", "branches"})
_KNOWN_CHANCE_NODE_STORED_KEYS = _KNOWN_CHANCE_NODE_INPUT_KEYS | {"expected_value"}
_KNOWN_DECISION_BRANCH_KEYS = frozenset({"label", "child"})
_KNOWN_CHANCE_BRANCH_KEYS = frozenset({"label", "probability", "child"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- NEVER Python's own recursive ``repr()`` (would
    itself risk trouble on a pathologically deep/wide tree), same discipline every prior tree module in this
    codebase (``fault_tree``/``attack_tree``) already establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _is_finite_number(value: Any) -> bool:
    """Same bool/NaN/inf exclusion discipline every numeric check in this codebase uses: ``True``/``False``
    must not silently pass an ``isinstance(value, (int, float))`` check as if it were 1/0, and NaN/Infinity
    are not valid RFC 8259 JSON and would make 'maximize expected value' meaningless."""
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _is_valid_probability(value: Any) -> bool:
    """Same convention ``root_cause.fault_tree``'s own ``_is_valid_probability`` / ``root_cause.event_tree``'s
    own copy already establish: a finite real number in [0, 1], bool explicitly excluded."""
    return _is_finite_number(value) and 0 <= value <= 1


def _terminal_node_is_valid(node: Any) -> bool:
    if not isinstance(node, dict) or set(node.keys()) != _KNOWN_TERMINAL_NODE_KEYS:
        return False
    return _is_nonempty_str(node.get("label")) and _is_finite_number(node.get("payoff"))


def _decision_branch_is_valid(branch: Any, depth: int, *, stored: bool) -> bool:
    if not isinstance(branch, dict) or set(branch.keys()) != _KNOWN_DECISION_BRANCH_KEYS:
        return False
    if not _is_nonempty_str(branch.get("label")):
        return False
    return _node_is_valid(branch.get("child"), depth, stored=stored)


def _chance_branch_is_valid(branch: Any, depth: int, *, stored: bool) -> bool:
    if not isinstance(branch, dict) or set(branch.keys()) != _KNOWN_CHANCE_BRANCH_KEYS:
        return False
    if not _is_nonempty_str(branch.get("label")) or not _is_valid_probability(branch.get("probability")):
        return False
    return _node_is_valid(branch.get("child"), depth, stored=stored)


def _node_is_valid(node: Any, depth: int = 0, *, stored: bool = False) -> bool:
    """Shared predicate (the recursive entry point), called by BOTH the builder (``stored=False`` -- a
    caller-supplied raw node must NEVER carry ``expected_value``/``optimal_branch_label``, there is no
    parameter for either) and the gate (``stored=True`` -- a record's own stored node MUST carry them,
    correctly typed; whether they hold the CORRECT VALUE is a separate concern, see
    ``evaluate_expected_value_integrity_gate``). Bounded to ``MAX_TREE_DEPTH`` -- past that, refused as
    invalid rather than recursing further, same fail-closed-not-RecursionError discipline
    ``security.attack_tree``'s own ``_attack_node_is_valid`` already establishes."""
    if depth > MAX_TREE_DEPTH:
        return False
    if not isinstance(node, dict) or "node_type" not in node:
        return False
    node_type = node["node_type"]
    if node_type not in VALID_NODE_TYPES:
        return False

    if node_type == "terminal":
        return _terminal_node_is_valid(node)

    if node_type == "decision":
        expected_keys = _KNOWN_DECISION_NODE_STORED_KEYS if stored else _KNOWN_DECISION_NODE_INPUT_KEYS
        if set(node.keys()) != expected_keys:
            return False
        if not _is_nonempty_str(node.get("label")):
            return False
        branches = node.get("branches")
        if not isinstance(branches, list) or len(branches) < MIN_BRANCHES:
            return False
        if not all(_decision_branch_is_valid(b, depth + 1, stored=stored) for b in branches):
            return False
        if not stored:
            return True
        if not _is_finite_number(node.get("expected_value")):
            return False
        branch_labels = {b["label"] for b in branches}
        return node.get("optimal_branch_label") in branch_labels

    # "chance"
    expected_keys = _KNOWN_CHANCE_NODE_STORED_KEYS if stored else _KNOWN_CHANCE_NODE_INPUT_KEYS
    if set(node.keys()) != expected_keys:
        return False
    if not _is_nonempty_str(node.get("label")):
        return False
    branches = node.get("branches")
    if not isinstance(branches, list) or len(branches) < MIN_BRANCHES:
        return False
    if not all(_chance_branch_is_valid(b, depth + 1, stored=stored) for b in branches):
        return False
    if not stored:
        return True
    return _is_finite_number(node.get("expected_value"))


# --------------------------------------------------------------------------
# Convenience constructors -- eager, minimal validation, same discipline every prior module's own
# constructors use. NOT the invariant boundary: generate_decision_tree_record validates whatever dict it is
# handed regardless of how it was built.
# --------------------------------------------------------------------------


def terminal_node(label: str, payoff: float) -> dict[str, Any]:
    if not _is_nonempty_str(label):
        raise InvariantViolation(f"DECISIONTREE_EMPTY_NODE_LABEL: terminal node label must be a non-empty string, got {label!r}")
    if not _is_finite_number(payoff):
        raise InvariantViolation(f"DECISIONTREE_INVALID_PAYOFF: payoff must be a finite real number, got {payoff!r}")
    return {"node_type": "terminal", "label": label, "payoff": payoff}


def decision_branch(label: str, child: dict[str, Any]) -> dict[str, Any]:
    if not _is_nonempty_str(label):
        raise InvariantViolation(f"DECISIONTREE_EMPTY_BRANCH_LABEL: decision branch label must be a non-empty string, got {label!r}")
    return {"label": label, "child": child}


def chance_branch(label: str, probability: float, child: dict[str, Any]) -> dict[str, Any]:
    if not _is_nonempty_str(label):
        raise InvariantViolation(f"DECISIONTREE_EMPTY_BRANCH_LABEL: chance branch label must be a non-empty string, got {label!r}")
    if not _is_valid_probability(probability):
        raise InvariantViolation(f"DECISIONTREE_INVALID_PROBABILITY: probability must be a finite number in [0, 1], got {probability!r}")
    return {"label": label, "probability": probability, "child": child}


def decision_node(label: str, branches: list[dict[str, Any]]) -> dict[str, Any]:
    if not _is_nonempty_str(label):
        raise InvariantViolation(f"DECISIONTREE_EMPTY_NODE_LABEL: decision node label must be a non-empty string, got {label!r}")
    return {"node_type": "decision", "label": label, "branches": list(branches)}


def chance_node(label: str, branches: list[dict[str, Any]]) -> dict[str, Any]:
    if not _is_nonempty_str(label):
        raise InvariantViolation(f"DECISIONTREE_EMPTY_NODE_LABEL: chance node label must be a non-empty string, got {label!r}")
    return {"node_type": "chance", "label": label, "branches": list(branches)}


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_decision_tree_record(
    record_id: str,
    decision_context: str,
    root: dict[str, Any],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/decision-tree-record.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed, in this order: id/decision_context/version/provenance shape, tree shape
    (invariant #1, ``root`` as CALLER-SUPPLIED -- ``stored=False``), probability-sum (invariant #2). Only
    THEN calls ``roll_up_node`` to compute ``expected_value``/``optimal_branch_label`` at every decision
    /chance node (invariant #3) -- neither is a parameter here; a caller cannot supply, and therefore cannot
    corrupt, either."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"DECISIONTREE_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not _is_nonempty_str(decision_context):
        raise InvariantViolation(f"DECISIONTREE_EMPTY_RECORD_FIELD: decision_context must be a non-empty string, got {decision_context!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"DECISIONTREE_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"DECISIONTREE_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    if not _node_is_valid(root, stored=False):
        raise InvariantViolation(
            f"DECISIONTREE_INVALID_TREE_SHAPE: root must be a recursively well-shaped decision_tree_node -- a decision/chance node "
            f"(node_type/label/branches, >= {MIN_BRANCHES} branches, each branch well-shaped for its own node_type) or a terminal node "
            f"(node_type/label/payoff, payoff a finite real number), deeper than MAX_TREE_DEPTH={MAX_TREE_DEPTH}, or too deeply nested "
            f"to describe safely; got {_shallow_describe(root)}"
        )

    prob_violations = probability_sum_violations(root)
    if prob_violations:
        raise InvariantViolation(f"DECISIONTREE_PROBABILITY_SUM_MISMATCH: {'; '.join(prob_violations)}")

    rolled_root = roll_up_node(root)

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "decision_context": decision_context,
        "root": rolled_root,
        "root_expected_value": resolved_value(rolled_root),
        "engine": "local_python_deterministic_compute",
        "computation_provenance_ref": COMPUTATION_PROVENANCE_REF,
        "provenance": genuine_compute_provenance(provenance),
    }


# --------------------------------------------------------------------------
# Bonus helper -- real compute over an ALREADY-VALID record, not one of the declared structural invariants
# (same scope split fault_tree.evaluate_top_event / event_tree.outcome_probability / pdca's own
# resolve_carried_forward_action_items use).
# --------------------------------------------------------------------------


def list_decision_points(record: dict[str, Any]) -> list[dict[str, Any]]:
    """Flattens every ``decision`` node anywhere in the record's own tree into a
    ``{path, label, expected_value, optimal_branch_label}`` summary row, in tree (pre-order) traversal order
    -- a practical "decision summary table" over an already-rolled-up tree (Atlas's own '呈現 uncertainty'
    benefit, made concrete: every choice point in the tree, with its own computed recommendation, at a
    glance). ``path`` is a human-readable breadcrumb (root, or a dotted chain of branch labels), not a
    machine cross-reference id -- this representation has none to give (see module docstring: nested,
    embedded, no id namespace). Precondition: ``record["root"]`` is already a rolled-up (``stored=True``
    -valid) tree."""
    points: list[dict[str, Any]] = []

    def _walk(node: dict[str, Any], path: str) -> None:
        if node["node_type"] == "terminal":
            return
        if node["node_type"] == "decision":
            points.append({"path": path, "label": node["label"], "expected_value": node["expected_value"], "optimal_branch_label": node["optimal_branch_label"]})
        for branch in node["branches"]:
            _walk(branch["child"], f"{path} -> {branch['label']}")

    _walk(record["root"], record["root"]["label"])
    return points


# --------------------------------------------------------------------------
# Gates -- independently re-derive all three invariants from raw fields, fail-closed on malformed input.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance is schema-valid."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_genuine_compute_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Reuses ``modules.research.gates.evaluate_statistical_gate`` UNCHANGED -- same family-wide reuse
    ``decision.ahp``/``decision.mcda``/``decision.impact_effort``/``decision.ice`` already established
    (family-consistency compilation decision, see module docstring), checking this record's own
    ``engine``/``computation_provenance_ref``/``provenance`` METADATA fields resolve and are well-formed.
    Does NOT itself re-derive whether the stored ``expected_value``/``optimal_branch_label`` VALUES are
    correct -- that is ``evaluate_expected_value_integrity_gate``'s own, stronger job; the two gates are
    complementary, not redundant (same split ``decision.impact_effort``'s own docstring already
    establishes for its ``genuine_compute``/``quadrant_integrity`` pair)."""
    if not isinstance(record, dict):
        return _result("genuine_compute", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed, evidence = evaluate_statistical_gate(record)
    return _result("genuine_compute", passed, evidence, validator, timestamp)


def evaluate_tree_shape_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Invariant #1, re-derived independently and fully: re-checks ``id``/``version``/``decision_context``
    plus a full recursive ``_node_is_valid(root, stored=True)`` pass over the record's own stored tree --
    does not trust any stored shape, including that every decision/chance node still carries a well-typed
    ``expected_value``/``optimal_branch_label``. FAILS CLOSED on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("tree_shape_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("tree_shape_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("tree_shape_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("decision_context")):
        return _result("tree_shape_integrity", False, [{"reason": "decision_context missing or empty"}], validator, timestamp)
    root = record.get("root")
    if not _node_is_valid(root, stored=True):
        return _result(
            "tree_shape_integrity",
            False,
            [{"reason": f"root invalid (malformed node, unknown/missing keys, mixed node_type shape, fewer than {MIN_BRANCHES} branches, or deeper than MAX_TREE_DEPTH={MAX_TREE_DEPTH})"}],
            validator,
            timestamp,
        )
    return _result("tree_shape_integrity", True, [{"root_node_type": root["node_type"]}], validator, timestamp)


def evaluate_probability_sum_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Invariant #2, re-derived independently: re-checks tree shape first (own precondition, does not trust
    ``evaluate_tree_shape_gate`` already ran), then re-derives every chance node's own probability sum via
    ``probability_sum_violations`` -- the SAME function construction uses, never a second parallel
    implementation."""
    if not isinstance(record, dict):
        return _result("probability_sum_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    root = record.get("root")
    if not _node_is_valid(root, stored=True):
        return _result("probability_sum_integrity", False, [{"reason": "root invalid -- cannot evaluate probability sums"}], validator, timestamp)
    violations = probability_sum_violations(root)
    return _result("probability_sum_integrity", not violations, [{"violations": violations}], validator, timestamp)


def _expected_value_mismatches(stored: dict[str, Any], recomputed: dict[str, Any], path: str) -> list[str]:
    """Structural DIFF only -- no arithmetic lives here (that is entirely ``roll_up_node``'s own job, called
    once by the caller before this walk begins). Walks ``stored`` (the record's own tree) and ``recomputed``
    (fresh output of ``roll_up_node`` over that same tree's raw fields) IN PARALLEL, reporting every
    ``expected_value``/``optimal_branch_label`` disagreement with a path breadcrumb naming the specific
    node. Precondition: both trees already share the same shape (``recomputed`` was derived FROM
    ``stored``'s own structural fields, so a shape mismatch here would itself be a bug in this function, not
    a legitimate finding about the record)."""
    violations: list[str] = []
    node_type = stored["node_type"]
    if node_type == "terminal":
        return violations
    if stored.get("expected_value") != recomputed.get("expected_value"):
        violations.append(f"{path} ({node_type} node {stored.get('label')!r}): stored expected_value={stored.get('expected_value')!r} does not match recomputed={recomputed.get('expected_value')!r}")
    if node_type == "decision" and stored.get("optimal_branch_label") != recomputed.get("optimal_branch_label"):
        violations.append(f"{path} (decision node {stored.get('label')!r}): stored optimal_branch_label={stored.get('optimal_branch_label')!r} does not match recomputed={recomputed.get('optimal_branch_label')!r}")
    for index, (stored_branch, recomputed_branch) in enumerate(zip(stored["branches"], recomputed["branches"])):
        violations.extend(_expected_value_mismatches(stored_branch["child"], recomputed_branch["child"], f"{path}.branches[{index}]({stored_branch.get('label')!r})"))
    return violations


def evaluate_expected_value_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Invariant #3, THE real differentiator: re-derives shape (own precondition, re-checked, not trusted)
    and probability-sum validity FIRST (recomputing ``expected_value`` over a tree with a malformed
    probability distribution would be meaningless), then calls ``roll_up_node`` fresh on the record's own
    raw payoffs/probabilities/branches and walks the result against whatever is actually stored
    (``_expected_value_mismatches``) -- including ``root_expected_value``. Never trusts any stored value.
    FAILS CLOSED on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("expected_value_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    root = record.get("root")
    if not _node_is_valid(root, stored=True):
        return _result("expected_value_integrity", False, [{"reason": "root invalid -- cannot evaluate expected-value integrity"}], validator, timestamp)
    if probability_sum_violations(root):
        return _result("expected_value_integrity", False, [{"reason": "probability sums invalid -- cannot evaluate expected-value integrity"}], validator, timestamp)

    recomputed_root = roll_up_node(root)
    violations = _expected_value_mismatches(root, recomputed_root, record.get("id", "root"))

    recomputed_root_value = resolved_value(recomputed_root)
    if record.get("root_expected_value") != recomputed_root_value:
        violations.append(f"root_expected_value: stored={record.get('root_expected_value')!r} does not match recomputed={recomputed_root_value!r}")

    return _result("expected_value_integrity", not violations, [{"violations": violations, "recomputed_root_expected_value": recomputed_root_value}], validator, timestamp)


def evaluate_decision_tree_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_genuine_compute_gate(record, validator, timestamp),
        evaluate_tree_shape_gate(record, validator, timestamp),
        evaluate_probability_sum_gate(record, validator, timestamp),
        evaluate_expected_value_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
