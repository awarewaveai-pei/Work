"""``framing.five_w_one_h`` -- F01 framing family (methods/contracts/framing.five_w_one_h.contract.yaml).

**Naming, due-diligence finding:** the human-facing method name is "5W1H", but
``specs/cognitive/method.schema.yaml``'s own ``id`` field requires pattern ``^[a-z_]+\\.[a-z_]+$``
(letters/underscore only -- grep-confirmed zero digit anywhere in any of the 90+ existing contract ``id``
values in this suite). ``framing.5w1h`` would FAIL that pattern. This module, its ``METHOD_ID`` constant,
and its own filename therefore spell the method out as ``five_w_one_h`` -- the same digit-avoidance
precedent ``root_cause.five_whys`` already set for this exact class of naming collision (a Python module
starting with a digit is separately illegal for ``import``, but the DRIVING constraint here is the schema
pattern, not the import system). ``RECORD_ID_PREFIX`` below preserves the human-facing "5W1H" form verbatim
since record ids are free strings with no method-id character-set constraint.

Atlas's citations: F01 table row (L340: "5W1H｜快速建立問題輪廓｜資訊不足時｜Who/What/When/Where/Why/How｜
找資訊缺口｜Problem Statement") plus dedicated §12.1 (L2544-2550: "低門檻、跨文化容易理解...只負責探索,不代表
已完成根因分析"). Grep-confirmed 5 total "5W1H" hits in the whole Atlas file: the table row, §12.1, the F01
mermaid flowchart node (L350), and two unrelated recipe-chain mentions (L3638/L4274) read and ruled out of
scope.

**Due diligence (VERIFIED before writing):** grepped the whole ``ai_lego`` tree case-insensitively for
"5w1h" and "who_what_when_where_why_how" -- zero pre-existing implementation (only
``method-inventory.yaml``'s own stale row and ``problem-statement.schema.yaml``'s own citation of 5W1H as
one of several EQUIVALENT framing tools that MAY produce a ``ProblemStatement``, not this file). Confirmed
distinct from ``framing.goal_statement`` (F01 row L334): that method turns an ALREADY-CHOSEN goal into a
5-field commitment (goal/beneficiaries/timeframe/success_condition/constraints); this method profiles a
STILL-FUZZY situation across 6 open questions and reports which remain unanswered -- different Atlas rows,
different inputs (goal_statement needs a chosen goal; this method's own Atlas citation places it on raw
"模糊需求", no upstream typed-object required), different purpose (goal-setting vs. gap-finding).

**Structural point, taken literally (not just as a docstring claim):** Atlas's own benefit column for this
row is "找資訊缺口" (find information gaps) -- not "record 6 answers". Two design choices make that literal:
(1) an unanswered dimension is a first-class ``status: UNKNOWN`` state that structurally FORBIDS the
``answer`` key's presence at all (not an empty string that would silently read as "answered: nothing");
(2) ``information_gaps`` is GENUINE_COMPUTE (``ai_lego.compute.five_w1h.gap_detection.derive_information_gaps``),
re-derived from ``dimensions[].status`` by both the builder and an independent gate -- never a value a caller
can simply assert.

Two real invariants, each enforced BOTH at construction (raise BEFORE any record is built) AND independently
by a gate that re-derives from raw fields, same "shared predicate, reused by both layers" discipline every
sibling module in this family already establishes:

1. ``dimensions`` is EXACTLY the six entries {WHO, WHAT, WHEN, WHERE, WHY, HOW}, one each, POSITIONALLY in
   that literal Atlas citation order; each entry's ``status``/``answer``/``gap_note`` triple must be
   internally coherent (KNOWN needs a non-empty answer and forbids gap_note; UNKNOWN forbids answer
   entirely and may carry a non-empty gap_note).
2. ``information_gaps`` must equal the actual set of UNKNOWN dimension names, in order -- re-derived by
   ``derive_information_gaps``, never trusted from a stored or caller-supplied value.
"""

from __future__ import annotations

from typing import Any

from ai_lego.compute.five_w1h.gap_detection import derive_information_gaps
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "framing.five_w_one_h"
RECORD_ID_PREFIX = "5W1H-"
DIMENSION_ORDER: tuple[str, ...] = ("WHO", "WHAT", "WHEN", "WHERE", "WHY", "HOW")
# Atlas's own literal six-word F01 row (L340) citation order, transcribed verbatim -- same
# "positionally-ordered pipeline" invariant class root_cause.kepner_tregoe's own DIMENSION_ORDER and
# framing.smart's own CRITERION_ORDER already establish.

_DIMENSION_REQUIRED_KEYS = frozenset({"dimension", "status", "provenance"})
_DIMENSION_ALLOWED_KEYS = _DIMENSION_REQUIRED_KEYS | frozenset({"answer", "gap_note", "supporting_evidence_refs"})
_STATUS_KNOWN = "KNOWN"
_STATUS_UNKNOWN = "UNKNOWN"
_VALID_STATUSES = frozenset({_STATUS_KNOWN, _STATUS_UNKNOWN})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shaped(entry: Any, required_keys: frozenset[str], allowed_keys: frozenset[str]) -> bool:
    if not isinstance(entry, dict):
        return False
    keys = set(entry.keys())
    return required_keys <= keys and keys <= allowed_keys


def _refs_shape_ok(entry: dict[str, Any]) -> bool:
    refs = entry.get("supporting_evidence_refs")
    return refs is None or (isinstance(refs, list) and bool(refs) and all(isinstance(r, str) for r in refs))


def _dimensions_are_valid(dimensions: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from
    the other -- same discipline every sibling module in this family already establishes.

    Real invariant: exactly 6 entries, one per DIMENSION_ORDER value, POSITIONALLY in that literal order.
    Per entry: well-shaped (known keys only); status in {KNOWN, UNKNOWN}; KNOWN requires a non-empty
    ``answer`` and FORBIDS ``gap_note``; UNKNOWN FORBIDS ``answer`` from being present AT ALL (even as an
    empty string -- see module docstring) and, if ``gap_note`` is present, it must be genuinely non-empty
    (an explicit blank gap_note is malformed, not "absent", same precision root_cause.kepner_tregoe's own
    "explicit empty is_not is malformed" check already establishes).
    """
    if not isinstance(dimensions, list) or len(dimensions) != len(DIMENSION_ORDER):
        return False, "SHAPE"
    for position, expected_dimension in enumerate(DIMENSION_ORDER):
        entry = dimensions[position]
        if not _shaped(entry, _DIMENSION_REQUIRED_KEYS, _DIMENSION_ALLOWED_KEYS):
            return False, "SHAPE"
        if entry.get("dimension") != expected_dimension:
            return False, "SHAPE"
        status = entry.get("status")
        if status not in _VALID_STATUSES:
            return False, "INVALID_STATUS"
        if not _refs_shape_ok(entry):
            return False, "SHAPE"
        if status == _STATUS_KNOWN:
            if "answer" not in entry or not _is_nonempty_str(entry.get("answer")):
                return False, "KNOWN_MISSING_ANSWER"
            if "gap_note" in entry:
                return False, "KNOWN_HAS_GAP_NOTE"
        else:  # UNKNOWN
            if "answer" in entry:
                return False, "UNKNOWN_HAS_ANSWER"
            if "gap_note" in entry and not _is_nonempty_str(entry.get("gap_note")):
                return False, "SHAPE"  # explicit blank gap_note is malformed, not "absent"
    return True, None


def dimension_entry(
    dimension: str,
    status: str,
    provenance: dict[str, Any],
    *,
    answer: str | None = None,
    gap_note: str | None = None,
    supporting_evidence_refs: list[str] | None = None,
) -> dict[str, Any]:
    """One item of ``typed-objects/5w1h-record.schema.yaml#/properties/dimensions``. A thin convenience
    constructor that emits ONLY the keys the caller actually passed -- it does NOT itself enforce the
    KNOWN/UNKNOWN coherence invariant (``generate_five_w1h_record`` validates whatever dict it is handed
    regardless of how it was built, same "helper is not the invariant boundary" discipline
    ``framing.non_goals``'s own ``excluded_scope_entry`` docstring already establishes -- mutation tests
    build entries directly, bypassing this helper, to prove the constructor itself enforces the invariant).
    """
    record: dict[str, Any] = {"dimension": dimension, "status": status, "provenance": provenance}
    if answer is not None:
        record["answer"] = answer
    if gap_note is not None:
        record["gap_note"] = gap_note
    if supporting_evidence_refs:
        record["supporting_evidence_refs"] = list(supporting_evidence_refs)
    return record


def generate_five_w1h_record(
    record_id: str,
    topic: str,
    dimensions: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
    informs_problem_statement_ref: str | None = None,
) -> dict[str, Any]:
    """Instance of ``typed-objects/5w1h-record.schema.yaml``.

    Enforces the method contract's own preconditions fail-closed, same family-wide "raise-before
    -construction" discipline every sibling module in this suite already establishes -- never a record
    that itself proves it was built illegally. ``information_gaps`` is NOT an accepted parameter: it is
    ALWAYS computed here via ``derive_information_gaps``, so there is no code path through which a caller
    could construct a record whose stored gaps disagree with its own dimensions (see module docstring,
    "structural point, taken literally").
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"FIVEWONEH_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"FIVEWONEH_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(topic):
        raise InvariantViolation(f"FIVEWONEH_EMPTY_TOPIC: topic must be a non-empty string, got {topic!r}")
    if informs_problem_statement_ref is not None and not _is_nonempty_str(informs_problem_statement_ref):
        raise InvariantViolation(
            f"FIVEWONEH_INVALID_INFORMS_PROBLEM_STATEMENT_REF: informs_problem_statement_ref, when present, must be a non-empty string, got {informs_problem_statement_ref!r}"
        )

    dims_ok, dims_reason = _dimensions_are_valid(dimensions)
    if not dims_ok:
        if dims_reason == "INVALID_STATUS":
            raise InvariantViolation(f"FIVEWONEH_INVALID_STATUS: every dimension's status must be one of {sorted(_VALID_STATUSES)}, got {dimensions!r}")
        if dims_reason == "KNOWN_MISSING_ANSWER":
            raise InvariantViolation(f"FIVEWONEH_KNOWN_MISSING_ANSWER: a KNOWN dimension must carry a non-empty 'answer', got {dimensions!r}")
        if dims_reason == "KNOWN_HAS_GAP_NOTE":
            raise InvariantViolation(f"FIVEWONEH_KNOWN_HAS_GAP_NOTE: a KNOWN dimension must NOT carry 'gap_note', got {dimensions!r}")
        if dims_reason == "UNKNOWN_HAS_ANSWER":
            raise InvariantViolation(
                f"FIVEWONEH_UNKNOWN_HAS_ANSWER: an UNKNOWN dimension must NOT carry an 'answer' key at all (not even empty) -- "
                f"that would silently read as 'answered: nothing', got {dimensions!r}"
            )
        raise InvariantViolation(
            f"FIVEWONEH_INVALID_DIMENSION_SET: dimensions must be EXACTLY the six entries {DIMENSION_ORDER} in that literal order, well-shaped, got {dimensions!r}"
        )

    information_gaps = derive_information_gaps(dimensions)

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "topic": topic,
        "dimensions": [dict(d) for d in dimensions],
        "information_gaps": information_gaps,
        "provenance": provenance,
    }
    if informs_problem_statement_ref is not None:
        record["informs_problem_statement_ref"] = informs_problem_statement_ref
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every dimension AND the overall record carry a
    schema-valid provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    dims = record.get("dimensions")
    dims = dims if isinstance(dims, list) else []
    invalid = [d.get("dimension") for d in dims if isinstance(d, dict) and not provenance_is_valid(d.get("provenance"))]
    record_provenance_ok = provenance_is_valid(record.get("provenance"))
    passed = bool(dims) and not invalid and record_provenance_ok
    return _result(
        "provenance_required",
        passed,
        [{"dimensions_checked": len(dims), "invalid_provenance_dimensions": invalid, "record_provenance_valid": record_provenance_ok}],
        validator,
        timestamp,
    )


def evaluate_evidence_labeling_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.evidence_labeling_required: true`` -- same real structural check
    root_cause.kepner_tregoe/framing.smart already use: an EVIDENCE-labeled dimension must actually cite
    supporting_evidence_refs. Only meaningful for KNOWN dimensions (an UNKNOWN dimension has no answer to
    label evidence for); an UNKNOWN dimension is skipped here rather than penalized."""
    dims = record.get("dimensions") if isinstance(record, dict) else None
    dims = dims if isinstance(dims, list) else []
    problems: list[dict[str, Any]] = []
    for d in dims:
        if not isinstance(d, dict) or d.get("status") != _STATUS_KNOWN:
            continue
        epistemic_type = (d.get("provenance") or {}).get("epistemic_type")
        if epistemic_type is None:
            problems.append({"dimension": d.get("dimension"), "reason": "no epistemic_type label"})
            continue
        if epistemic_type == "EVIDENCE" and not d.get("supporting_evidence_refs"):
            problems.append({"dimension": d.get("dimension"), "reason": "labeled EVIDENCE but cites no supporting_evidence_refs"})
    passed = bool(dims) and not problems
    return _result("evidence_labeling_required", passed, [{"dimensions_checked": len(dims), "problems": problems}], validator, timestamp)


def evaluate_five_w1h_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored value
    and does NOT call ``generate_five_w1h_record``, so a hand-tampered record that bypassed the builder
    entirely is caught here exactly as a builder-refused one would have been. In particular, this is the
    ONLY place ``information_gaps`` is checked against reality: re-derives it via
    ``derive_information_gaps`` and compares to the stored value -- a record whose ``dimensions`` were
    edited without recomputing ``information_gaps`` (or vice versa) fails here even though each field is,
    in isolation, individually well-shaped. FAILS CLOSED on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("five_w1h_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("five_w1h_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("five_w1h_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("topic")):
        return _result("five_w1h_integrity", False, [{"reason": "topic missing or empty"}], validator, timestamp)
    ref = record.get("informs_problem_statement_ref")
    if ref is not None and not _is_nonempty_str(ref):
        return _result("five_w1h_integrity", False, [{"reason": "informs_problem_statement_ref present but not a non-empty string"}], validator, timestamp)

    dims_ok, dims_reason = _dimensions_are_valid(record.get("dimensions"))
    if not dims_ok:
        return _result(
            "five_w1h_integrity",
            False,
            [{"reason": f"dimensions invalid ({dims_reason}) -- must be exactly {DIMENSION_ORDER} in that literal order, status/answer/gap_note internally coherent"}],
            validator,
            timestamp,
        )

    dimensions = record["dimensions"]
    recomputed_gaps = derive_information_gaps(dimensions)
    stored_gaps = record.get("information_gaps")
    if not isinstance(stored_gaps, list) or stored_gaps != recomputed_gaps:
        return _result(
            "five_w1h_integrity",
            False,
            [{"reason": "FIVEWONEH_INFORMATION_GAPS_MISMATCH", "stored": stored_gaps, "recomputed": recomputed_gaps}],
            validator,
            timestamp,
        )

    return _result(
        "five_w1h_integrity",
        True,
        [{"dimension_count": len(dimensions), "gap_count": len(recomputed_gaps), "information_gaps": recomputed_gaps}],
        validator,
        timestamp,
    )


def evaluate_five_w1h_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """All three of the contract's real gates, in catalog order: the two declared ``quality`` properties,
    then the independent structural-integrity re-derivation (which also re-derives information_gaps)."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_evidence_labeling_required_gate(record, validator, timestamp),
        evaluate_five_w1h_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
