"""``systems.systems_archetypes`` -- F09 systems-thinking family (Atlas L541-559), 1 of 2 members this agent
opens in a parallel batch alongside ``systems.rich_picture`` (family had 0 real methods built before this
batch except a concurrent sibling agent's own ``leverage_point_analysis.py`` -- zero file overlap).

Atlas cites this method ONCE: the F09 tool table row (L548: "Systems Archetypes｜辨識常見系統陷阱｜比對
Limits to Growth / Fixes that Fail 等｜快速找到已知動態"). Grep-confirmed the only real hit
case-insensitively across the whole Atlas file -- no dedicated section.

Atlas's own row truncates its comparison list with "等" (etc) -- supplemented here with the standard,
external 10-member Peter Senge / systems-thinking literature vocabulary of named archetypes (not invented;
disclosed in ``methods/contracts/systems.systems_archetypes.contract.yaml``'s own ``compilation_decisions``,
same "disclosed compilation choice" class ``challenge.hazop.contract.yaml``'s own 11-word HAZOP guide-word
vocabulary already establishes for Atlas's identically truncated list).

Two real invariants, EACH enforced BOTH at construction (raise BEFORE any record is built) AND independently
by a gate that re-derives from raw fields, same "shared predicate, reused by both layers" discipline every
sibling module in this suite already establishes:

1. **Closed vocabulary** (``SYSARCH_INVALID_ARCHETYPE_NAME``): every ``archetype_matches[].archetype_name``
   must be a member of ``VALID_ARCHETYPES`` -- an unrecognized name is refused, not silently accepted as
   free text.
2. **Evidence minimum** (``SYSARCH_MATCH_NO_OBSERVED_SYMPTOMS``): every ``archetype_matches[]`` entry must
   cite at least 1 non-empty ``observed_symptoms`` entry -- an archetype claimed with zero supporting
   observation is an unevidenced pattern-match, exactly as risky as an unevidenced Red Team finding or an
   unevidenced Fishbone cause hypothesis.

``archetype_matches`` may legitimately be EMPTY (a clean scan that recognized no known pattern) -- same
"clean pass" legality ``challenge.red_team``'s own zero-findings state already establishes; this method does
NOT require at least 1 match, only that every match it does report satisfies both invariants above.

This method does NOT run an archetype-scoring/ranking algorithm -- ``archetype_matches`` is caller-supplied
content; only closed-vocabulary membership and the evidence-minimum floor are mechanically enforced, same
"validate-only" scope ``stakeholders.coalition_mapping``'s own identical decision already establishes.

Grepped the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` trees case-insensitively for "archetype"/"rich picture" before
writing any of this batch's own files: zero pre-existing implementation (only the table row itself and the
``method-inventory.yaml``/``contract-backlog.yaml`` backlog entries, both read, neither edited).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "systems.systems_archetypes"
RECORD_ID_PREFIX = "ARCH-"

VALID_ARCHETYPES = frozenset(
    {
        "LIMITS_TO_GROWTH",
        "FIXES_THAT_FAIL",
        "SHIFTING_THE_BURDEN",
        "TRAGEDY_OF_THE_COMMONS",
        "SUCCESS_TO_THE_SUCCESSFUL",
        "ESCALATION",
        "ERODING_GOALS",
        "GROWTH_AND_UNDERINVESTMENT",
        "ACCIDENTAL_ADVERSARIES",
        "DRIFTING_GOALS",
    }
)

_MATCH_KEYS = frozenset({"id", "archetype_name", "observed_symptoms", "description"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_valid_id(value: Any) -> bool:
    """An id must be non-empty AND carry no leading/trailing whitespace -- same shape-boundary rejection
    ``stakeholders.coalition_mapping``'s own ``_is_valid_id`` establishes (2026-09-11 critic fix: reject a
    whitespace-padded id outright rather than silently stripping it, so duplicate detection can never be
    bypassed by a byte-different-but-visually-identical id)."""
    return _is_nonempty_str(value) and value == value.strip()


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline every prior module in this codebase already establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _shaped(entry: Any, required_keys: frozenset[str]) -> bool:
    if not isinstance(entry, dict):
        return False
    return set(entry.keys()) == required_keys


def _archetype_matches_are_valid(matches: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from
    the other -- same discipline every sibling module in this suite already establishes.

    Real invariants: a list of well-shaped ``{id, archetype_name, observed_symptoms, description}`` entries
    (list itself MAY be empty, see module docstring), unique whitespace-free ``id`` values, non-empty
    ``description``, ``archetype_name`` a member of ``VALID_ARCHETYPES``, and >=1 non-empty
    ``observed_symptoms`` entry per match.
    """
    if not isinstance(matches, list):
        return False, "SHAPE"
    seen_ids: set[str] = set()
    for match in matches:
        if not _shaped(match, _MATCH_KEYS):
            return False, "SHAPE"
        if not _is_valid_id(match.get("id")):
            return False, "SHAPE"
        if match["id"] in seen_ids:
            return False, "DUPLICATE_ID"
        seen_ids.add(match["id"])
        if not _is_nonempty_str(match.get("description")):
            return False, "SHAPE"
        if match.get("archetype_name") not in VALID_ARCHETYPES:
            return False, "INVALID_ARCHETYPE_NAME"
        symptoms = match.get("observed_symptoms")
        if not isinstance(symptoms, list) or not symptoms or not all(_is_nonempty_str(s) for s in symptoms):
            return False, "NO_OBSERVED_SYMPTOMS"
    return True, None


# --------------------------------------------------------------------------
# Convenience constructor -- thin, does NOT itself enforce shape/vocabulary/evidence (``generate_...``
# validates whatever list it is handed regardless of how it was built, same "helper is not the invariant
# boundary" discipline every sibling module in this suite already establishes; mutation tests build entries
# directly, bypassing this helper, to prove the builder itself enforces the invariants).
# --------------------------------------------------------------------------


def archetype_match(match_id: str, archetype_name: str, observed_symptoms: list[str], description: str) -> dict[str, Any]:
    """One item of ``typed-objects/systems-archetype-match.schema.yaml#/properties/archetype_matches``."""
    return {"id": match_id, "archetype_name": archetype_name, "observed_symptoms": list(observed_symptoms), "description": description}


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_systems_archetype_match_set(
    record_id: str,
    context: str,
    archetype_matches: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/systems-archetype-match.schema.yaml``.

    Enforces both real invariants (closed vocabulary, evidence minimum) fail-closed, in order after
    id/version/context/provenance shape. A ``SystemsArchetypeMatchSet`` failing either invariant is refused
    at construction, never silently stored with an unrecognized archetype name or an unevidenced match.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"SYSARCH_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"SYSARCH_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(context):
        raise InvariantViolation(f"SYSARCH_EMPTY_CONTEXT: context must be a non-empty string, got {context!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"SYSARCH_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    matches_ok, reason = _archetype_matches_are_valid(archetype_matches)
    if not matches_ok:
        if reason == "DUPLICATE_ID":
            raise InvariantViolation(f"SYSARCH_DUPLICATE_MATCH_ID: archetype_matches ids must be unique within one record, got {_shallow_describe(archetype_matches)}")
        if reason == "INVALID_ARCHETYPE_NAME":
            raise InvariantViolation(f"SYSARCH_INVALID_ARCHETYPE_NAME: archetype_name must be one of {sorted(VALID_ARCHETYPES)}, got {_shallow_describe(archetype_matches)}")
        if reason == "NO_OBSERVED_SYMPTOMS":
            raise InvariantViolation(f"SYSARCH_MATCH_NO_OBSERVED_SYMPTOMS: every archetype_matches entry must cite at least 1 non-empty observed_symptoms entry, got {_shallow_describe(archetype_matches)}")
        raise InvariantViolation(
            f"SYSARCH_INVALID_ARCHETYPE_MATCHES: archetype_matches must be a list of well-shaped "
            f"{{id, archetype_name, observed_symptoms, description}} entries, got {_shallow_describe(archetype_matches)}"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "context": context,
        "archetype_matches": [{**m, "observed_symptoms": list(m["observed_symptoms"])} for m in archetype_matches],
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive both invariants from raw fields, fail-closed on malformed input. Never
# call generate_systems_archetype_match_set -- a hand-tampered record that bypassed the builder entirely
# must be caught here exactly as a builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance is schema-valid
    (record-level ONLY, see module docstring -- no per-match provenance field exists to check). Fails closed
    on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_systems_archetypes_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_systems_archetype_match_set``, so a hand-tampered record that bypassed the
    builder entirely is caught here exactly as a builder-refused one would have been. Fails closed on
    malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("systems_archetypes_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("systems_archetypes_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("systems_archetypes_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("context")):
        return _result("systems_archetypes_integrity", False, [{"reason": "context missing or empty"}], validator, timestamp)

    matches_ok, reason = _archetype_matches_are_valid(record.get("archetype_matches"))
    if not matches_ok:
        return _result("systems_archetypes_integrity", False, [{"reason": f"archetype_matches invalid ({reason})"}], validator, timestamp)

    return _result(
        "systems_archetypes_integrity",
        True,
        [{"match_count": len(record["archetype_matches"])}],
        validator,
        timestamp,
    )


def evaluate_systems_archetypes_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the one declared ``quality`` property, then the
    independent content-integrity re-derivation. No ``evidence_labeling_required`` gate -- the contract sets
    that flag to ``false`` (see module docstring)."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_systems_archetypes_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
