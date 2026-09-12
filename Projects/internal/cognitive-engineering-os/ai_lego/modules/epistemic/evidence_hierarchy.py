"""``epistemic.evidence_hierarchy`` -- F10 epistemic quality family (Atlas L566-600), one of 2 members this
workstream builds (paired with ``epistemic.contradiction_detection``, same batch). Atlas F10 table row (L576):
"Evidence Hierarchy｜區分證據強度｜domain-specific hierarchy｜避免來源等價化" (distinguish evidence strength via
a domain-specific hierarchy; avoid treating all sources as equivalent).

Closes a seam ``specs/evidence/evidence.schema.yaml`` (L127-139) deliberately left open: ``hierarchy_tier`` is
typed ``[string, number, "null"]``, untyped BY DESIGN because Atlas's own F10 row says the hierarchy is
"domain-specific" -- a universal Weak/Medium/Strong enum would contradict that source's own point (a medical
evidence hierarchy -- RCT > cohort > case report -- is not a market-research evidence hierarchy). This method
does NOT invent a universal tier enum (that would directly override an existing, reasoned spec decision).
Instead each run DECLARES its own ordered ``hierarchy_levels[]`` for one ``domain`` and assigns evidence into
those declared levels, operationalizing evidence.schema.yaml's own ``hierarchy_tier`` free-form field instead
of overriding it.

Two real invariants, both enforced at construction AND independently re-derived by a gate, same discipline
every sibling module in this suite establishes:

1. Declared-ordering integrity (``EVIDENCEHIERARCHY_DUPLICATE_RANK``): ``hierarchy_levels[]`` must be
   non-empty and its ``rank`` values unique -- two levels claiming the same rank makes "which evidence is
   stronger" unanswerable, the exact 來源等價化 (source-equivalence) failure this method exists to prevent.
2. Referential integrity (``EVIDENCEHIERARCHY_DANGLING_LEVEL_REF``): every ``evidence_assignments[].level_id``
   must resolve to a declared ``hierarchy_levels[].level_id`` -- a dangling reference is refused, same
   discipline ``ai_lego/modules/association/concept_map.py``'s own edge-to-node referential check establishes
   for its sibling graph shape.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "epistemic.evidence_hierarchy"
RECORD_ID_PREFIX = "EVHIER-"

_LEVEL_KEYS = frozenset({"level_id", "label", "rank"})
_ASSIGNMENT_KEYS = frozenset({"evidence_id", "level_id"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_plain_int(value: Any) -> bool:
    """``isinstance(True, int)`` is True in Python -- a bool must not silently pass as a rank."""
    return isinstance(value, int) and not isinstance(value, bool)


def _is_evidence_id(value: Any) -> bool:
    return isinstance(value, str) and value.startswith("E-") and value[2:].isdigit()


def _shaped(entry: Any, required_keys: frozenset[str]) -> bool:
    return isinstance(entry, dict) and set(entry.keys()) == required_keys


def _hierarchy_levels_are_valid(levels: Any) -> tuple[bool, str | None]:
    """Shared by the builder and the gate so neither can drift from the other -- same discipline every sibling
    module in this suite already establishes.

    Real invariant: a non-empty list of well-shaped ``{level_id, label, rank}`` entries, unique ``level_id``
    values, unique ``rank`` values (the strict-total-order requirement -- no two levels may tie for the same
    rank).
    """
    if not isinstance(levels, list) or not levels:
        return False, "EMPTY"
    seen_ids: set[str] = set()
    seen_ranks: set[int] = set()
    for level in levels:
        if not _shaped(level, _LEVEL_KEYS):
            return False, "SHAPE"
        if not _is_nonempty_str(level.get("level_id")) or not _is_nonempty_str(level.get("label")):
            return False, "SHAPE"
        if not _is_plain_int(level.get("rank")):
            return False, "SHAPE"
        if level["level_id"] in seen_ids:
            return False, "DUPLICATE_LEVEL_ID"
        if level["rank"] in seen_ranks:
            return False, "DUPLICATE_RANK"
        seen_ids.add(level["level_id"])
        seen_ranks.add(level["rank"])
    return True, None


def _evidence_assignments_are_valid(assignments: Any, level_ids: frozenset[str]) -> tuple[bool, str | None]:
    """Same shared-predicate discipline as ``_hierarchy_levels_are_valid``.

    Real invariant: a (possibly empty) list of well-shaped ``{evidence_id, level_id}`` entries, each
    ``level_id`` resolving to a real id in ``level_ids`` -- a dangling reference is refused, never silently
    accepted.
    """
    if not isinstance(assignments, list):
        return False, "SHAPE"
    for assignment in assignments:
        if not _shaped(assignment, _ASSIGNMENT_KEYS):
            return False, "SHAPE"
        if not _is_evidence_id(assignment.get("evidence_id")):
            return False, "SHAPE"
        if not _is_nonempty_str(assignment.get("level_id")):
            return False, "SHAPE"
        if assignment["level_id"] not in level_ids:
            return False, "DANGLING_REF"
    return True, None


def hierarchy_level(level_id: str, label: str, rank: int) -> dict[str, Any]:
    """One item of ``typed-objects/evidence-hierarchy.schema.yaml#/properties/hierarchy_levels``. A thin
    convenience constructor -- does NOT itself enforce shape/uniqueness (``generate_evidence_hierarchy``
    validates whatever list it is handed regardless of how it was built, same "helper is not the invariant
    boundary" discipline every sibling module in this suite already establishes)."""
    return {"level_id": level_id, "label": label, "rank": rank}


def evidence_assignment(evidence_id: str, level_id: str) -> dict[str, Any]:
    """One item of ``typed-objects/evidence-hierarchy.schema.yaml#/properties/evidence_assignments``. Same
    "helper is not the invariant boundary" discipline as ``hierarchy_level`` above."""
    return {"evidence_id": evidence_id, "level_id": level_id}


def generate_evidence_hierarchy(
    record_id: str,
    domain: str,
    hierarchy_levels: list[dict[str, Any]],
    evidence_assignments: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/evidence-hierarchy.schema.yaml``.

    Enforces both real invariants fail-closed BEFORE any record is constructed -- same "raise-before-
    construction" discipline every sibling module in this suite already establishes.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"EVIDENCEHIERARCHY_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"EVIDENCEHIERARCHY_INVALID_VERSION: version must be a string, got {version!r}")
    # Without this the builder happily returned a record whose own provenance_required gate then reported
    # FAIL -- i.e. it produced a "validated" record it could not itself certify (8 of this family's 10
    # builders already checked here; this one and contradiction_detection had been left behind).
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"EVIDENCEHIERARCHY_INVALID_PROVENANCE: provenance failed schema validation, got {provenance!r}")
    if not _is_nonempty_str(domain):
        raise InvariantViolation(f"EVIDENCEHIERARCHY_EMPTY_DOMAIN: domain must be a non-empty string, got {domain!r}")

    levels_ok, levels_reason = _hierarchy_levels_are_valid(hierarchy_levels)
    if not levels_ok:
        if levels_reason == "DUPLICATE_LEVEL_ID":
            raise InvariantViolation(f"EVIDENCEHIERARCHY_DUPLICATE_LEVEL_ID: level_id values must be unique within one hierarchy, got {hierarchy_levels!r}")
        if levels_reason == "DUPLICATE_RANK":
            raise InvariantViolation(f"EVIDENCEHIERARCHY_DUPLICATE_RANK: rank values must be unique (a strict total order) -- two levels tying for the same rank makes 'which evidence is stronger' unanswerable, got {hierarchy_levels!r}")
        raise InvariantViolation(f"EVIDENCEHIERARCHY_INVALID_LEVELS: hierarchy_levels must be a non-empty list of well-shaped {{level_id, label, rank}} entries, got {hierarchy_levels!r}")

    level_ids = frozenset(level["level_id"] for level in hierarchy_levels)
    assignments_ok, assignments_reason = _evidence_assignments_are_valid(evidence_assignments, level_ids)
    if not assignments_ok:
        if assignments_reason == "DANGLING_REF":
            raise InvariantViolation(f"EVIDENCEHIERARCHY_DANGLING_LEVEL_REF: every evidence_assignments[].level_id must resolve to a declared hierarchy_levels[].level_id, got {evidence_assignments!r}")
        raise InvariantViolation(f"EVIDENCEHIERARCHY_INVALID_ASSIGNMENTS: evidence_assignments must be a list of well-shaped {{evidence_id, level_id}} entries, got {evidence_assignments!r}")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "domain": domain,
        "hierarchy_levels": [dict(level) for level in hierarchy_levels],
        "evidence_assignments": [dict(assignment) for assignment in evidence_assignments],
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record carries a schema-valid provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance": record.get("provenance")}], validator, timestamp)


def evaluate_evidence_hierarchy_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_evidence_hierarchy``, so a hand-tampered record that bypassed the builder entirely
    is caught here exactly as a builder-refused one would have been. FAILS CLOSED on malformed input rather
    than crashing."""
    if not isinstance(record, dict):
        return _result("evidence_hierarchy_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("evidence_hierarchy_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("evidence_hierarchy_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("domain")):
        return _result("evidence_hierarchy_integrity", False, [{"reason": "domain missing or empty"}], validator, timestamp)

    levels_ok, levels_reason = _hierarchy_levels_are_valid(record.get("hierarchy_levels"))
    if not levels_ok:
        return _result("evidence_hierarchy_integrity", False, [{"reason": f"hierarchy_levels invalid ({levels_reason})"}], validator, timestamp)
    hierarchy_levels = record["hierarchy_levels"]
    level_ids = frozenset(level["level_id"] for level in hierarchy_levels)

    assignments_ok, assignments_reason = _evidence_assignments_are_valid(record.get("evidence_assignments"), level_ids)
    if not assignments_ok:
        return _result("evidence_hierarchy_integrity", False, [{"reason": f"evidence_assignments invalid ({assignments_reason})"}], validator, timestamp)

    return _result(
        "evidence_hierarchy_integrity",
        True,
        [{"level_count": len(hierarchy_levels), "assignment_count": len(record["evidence_assignments"])}],
        validator,
        timestamp,
    )


def evaluate_evidence_hierarchy_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_evidence_hierarchy_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
