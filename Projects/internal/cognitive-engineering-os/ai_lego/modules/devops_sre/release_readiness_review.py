"""``devops_sre.release_readiness_review`` -- thirty-second Method Atlas slice, SEVENTH from the
`devops_sre` family (F19).

Atlas's own benefit column (F19 tool table, L862: "防漏掉跨域風險" --
prevent MISSING cross-domain risk) directly implies the real invariant
this module enforces: a review record must assess EXACTLY the six
canonical domains Atlas's own formula names (change/data/security/
observability/rollback/capacity) -- no fewer, no duplicates, no domain
outside this closed set -- and `overall_status: ready` requires every
one of those six assessments to itself be `ready`, the same "one
failing part propagates to the whole" aggregation
`devops_sre.canary_deployment`'s own unhealthy-forbids-completed
invariant already established for a structurally analogous case.
(Atlas's own 主要用途/used-for column for this row -- not its benefit
column -- reads "上線前統一檢查", a unified pre-release check.)

``generate_release_readiness_review_record`` RECOMPUTES/rebuilds every
domain assessment from known fields only -- a critic review of
`database_data.reconciliation`/`devops_sre.capacity_model`'s own first
drafts (in different ways) both caught that storing a hand-built dict
verbatim lets extra/wrong fields or an unvalidated shape survive into a
certified record; this module does not repeat that mistake.
``evaluate_readiness_integrity_gate`` RE-DERIVES completeness and the
aggregation verdict fresh from the record's own raw
``domain_assessments`` field, and (the lesson `devops_sre
.capacity_model`'s own critic round most recently established) also
re-validates the record's own `id`/`release_ref` fields, not merely
whatever the builder's own computed/aggregated fields happen to
already agree on -- a critic review of THIS slice's own first draft
found exactly that same gap had been reintroduced here too (the gate
never re-checked `id`/`release_ref` non-emptiness, or an assessment's
own key set, even though the builder enforces both).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "devops_sre.release_readiness_review"
RECORD_ID_PREFIX = "RRR-"  # = typed-object schema id pattern; used only when the API auto-supplies record_id
CANONICAL_DOMAINS = frozenset({"change", "data", "security", "observability", "rollback", "capacity"})
VALID_VERDICTS = frozenset({"ready", "not_ready"})
_KNOWN_ASSESSMENT_KEYS = frozenset({"domain", "verdict", "note"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _record_identity_is_valid(record_id: Any, release_ref: Any) -> bool:
    """Shared predicate: are both record-identity fields real, non-empty strings? Called by BOTH the
    builder's construction-time check and the gate's independent re-derivation -- a critic review of this
    slice's own first draft found the gate never re-checked this precondition at all, letting a record
    hand-tampered to empty out its own id/release_ref pass every gate unchallenged (the same "gate
    recomputes outputs but never re-validates a precondition the builder enforces on raw inputs" class
    `devops_sre.capacity_model`'s own critic round caught one slice earlier)."""
    return _is_nonempty_str(record_id) and _is_nonempty_str(release_ref)


def _duplicate_domains(assessments: list[Any]) -> list[str]:
    """Shared predicate: which domain values (if any) appear more than once? Called by BOTH the builder's
    construction-time check and the gate's independent re-derivation."""
    seen: set[str] = set()
    duplicates: set[str] = set()
    for item in assessments:
        domain = item.get("domain") if isinstance(item, dict) else None
        if not isinstance(domain, str):
            continue
        if domain in seen:
            duplicates.add(domain)
        seen.add(domain)
    return sorted(duplicates)


def _missing_domains(assessments: list[dict[str, Any]]) -> list[str]:
    """Shared predicate: given well-shaped, deduped assessments, which of the six canonical domains are
    absent? Atlas's own benefit text ("防漏掉跨域風險") is precisely about this gap. PROVABLY UNREACHABLE
    given this module's own other checks (exactly 6 entries + every domain in the canonical 6-set + no
    duplicates implies the present set IS the canonical set) -- kept as an explicit tripwire in case any of
    those other checks is ever relaxed, not dead code by oversight. Verified by exhaustive enumeration of
    every 6-multiset of the 6 canonical domains during this slice's own critic review: 0 of 462 combinations
    reach this branch."""
    present = {item["domain"] for item in assessments if isinstance(item, dict) and item.get("domain") in CANONICAL_DOMAINS}
    return sorted(CANONICAL_DOMAINS - present)


def _assessment_keys_are_known(item: dict[str, Any]) -> bool:
    """Shared predicate: does this assessment carry ONLY domain/verdict/note, no attacker-controlled extra
    field? Called by BOTH the builder (which additionally rebuilds from known fields, making this a
    belt-and-braces check there) and the gate (where this IS the only defense against an extra field, since
    the gate does not rebuild anything)."""
    return isinstance(item, dict) and set(item.keys()) <= _KNOWN_ASSESSMENT_KEYS


def _assessment_is_valid(domain: Any, verdict: Any, note: Any) -> bool:
    """Shared predicate: is one assessment's own domain/verdict/note combination valid -- known domain,
    known verdict, note a non-empty string whenever supplied, and REQUIRED (not merely non-empty when
    present) whenever verdict is not_ready? Called by BOTH the builder and the gate.

    A critic review of this slice's own first draft found this predicate checked note's non-emptiness only
    for the not_ready case, leaving a `ready` assessment's own note completely unvalidated at this shared
    layer (a non-string note -- an int, a list, a mutable object a caller could mutate after certification --
    passed the gate, differing from `domain_assessment()`'s own stricter, but NOT shared, check). Fixed by
    validating note's own shape unconditionally, before the additional not_ready-requires-note rule."""
    if domain not in CANONICAL_DOMAINS:
        return False
    if verdict not in VALID_VERDICTS:
        return False
    if note is not None and not _is_nonempty_str(note):
        return False
    if verdict == "not_ready" and note is None:
        return False
    return True


def domain_assessment(domain: str, verdict: str, *, note: str | None = None) -> dict[str, Any]:
    """One item of ``typed-objects/release-readiness-review-record.schema.yaml#/properties/domain_assessments``."""
    if domain not in CANONICAL_DOMAINS:
        raise InvariantViolation(f"RELEASEREADINESS_UNKNOWN_DOMAIN: {domain!r} is not one of {sorted(CANONICAL_DOMAINS)}")
    if verdict not in VALID_VERDICTS:
        raise InvariantViolation(f"RELEASEREADINESS_INVALID_VERDICT: {verdict!r} is not one of {sorted(VALID_VERDICTS)}")
    if note is not None and not _is_nonempty_str(note):
        raise InvariantViolation(f"RELEASEREADINESS_EMPTY_NOTE: domain {domain!r}'s note must be a non-empty string when supplied, got {note!r}")
    if verdict == "not_ready" and note is None:
        raise InvariantViolation(f"RELEASEREADINESS_NOT_READY_REQUIRES_NOTE: domain {domain!r} is not_ready but has no note -- a failing domain must say why")
    item: dict[str, Any] = {"domain": domain, "verdict": verdict}
    if note is not None:
        item["note"] = note
    return item


def generate_release_readiness_review_record(
    record_id: str,
    release_ref: str,
    domain_assessments: list[dict[str, Any]],
    overall_status: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/release-readiness-review-record.schema.yaml``. Enforces the method
    contract's own preconditions fail-closed: record_id/release_ref non-empty, EXACTLY the six canonical
    domains present (no fewer, no duplicates, no domain outside the set), every not_ready assessment carries
    a non-empty note, and -- the core invariant -- forbids ``overall_status: ready`` unless EVERY domain
    assessment is itself ``ready``. RECOMPUTES/rebuilds every assessment from known fields, accepting
    hand-built dicts (not just ones produced by ``domain_assessment()``) as a legitimate input shape,
    re-validated here rather than assumed.

    DELIBERATELY ONE-DIRECTIONAL (same class as ``database_data.backup_restore_drill``'s own status field):
    a caller MAY declare ``overall_status: not_ready`` even when every domain is already ready -- a
    conservative choice this contract's own text never forbids.
    """
    if not _record_identity_is_valid(record_id, release_ref):
        raise InvariantViolation(f"RELEASEREADINESS_EMPTY_RECORD_FIELD: record_id/release_ref must both be non-empty strings, got {record_id!r}/{release_ref!r}")
    if not isinstance(domain_assessments, list) or len(domain_assessments) != 6:
        raise InvariantViolation(f"RELEASEREADINESS_WRONG_COUNT: domain_assessments must contain exactly the six canonical domains, got {len(domain_assessments) if isinstance(domain_assessments, list) else domain_assessments!r}")

    rebuilt: list[dict[str, Any]] = []
    for item in domain_assessments:
        if not isinstance(item, dict):
            raise InvariantViolation(f"RELEASEREADINESS_INVALID_ASSESSMENT_SHAPE: each assessment must be a dict, got {item!r}")
        domain = item.get("domain")
        verdict = item.get("verdict")
        note = item.get("note")
        if not _assessment_is_valid(domain, verdict, note):
            raise InvariantViolation(f"RELEASEREADINESS_INVALID_ASSESSMENT: domain={domain!r} verdict={verdict!r} note={note!r} is not a valid assessment (unknown domain/verdict, non-string note, or not_ready with no note)")
        clean: dict[str, Any] = {"domain": domain, "verdict": verdict}
        if note is not None:
            clean["note"] = note
        rebuilt.append(clean)

    duplicates = _duplicate_domains(rebuilt)
    if duplicates:
        raise InvariantViolation(f"RELEASEREADINESS_DUPLICATE_DOMAIN: {duplicates} assessed more than once")
    missing = _missing_domains(rebuilt)
    if missing:
        raise InvariantViolation(f"RELEASEREADINESS_MISSING_DOMAIN: {missing} not assessed -- Atlas's own benefit text (F19 L862, '防漏掉跨域風險') forbids a review that silently skips a canonical domain")

    if overall_status not in VALID_VERDICTS:
        # Reuses the assessment-level verdict enum -- the aggregate status shares the same two-value vocabulary.
        raise InvariantViolation(f"RELEASEREADINESS_INVALID_OVERALL_STATUS: overall_status must be 'ready' or 'not_ready', got {overall_status!r}")
    if overall_status == "ready":
        not_ready_domains = [item["domain"] for item in rebuilt if item["verdict"] != "ready"]
        if not_ready_domains:
            raise InvariantViolation(
                f"RELEASEREADINESS_NOT_ACTUALLY_READY: overall_status:ready requires every domain to be ready -- {not_ready_domains} are not, "
                "Atlas's own 上線前統一檢查 (F19 L862, 用途 column) forbids a unified verdict that ignores a failing domain"
            )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "release_ref": release_ref,
        "domain_assessments": rebuilt,
        "overall_status": overall_status,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance is schema-valid."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_readiness_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- valid id/release_ref,
    well-shaped entries with a known key set, valid domain/verdict/note, no duplicates, no missing domain --
    AND re-derives whether ``overall_status: ready`` is actually justified. Does not trust any stored value.
    FAILS CLOSED at every step on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("readiness_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _record_identity_is_valid(record.get("id"), record.get("release_ref")):
        return _result("readiness_integrity", False, [{"reason": "id/release_ref missing or empty"}], validator, timestamp)

    assessments = record.get("domain_assessments")
    if not isinstance(assessments, list) or len(assessments) != 6:
        return _result("readiness_integrity", False, [{"reason": "domain_assessments missing, not a list, or not exactly six entries"}], validator, timestamp)
    unknown_keys = [item.get("domain") if isinstance(item, dict) else None for item in assessments if not _assessment_keys_are_known(item)]
    if unknown_keys:
        return _result("readiness_integrity", False, [{"reason": "one or more assessments carries an unknown extra field", "domains": unknown_keys}], validator, timestamp)
    invalid = [
        {"domain": item.get("domain") if isinstance(item, dict) else None, "verdict": item.get("verdict") if isinstance(item, dict) else None}
        for item in assessments
        if not (isinstance(item, dict) and _assessment_is_valid(item.get("domain"), item.get("verdict"), item.get("note")))
    ]
    if invalid:
        return _result("readiness_integrity", False, [{"reason": "one or more assessments is invalid (unknown domain/verdict, non-string note, or not_ready with no note)", "invalid": invalid}], validator, timestamp)

    duplicates = _duplicate_domains(assessments)
    if duplicates:
        return _result("readiness_integrity", False, [{"reason": "duplicate domain", "duplicate_domains": duplicates}], validator, timestamp)
    missing = _missing_domains(assessments)
    if missing:
        return _result("readiness_integrity", False, [{"reason": "missing domain", "missing_domains": missing}], validator, timestamp)

    overall_status = record.get("overall_status")
    if overall_status not in VALID_VERDICTS:
        return _result("readiness_integrity", False, [{"reason": "overall_status is not 'ready' or 'not_ready'", "overall_status": overall_status}], validator, timestamp)
    not_ready_domains = [item["domain"] for item in assessments if item.get("verdict") != "ready"]
    if overall_status == "ready" and not_ready_domains:
        return _result("readiness_integrity", False, [{"reason": "overall_status:ready but not-ready domains remain", "not_ready_domains": not_ready_domains}], validator, timestamp)

    return _result("readiness_integrity", True, [{"domains_assessed": len(assessments), "overall_status": overall_status}], validator, timestamp)


def evaluate_release_readiness_review_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_readiness_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
