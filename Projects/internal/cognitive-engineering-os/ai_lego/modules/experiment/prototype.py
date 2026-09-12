"""``experiment.prototype`` -- F15 experiment & validation family (Atlas L734-752).

Atlas's own table row (L738, verbatim): "Prototype | 驗證概念/互動 | learning
goal->低保真->user test->iterate | 低成本發現問題" (validate concept/
interaction, via a low-fidelity representation and a user test, iterating on
what is observed; low-cost problem discovery).

Real invariants, enforced at TWO independent layers, same belt-and-
suspenders discipline every prior slice in this corpus establishes:

1. **Fidelity ceiling** (``PROTO_FIDELITY_TOO_HIGH``) -- Atlas's own text
   says "低保真" (low-fidelity); ``fidelity.level`` must be LOW or MEDIUM,
   never HIGH. A "prototype" built at high fidelity is not testing an
   interaction/concept assumption cheaply -- it is a build, and calling it a
   Prototype would let a full-cost build skip the rigor this method exists
   to keep cheap.
2. **Iteration traceability, THE real invariant this method exists to
   enforce** (``PROTO_DANGLING_OBSERVATION_REF``) -- every
   ``iterations[].triggered_by_observation_index`` must resolve to a real
   ``user_test.observations[]`` entry. An "iterated based on user feedback"
   claim with no real observation behind it is exactly the unfalsifiable,
   AI-narrated confidence this corpus's F15 core principle (Atlas L750-752:
   "而不是讓 AI 主觀打 8.7/10") exists to refuse.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for
"experiment\\.", "prototype-record", "family: experiment" before writing any
of this method's own files: zero pre-existing implementation or schema title
overlap.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "experiment.prototype"
RECORD_ID_PREFIX = "PROTO-"
_FIDELITY_LEVELS = frozenset({"LOW", "MEDIUM"})
_LEARNING_GOAL_KEYS = frozenset({"statement", "falsifiable_if"})
_FIDELITY_KEYS = frozenset({"level", "rationale"})
_USER_TEST_KEYS = frozenset({"method", "participant_count", "observations"})
_ITERATION_KEYS = frozenset({"change", "triggered_by_observation_index"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _learning_goal_problem(value: Any) -> str | None:
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    if set(value.keys()) != _LEARNING_GOAL_KEYS:
        return f"keys must be exactly {sorted(_LEARNING_GOAL_KEYS)}, got {sorted(value.keys())}"
    if not _is_nonempty_str(value.get("statement")):
        return f"statement must be a non-empty string, got {value.get('statement')!r}"
    if not _is_nonempty_str(value.get("falsifiable_if")):
        return f"falsifiable_if must be a non-empty string, got {value.get('falsifiable_if')!r}"
    return None


def _fidelity_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped fidelity block", INCLUDING the LOW/MEDIUM ceiling --
    both ``fidelity()`` (construction layer) and the gate (independent re-derivation layer) consult it."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    if set(value.keys()) != _FIDELITY_KEYS:
        return f"keys must be exactly {sorted(_FIDELITY_KEYS)}, got {sorted(value.keys())}"
    level = value.get("level")
    if level not in _FIDELITY_LEVELS:
        return f"level must be one of {sorted(_FIDELITY_LEVELS)} (Atlas L738's own '低保真' -- HIGH is refused), got {level!r}"
    if not _is_nonempty_str(value.get("rationale")):
        return f"rationale must be a non-empty string, got {value.get('rationale')!r}"
    return None


def _user_test_problem(value: Any) -> str | None:
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    if set(value.keys()) != _USER_TEST_KEYS:
        return f"keys must be exactly {sorted(_USER_TEST_KEYS)}, got {sorted(value.keys())}"
    if not _is_nonempty_str(value.get("method")):
        return f"method must be a non-empty string, got {value.get('method')!r}"
    participant_count = value.get("participant_count")
    if isinstance(participant_count, bool) or not isinstance(participant_count, int) or participant_count < 1:
        return f"participant_count must be an int >= 1 (bool excluded), got {participant_count!r}"
    observations = value.get("observations")
    if not isinstance(observations, list) or not observations:
        return f"observations must be a non-empty list, got {observations!r}"
    for i, observation in enumerate(observations):
        if not _is_nonempty_str(observation):
            return f"observations[{i}] must be a non-empty string, got {observation!r}"
    return None


def _iteration_problem(value: Any) -> str | None:
    """Shape/range only, NOT traceability against user_test.observations, which needs the sibling object and
    is checked once in ``generate_prototype``/the gate (same division of labor cross_impact_analysis's
    ``_pair_problem``/matrix-completeness split establishes)."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    if set(value.keys()) != _ITERATION_KEYS:
        return f"keys must be exactly {sorted(_ITERATION_KEYS)}, got {sorted(value.keys())}"
    if not _is_nonempty_str(value.get("change")):
        return f"change must be a non-empty string, got {value.get('change')!r}"
    index = value.get("triggered_by_observation_index")
    if isinstance(index, bool) or not isinstance(index, int) or index < 0:
        return f"triggered_by_observation_index must be an int >= 0 (bool excluded), got {index!r}"
    return None


def learning_goal(statement: str, falsifiable_if: str) -> dict[str, Any]:
    """One instance of ``typed-objects/prototype-record.schema.yaml#/properties/learning_goal``."""
    record = {"statement": statement, "falsifiable_if": falsifiable_if}
    problem = _learning_goal_problem(record)
    if problem is not None:
        raise InvariantViolation(f"PROTO_INVALID_LEARNING_GOAL: {problem}")
    return record


def fidelity(level: str, rationale: str) -> dict[str, Any]:
    """One instance of ``typed-objects/prototype-record.schema.yaml#/properties/fidelity``."""
    record = {"level": level, "rationale": rationale}
    problem = _fidelity_problem(record)
    if problem is not None:
        code = "PROTO_FIDELITY_TOO_HIGH" if level == "HIGH" else "PROTO_INVALID_FIDELITY"
        raise InvariantViolation(f"{code}: {problem}")
    return record


def user_test(method: str, participant_count: int, observations: list[str]) -> dict[str, Any]:
    """One instance of ``typed-objects/prototype-record.schema.yaml#/properties/user_test``."""
    record = {"method": method, "participant_count": participant_count, "observations": list(observations)}
    problem = _user_test_problem(record)
    if problem is not None:
        raise InvariantViolation(f"PROTO_INVALID_USER_TEST: {problem}")
    return record


def iteration(change: str, triggered_by_observation_index: int) -> dict[str, Any]:
    """One instance of ``typed-objects/prototype-record.schema.yaml#/properties/iterations`` item. Does NOT
    itself check traceability against a declared ``user_test.observations`` list -- that cross-field check
    happens once, in ``generate_prototype``, after every iteration has been rebuilt."""
    record = {"change": change, "triggered_by_observation_index": triggered_by_observation_index}
    problem = _iteration_problem(record)
    if problem is not None:
        raise InvariantViolation(f"PROTO_INVALID_ITERATION: {problem}")
    return record


def generate_prototype(
    record_id: str,
    learning_goal_: dict[str, Any],
    fidelity_: dict[str, Any],
    user_test_: dict[str, Any],
    iterations: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/prototype-record.schema.yaml``.

    Rebuilds every sub-object via its own builder (never trusting the caller's raw dicts), then enforces the
    method contract's own real invariants fail-closed, in order: id/version/provenance shape, fidelity ceiling,
    at least 1 iteration declared, and -- the invariant this method exists to enforce -- every iteration's
    ``triggered_by_observation_index`` resolves to a real ``user_test.observations[]`` entry -- BEFORE
    returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"PROTO_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"PROTO_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("PROTO_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    if not isinstance(learning_goal_, dict):
        raise InvariantViolation(f"PROTO_INVALID_LEARNING_GOAL: learning_goal must be a dict, got {learning_goal_!r}")
    rebuilt_learning_goal = learning_goal(learning_goal_.get("statement"), learning_goal_.get("falsifiable_if"))

    if not isinstance(fidelity_, dict):
        raise InvariantViolation(f"PROTO_INVALID_FIDELITY: fidelity must be a dict, got {fidelity_!r}")
    rebuilt_fidelity = fidelity(fidelity_.get("level"), fidelity_.get("rationale"))

    if not isinstance(user_test_, dict):
        raise InvariantViolation(f"PROTO_INVALID_USER_TEST: user_test must be a dict, got {user_test_!r}")
    rebuilt_user_test = user_test(user_test_.get("method"), user_test_.get("participant_count"), user_test_.get("observations") or [])

    if not isinstance(iterations, list) or not iterations:
        raise InvariantViolation(f"PROTO_TOO_FEW_ITERATIONS: at least 1 iteration is required, got {iterations!r}")
    rebuilt_iterations: list[dict[str, Any]] = []
    for i, it in enumerate(iterations):
        if not isinstance(it, dict):
            raise InvariantViolation(f"PROTO_INVALID_ITERATION: iterations[{i}] must be a dict, got {it!r}")
        try:
            rebuilt_iterations.append(iteration(it.get("change"), it.get("triggered_by_observation_index")))
        except InvariantViolation as error:
            raise InvariantViolation(f"PROTO_INVALID_ITERATION: iterations[{i}]: {error}") from error

    observation_count = len(rebuilt_user_test["observations"])
    dangling = sorted({it["triggered_by_observation_index"] for it in rebuilt_iterations if not (0 <= it["triggered_by_observation_index"] < observation_count)})
    if dangling:
        raise InvariantViolation(
            f"PROTO_DANGLING_OBSERVATION_REF: iterations[] reference observation index(es) {dangling} outside "
            f"user_test.observations[] (length {observation_count}) -- an iteration must trace to a real observation"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "learning_goal": rebuilt_learning_goal,
        "fidelity": rebuilt_fidelity,
        "user_test": rebuilt_user_test,
        "iterations": rebuilt_iterations,
        "provenance": copy.deepcopy(provenance),
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record carries a schema-valid provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_fidelity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives the LOW/MEDIUM fidelity ceiling directly from raw fields using the SAME ``_fidelity_problem``
    predicate the builder uses -- without this the gate could pass a hand-tampered HIGH-fidelity record."""
    if not isinstance(record, dict):
        return _result("fidelity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problem = _fidelity_problem(record.get("fidelity"))
    return _result("fidelity", problem is None, [{"problem": problem}], validator, timestamp)


def evaluate_iteration_traceability_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas L738's own 'iterate' pipeline stage directly from raw fields -- every iteration must
    trace to a real user_test.observations[] entry. Fails closed on malformed entries rather than crashing, and
    does NOT assume the builder's own shape checks already ran."""
    if not isinstance(record, dict):
        return _result("iteration_traceability", False, [{"reason": "record is not a dict"}], validator, timestamp)
    user_test_ = record.get("user_test")
    iterations = record.get("iterations")
    problems: list[str] = []

    observation_count = 0
    if isinstance(user_test_, dict) and _user_test_problem(user_test_) is None:
        observation_count = len(user_test_["observations"])
    else:
        problems.append("user_test is missing or malformed")

    if isinstance(iterations, list) and iterations:
        malformed = [f"iterations[{i}]: {problem}" for i, problem in ((i, _iteration_problem(it)) for i, it in enumerate(iterations)) if problem]
        problems.extend(malformed)
        well_shaped = [it for it in iterations if _iteration_problem(it) is None]
        if not malformed:
            dangling = sorted({it["triggered_by_observation_index"] for it in well_shaped if not (0 <= it["triggered_by_observation_index"] < observation_count)})
            if dangling:
                problems.append(f"dangling observation index(es): {dangling} (observation_count={observation_count})")
    else:
        problems.append("iterations must be a non-empty list")

    passed = not problems
    return _result("iteration_traceability", passed, [{"observation_count": observation_count, "problems": problems}], validator, timestamp)


def evaluate_prototype_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_fidelity_gate(record, validator, timestamp),
        evaluate_iteration_traceability_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
