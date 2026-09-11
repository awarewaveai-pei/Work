"""``stakeholders.incentive_mapping`` -- F07 stakeholder/power/negotiation family, one of 10 concurrent
members opened in this same batch (9 siblings build the other F07 members in parallel, none read or touched
here). ``ai_lego/modules/stakeholders/__init__.py`` was pre-created by the orchestrator before dispatch (a
placeholder docstring only, not overwritten by this module).

Atlas cites this method ONCE: the F07 tool table row (L490: "Incentive Mapping｜Goals/Incentives/
Constraints/Risks｜每 stakeholder 一張 incentive card｜預測真實行為"). Grep-confirmed 2 real hits for
"incentive" case-insensitively across the whole Atlas file: L490 (this method's own citation) and L4475 (a
DIFFERENT recipe row naming "Incentive / BATNA / ZOPA" as a companion concept for a different method's own
best-pairing column -- not edited or imported from here, same "other hit belongs to a different method" class
``insight.jtbd``'s own module docstring already establishes for its own JTBD grep hits).

**Design-shape investigation (task-mandated, disclosed here)**: read ``insight.empathy_map``'s
``QUADRANT_NAMES`` (closed SET, cross-entry completeness FLOOR across the whole ``entries`` list, no per-entry
uniqueness) and ``insight.contextual_inquiry``'s ``_OBSERVATION_KEYS`` (per-entry completeness -- EVERY single
``observations[]`` item must itself carry all 3 required fields non-empty) before choosing this method's own
shape. Atlas's own L490 citation reads "每 stakeholder 一張 incentive card" (one incentive card PER
stakeholder) -- each card is its own complete, standalone disclosure of one stakeholder's Goals/Incentives/
Constraints/Risks, not a value drawn from a shared vocabulary spread across the whole list. That is
``contextual_inquiry``'s own per-entry-completeness shape, not ``empathy_map``'s cross-entry floor: a card
missing ``risks`` has not itself completed that stakeholder's incentive card, regardless of what any other
card in the same ``incentive_cards`` list contains.

Real invariants, ALL re-derived independently at both construction time and gate time (never trusting a
stored value), same two-layer discipline every sibling module in this package already establishes:

1. ``incentive_cards`` is a non-empty list (at least 1 stakeholder card) -- an incentive map with zero cards
   has not mapped anyone.
2. Every ``incentive_cards[]`` item carries all 5 of its own required fields (``stakeholder_name``, ``goals``,
   ``incentives``, ``constraints``, ``risks``) as non-empty strings, no unknown keys. Atlas's own
   Goals/Incentives/Constraints/Risks IS the method's definition; ``stakeholder_name`` is the card's own
   required identifier (Atlas's own "每 stakeholder 一張 incentive card" phrasing means an unnamed card cannot
   be attributed to any stakeholder). This is a PER-CARD completeness check (every card, not just the overall
   list), independently re-derived by a gate from each card's own raw fields.

**Provenance placement (batch-wide decision for this whole F07 batch, disclosed in the method contract's own
compilation_decisions)**: record-level ONLY -- a single top-level ``provenance`` field, no per-card
provenance, matching the F06 batch's own identical decision (``insight.jtbd``/``insight.contextual_inquiry``).
An IncentiveMap's cards are all produced by the same stakeholder-mapping exercise, not a list of
independently-sourced items each needing its own epistemic stamp.

No top-level scalar content field (e.g. no ``subject``/``environment_context`` analog) -- Atlas's own L490
citation names no such field, and the task's own expected-output description names only ``incentive_cards``
plus record envelope/provenance; inventing one would not be grounded in anything cited.

Grepped the whole ``ai_lego`` tree and ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` case-insensitively
for "incentive_mapping"/"IncentiveMap" before writing any of this method's own files: zero pre-existing
implementation.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "stakeholders.incentive_mapping"
RECORD_ID_PREFIX = "INCMAP-"

_CARD_KEYS = frozenset({"stakeholder_name", "goals", "incentives", "constraints", "risks"})
# Atlas F07 L490 verbatim "Goals/Incentives/Constraints/Risks" plus stakeholder_name as the card's own
# required identifier ("每 stakeholder 一張 incentive card"). See module docstring's design-shape
# investigation for why this is a PER-CARD completeness check (like insight.contextual_inquiry's
# _OBSERVATION_KEYS) rather than a cross-entry floor (unlike insight.empathy_map's QUADRANT_NAMES).


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline every prior module in this codebase (``insight.jtbd``/
    ``insight.contextual_inquiry``) already establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


# --------------------------------------------------------------------------
# Shape validator (keys/types only -- NOT the real invariant, checked separately below with its own distinct
# error code, same three-tier split insight.contextual_inquiry already uses).
# --------------------------------------------------------------------------


def _card_shape_is_valid(entry: Any) -> bool:
    """Exactly the 5 known keys, all string-typed (emptiness is the REAL invariant, checked separately by
    ``_cards_invariant_violations``/``evaluate_incentive_map_integrity_gate``)."""
    if not isinstance(entry, dict) or set(entry.keys()) != _CARD_KEYS:
        return False
    return all(isinstance(entry.get(key), str) for key in _CARD_KEYS)


def _cards_invariant_violations(cards: list[dict[str, Any]]) -> list[str]:
    """The REAL invariant: >= 1 card overall, AND every card's own 5 fields are all non-empty (that
    stakeholder's incentive card is actually complete). Precondition: every item already passed
    ``_card_shape_is_valid``."""
    violations: list[str] = []
    if len(cards) < 1:
        violations.append("incentive_cards is empty; at least 1 stakeholder card is required")
    incomplete: list[int] = [
        index
        for index, entry in enumerate(cards)
        if not all(_is_nonempty_str(entry.get(key)) for key in _CARD_KEYS)
    ]
    if incomplete:
        violations.append(
            f"incentive_cards entry(ies) at index {incomplete} are missing a non-empty value for one or more of "
            f"{sorted(_CARD_KEYS)} -- a card missing any one of the 5 has not completed that stakeholder's incentive card"
        )
    return violations


# --------------------------------------------------------------------------
# Convenience constructor (NOT the invariant boundary -- see module docstring's design-shape investigation).
# --------------------------------------------------------------------------


def card(stakeholder_name: str, goals: str, incentives: str, constraints: str, risks: str) -> dict[str, Any]:
    """Convenience constructor for one ``incentive_cards[]`` entry. Eagerly rejects any of the 5 fields being
    empty (fail-fast courtesy, same discipline ``insight.contextual_inquiry.observation`` already establishes)
    -- but this is a courtesy, not the invariant boundary: ``generate_incentive_map`` independently re-checks
    all 5 fields on every card regardless of how it was built, so a hand-crafted dict that bypasses this
    helper is equally caught."""
    values = {"stakeholder_name": stakeholder_name, "goals": goals, "incentives": incentives, "constraints": constraints, "risks": risks}
    if not all(_is_nonempty_str(v) for v in values.values()):
        raise InvariantViolation(
            f"INCMAP_INCOMPLETE_CARD: stakeholder_name/goals/incentives/constraints/risks must all be non-empty strings, got "
            f"stakeholder_name={stakeholder_name!r} goals={goals!r} incentives={incentives!r} constraints={constraints!r} risks={risks!r}"
        )
    return dict(values)


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_incentive_map(
    map_id: str,
    incentive_cards: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/incentive-mapping.schema.yaml``. Enforces both real invariants fail-closed,
    in this order: id/version/provenance shape, then incentive_cards shape, then the real invariant (non-empty
    list AND every card's own 5-field completeness). REBUILDS the incentive_cards list from known fields,
    accepting hand-built dicts (via ``card()`` or plain dict literals) as a legitimate input shape,
    re-validated here rather than assumed -- same discipline every builder in this package uses."""
    if not _is_nonempty_str(map_id) or not map_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"INCMAP_INVALID_ID: map_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {map_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"INCMAP_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"INCMAP_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    if not isinstance(incentive_cards, list) or not all(_card_shape_is_valid(entry) for entry in incentive_cards):
        raise InvariantViolation(
            f"INCMAP_INVALID_CARDS: incentive_cards must be a list of well-shaped entries (exactly the keys "
            f"{sorted(_CARD_KEYS)}, each a string, no unknown keys), got {_shallow_describe(incentive_cards)}"
        )
    violations = _cards_invariant_violations(incentive_cards)
    if violations:
        if len(incentive_cards) < 1:
            raise InvariantViolation(f"INCMAP_EMPTY_CARDS: {'; '.join(violations)}")
        raise InvariantViolation(f"INCMAP_INCOMPLETE_CARD: {'; '.join(violations)}")

    return {
        "id": map_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "incentive_cards": [dict(entry) for entry in incentive_cards],
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive both invariants from raw fields, fail-closed on malformed input. Never
# call generate_incentive_map -- a hand-tampered record that bypassed the builder entirely must be caught
# exactly as a builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance is schema-valid.
    incentive_cards[] carries no per-card provenance (contract's own compilation_decisions, F07-batch-wide
    decision), so only the record-level field is checked here."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_incentive_map_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives ALL real invariants from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_incentive_map``, so a hand-tampered record that bypassed the builder entirely is
    caught here exactly as a builder-refused one would have been. Checks id/version shape, then
    incentive_cards' own shape and per-card 5-field completeness, all independently. Fails closed on malformed
    input rather than crashing."""
    if not isinstance(record, dict):
        return _result("incentive_map_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("incentive_map_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("incentive_map_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    incentive_cards = record.get("incentive_cards")
    if not isinstance(incentive_cards, list) or not all(_card_shape_is_valid(entry) for entry in incentive_cards):
        return _result(
            "incentive_map_integrity",
            False,
            [{"reason": f"incentive_cards malformed: {_shallow_describe(incentive_cards)}"}],
            validator,
            timestamp,
        )
    violations = _cards_invariant_violations(incentive_cards)
    if violations:
        return _result(
            "incentive_map_integrity",
            False,
            [{"reason": f"incentive_cards invalid: {'; '.join(violations)}"}],
            validator,
            timestamp,
        )

    return _result("incentive_map_integrity", True, [{"card_count": len(incentive_cards)}], validator, timestamp)


def evaluate_incentive_mapping_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the declared ``quality.provenance_required``
    property, then the independent structural-and-completeness integrity re-derivation. No
    ``evidence_labeling_required`` gate -- the contract sets that quality flag false (no
    ``supporting_evidence_refs`` field exists on this type -- see stakeholders.incentive_mapping.contract.yaml's
    own ``quality``/``compilation_decisions``), same "only emit gates for what is actually declared true"
    discipline ``insight.empathy_map``'s own ``evaluate_empathy_map_gates`` already establishes."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_incentive_map_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
