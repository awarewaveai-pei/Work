"""``epistemic.contradiction_detection`` -- F10 epistemic quality family (Atlas L566-600), one of 2 members
this workstream builds (paired with ``epistemic.evidence_hierarchy``, same batch). Atlas F10 table row (L579):
"Contradiction Detection｜找來源/模型互相衝突｜claims matching→support/contradict/context｜暴露不確定性"
(find conflicts between sources/models; match claims -> classify each pair as support/contradict/
context-dependent; the benefit is exposing uncertainty rather than hiding it behind a false consensus).

Orthogonal to ``specs/evidence/claim.schema.yaml``'s own ``contradicting_evidence`` field: that field links
ONE claim to contradicting EVIDENCE records (claim-to-evidence). This method detects CLAIM-to-CLAIM relations
across a roster of claims that may originate from different sources/models -- composes with, does not
duplicate, that existing field. ``claims[]`` are SOFT id references into ``claim.schema.yaml``'s own
``^C-[0-9]+$`` id convention, not a re-minted parallel claim type.

Two real invariants, both enforced at construction AND independently re-derived by a gate, same discipline
every sibling module in this suite establishes:

1. Referential integrity + no self-relation (``CONTRADICTIONDETECTION_DANGLING_CLAIM_REF`` /
   ``CONTRADICTIONDETECTION_SELF_RELATION``): every ``relations[].claim_id_a``/``claim_id_b`` must resolve to
   a declared ``claims[].claim_id``, and a claim may never be declared to relate to itself.
2. Unordered-pair uniqueness (``CONTRADICTIONDETECTION_DUPLICATE_PAIR``): {A,B} and {B,A} are the SAME pair --
   declaring it twice (in either order, even with conflicting relation values) is refused as an authoring
   error that would make the contradiction set self-inconsistent.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "epistemic.contradiction_detection"
RECORD_ID_PREFIX = "CDET-"
VALID_RELATIONS = frozenset({"SUPPORTS", "CONTRADICTS", "CONTEXT_DEPENDENT"})

_CLAIM_KEYS = frozenset({"claim_id"})
_RELATION_KEYS = frozenset({"claim_id_a", "claim_id_b", "relation"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_claim_id(value: Any) -> bool:
    return isinstance(value, str) and value.startswith("C-") and value[2:].isdigit()


def _shaped(entry: Any, required_keys: frozenset[str]) -> bool:
    return isinstance(entry, dict) and set(entry.keys()) == required_keys


def _claims_are_valid(claims: Any) -> tuple[bool, str | None]:
    """Shared by the builder and the gate so neither can drift from the other -- same discipline every sibling
    module in this suite already establishes.

    Real invariant: a list of >=2 well-shaped ``{claim_id}`` entries (2 is the structural floor for any
    relation to connect two DISTINCT claims), unique ``claim_id`` values.
    """
    if not isinstance(claims, list) or len(claims) < 2:
        return False, "TOO_FEW"
    seen: set[str] = set()
    for claim in claims:
        if not _shaped(claim, _CLAIM_KEYS) or not _is_claim_id(claim.get("claim_id")):
            return False, "SHAPE"
        if claim["claim_id"] in seen:
            return False, "DUPLICATE_CLAIM_ID"
        seen.add(claim["claim_id"])
    return True, None


def _relations_are_valid(relations: Any, claim_ids: frozenset[str]) -> tuple[bool, str | None]:
    """Same shared-predicate discipline as ``_claims_are_valid``.

    Real invariant: a (possibly empty) list of well-shaped entries, each with a valid ``relation`` enum value,
    ``claim_id_a != claim_id_b`` (no self-relation), both ids resolving to a declared claim (no dangling
    reference), and no two entries declaring the same UNORDERED pair (normalised via a sorted tuple before
    comparison -- {A,B} and {B,A} are the same pair).
    """
    if not isinstance(relations, list):
        return False, "SHAPE"
    seen_pairs: set[tuple[str, str]] = set()
    for relation in relations:
        if not _shaped(relation, _RELATION_KEYS):
            return False, "SHAPE"
        a, b, kind = relation.get("claim_id_a"), relation.get("claim_id_b"), relation.get("relation")
        if not _is_claim_id(a) or not _is_claim_id(b):
            return False, "SHAPE"
        if kind not in VALID_RELATIONS:
            return False, "INVALID_RELATION_ENUM"
        if a == b:
            return False, "SELF_RELATION"
        if a not in claim_ids or b not in claim_ids:
            return False, "DANGLING_REF"
        pair = tuple(sorted((a, b)))
        if pair in seen_pairs:
            return False, "DUPLICATE_PAIR"
        seen_pairs.add(pair)
    return True, None


def claim_ref(claim_id: str) -> dict[str, Any]:
    """One item of ``typed-objects/contradiction-detection.schema.yaml#/properties/claims`` -- a SOFT reference
    to an existing ``claim.schema.yaml`` record's own ``claim_id``, not an embedded record. A thin convenience
    constructor -- does NOT itself enforce shape/uniqueness (``generate_contradiction_detection`` validates
    whatever list it is handed regardless of how it was built, same "helper is not the invariant boundary"
    discipline every sibling module in this suite already establishes)."""
    return {"claim_id": claim_id}


def contradiction_relation(claim_id_a: str, claim_id_b: str, relation: str) -> dict[str, Any]:
    """One item of ``typed-objects/contradiction-detection.schema.yaml#/properties/relations``. Same
    "helper is not the invariant boundary" discipline as ``claim_ref`` above -- mutation tests build relations
    directly, bypassing this helper, to prove the builder itself enforces the invariants."""
    return {"claim_id_a": claim_id_a, "claim_id_b": claim_id_b, "relation": relation}


def generate_contradiction_detection(
    record_id: str,
    claims: list[dict[str, Any]],
    relations: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/contradiction-detection.schema.yaml``.

    Enforces both real invariants fail-closed BEFORE any record is constructed -- same "raise-before-
    construction" discipline every sibling module in this suite already establishes.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"CONTRADICTIONDETECTION_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not provenance_is_valid(provenance):
        # See evidence_hierarchy's identical guard: a builder must never emit a record its own
        # provenance_required gate would immediately fail.
        raise InvariantViolation(f"CONTRADICTIONDETECTION_INVALID_PROVENANCE: provenance failed schema validation, got {provenance!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"CONTRADICTIONDETECTION_INVALID_VERSION: version must be a string, got {version!r}")

    claims_ok, claims_reason = _claims_are_valid(claims)
    if not claims_ok:
        if claims_reason == "DUPLICATE_CLAIM_ID":
            raise InvariantViolation(f"CONTRADICTIONDETECTION_DUPLICATE_CLAIM_ID: claim_id values must be unique within one record, got {claims!r}")
        raise InvariantViolation(f"CONTRADICTIONDETECTION_INVALID_CLAIMS: claims must be a list of >=2 well-shaped {{claim_id}} entries with unique ids, got {claims!r}")

    claim_ids = frozenset(c["claim_id"] for c in claims)
    relations_ok, relations_reason = _relations_are_valid(relations, claim_ids)
    if not relations_ok:
        if relations_reason == "SELF_RELATION":
            raise InvariantViolation(f"CONTRADICTIONDETECTION_SELF_RELATION: claim_id_a must not equal claim_id_b -- a claim cannot be declared to relate to itself, got {relations!r}")
        if relations_reason == "DANGLING_REF":
            raise InvariantViolation(f"CONTRADICTIONDETECTION_DANGLING_CLAIM_REF: every relations[].claim_id_a/claim_id_b must resolve to a claim declared in this record's own claims, got {relations!r}")
        if relations_reason == "DUPLICATE_PAIR":
            raise InvariantViolation(f"CONTRADICTIONDETECTION_DUPLICATE_PAIR: {{claim_id_a, claim_id_b}} is an unordered pair -- the same pair (in either order) must not be declared twice, got {relations!r}")
        if relations_reason == "INVALID_RELATION_ENUM":
            raise InvariantViolation(f"CONTRADICTIONDETECTION_INVALID_RELATION_ENUM: relation must be one of {sorted(VALID_RELATIONS)}, got {relations!r}")
        raise InvariantViolation(f"CONTRADICTIONDETECTION_INVALID_RELATIONS: relations must be a list of well-shaped entries, got {relations!r}")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "claims": [dict(c) for c in claims],
        "relations": [dict(r) for r in relations],
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


def evaluate_contradiction_detection_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_contradiction_detection``, so a hand-tampered record that bypassed the builder
    entirely is caught here exactly as a builder-refused one would have been. FAILS CLOSED on malformed input
    rather than crashing."""
    if not isinstance(record, dict):
        return _result("contradiction_detection_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("contradiction_detection_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("contradiction_detection_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    claims_ok, claims_reason = _claims_are_valid(record.get("claims"))
    if not claims_ok:
        return _result("contradiction_detection_integrity", False, [{"reason": f"claims invalid ({claims_reason})"}], validator, timestamp)
    claims = record["claims"]
    claim_ids = frozenset(c["claim_id"] for c in claims)

    relations_ok, relations_reason = _relations_are_valid(record.get("relations"), claim_ids)
    if not relations_ok:
        return _result("contradiction_detection_integrity", False, [{"reason": f"relations invalid ({relations_reason})"}], validator, timestamp)

    return _result(
        "contradiction_detection_integrity",
        True,
        [{"claim_count": len(claims), "relation_count": len(record["relations"])}],
        validator,
        timestamp,
    )


def evaluate_contradiction_detection_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_contradiction_detection_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
