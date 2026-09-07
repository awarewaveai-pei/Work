"""``learning.after_action_review`` -- Method Atlas slice, learning family (F17), after
reversal_criteria/kill_criteria/decision_journal/pdca. Atlas F17 table row (L804, grep-verified):
"After Action Review | 比較預期與實際 | Expected? Actual? Why? Next? | 快速組織學習". No dedicated
Atlas section beyond the table row and the F19 Game Day formula's own final phase (L858, "...→AAR").

Due diligence (full argument in methods/contracts/learning.after_action_review.contract.yaml's own
compilation_decisions -- not repeated here): (1) distinct from ``learning.decision_journal`` -- that
method is ONE decision, >= 2 named options, hash-locked BEFORE the outcome is known (防 hindsight bias);
this method is any COMPLETED activity, no options structure, written AFTER the outcome is known, no
tamper-evidence mechanism (快速組織學習). (2) ``devops_sre.game_day.py`` already embeds these same 4
Atlas L804 keys as a bare-string ``aar`` phase object (its own OQ-GAMEDAY-2 asked whether a future F17
object should be referenced by it) -- resolved in this method's own contract: game_day's embedded aar
stays as-is (out of this task's scope to edit), this module is the standalone, independently-gated
canonical F17 method.

TWO real, independently-enforced invariants (construction AND gate, same "raise before any downstream
write" / "re-derive, don't trust" two-layer discipline every prior module in this package uses; both
convenience constructors below are NOT the invariant boundary -- ``generate_after_action_review_record``
validates whatever it is handed regardless of how each item was built, same division of labor
``root_cause.fault_tree``'s ``basic_event``/``gate`` and ``learning.decision_journal``'s ``option``/
``evidence_item`` already establish):

1. **Why-analysis genuineness** (``AAR_INSUFFICIENT_WHY_ANALYSIS``): ``why_factors`` needs >= 2 entries,
   each >= 3 whitespace-separated words, no two normalizing (case/whitespace-insensitive, same
   ``root_cause.kepner_tregoe._normalize`` technique) to the same text -- two syntactic floors, not fake
   NLP semantic checking (rejected alternative: comparing why_factors text against expected/actual for
   near-duplicate detection -- cheap string-equality would fake a semantic check it cannot actually do).
2. **Ownership** (``AAR_NO_OWNED_ACTION``): ``next_actions`` needs >= 1 entry, every entry names a
   non-empty owner -- same "unowned == decorative, not a real control" discipline
   ``learning.kill_criteria``'s own ownership invariant and ``root_cause.bow_tie``'s own OWNER/TEST
   invariant already establish elsewhere in this package.

Scope, disclosed: id-prefix/version-type/expected/actual-emptiness are checked at construction only, not
independently gate-re-derived -- same asymmetry ``learning.kill_criteria``'s own id/decision_ref fields
already have (its 3 gates check only threshold-coverage/ownership/provenance, never id shape); the schema
(``after-action-review-record.schema.yaml``) is the id-prefix/version-type source of truth, same
"schema owns the envelope, runtime owns the phase invariants" split ``devops_sre.game_day``'s own
compilation_decisions disclose for its own record. minItems (2 for why_factors, 1 for next_actions) is
belt-and-suspenders re-checked here too (schema already expresses it) because a gate re-derivation may run
against a hand-tampered record that never passed through schema validation at all.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "learning.after_action_review"
RECORD_ID_PREFIX = "AAR-"
MIN_WHY_FACTORS = 2
MIN_WHY_FACTOR_WORDS = 3
_KNOWN_WHY_FACTOR_KEYS = frozenset({"id", "description"})
_KNOWN_NEXT_ACTION_KEYS = frozenset({"id", "description", "owner"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- NEVER a raw recursive ``repr()`` over caller-
    supplied input of unknown size, same discipline ``root_cause.fault_tree._shallow_describe`` establishes
    (a bare recursive repr in an error path is itself a small denial-of-service surface)."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _normalize(value: str) -> str:
    """Case/whitespace-insensitive comparison key -- same technique ``root_cause.kepner_tregoe._normalize``
    already establishes for this package's own duplicate-after-normalize checks."""
    return " ".join(value.strip().casefold().split())


def _word_count(value: str) -> int:
    return len(value.split())


# --------------------------------------------------------------------------
# Shape validators (keys/types only -- NOT the real invariants, each checked separately below with its own
# distinct error code, same three-tier split root_cause.fault_tree/learning.kill_criteria already use).
# --------------------------------------------------------------------------


def _why_factor_shape_is_valid(item: Any) -> bool:
    if not isinstance(item, dict) or set(item.keys()) != _KNOWN_WHY_FACTOR_KEYS:
        return False
    return _is_nonempty_str(item.get("id")) and _is_nonempty_str(item.get("description"))


def _next_action_shape_is_valid(item: Any) -> bool:
    """``owner`` is checked as a plain string here (empty allowed) -- non-emptiness is Invariant #2,
    checked separately by ``_next_actions_invariant_violations``/``evaluate_ownership_gate`` with its own
    distinct code, same shape/invariant split ``learning.kill_criteria._threshold_shape_is_valid`` uses for
    its own owner field."""
    if not isinstance(item, dict) or set(item.keys()) != _KNOWN_NEXT_ACTION_KEYS:
        return False
    if not _is_nonempty_str(item.get("id")) or not _is_nonempty_str(item.get("description")):
        return False
    return isinstance(item.get("owner"), str)


def _duplicate_ids(items: list[dict[str, Any]]) -> list[str]:
    """Precondition: every item already passed its own shape check (so ``item["id"]`` is a real string)."""
    ids = [item["id"] for item in items]
    return sorted({i for i in ids if ids.count(i) > 1})


# --------------------------------------------------------------------------
# Invariant #1 (why-analysis genuineness): one predicate, two callers (construction raise + independent
# gate), same shape fault_tree's own _gate_mode_is_consistent / kill_criteria's own coverage check establish.
# --------------------------------------------------------------------------


def _why_factors_invariant_violations(why_factors: list[dict[str, Any]]) -> list[str]:
    """Precondition: every item already passed ``_why_factor_shape_is_valid``."""
    violations: list[str] = []
    if len(why_factors) < MIN_WHY_FACTORS:
        violations.append(f"only {len(why_factors)} why_factors entry(ies); at least {MIN_WHY_FACTORS} required")
    thin = [f["id"] for f in why_factors if _word_count(f["description"]) < MIN_WHY_FACTOR_WORDS]
    if thin:
        violations.append(f"why_factors entry(ies) {sorted(thin)} have fewer than {MIN_WHY_FACTOR_WORDS} whitespace-separated words")
    seen: dict[str, str] = {}
    duplicate_pairs: list[tuple[str, str]] = []
    for f in why_factors:
        key = _normalize(f["description"])
        if key in seen:
            duplicate_pairs.append((seen[key], f["id"]))
        else:
            seen[key] = f["id"]
    if duplicate_pairs:
        violations.append(f"why_factors entries normalize to the same text: {duplicate_pairs}")
    return violations


# --------------------------------------------------------------------------
# Invariant #2 (ownership): one predicate, two callers, same shape as above.
# --------------------------------------------------------------------------


def _next_actions_invariant_violations(next_actions: list[dict[str, Any]]) -> list[str]:
    """Precondition: every item already passed ``_next_action_shape_is_valid``."""
    violations: list[str] = []
    if len(next_actions) < 1:
        violations.append("next_actions is empty; at least 1 owned action is required")
    unowned = sorted(a["id"] for a in next_actions if not a["owner"].strip())
    if unowned:
        violations.append(f"next_actions entry(ies) {unowned} have no owner")
    return violations


# --------------------------------------------------------------------------
# Convenience constructors (NOT the invariant boundary -- see module docstring's DECISION section).
# --------------------------------------------------------------------------


def why_factor(factor_id: str, description: str) -> dict[str, Any]:
    """Convenience constructor for one ``why_factors[]`` entry. The word-count floor, cross-item
    duplicate-after-normalize check, and minimum-count invariant are enforced only by
    ``generate_after_action_review_record`` (a whole-list property), not here."""
    if not _is_nonempty_str(factor_id) or not _is_nonempty_str(description):
        raise InvariantViolation(f"AAR_EMPTY_WHY_FACTOR_FIELD: why_factor id/description must be non-empty strings, got id={factor_id!r} description={description!r}")
    return {"id": factor_id, "description": description}


def next_action(action_id: str, description: str, owner: str) -> dict[str, Any]:
    """Convenience constructor for one ``next_actions[]`` entry. Eagerly rejects a blank owner (same
    fail-fast courtesy ``learning.kill_criteria.kill_threshold`` already establishes for its own ownership
    field) -- but this is a courtesy, not the invariant boundary: ``generate_after_action_review_record``
    independently re-checks ownership on every entry regardless of how it was built, so a hand-crafted dict
    that bypasses this helper is equally caught."""
    if not _is_nonempty_str(action_id) or not _is_nonempty_str(description):
        raise InvariantViolation(f"AAR_EMPTY_NEXT_ACTION_FIELD: next_action id/description must be non-empty strings, got id={action_id!r} description={description!r}")
    if not isinstance(owner, str) or not owner.strip():
        raise InvariantViolation(f"AAR_NO_OWNED_ACTION: next_action {action_id!r} has no owner -- an unowned lesson is a wasted retrospective")
    return {"id": action_id, "description": description, "owner": owner}


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_after_action_review_record(
    record_id: str,
    expected: str,
    actual: str,
    why_factors: list[dict[str, Any]],
    next_actions: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    activity_ref: str | None = None,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/after-action-review-record.schema.yaml``. Enforces the method contract's
    own preconditions fail-closed, in this order: id/expected/actual/version/activity_ref/provenance shape,
    why_factors shape then id-uniqueness then Invariant #1, next_actions shape then id-uniqueness then
    Invariant #2. REBUILDS both lists from known fields, accepting hand-built dicts (via ``why_factor``/
    ``next_action`` or plain dict literals) as a legitimate input shape, re-validated here rather than
    assumed -- same discipline every builder in this package uses."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"AAR_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not _is_nonempty_str(expected):
        raise InvariantViolation(f"AAR_EMPTY_EXPECTED: expected must be a non-empty string, got {expected!r}")
    if not _is_nonempty_str(actual):
        raise InvariantViolation(f"AAR_EMPTY_ACTUAL: actual must be a non-empty string, got {actual!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"AAR_INVALID_VERSION: version must be a string, got {version!r}")
    if activity_ref is not None and not isinstance(activity_ref, str):
        raise InvariantViolation(f"AAR_INVALID_ACTIVITY_REF: activity_ref must be a string or None, got {activity_ref!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"AAR_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    if not isinstance(why_factors, list) or not all(_why_factor_shape_is_valid(f) for f in why_factors):
        raise InvariantViolation(
            f"AAR_INVALID_WHY_FACTORS: why_factors must be a list of well-shaped entries (id/description non-empty strings, no unknown keys), got {_shallow_describe(why_factors)}"
        )
    why_duplicates = _duplicate_ids(why_factors)
    if why_duplicates:
        raise InvariantViolation(f"AAR_DUPLICATE_WHY_FACTOR_ID: id(s) {why_duplicates} used more than once -- every why_factors id must be unique within a record")
    why_violations = _why_factors_invariant_violations(why_factors)
    if why_violations:
        raise InvariantViolation(f"AAR_INSUFFICIENT_WHY_ANALYSIS: {'; '.join(why_violations)}")

    if not isinstance(next_actions, list) or not all(_next_action_shape_is_valid(a) for a in next_actions):
        raise InvariantViolation(
            f"AAR_INVALID_NEXT_ACTIONS: next_actions must be a list of well-shaped entries (id/description non-empty strings, owner a string, no unknown keys), got {_shallow_describe(next_actions)}"
        )
    action_duplicates = _duplicate_ids(next_actions)
    if action_duplicates:
        raise InvariantViolation(f"AAR_DUPLICATE_NEXT_ACTION_ID: id(s) {action_duplicates} used more than once -- every next_actions id must be unique within a record")
    action_violations = _next_actions_invariant_violations(next_actions)
    if action_violations:
        raise InvariantViolation(f"AAR_NO_OWNED_ACTION: {'; '.join(action_violations)}")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "activity_ref": activity_ref,
        "expected": expected,
        "actual": actual,
        "why_factors": [dict(f) for f in why_factors],
        "next_actions": [dict(a) for a in next_actions],
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive both invariants from raw fields, fail-closed on malformed input.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance is schema-valid.
    why_factors/next_actions carry no per-item provenance (contract's own compilation_decisions), so only
    the record-level field is checked here."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_why_analysis_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Invariant #1, re-derived independently from the record's own raw ``why_factors`` -- catches a
    hand-tampered record (e.g. an entry deleted after construction, or two entries edited to read
    identically) that never went through ``generate_after_action_review_record`` at all. Fails closed on
    malformed input rather than crashing, same discipline every gate in this package uses."""
    if not isinstance(record, dict):
        return _result("why_analysis", False, [{"reason": "record is not a dict"}], validator, timestamp)
    why_factors = record.get("why_factors")
    if not isinstance(why_factors, list) or not all(_why_factor_shape_is_valid(f) for f in why_factors):
        return _result("why_analysis", False, [{"reason": f"why_factors malformed: {_shallow_describe(why_factors)}"}], validator, timestamp)
    duplicate_ids = _duplicate_ids(why_factors)
    violations = _why_factors_invariant_violations(why_factors)
    passed = not duplicate_ids and not violations
    return _result(
        "why_analysis",
        passed,
        [{"why_factor_count": len(why_factors), "duplicate_ids": duplicate_ids, "violations": violations}],
        validator,
        timestamp,
    )


def evaluate_ownership_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Invariant #2, re-derived independently: every ``next_actions`` entry names a non-empty owner. Same
    "unowned == decorative, not a real control" discipline ``learning.kill_criteria``'s own ownership gate
    and ``root_cause.bow_tie``'s own OWNER/TEST invariant already establish elsewhere in this package.
    Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("ownership", False, [{"reason": "record is not a dict"}], validator, timestamp)
    next_actions = record.get("next_actions")
    if not isinstance(next_actions, list) or not all(_next_action_shape_is_valid(a) for a in next_actions):
        return _result("ownership", False, [{"reason": f"next_actions malformed: {_shallow_describe(next_actions)}"}], validator, timestamp)
    duplicate_ids = _duplicate_ids(next_actions)
    violations = _next_actions_invariant_violations(next_actions)
    passed = not duplicate_ids and not violations
    return _result(
        "ownership",
        passed,
        [{"next_action_count": len(next_actions), "duplicate_ids": duplicate_ids, "violations": violations}],
        validator,
        timestamp,
    )


def evaluate_after_action_review_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_why_analysis_gate(record, validator, timestamp),
        evaluate_ownership_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
