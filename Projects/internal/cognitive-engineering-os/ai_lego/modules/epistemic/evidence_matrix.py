"""``epistemic.evidence_matrix`` -- F10 epistemic-quality family (Atlas L566-600, this method's own row L575).

Atlas's own table row (L575, verbatim): "Evidence Matrix | Claim x Evidence
對齊 | rows=claims、cols=evidence->quality/diversity/recency | 快速看到薄弱
claim" (align claims against evidence; rows=claims, cols=evidence; quickly
surface the weak claim).

Real invariant (referential integrity + no orphan claim), enforced at TWO
independent layers, same belt-and-suspenders discipline every prior slice
in this corpus establishes:

  1. Every ``links[].claim_id``/``links[].evidence_id`` must resolve to a
     declared ``claims[]``/``evidence_items[]`` entry, BOTH directions -- a
     dangling reference is refused.
  2. Every declared claim must appear in >=1 link. Atlas's own benefit
     column ("快速看到薄弱 claim") is the method's whole purpose -- a claim
     floating in the matrix with zero evidence alignment IS the weak claim
     this method exists to surface, so it must never be silently accepted
     as a complete matrix.
  3. No duplicate ``(claim_id, evidence_id)`` pair -- the same cell asserted
     twice, possibly with conflicting ``relation`` values, is a real
     authoring error, not a stylistic nicety.

Composes, does not duplicate: ``claims[]``/``evidence_items[]`` are real
``specs/evidence/claim.schema.yaml``/``specs/evidence/evidence.schema.yaml``
-shaped dicts (structural sanity checked here; full conformance is the
schema layer's own job) -- this method does not mint a second claim/
evidence record shape, only the alignment layer (``links[]``). Because both
referenced record types may themselves carry nested list fields (Claim's
own ``supporting_evidence``/``contradicting_evidence``), every ``claims[]``/
``evidence_items[]`` entry is rebuilt via ``copy.deepcopy``, never a shallow
``dict(item)`` copy -- a critic review of this corpus's own F09 batch
(2026-09-12, ``ai_lego/modules/systems/__init__.py``) found this exact
shallow-copy-does-not-copy-nested-lists defect in three sibling builders (a
"validated" returned record silently shared a mutable list object with the
caller's own input) and this module applies that fix proactively rather
than repeating it.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for
"argument map"/"evidence matrix"/"objection"/"rebuttal"/"toulmin" before
writing any of this method's own files -- see
``typed-objects/evidence-matrix.schema.yaml``'s own ``verification`` for the
full grep record.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "epistemic.evidence_matrix"
RECORD_ID_PREFIX = "EVIDMATRIX-"
VALID_RELATIONS = frozenset({"SUPPORTS", "CONTRADICTS", "NEUTRAL"})
_LINK_KEYS = frozenset({"claim_id", "evidence_id", "relation"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_valid_claim_stub(value: Any) -> bool:
    """Structural sanity check only -- full conformance to claim.schema.yaml is the schema layer's own job.
    A minimal {claim_id, statement, provenance} stub is legal per that schema's own required set (real $ref,
    composed not duplicated -- see the module docstring)."""
    return isinstance(value, dict) and _is_nonempty_str(value.get("claim_id")) and _is_nonempty_str(value.get("statement"))


def _is_valid_evidence_stub(value: Any) -> bool:
    """Same structural-sanity-only posture as ``_is_valid_claim_stub`` above. evidence.schema.yaml's own
    required set is only {evidence_id, provenance} -- content is optional, so it is not checked here."""
    return isinstance(value, dict) and _is_nonempty_str(value.get("evidence_id"))


def _link_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped link". Both ``link()`` (construction layer) and
    ``evaluate_referential_integrity_gate`` (independent re-derivation layer) consult it, so the two layers
    cannot drift apart -- a critic pass found the gate silently accepting relation values and link shapes the
    builder refuses, because each layer had spelled the rule out separately. Returns None when valid.
    """
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _LINK_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _LINK_KEYS <= value.keys():
        return f"missing key(s) {sorted(_LINK_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("claim_id")):
        return f"claim_id must be a non-empty string, got {value.get('claim_id')!r}"
    if not _is_nonempty_str(value.get("evidence_id")):
        return f"evidence_id must be a non-empty string, got {value.get('evidence_id')!r}"
    if value.get("relation") not in VALID_RELATIONS:
        return f"relation must be one of {sorted(VALID_RELATIONS)}, got {value.get('relation')!r}"
    return None


def link(claim_id: str, evidence_id: str, relation: str) -> dict[str, Any]:
    """One item of ``typed-objects/evidence-matrix.schema.yaml#/properties/links``. Does NOT itself check that
    ``claim_id``/``evidence_id`` resolve to a declared claim/evidence entry -- that cross-field check happens
    once, in ``generate_evidence_matrix``, after every link has been rebuilt (this helper only validates this
    one item's own shape, the same division of labor ``finding()``/``point()`` already establish in this
    corpus)."""
    if not _is_nonempty_str(claim_id):
        raise InvariantViolation(f"EVIDMATRIX_INVALID_LINK_CLAIM_ID: link claim_id must be a non-empty string, got {claim_id!r}")
    if not _is_nonempty_str(evidence_id):
        raise InvariantViolation(f"EVIDMATRIX_INVALID_LINK_EVIDENCE_ID: link evidence_id must be a non-empty string, got {evidence_id!r}")
    if relation not in VALID_RELATIONS:
        raise InvariantViolation(f"EVIDMATRIX_INVALID_RELATION: relation must be one of {sorted(VALID_RELATIONS)}, got {relation!r}")
    record = {"claim_id": claim_id, "evidence_id": evidence_id, "relation": relation}
    problem = _link_problem(record)
    if problem is not None:  # unreachable unless the checks above and _link_problem ever disagree
        raise InvariantViolation(f"EVIDMATRIX_INVALID_LINK: {problem}")
    return record


def generate_evidence_matrix(
    record_id: str,
    claims: list[dict[str, Any]],
    evidence_items: list[dict[str, Any]],
    links: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/evidence-matrix.schema.yaml``.

    Deep-copies every claims/evidence_items entry (never a shallow ``dict()`` copy -- see module docstring) and
    rebuilds every links item via ``link()`` (never trusting the caller's raw dicts), then enforces the method
    contract's own real invariant fail-closed, in order: >=1 claim and >=1 evidence item declared, every link
    resolves to a real claim AND a real evidence item (both directions), no duplicate ``(claim_id, evidence_id)``
    pair, and every declared claim appears in >=1 link -- BEFORE returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"EVIDMATRIX_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"EVIDMATRIX_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("EVIDMATRIX_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    if not isinstance(claims, list) or not claims:
        raise InvariantViolation("EVIDMATRIX_NO_CLAIMS: at least 1 claim is required -- Atlas L575's own literal 'rows=claims'")
    rebuilt_claims: list[dict[str, Any]] = []
    for i, c in enumerate(claims):
        if not _is_valid_claim_stub(c):
            raise InvariantViolation(f"EVIDMATRIX_INVALID_CLAIM: claims[{i}] must be a claim.schema.yaml-shaped dict with at least claim_id and statement, got {c!r}")
        rebuilt_claims.append(copy.deepcopy(c))

    if not isinstance(evidence_items, list) or not evidence_items:
        raise InvariantViolation("EVIDMATRIX_NO_EVIDENCE_ITEMS: at least 1 evidence item is required -- Atlas L575's own literal 'cols=evidence'")
    rebuilt_evidence_items: list[dict[str, Any]] = []
    for i, e in enumerate(evidence_items):
        if not _is_valid_evidence_stub(e):
            raise InvariantViolation(f"EVIDMATRIX_INVALID_EVIDENCE_ITEM: evidence_items[{i}] must be an evidence.schema.yaml-shaped dict with at least evidence_id, got {e!r}")
        rebuilt_evidence_items.append(copy.deepcopy(e))

    if not isinstance(links, list):
        raise InvariantViolation(f"EVIDMATRIX_INVALID_LINKS: links must be a list, got {type(links).__name__}")
    rebuilt_links: list[dict[str, Any]] = []
    for i, l in enumerate(links):
        if not isinstance(l, dict) or "claim_id" not in l or "evidence_id" not in l or "relation" not in l:
            raise InvariantViolation(f"EVIDMATRIX_INVALID_LINK: links[{i}] must be a {{claim_id, evidence_id, relation}} object, got {l!r}")
        rebuilt_links.append(link(l["claim_id"], l["evidence_id"], l["relation"]))

    claim_ids = [c["claim_id"] for c in rebuilt_claims]
    evidence_ids = [e["evidence_id"] for e in rebuilt_evidence_items]

    dangling_claim_refs = sorted({l["claim_id"] for l in rebuilt_links} - set(claim_ids))
    if dangling_claim_refs:
        raise InvariantViolation(f"EVIDMATRIX_DANGLING_CLAIM_REF: links[] reference claim_id(s) {dangling_claim_refs} not present in claims[]")

    dangling_evidence_refs = sorted({l["evidence_id"] for l in rebuilt_links} - set(evidence_ids))
    if dangling_evidence_refs:
        raise InvariantViolation(f"EVIDMATRIX_DANGLING_EVIDENCE_REF: links[] reference evidence_id(s) {dangling_evidence_refs} not present in evidence_items[]")

    pairs = [(l["claim_id"], l["evidence_id"]) for l in rebuilt_links]
    duplicate_pairs = sorted({p for p in pairs if pairs.count(p) > 1})
    if duplicate_pairs:
        raise InvariantViolation(f"EVIDMATRIX_DUPLICATE_LINK_PAIR: links[] must not assert the same (claim_id, evidence_id) cell twice, duplicates found: {duplicate_pairs}")

    linked_claim_ids = {l["claim_id"] for l in rebuilt_links}
    orphan_claims = sorted(set(claim_ids) - linked_claim_ids)
    if orphan_claims:
        raise InvariantViolation(
            f"EVIDMATRIX_ORPHAN_CLAIM: claims[] {orphan_claims} appear in zero links -- Atlas L575's own "
            "'快速看到薄弱 claim' is exactly why an unlinked claim must not be silently accepted as a complete matrix"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "claims": rebuilt_claims,
        "evidence_items": rebuilt_evidence_items,
        "links": rebuilt_links,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record carries a schema-valid provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_referential_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives invariant halves (1) and (3) directly from raw fields -- not just trusting that
    ``generate_evidence_matrix``'s own construction-time check already ran. Fails closed on malformed entries
    rather than crashing."""
    if not isinstance(record, dict):
        return _result("referential_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems: list[str] = []

    record_id = record.get("id")
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        problems.append(f"id must be a non-empty string starting with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(record.get("version"), str):
        problems.append(f"version must be a string, got {record.get('version')!r}")

    claims = record.get("claims")
    claim_ids: set[Any] = set()
    if isinstance(claims, list):
        claim_ids = {c.get("claim_id") if isinstance(c, dict) else None for c in claims}
    else:
        problems.append("claims must be a list")

    evidence_items = record.get("evidence_items")
    evidence_ids: set[Any] = set()
    if isinstance(evidence_items, list):
        evidence_ids = {e.get("evidence_id") if isinstance(e, dict) else None for e in evidence_items}
    else:
        problems.append("evidence_items must be a list")

    links = record.get("links")
    if isinstance(links, list):
        # Shape/enum re-derivation via the SAME predicate link() uses -- without this the gate passed
        # records the builder refuses (e.g. relation:"TOTALLY_MADE_UP", a link missing relation entirely).
        malformed = [f"links[{i}]: {problem}" for i, problem in ((i, _link_problem(l)) for i, l in enumerate(links)) if problem]
        problems.extend(malformed)
        well_shaped = [l for l in links if _link_problem(l) is None]
        dangling_claim_refs = sorted({l["claim_id"] for l in well_shaped if l["claim_id"] not in claim_ids}, key=repr)
        if dangling_claim_refs:
            problems.append(f"dangling claim_id ref(s): {dangling_claim_refs}")
        dangling_evidence_refs = sorted({l["evidence_id"] for l in well_shaped if l["evidence_id"] not in evidence_ids}, key=repr)
        if dangling_evidence_refs:
            problems.append(f"dangling evidence_id ref(s): {dangling_evidence_refs}")
        pairs = [(l["claim_id"], l["evidence_id"]) for l in well_shaped]
        duplicate_pairs = sorted({p for p in pairs if pairs.count(p) > 1}, key=repr)
        if duplicate_pairs:
            problems.append(f"duplicate (claim_id, evidence_id) pair(s): {duplicate_pairs}")
    else:
        problems.append("links must be a list")

    passed = not problems
    return _result("referential_integrity", passed, [{"problems": problems}], validator, timestamp)


def evaluate_no_orphan_claim_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives invariant half (2) directly from raw fields -- Atlas L575's own 'quickly surface the weak
    claim' purpose, mechanized. Fails closed on malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("no_orphan_claim", False, [{"reason": "record is not a dict"}], validator, timestamp)
    claims = record.get("claims")
    links = record.get("links")
    if not isinstance(claims, list):
        return _result("no_orphan_claim", False, [{"reason": "claims must be a list"}], validator, timestamp)
    if not isinstance(links, list):
        return _result("no_orphan_claim", False, [{"reason": "links must be a list"}], validator, timestamp)

    claim_ids = {c.get("claim_id") if isinstance(c, dict) else None for c in claims}
    linked_claim_ids = {l.get("claim_id") if isinstance(l, dict) else None for l in links}
    # key=repr: these sets legitimately mix str with None when an entry is malformed, and a bare sorted()
    # raises TypeError on that mix -- a gate must fail closed on garbage, never crash.
    orphan_claims = sorted(claim_ids - linked_claim_ids, key=repr)
    passed = not orphan_claims
    return _result("no_orphan_claim", passed, [{"claims_checked": len(claims), "orphan_claim_ids": orphan_claims}], validator, timestamp)


def evaluate_evidence_matrix_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_referential_integrity_gate(record, validator, timestamp),
        evaluate_no_orphan_claim_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
