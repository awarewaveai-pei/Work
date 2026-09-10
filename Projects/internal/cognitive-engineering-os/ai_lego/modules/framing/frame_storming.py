"""``framing.frame_storming`` -- F01 framing family (methods/contracts/framing.frame_storming.contract.yaml),
10th of 11 F01 members, built in parallel with framing.how_might_we / framing.boundary_critique (2 other
concurrent agents, same batch -- not read or depended on here, per this task's own scope boundary).

Atlas's ONLY 2 citations: F01 table row (L343: "Frame Storming｜先 brainstorm 問題框架｜可能解錯問題時｜對同一現象
產生多種問法→分群→選框架｜降低 framing bias｜Boundary Critique") and §28 快速選工具表 (L4468: "不確定真正問題 |
Frame Storming | Problem Statement | SWOT"). Grep-confirmed exactly these 2 hits for "Frame Storming"
case-insensitive in the whole Atlas file -- no dedicated §12.x prose section exists (numbering jumps §12.3
How Might We straight to §12.4 SMART, grep-confirmed).

**Due diligence (VERIFIED before writing):** grepped the whole ``ai_lego`` tree case-insensitively for
"frame_storming"/"frame storming" -- zero pre-existing implementation.

**Structural point, taken literally (not just as a docstring claim):** the F01 table's own "標準使用方式"
column is explicit -- "對同一現象產生多種問法→分群→選框架" (generate MULTIPLE question-forms of the same
phenomenon -> cluster -> select ONE frame). This is a generate-then-select PIPELINE, not a flat record. Three
real invariants, each enforced BOTH at construction (raise BEFORE any record is built) AND independently by a
gate that re-derives from raw fields, same "shared predicate, reused by both layers" discipline every sibling
module in this family already establishes:

1. ``candidate_framings`` has >=2 entries (Atlas's own "多種" -- MULTIPLE -- a single framing is not
   "storming"), every id is unique, and every entry's own ``frame_text`` is genuinely distinct from every
   other (case/whitespace-insensitive) -- near-duplicate re-wordings of the same question are not real
   alternative framings.
2. Every ``candidate_framings`` entry's ``frame_text`` carries substantive content, not a placeholder stub
   (>=6 non-blank characters -- see the typed-object schema's own compilation_decisions for the threshold
   reasoning).
3. ``selected_frame_ref`` MUST equal exactly one ``candidate_framings[].id`` -- the chosen frame is always
   traceable to a generated candidate, never a free-floating selection not grounded in what was generated
   (same "selection must reference a real generated option" invariant class
   ``ai_lego/modules/decision/ice.py``'s own ``ranking[].item_id`` <-> ``items[].id`` cross-reference and
   ``decision.weighted_decision_matrix``'s own "every scores/weights entry references a known option_id"
   precondition already establish for their own generated-option structures).
"""

from __future__ import annotations

import unicodedata
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "framing.frame_storming"
RECORD_ID_PREFIX = "FS-"
MIN_CANDIDATE_FRAMINGS = 2
MIN_FRAME_TEXT_LENGTH = 6

_CANDIDATE_REQUIRED_KEYS = frozenset({"id", "frame_text", "provenance"})
_CANDIDATE_ALLOWED_KEYS = _CANDIDATE_REQUIRED_KEYS | frozenset({"cluster", "supporting_evidence_refs"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _normalize(value: str) -> str:
    """Case/whitespace-insensitive comparison key -- same helper role framing.problem_statement's own
    ``_normalize`` already establishes for its own echo-invariant, reused here for the distinctness check.
    NFKC-normalized first so width-variant characters (e.g. ASCII '?' vs full-width '?') don't defeat
    distinctness (critic finding, 2026-09-10 F01 closeout batch review)."""
    return " ".join(unicodedata.normalize("NFKC", value).strip().casefold().split())


def _refs_shape_ok(entry: dict[str, Any]) -> bool:
    refs = entry.get("supporting_evidence_refs")
    return refs is None or (isinstance(refs, list) and bool(refs) and all(isinstance(r, str) for r in refs))


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- NEVER Python's own recursive ``repr()``, same
    discipline ``ai_lego/modules/decision/ice.py``'s own ``_shallow_describe`` already uses (a bare recursive
    repr over caller-supplied input of unknown size is itself a small denial-of-service surface in an error
    path)."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _candidate_shape_is_valid(entry: Any) -> bool:
    if not isinstance(entry, dict):
        return False
    keys = set(entry.keys())
    if not (_CANDIDATE_REQUIRED_KEYS <= keys <= _CANDIDATE_ALLOWED_KEYS):
        return False
    if not _is_nonempty_str(entry.get("id")):
        return False
    frame_text = entry.get("frame_text")
    if not isinstance(frame_text, str) or not frame_text.strip() or len(frame_text) < MIN_FRAME_TEXT_LENGTH:
        return False
    if "cluster" in entry and not _is_nonempty_str(entry.get("cluster")):
        return False
    if not _refs_shape_ok(entry):
        return False
    return True


def _candidates_are_valid(candidates: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from
    the other -- same discipline every sibling module in this family already establishes.

    Real invariants: >= MIN_CANDIDATE_FRAMINGS well-shaped entries; every id unique; every frame_text
    genuinely distinct from every other (case/whitespace-insensitive) -- a near-duplicate re-wording is not a
    real alternative framing.
    """
    if not isinstance(candidates, list) or len(candidates) < MIN_CANDIDATE_FRAMINGS:
        return False, "TOO_FEW"
    if not all(_candidate_shape_is_valid(c) for c in candidates):
        return False, "SHAPE"
    ids = [c["id"] for c in candidates]
    if len(set(ids)) != len(ids):
        return False, "DUPLICATE_ID"
    normalized_texts = [_normalize(c["frame_text"]) for c in candidates]
    if len(set(normalized_texts)) != len(normalized_texts):
        return False, "DUPLICATE_FRAME_TEXT"
    return True, None


def candidate_framing(
    candidate_id: str,
    frame_text: str,
    provenance: dict[str, Any],
    *,
    cluster: str | None = None,
    supporting_evidence_refs: list[str] | None = None,
) -> dict[str, Any]:
    """One item of ``typed-objects/frame-storming-record.schema.yaml#/properties/candidate_framings``. A thin
    convenience constructor that emits ONLY the keys the caller actually passed -- it does NOT itself enforce
    the >=2/distinctness/selection invariants (``generate_frame_storming_record`` validates whatever list of
    dicts it is handed regardless of how each entry was built), same "helper is not the invariant boundary"
    discipline ``framing.five_w_one_h``'s own ``dimension_entry`` docstring already establishes -- mutation
    tests build entries directly, bypassing this helper, to prove the builder itself enforces the invariants.
    """
    record: dict[str, Any] = {"id": candidate_id, "frame_text": frame_text, "provenance": provenance}
    if cluster is not None:
        record["cluster"] = cluster
    if supporting_evidence_refs:
        record["supporting_evidence_refs"] = list(supporting_evidence_refs)
    return record


def generate_frame_storming_record(
    record_id: str,
    phenomenon: str,
    candidate_framings: list[dict[str, Any]],
    selected_frame_ref: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
    informs_boundary_critique_ref: str | None = None,
) -> dict[str, Any]:
    """Instance of ``typed-objects/frame-storming-record.schema.yaml``. Enforces all three real invariants
    fail-closed, same family-wide "raise-before-construction" discipline every sibling module in this suite
    already establishes -- never a record that itself proves it was built illegally."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"FRAMESTORMING_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"FRAMESTORMING_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(phenomenon):
        raise InvariantViolation(f"FRAMESTORMING_EMPTY_PHENOMENON: phenomenon must be a non-empty string, got {phenomenon!r}")
    if informs_boundary_critique_ref is not None and not _is_nonempty_str(informs_boundary_critique_ref):
        raise InvariantViolation(
            f"FRAMESTORMING_INVALID_INFORMS_BOUNDARY_CRITIQUE_REF: informs_boundary_critique_ref, when present, must be a non-empty string, got {informs_boundary_critique_ref!r}"
        )

    candidates_ok, candidates_reason = _candidates_are_valid(candidate_framings)
    if not candidates_ok:
        if candidates_reason == "TOO_FEW":
            raise InvariantViolation(
                f"FRAMESTORMING_TOO_FEW_CANDIDATES: candidate_framings must carry at least {MIN_CANDIDATE_FRAMINGS} entries -- "
                f"a single framing is not 'storming', got {_shallow_describe(candidate_framings)}"
            )
        if candidates_reason == "DUPLICATE_ID":
            raise InvariantViolation(
                f"FRAMESTORMING_DUPLICATE_CANDIDATE_ID: candidate_framings ids must be unique, got {[c.get('id') for c in candidate_framings]!r}"
            )
        if candidates_reason == "DUPLICATE_FRAME_TEXT":
            raise InvariantViolation(
                "FRAMESTORMING_DUPLICATE_FRAME_TEXT: two or more candidate_framings entries have effectively identical frame_text "
                "(case/whitespace-insensitive) -- genuinely distinct question-forms are required, not near-duplicate re-wordings"
            )
        raise InvariantViolation(
            f"FRAMESTORMING_INVALID_CANDIDATE_SHAPE: every candidate_framings entry must carry a non-empty id, a frame_text of at least "
            f"{MIN_FRAME_TEXT_LENGTH} non-blank characters (not a stub), and a valid provenance, got {_shallow_describe(candidate_framings)}"
        )

    candidate_ids = {c["id"] for c in candidate_framings}
    if not _is_nonempty_str(selected_frame_ref) or selected_frame_ref not in candidate_ids:
        raise InvariantViolation(
            f"FRAMESTORMING_SELECTED_FRAME_NOT_FOUND: selected_frame_ref must equal exactly one candidate_framings[].id "
            f"(a selection not grounded in a generated candidate), got selected_frame_ref={selected_frame_ref!r}, "
            f"known ids={sorted(candidate_ids)!r}"
        )

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "phenomenon": phenomenon,
        "candidate_framings": [dict(c) for c in candidate_framings],
        "selected_frame_ref": selected_frame_ref,
        "provenance": provenance,
    }
    if informs_boundary_critique_ref is not None:
        record["informs_boundary_critique_ref"] = informs_boundary_critique_ref
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every candidate AND the overall record carry a
    schema-valid provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    candidates = record.get("candidate_framings")
    candidates = candidates if isinstance(candidates, list) else []
    invalid = [c.get("id") for c in candidates if isinstance(c, dict) and not provenance_is_valid(c.get("provenance"))]
    record_provenance_ok = provenance_is_valid(record.get("provenance"))
    passed = bool(candidates) and not invalid and record_provenance_ok
    return _result(
        "provenance_required",
        passed,
        [{"candidates_checked": len(candidates), "invalid_provenance_candidates": invalid, "record_provenance_valid": record_provenance_ok}],
        validator,
        timestamp,
    )


def evaluate_evidence_labeling_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.evidence_labeling_required: true`` -- same real structural check
    ``framing.five_w_one_h`` already uses: a candidate labeled EVIDENCE must actually cite
    supporting_evidence_refs."""
    candidates = record.get("candidate_framings") if isinstance(record, dict) else None
    candidates = candidates if isinstance(candidates, list) else []
    problems: list[dict[str, Any]] = []
    for c in candidates:
        if not isinstance(c, dict):
            continue
        epistemic_type = (c.get("provenance") or {}).get("epistemic_type")
        if epistemic_type is None:
            problems.append({"id": c.get("id"), "reason": "no epistemic_type label"})
            continue
        if epistemic_type == "EVIDENCE" and not c.get("supporting_evidence_refs"):
            problems.append({"id": c.get("id"), "reason": "labeled EVIDENCE but cites no supporting_evidence_refs"})
    passed = bool(candidates) and not problems
    return _result("evidence_labeling_required", passed, [{"candidates_checked": len(candidates), "problems": problems}], validator, timestamp)


def evaluate_frame_storming_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives ALL THREE real invariants from the record's OWN raw fields -- does not trust any stored
    value and does NOT call ``generate_frame_storming_record``, so a hand-tampered record that bypassed the
    builder entirely is caught here exactly as a builder-refused one would have been. In particular, this is
    the ONLY place ``selected_frame_ref`` is checked against the actual candidate id set -- a record whose
    ``selected_frame_ref`` was edited to point at a non-existent (or removed) candidate fails here even
    though each field is, in isolation, individually well-shaped. FAILS CLOSED on malformed input rather than
    crashing."""
    if not isinstance(record, dict):
        return _result("frame_storming_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("frame_storming_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("frame_storming_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("phenomenon")):
        return _result("frame_storming_integrity", False, [{"reason": "phenomenon missing or empty"}], validator, timestamp)
    ref = record.get("informs_boundary_critique_ref")
    if ref is not None and not _is_nonempty_str(ref):
        return _result("frame_storming_integrity", False, [{"reason": "informs_boundary_critique_ref present but not a non-empty string"}], validator, timestamp)

    candidates_ok, candidates_reason = _candidates_are_valid(record.get("candidate_framings"))
    if not candidates_ok:
        return _result("frame_storming_integrity", False, [{"reason": f"candidate_framings invalid ({candidates_reason})"}], validator, timestamp)

    candidates = record["candidate_framings"]
    candidate_ids = {c["id"] for c in candidates}
    selected = record.get("selected_frame_ref")
    if not _is_nonempty_str(selected) or selected not in candidate_ids:
        return _result(
            "frame_storming_integrity",
            False,
            [{"reason": "FRAMESTORMING_SELECTED_FRAME_NOT_FOUND", "selected_frame_ref": selected, "known_ids": sorted(candidate_ids)}],
            validator,
            timestamp,
        )

    return _result(
        "frame_storming_integrity",
        True,
        [{"candidate_count": len(candidates), "selected_frame_ref": selected}],
        validator,
        timestamp,
    )


def evaluate_frame_storming_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """All three of the contract's real gates, in catalog order: the two declared ``quality`` properties, then
    the independent structural-integrity re-derivation (which also re-derives the selection-traceability
    check)."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_evidence_labeling_required_gate(record, validator, timestamp),
        evaluate_frame_storming_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
