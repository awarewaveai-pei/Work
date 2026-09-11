"""``insight.persona`` -- F06 human/customer-insight family, 2nd member and FIRST-EVER F06 module (the
family did not exist before this task; 9 concurrent siblings open F06 in this same batch, none read or
touched here).

Atlas cites this method ONCE: the F06 tool table row (L462: "Persona｜代表性使用者模型｜用研究資料建
goals/behavior/context｜建立共同 reference｜Persona ≠ 真實民意"). Grep-confirmed the only real hit
case-insensitively across the whole Atlas file -- no dedicated section, same thin-citation class
``strategy.ansoff``/``strategy.bcg_matrix`` already establish for a different family.

**Real invariant, directly mechanizing Atlas's own explicit misuse caution**: "Persona ≠ 真實民意" (a
persona is NOT the same as real public opinion/real survey data) -- a persona is a synthesized composite
that MUST be grounded in cited research, or it degenerates into exactly the abuse the caution warns
against: an invented composite presented as if it represents real people. ``research_basis`` is therefore
REQUIRED non-empty (at least one disclosed research/evidence citation string). There is no GENUINE_COMPUTE
field in this method -- Atlas's own citation gives no formula, only 4 disclosed content fields
(``persona_name``/``goals``/``behaviors``/``context``) plus the grounding list.

A second, weaker completeness invariant mirrors Atlas's own literal "goals/behavior/context" split:
``goals`` and ``behaviors`` must each be non-empty lists of non-empty strings, and ``context`` a non-empty
string -- a persona with zero goals or zero behaviors has not actually modeled anything.

**Provenance placement (batch-wide decision for this whole F06 batch, disclosed in the method contract's
own compilation_decisions)**: record-level ONLY -- a single top-level ``provenance`` field, no per-item
provenance on any of the string-list fields. This deliberately avoids the per-item/record-level ambiguity
that hit both the F02 and F03 batches (2026-09-11 WORKLOG).

Grepped the whole ``ai_lego`` tree and ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` case-insensitively
for "persona"/"PersonaProfile" before writing any of this method's own files: zero pre-existing
implementation (other hits were unrelated prose, e.g. personal-data/PII discussions).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "insight.persona"
RECORD_ID_PREFIX = "PERSONA-"

_STRING_LIST_FIELDS: tuple[str, ...] = ("goals", "behaviors", "research_basis")
# The 3 non-empty-list-of-non-empty-strings fields this record carries. Order matches the method contract's
# own preconditions list. ``research_basis`` is the real (misuse-caution) invariant; ``goals``/``behaviors``
# are the weaker "actually modeled something" completeness invariant. Both enforced identically at both the
# builder and the gate via the same shared predicate below.


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _nonempty_string_list_is_valid(value: Any) -> bool:
    """Shared predicate: a non-empty list whose every entry is itself a non-empty string. Used for
    ``goals``/``behaviors``/``research_basis`` alike -- called by BOTH the builder and the gate so neither can
    drift from the other."""
    return isinstance(value, list) and bool(value) and all(_is_nonempty_str(entry) for entry in value)


def generate_persona_profile(
    persona_id: str,
    persona_name: str,
    goals: list[str],
    behaviors: list[str],
    context: str,
    research_basis: list[str],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/persona-profile.schema.yaml``.

    Enforces every real invariant fail-closed BEFORE constructing a record -- same "raise-before-
    construction" discipline every sibling module in this package establishes. In particular,
    ``research_basis`` empty is refused with its own distinct error code
    (``PERSONA_EMPTY_RESEARCH_BASIS``): this is the mechanized form of Atlas's own "Persona ≠ 真實民意"
    caution, not merely a generic completeness check like ``goals``/``behaviors``.
    """
    if not _is_nonempty_str(persona_id) or not persona_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"PERSONA_INVALID_ID: persona_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {persona_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"PERSONA_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(persona_name):
        raise InvariantViolation(f"PERSONA_EMPTY_NAME: persona_name must be a non-empty string, got {persona_name!r}")
    if not _nonempty_string_list_is_valid(goals):
        raise InvariantViolation(
            f"PERSONA_EMPTY_GOALS: goals must be a non-empty list of non-empty strings -- Atlas L462's own literal "
            f"'goals/behavior/context' split, 1st of 3 named parts, got {goals!r}"
        )
    if not _nonempty_string_list_is_valid(behaviors):
        raise InvariantViolation(
            f"PERSONA_EMPTY_BEHAVIORS: behaviors must be a non-empty list of non-empty strings -- same citation, 2nd of 3 "
            f"named parts, got {behaviors!r}"
        )
    if not _is_nonempty_str(context):
        raise InvariantViolation(f"PERSONA_EMPTY_CONTEXT: context must be a non-empty string -- same citation, 3rd of 3 named parts, got {context!r}")
    if not _nonempty_string_list_is_valid(research_basis):
        raise InvariantViolation(
            "PERSONA_EMPTY_RESEARCH_BASIS: research_basis must be a non-empty list of non-empty strings -- Atlas's own "
            "explicit misuse caution 'Persona ≠ 真實民意' (persona is not the same as real public opinion) mechanized: a "
            f"persona with zero disclosed research grounding is an invented composite presented as real people, got {research_basis!r}"
        )
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"PERSONA_INVALID_PROVENANCE: provenance must be a schema-valid provenance_record, got {provenance!r}")

    return {
        "id": persona_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "persona_name": persona_name,
        "goals": list(goals),
        "behaviors": list(behaviors),
        "context": context,
        "research_basis": list(research_basis),
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance_record is
    schema-valid. Fails closed on non-dict input. Record-level ONLY (batch-wide decision, see module
    docstring) -- no per-item provenance to check on goals/behaviors/research_basis."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"record_provenance_valid": passed}], validator, timestamp)


def evaluate_research_basis_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives the REAL invariant (Atlas's own 'Persona ≠ 真實民意' caution, mechanized) from the record's
    OWN raw ``research_basis`` -- does not trust any stored value and does NOT call
    ``generate_persona_profile``, so a hand-tampered record that bypassed the builder entirely (e.g. one with
    ``research_basis: []`` spliced in directly) is caught here exactly as a builder-refused one would have
    been. Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("research_basis_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    research_basis = record.get("research_basis")
    passed = _nonempty_string_list_is_valid(research_basis)
    return _result(
        "research_basis_required",
        passed,
        [{"research_basis_count": len(research_basis) if isinstance(research_basis, list) else 0, "valid": passed}],
        validator,
        timestamp,
    )


def evaluate_persona_completeness_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY other per-field completeness invariant (id/version/persona_name/goals/behaviors/
    context) from the record's OWN raw fields, independent of the builder. Fails closed on malformed input."""
    if not isinstance(record, dict):
        return _result("persona_completeness", False, [{"reason": "record is not a dict"}], validator, timestamp)

    problems: list[str] = []
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        problems.append("PERSONA_INVALID_ID")
    if not isinstance(record.get("version"), str):
        problems.append("PERSONA_INVALID_VERSION")
    if not _is_nonempty_str(record.get("persona_name")):
        problems.append("PERSONA_EMPTY_NAME")
    if not _nonempty_string_list_is_valid(record.get("goals")):
        problems.append("PERSONA_EMPTY_GOALS")
    if not _nonempty_string_list_is_valid(record.get("behaviors")):
        problems.append("PERSONA_EMPTY_BEHAVIORS")
    if not _is_nonempty_str(record.get("context")):
        problems.append("PERSONA_EMPTY_CONTEXT")

    passed = not problems
    return _result("persona_completeness", passed, [{"problems": problems}], validator, timestamp)


def evaluate_persona_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """All 3 of this contract's real gates, in catalog order: the declared ``quality.provenance_required``
    flag, the mechanized 'Persona ≠ 真實民意' research-grounding invariant, and general per-field
    completeness. No ``evidence_labeling_required`` gate -- the contract sets that flag to ``false`` (see
    insight.persona.contract.yaml's own ``quality``/``compilation_decisions``), same "only emit gates for
    what is actually declared true" discipline ``strategy.ansoff``'s own ``evaluate_ansoff_gates`` already
    establishes."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_research_basis_required_gate(record, validator, timestamp),
        evaluate_persona_completeness_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
