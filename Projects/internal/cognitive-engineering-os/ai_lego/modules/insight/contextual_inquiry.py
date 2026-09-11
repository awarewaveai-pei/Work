"""``insight.contextual_inquiry`` -- F06 human/customer insight family, 6th of 9 Atlas table rows (JTBD/
Persona/Empathy Map/Journey Map/Service Blueprint precede it; Interview/Survey/Focus Group follow) -- 1 of 9
concurrent agents opening F02/F03/F04/F06/F08 members in this same parallel batch (``insight.jtbd`` is this
batch's F06 opening member, built by a sibling agent; see ``jtbd.py``, not edited here).

Atlas cites this method ONCE: the F06 tool table row (L466: "Contextual Inquiry｜在真實環境觀察｜使用者做→
研究者看→即時追問｜發現隱性需求｜B2B 特別有效"). Grep-confirmed the only real hit case-insensitively across the
whole Atlas file -- no dedicated section, same thin-citation class ``strategy.bcg_matrix`` already
establishes.

**Real invariant, directly grounded in the citation's own literal 3-arrow cycle** ("使用者做→研究者看→
即時追問" -- user does -> researcher observes -> immediate follow-up question): every ``observations[]``
entry MUST carry ALL THREE non-empty fields (``action_observed``, ``researcher_note``, ``followup_question``)
-- an entry missing any one of the three has not actually completed the method's own do-watch-ask cycle for
that moment, it is a bare note, not a contextual-inquiry observation. This is a PER-ENTRY completeness check
(every entry, not just the overall list), GENUINE_COMPUTE re-derived by an independent gate from each entry's
own raw fields, never trusted -- same "raise before construction, re-derive at the gate" two-layer discipline
every prior module in this package uses (e.g. ``decomposition.problem_tree``'s causes/effects
disjointness, ``strategy.bcg_matrix``'s quadrant re-derivation).

``environment_context`` is a separate required non-empty scalar field (Atlas's own "在真實環境觀察" framing
makes the real environment being observed the method's defining precondition, not incidental metadata) --
checked at construction only, not independently gate-re-derived, same asymmetry
``learning.after_action_review``'s own ``expected``/``actual``/``version`` fields already establish ("schema
owns the envelope, runtime owns the phase invariants"); ``observations`` non-emptiness and the per-entry
3-field completeness invariant ARE independently gated (one combined gate, ``observation_cycle_completeness``
-- an empty list and an incomplete entry are the same underlying failure mode: the do-watch-ask cycle did not
genuinely happen for some/all of the session, same grouping discipline
``learning.after_action_review``'s own ``why_analysis`` gate already establishes).

**Provenance placement, F06-BATCH-WIDE decision (disclosed, not this module's own independent judgment
call)**: RECORD-LEVEL ONLY, one top-level ``provenance`` field -- matching ``insight.jtbd``'s own identical
placement, made specifically to avoid the per-item/record-level provenance ambiguity that hit both the F02
and F03 batches. No per-item provenance on ``observations[]`` entries (unlike ``strategy.bcg_matrix``'s own
per-item ``portfolio_items[].provenance``) -- a contextual inquiry session is one coherent research artifact
about one environment, not a list of independently-sourced claims.

No ``id`` field on ``observations[]`` entries (task-mandated exact shape
``{action_observed, researcher_note, followup_question}`` only) -- no cross-reference or uniqueness need
exists for this method's own citation, unlike ``problem_tree``'s causes/effects disjointness, which its own
"分離症狀與原因" benefit directly requires.

Grepped the whole ``ai_lego`` tree case-insensitively for "contextual_inquiry"/"ContextualInquiry" before
writing any of this method's own files: zero pre-existing implementation (only this batch's sibling
``insight/jtbd.py``/``insight/persona.py``, different F06 methods, exist under ``ai_lego/modules/insight/``).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "insight.contextual_inquiry"
RECORD_ID_PREFIX = "CTXINQUIRY-"

_OBSERVATION_KEYS = frozenset({"action_observed", "researcher_note", "followup_question"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- NEVER a raw recursive ``repr()`` over caller-
    supplied input of unknown size, same discipline ``learning.after_action_review._shallow_describe``/
    ``root_cause.fault_tree._shallow_describe`` establish (a bare recursive repr in an error path is itself
    a small denial-of-service surface)."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


# --------------------------------------------------------------------------
# Shape validator (keys/types only -- NOT the real invariant, checked separately below with its own
# distinct error code, same three-tier split root_cause.fault_tree/learning.after_action_review already use).
# --------------------------------------------------------------------------


def _observation_shape_is_valid(entry: Any) -> bool:
    """Exactly the 3 known keys, all string-typed (emptiness is the REAL invariant, checked separately by
    ``_observations_invariant_violations``/``evaluate_observation_cycle_completeness_gate``)."""
    if not isinstance(entry, dict) or set(entry.keys()) != _OBSERVATION_KEYS:
        return False
    return all(isinstance(entry.get(key), str) for key in _OBSERVATION_KEYS)


def _observations_invariant_violations(observations: list[dict[str, Any]]) -> list[str]:
    """The REAL invariant: >= 1 entry overall, AND every entry's own 3 fields are all non-empty (the
    method's own literal 3-arrow cycle actually completed for that moment). Precondition: every item already
    passed ``_observation_shape_is_valid``."""
    violations: list[str] = []
    if len(observations) < 1:
        violations.append("observations is empty; at least 1 completed do-watch-ask cycle is required")
    incomplete: list[int] = [
        index
        for index, entry in enumerate(observations)
        if not all(_is_nonempty_str(entry.get(key)) for key in _OBSERVATION_KEYS)
    ]
    if incomplete:
        violations.append(
            f"observations entry(ies) at index {incomplete} are missing a non-empty value for one or more of "
            f"{sorted(_OBSERVATION_KEYS)} -- an entry missing any one of the 3 has not completed the method's own do-watch-ask cycle"
        )
    return violations


# --------------------------------------------------------------------------
# Convenience constructor (NOT the invariant boundary -- see module docstring's DECISION section).
# --------------------------------------------------------------------------


def observation(action_observed: str, researcher_note: str, followup_question: str) -> dict[str, Any]:
    """Convenience constructor for one ``observations[]`` entry. Eagerly rejects any of the 3 fields being
    empty (fail-fast courtesy, same discipline ``learning.after_action_review.next_action`` already
    establishes for its own ownership field) -- but this is a courtesy, not the invariant boundary:
    ``generate_contextual_inquiry_session`` independently re-checks all 3 fields on every entry regardless of
    how it was built, so a hand-crafted dict that bypasses this helper is equally caught."""
    if not _is_nonempty_str(action_observed) or not _is_nonempty_str(researcher_note) or not _is_nonempty_str(followup_question):
        raise InvariantViolation(
            "CTXINQUIRY_INCOMPLETE_OBSERVATION_CYCLE: action_observed/researcher_note/followup_question must all be non-empty strings, "
            f"got action_observed={action_observed!r} researcher_note={researcher_note!r} followup_question={followup_question!r}"
        )
    return {"action_observed": action_observed, "researcher_note": researcher_note, "followup_question": followup_question}


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_contextual_inquiry_session(
    session_id: str,
    environment_context: str,
    observations: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/contextual-inquiry-session.schema.yaml``. Enforces the method contract's
    own preconditions fail-closed, in this order: id/version/environment_context/provenance shape, then
    observations shape, then the real invariant (non-empty list AND every entry's own 3-field completeness).
    REBUILDS the observations list from known fields, accepting hand-built dicts (via ``observation()`` or
    plain dict literals) as a legitimate input shape, re-validated here rather than assumed -- same
    discipline every builder in this package uses."""
    if not _is_nonempty_str(session_id) or not session_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"CTXINQUIRY_INVALID_ID: session_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {session_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"CTXINQUIRY_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(environment_context):
        raise InvariantViolation(
            f"CTXINQUIRY_EMPTY_ENVIRONMENT_CONTEXT: environment_context must be a non-empty string (Atlas's own '在真實環境觀察' framing -- "
            f"the real environment being observed must be disclosed), got {environment_context!r}"
        )
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"CTXINQUIRY_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    if not isinstance(observations, list) or not all(_observation_shape_is_valid(entry) for entry in observations):
        raise InvariantViolation(
            f"CTXINQUIRY_INVALID_OBSERVATIONS: observations must be a list of well-shaped entries (exactly the keys "
            f"{sorted(_OBSERVATION_KEYS)}, each a string, no unknown keys), got {_shallow_describe(observations)}"
        )
    violations = _observations_invariant_violations(observations)
    if violations:
        if len(observations) < 1:
            raise InvariantViolation(f"CTXINQUIRY_EMPTY_OBSERVATIONS: {'; '.join(violations)}")
        raise InvariantViolation(f"CTXINQUIRY_INCOMPLETE_OBSERVATION_CYCLE: {'; '.join(violations)}")

    return {
        "id": session_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "environment_context": environment_context,
        "observations": [dict(entry) for entry in observations],
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive the real invariant from raw fields, fail-closed on malformed input.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance is schema-valid.
    observations[] carries no per-item provenance (contract's own compilation_decisions, F06-batch-wide
    decision), so only the record-level field is checked here."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_observation_cycle_completeness_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """The REAL invariant, re-derived independently from the record's own raw ``observations`` -- catches a
    hand-tampered record (e.g. an entry emptied out after construction, or the whole list cleared) that never
    went through ``generate_contextual_inquiry_session`` at all. Fails closed on malformed input rather than
    crashing, same discipline every gate in this package uses."""
    if not isinstance(record, dict):
        return _result("observation_cycle_completeness", False, [{"reason": "record is not a dict"}], validator, timestamp)
    observations = record.get("observations")
    if not isinstance(observations, list) or not all(_observation_shape_is_valid(entry) for entry in observations):
        return _result(
            "observation_cycle_completeness", False, [{"reason": f"observations malformed: {_shallow_describe(observations)}"}], validator, timestamp
        )
    violations = _observations_invariant_violations(observations)
    passed = not violations
    return _result(
        "observation_cycle_completeness",
        passed,
        [{"observation_count": len(observations), "violations": violations}],
        validator,
        timestamp,
    )


def evaluate_contextual_inquiry_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the one declared ``quality`` property, then the
    independent structural-and-completeness integrity re-derivation. No ``evidence_labeling_required`` gate
    -- the contract sets that flag to ``false`` (see insight.contextual_inquiry.contract.yaml's own
    ``quality``/``compilation_decisions``), same "only emit gates for what is actually declared true"
    discipline ``strategy.bcg_matrix``'s own ``evaluate_bcg_matrix_gates`` already establishes."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_observation_cycle_completeness_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
