"""``decision.impact_effort`` -- Method Atlas slice, third member of the ``decision`` family (F16), after
``decision.ahp`` and ``decision.mcda``.

CRITICAL DUE-DILIGENCE (before writing this module): ``decision.mcda`` and ``decision.ahp`` (both read in
full) produce a CONTINUOUS weighted score + ranking across N arbitrary, caller-named criteria
(``ai_lego/modules/decision/mcda.py``/``ahp.py``). Impact-Effort is a genuinely different operation, not a
2-criterion special case of MCDA: exactly 2 FIXED, NAMED dimensions (impact, effort -- not arbitrary
criteria), producing a CATEGORICAL quadrant label, where the high/low boundary itself is the analytical
content, not a weighted sum. Three independent Atlas citations confirm this is a distinct, real method, not
an alias:

1. Atlas §11.30 (L1889-1906) is a DEDICATED section (unlike ``architecture.trade_off_matrix``, which had
   only a table row -- see that contract's own reuse-only precedent, deliberately NOT followed here): a
   worked mermaid ``quadrantChart`` with 2 named axes and 4 named quadrants (L1894-1903).
2. Atlas §28's own quick-tool-selection table (L4485): "很多方案不知選哪個 | Impact–Effort | MCDA / AHP |
   Vote Only" -- Impact-Effort is the explicit FIRST tool, MCDA/AHP the explicit NEXT tool, for the same
   scenario. Atlas's own routing logic treats them as sequential, distinct methods, not synonyms.
3. Atlas's own Phase-1 method list (L4280-4295) lists "Impact–Effort" and "Weighted Decision Matrix" (the
   MCDA-shaped method) as two separate entries in the same enumeration.

TWO real, independently-enforced invariants (construction AND gate, same "raise before any downstream
write" / "re-derive, don't trust" two-layer discipline ``root_cause.fault_tree`` (read in full) already
establishes for this codebase's current best-practice fail-closed gate pattern):

1. **Quadrant genuine-compute** (``IMPACTEFFORT_QUADRANT_MISMATCH``, surfaced via
   ``evaluate_quadrant_integrity_gate``'s own evidence): every idea's own ``quadrant`` is COMPUTED by
   ``ai_lego.compute.impact_effort.classification.classify_quadrant`` at construction -- there is no
   constructor parameter for it, so a legitimately-built record cannot carry a wrong one -- and
   independently RE-DERIVED at the gate from the record's own raw impact/effort/thresholds, compared
   against whatever quadrant is actually stored. A hand-tampered record with a mismatched quadrant label
   fails the gate.
2. **Scale consistency** (``IMPACTEFFORT_VALUE_OUT_OF_SCALE`` / ``IMPACTEFFORT_THRESHOLD_OUT_OF_SCALE``,
   raised at construction, re-derived at the gate): impact and effort are each validated against their OWN
   declared ``{min, max}`` range -- comparing an impact scored 1-10 against an effort scored 1-5 on the
   same boundary would be meaningless. One declared ``impact_scale`` / one declared ``effort_scale`` per
   record (never a per-idea override) makes mixed-scale input structurally impossible within one record;
   out-of-range values are REJECTED, not silently normalized (see method contract compilation_decisions).

Both invariants are bundled under one gate_id (``quadrant_integrity``), same shape
``evaluate_fault_tree_integrity_gate`` already uses for its own family: several distinct, dependent
structural reasons (the recomputed quadrant is only meaningful once the scale/threshold data it depends on
is itself sane), one gate_id, each mismatch its own distinguishable evidence entry.

A third, separate guard (``assert_no_automatic_authority_claim`` / ``evaluate_no_automatic_authority_gate``)
is INFERRED, not table-cited: Atlas §11.30's own prose caution (L1905-1906, "它只適合初篩；高風險方案不能只
靠這張圖決策" -- suitable for first-pass screening only; high-risk proposals must not be decided from this
chart alone) has no corresponding row in Atlas §22.3's Method-specific Gate table (grep-confirmed absent,
unlike ``decision.mcda``'s own directly-cited L4154 row). Reuses the same representative-blocklist-plus-
structural-second-layer design ``decision.mcda``'s own ``FORBIDDEN_AUTHORITY_KEYS`` established, re-derived
independently here (not imported) for this method's own, weaker-grounded (prose, not table) citation.
"""

from __future__ import annotations

from typing import Any

from ai_lego.compute.impact_effort.classification import (
    VALID_QUADRANTS,
    classify_ideas,
    classify_quadrant,
    validate_scale,
    validate_threshold_in_scale,
    validate_value_in_scale,
)
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.gates import evaluate_statistical_gate, genuine_compute_provenance

METHOD_ID = "decision.impact_effort"
RECORD_ID_PREFIX = "IMPACTEFFORT-"
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.impact_effort.classification.classify_quadrant"
# Same representative-blocklist-plus-structural-second-layer design `decision.mcda.py`'s own
# FORBIDDEN_AUTHORITY_KEYS already established -- independently re-derived here (not imported), grounded in
# THIS method's own citation (Atlas §11.30 L1905-1906 prose caution, not a §22.3 table row -- see module
# docstring and method contract compilation_decisions for the disclosed grounding-strength difference).
FORBIDDEN_AUTHORITY_KEYS = frozenset({"approved", "decision", "final_decision", "automatic_decision", "authorized", "outcome"})

_KNOWN_IDEA_INPUT_KEYS = frozenset({"id", "label", "impact", "effort"})


def assert_no_automatic_authority_claim(record: dict[str, Any]) -> None:
    """Atlas §11.30's own prose caution (L1905-1906), checked structurally BEFORE the record is
    returned/persisted -- same 'raise before construction' discipline every forbidden-transition guard in
    this package uses. Guards ``isinstance(record, dict)`` itself (stricter than ``decision.mcda``'s own
    precedent, which lacks this check and would crash with ``AttributeError`` instead of failing closed on
    non-dict input) so a caller of ``evaluate_no_automatic_authority_gate`` always gets a clean FAIL, never
    a crash."""
    if not isinstance(record, dict):
        raise InvariantViolation(f"IMPACTEFFORT_AUTOMATIC_AUTHORITY_CLAIM_FORBIDDEN: record must be a dict, got {type(record).__name__}")
    violations = FORBIDDEN_AUTHORITY_KEYS & record.keys()
    if violations:
        raise InvariantViolation(
            f"IMPACTEFFORT_AUTOMATIC_AUTHORITY_CLAIM_FORBIDDEN: top-level key(s) {sorted(violations)} assert automatic/final authority "
            "(Atlas §11.30 L1905-1906: high-risk proposals must not be decided from this chart alone)"
        )


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- NEVER Python's own recursive ``repr()``, same
    discipline ``root_cause.fault_tree``'s own ``_shallow_describe`` uses."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _idea_input_is_valid(idea: Any) -> bool:
    """Shape only (keys closed, id/label non-empty strings, impact/effort real numbers). Value-RANGE checks
    (impact/effort within their own declared scale) are a separate concern, owned by
    ``ai_lego.compute.impact_effort.classification`` -- same three-independent-predicates split
    ``root_cause.fault_tree``'s own shape/mode/referential-integrity checks already establish, so a failure
    always names the specific bug class."""
    if not isinstance(idea, dict) or set(idea.keys()) != _KNOWN_IDEA_INPUT_KEYS:
        return False
    if not _is_nonempty_str(idea["id"]) or not _is_nonempty_str(idea["label"]):
        return False
    impact, effort = idea["impact"], idea["effort"]
    if isinstance(impact, bool) or isinstance(effort, bool):
        return False
    return isinstance(impact, (int, float)) and isinstance(effort, (int, float))


def generate_impact_effort_classification(
    record_id: str,
    subject: str,
    ideas: list[dict[str, Any]],
    impact_scale: dict[str, Any],
    effort_scale: dict[str, Any],
    impact_threshold: float,
    effort_threshold: float,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/impact-effort-classification.schema.yaml``. Enforces the method contract's
    own preconditions fail-closed, in this order: id/subject/version shape, idea shape, idea-id-uniqueness,
    then scale/threshold/value-range validation and quadrant computation (delegated to
    ``ai_lego.compute.impact_effort.classification.classify_ideas``, which is where
    ``IMPACTEFFORT_INVALID_SCALE`` / ``IMPACTEFFORT_THRESHOLD_OUT_OF_SCALE`` / ``IMPACTEFFORT_VALUE_OUT_OF_SCALE``
    actually raise). ``quadrant`` is COMPUTED -- there is no parameter for it; a caller cannot supply one."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"IMPACTEFFORT_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not _is_nonempty_str(subject):
        raise InvariantViolation(f"IMPACTEFFORT_EMPTY_RECORD_FIELD: subject must be a non-empty string, got {subject!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"IMPACTEFFORT_INVALID_VERSION: version must be a string, got {version!r}")
    if not isinstance(ideas, list) or not ideas or not all(_idea_input_is_valid(i) for i in ideas):
        raise InvariantViolation(
            f"IMPACTEFFORT_INVALID_IDEAS: ideas must be a non-empty list of well-shaped entries "
            f"(id/label non-empty strings, impact/effort real numbers, no extra/missing keys), got {_shallow_describe(ideas)}"
        )
    ids = [i["id"] for i in ideas]
    if len(set(ids)) != len(ids):
        duplicates = sorted({i for i in ids if ids.count(i) > 1})
        raise InvariantViolation(f"IMPACTEFFORT_DUPLICATE_IDEA_ID: id(s) {duplicates} used more than once -- every idea id must be unique in the record")

    classified_ideas = classify_ideas(ideas, impact_scale, effort_scale, impact_threshold, effort_threshold)

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "subject": subject,
        "impact_scale": dict(impact_scale),
        "effort_scale": dict(effort_scale),
        "impact_threshold": impact_threshold,
        "effort_threshold": effort_threshold,
        "ideas": classified_ideas,
        "engine": "local_python_deterministic_compute",
        "computation_provenance_ref": COMPUTATION_PROVENANCE_REF,
        "provenance": genuine_compute_provenance(provenance),
    }
    assert_no_automatic_authority_claim(record)
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance is schema-valid."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_genuine_compute_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Reuses ``modules.research.gates.evaluate_statistical_gate`` UNCHANGED -- same reuse
    ``root_cause.pareto``/``decision.ahp``/``decision.mcda`` already established, checking this record's own
    ``engine``/``computation_provenance_ref``/``provenance`` METADATA fields resolve and are well-formed.
    Does NOT by itself re-derive whether the stored quadrant VALUES are correct -- that is
    ``evaluate_quadrant_integrity_gate``'s own, stronger job (see that gate's docstring); the two gates are
    complementary, not redundant. Guards ``isinstance(record, dict)`` itself before delegating -- stricter
    than ``decision.mcda``'s own precedent, whose identically-shaped gate has no such guard and would crash
    with ``AttributeError`` (``dict.get`` called on a non-dict) instead of failing closed."""
    if not isinstance(record, dict):
        return _result("genuine_compute", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed, evidence = evaluate_statistical_gate(record)
    return _result("genuine_compute", passed, evidence, validator, timestamp)


def evaluate_quadrant_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural/value precondition from the record's own raw fields -- does not trust any
    stored value, including whether each idea's own ``quadrant`` actually matches what
    ``ai_lego.compute.impact_effort.classification.classify_quadrant`` recomputes fresh from that same
    idea's impact/effort and the record's own declared thresholds. Reuses the SAME raising validators
    construction uses (via try/except) rather than a second, parallel set of boolean predicates -- avoids
    two implementations of the same scale-check logic that could drift, same trade-off
    ``evaluate_no_automatic_authority_gate``'s own try/except style already accepts in this codebase.
    Bundles both headline invariants (scale consistency AND quadrant genuine-compute) under one gate_id,
    same shape ``evaluate_fault_tree_integrity_gate`` already uses for its own family (several distinct,
    DEPENDENT structural reasons -- recomputing a quadrant is only meaningful once the scale/threshold data
    it depends on is itself sane -- one gate_id, each mismatch its own distinguishable evidence entry).
    FAILS CLOSED on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("quadrant_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("quadrant_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not _is_nonempty_str(record.get("subject")):
        return _result("quadrant_integrity", False, [{"reason": "subject missing or empty"}], validator, timestamp)

    impact_scale, effort_scale = record.get("impact_scale"), record.get("effort_scale")
    impact_threshold, effort_threshold = record.get("impact_threshold"), record.get("effort_threshold")
    try:
        validate_scale(impact_scale, "impact")
        validate_scale(effort_scale, "effort")
        validate_threshold_in_scale(impact_threshold, impact_scale, "impact")
        validate_threshold_in_scale(effort_threshold, effort_scale, "effort")
    except InvariantViolation as error:
        return _result("quadrant_integrity", False, [{"reason": str(error)}], validator, timestamp)

    ideas = record.get("ideas")
    if not isinstance(ideas, list) or not ideas:
        return _result("quadrant_integrity", False, [{"reason": "ideas missing, empty, or not a list"}], validator, timestamp)

    required_idea_keys = {"id", "label", "impact", "effort", "quadrant"}
    mismatches: list[str] = []
    for entry in ideas:
        if not isinstance(entry, dict) or not required_idea_keys <= entry.keys():
            mismatches.append(f"idea entry malformed or missing a required key: {_shallow_describe(entry)}")
            continue
        try:
            validate_value_in_scale(entry["impact"], impact_scale, "impact", entry.get("id", "?"))
            validate_value_in_scale(entry["effort"], effort_scale, "effort", entry.get("id", "?"))
        except InvariantViolation as error:
            mismatches.append(str(error))
            continue
        if entry["quadrant"] not in VALID_QUADRANTS:
            mismatches.append(f"idea {entry['id']!r}: stored quadrant={entry['quadrant']!r} is not one of the 4 canonical quadrants {sorted(VALID_QUADRANTS)}")
            continue
        recomputed = classify_quadrant(entry["impact"], entry["effort"], impact_threshold, effort_threshold)
        if entry["quadrant"] != recomputed:
            mismatches.append(f"idea {entry['id']!r}: stored quadrant={entry['quadrant']!r} does not match recomputed={recomputed!r}")

    ids = [e["id"] for e in ideas if isinstance(e, dict) and "id" in e]
    if len(set(ids)) != len(ids):
        mismatches.append("duplicate idea id across ideas[]")

    if mismatches:
        return _result("quadrant_integrity", False, [{"reason": "quadrant/scale mismatch", "details": mismatches}], validator, timestamp)

    quadrant_counts = {q: sum(1 for e in ideas if e.get("quadrant") == q) for q in VALID_QUADRANTS}
    return _result("quadrant_integrity", True, [{"idea_count": len(ideas), "quadrant_counts": quadrant_counts}], validator, timestamp)


def evaluate_no_automatic_authority_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-checks Atlas §11.30's own caution structurally on any record handed to it -- not just trusting that
    ``generate_impact_effort_classification``'s own construction-time check already ran (a hand-crafted/
    tampered record must still be caught, same discipline ``decision.mcda``'s own gate-re-derivation already
    established)."""
    try:
        assert_no_automatic_authority_claim(record)
        return _result("no_automatic_authority_claim", True, [{"checked_keys": sorted(FORBIDDEN_AUTHORITY_KEYS)}], validator, timestamp)
    except InvariantViolation as error:
        return _result("no_automatic_authority_claim", False, [{"error": str(error)}], validator, timestamp)


def evaluate_impact_effort_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_genuine_compute_gate(record, validator, timestamp),
        evaluate_quadrant_integrity_gate(record, validator, timestamp),
        evaluate_no_automatic_authority_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
