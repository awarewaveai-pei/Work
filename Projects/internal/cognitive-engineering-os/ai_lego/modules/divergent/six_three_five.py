"""``divergent.six_three_five`` -- F03 divergent-ideation family, one of 10 agents opening independent F03
members in this same parallel batch (family previously entirely unbuilt; grep-confirmed zero pre-existing
``ai_lego/modules/divergent/`` implementation of this method before writing this file; sibling members
built concurrently in the same batch -- disjoint files, no shared state).

**Naming, due-diligence finding:** the human-facing method name is "6-3-5", but
``specs/cognitive/method.schema.yaml``'s own ``id`` field requires pattern ``^[a-z_]+\\.[a-z_]+$``
(letters/underscore only -- grep-confirmed zero digit in any existing contract ``id`` value in this suite).
``divergent.6-3-5`` would FAIL that pattern. This module, its ``METHOD_ID`` constant, and its own filename
therefore spell the method out as ``six_three_five``, the same digit-avoidance precedent
``root_cause.five_whys``/``framing.five_w_one_h`` already set for this exact class of naming collision.
``RECORD_ID_PREFIX`` below preserves the human-facing "6-3-5" form as ``SIXTHREEFIVE-`` (record ids are
free strings with no method-id character-set constraint).

Atlas cites this method ONCE: the F03 tool table row (L381: "6-3-5｜結構化大量 ideation｜6 人×3 idea×5 分鐘，
輪傳延伸｜快速得到大量變體｜人數可調整") -- grep-confirmed the only hit, no dedicated section, and F03's own
table header has no "最佳搭配" column at all (unlike F02/F08).

Two real invariants, each enforced BOTH at construction (raise BEFORE any record is built) AND
independently by a gate that re-derives from raw fields, same "shared predicate, reused by both layers"
discipline every sibling module in this suite already establishes. Unlike ``decomposition.mece``'s
overlaps/gaps/is_mece or ``strategy.bcg_matrix``'s quadrant, NEITHER invariant here produces a stored
derived VALUE field -- both are pure structural VALIDITY facts (same "no stored field" class
``framing.five_w_one_h``'s own dimension KNOWN/UNKNOWN coherence invariant already establishes): there is
nothing to compute-and-store, only something to verify and refuse if false. Consequently this module does
NOT carry ``engine``/``computation_provenance_ref`` record-level fields (see
``typed-objects/six-three-five-session.schema.yaml``'s own compilation_decisions).

1. Every ``sheets[].rounds[].ideas`` entry has EXACTLY 3 non-empty strings -- Atlas's own literal "3 idea"
   per round-per-person. NOT adjustable like headcount (the SAME row names only headcount as adjustable via
   "人數可調整").
2. For EVERY sheet, the multiset of that sheet's own ``rounds[].contributor_id`` equals EXACTLY the full
   ``participant_ids`` set -- Atlas's own literal "輪傳延伸" (rotate-and-extend) full-rotation completeness
   this method's own name encodes. A sheet missing a participant, or a participant appearing twice on one
   sheet, is a REAL structural defect (unlike ``decomposition.mece``'s own ``is_mece: false``, which Atlas's
   own §12.7 caution makes a LEGAL outcome) -- refused at construction, never recorded as a partial result.

Headcount ("6" in the method's name) is the row's own named DEFAULT, not a hard requirement -- Atlas's own
caution "人數可調整" -- so ``participant_ids`` is open-ended (``minItems: 2``), never hardcoded to 6.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "divergent.six_three_five"
RECORD_ID_PREFIX = "SIXTHREEFIVE-"

_IDEAS_PER_ROUND = 3
# Atlas's own literal "3 idea" (L381) -- NOT adjustable, unlike headcount. A module-level constant, not a
# magic number, so both the builder and the gate reference the SAME value.

_ROUND_REQUIRED_KEYS = frozenset({"round_number", "contributor_id", "ideas"})
_SHEET_REQUIRED_KEYS = frozenset({"sheet_id", "rounds"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _unique_nonempty_str_list(value: Any, *, min_items: int) -> bool:
    """Shared predicate: a list of >= ``min_items`` unique, non-empty strings. Called by BOTH the builder and
    the gate for ``participant_ids``."""
    if not isinstance(value, list) or len(value) < min_items:
        return False
    if not all(_is_nonempty_str(v) for v in value):
        return False
    return len(value) == len(set(value))


def _ideas_are_valid(value: Any) -> bool:
    """Real invariant #1's own shared predicate: EXACTLY 3 non-empty strings. Called by BOTH the builder and
    the gate -- neither can drift from the other. Rejects 2 ideas, 4 ideas, non-string entries, and
    blank/whitespace-only strings alike."""
    if not isinstance(value, list) or len(value) != _IDEAS_PER_ROUND:
        return False
    return all(_is_nonempty_str(v) for v in value)


def _round_shape_is_valid(entry: Any) -> bool:
    """Shared predicate: exactly the three known keys, round_number a positive int, contributor_id a
    non-empty string, ideas real invariant #1-valid. Does NOT check contributor_id against participant_ids
    (that is a cross-round, per-sheet check -- see ``_sheet_rotation_is_complete``)."""
    if not isinstance(entry, dict) or set(entry.keys()) != _ROUND_REQUIRED_KEYS:
        return False
    round_number = entry.get("round_number")
    if not isinstance(round_number, int) or isinstance(round_number, bool) or round_number < 1:
        return False
    if not _is_nonempty_str(entry.get("contributor_id")):
        return False
    return _ideas_are_valid(entry.get("ideas"))


def _sheet_rotation_is_complete(rounds: list[dict[str, Any]], participant_ids: list[str]) -> bool:
    """Real invariant #2's own shared predicate: this sheet's own rounds' contributor_id multiset equals
    EXACTLY the full participant_ids set -- no participant missing, none appearing twice. A sorted-list
    comparison (not a set comparison) is deliberate: it catches BOTH a missing participant (list too short /
    wrong members) AND a participant appearing twice (list too long / a duplicate), the same "count matters,
    not just membership" precision decomposition.mece's own overlaps detection already establishes for a
    structurally different check. Called by BOTH the builder and the gate."""
    contributor_ids = [r["contributor_id"] for r in rounds]
    return sorted(contributor_ids) == sorted(participant_ids)


def _sheet_shape_is_valid(sheet: Any) -> bool:
    """Shared predicate: exactly the two known keys, non-empty sheet_id, rounds a non-empty list of
    shape-valid round entries. Does NOT check rotation completeness (see ``_sheet_rotation_is_complete``,
    called separately once ``participant_ids`` is known to be valid)."""
    if not isinstance(sheet, dict) or set(sheet.keys()) != _SHEET_REQUIRED_KEYS:
        return False
    if not _is_nonempty_str(sheet.get("sheet_id")):
        return False
    rounds = sheet.get("rounds")
    if not isinstance(rounds, list) or not rounds:
        return False
    return all(_round_shape_is_valid(r) for r in rounds)


def _sheets_are_valid(sheets: Any, participant_ids: list[str]) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from
    the other. Real invariant: a non-empty list, every sheet shape-valid, no two sheets sharing the same
    sheet_id, and EVERY sheet's own rotation complete against participant_ids."""
    if not isinstance(sheets, list) or not sheets:
        return False, "SHAPE"
    if not all(_sheet_shape_is_valid(s) for s in sheets):
        return False, "SHAPE"
    sheet_ids = [s["sheet_id"] for s in sheets]
    if len(sheet_ids) != len(set(sheet_ids)):
        return False, "DUPLICATE_SHEET_ID"
    for sheet in sheets:
        if not _sheet_rotation_is_complete(sheet["rounds"], participant_ids):
            return False, "INCOMPLETE_ROTATION"
    return True, None


def round_entry(round_number: int, contributor_id: str, ideas: list[str]) -> dict[str, Any]:
    """One INPUT entry for ``sheet``'s own ``rounds`` parameter. Convenience constructor only -- does NOT
    itself enforce the cross-round full-rotation invariant (checked by ``generate_six_three_five_session``
    once the whole sheet and participant_ids are known), same "helper is not the invariant boundary"
    discipline ``decomposition.mece``'s own ``category`` constructor already establishes."""
    if not isinstance(round_number, int) or isinstance(round_number, bool) or round_number < 1:
        raise InvariantViolation(f"SIXTHREEFIVE_INVALID_ROUND_NUMBER: round_number must be a positive int, got {round_number!r}")
    if not _is_nonempty_str(contributor_id):
        raise InvariantViolation(f"SIXTHREEFIVE_EMPTY_CONTRIBUTOR_ID: contributor_id must be a non-empty string, got {contributor_id!r}")
    if not _ideas_are_valid(ideas):
        raise InvariantViolation(f"SIXTHREEFIVE_INVALID_IDEAS_COUNT: ideas must be a list of EXACTLY {_IDEAS_PER_ROUND} non-empty strings (Atlas's own literal '3 idea'), got {ideas!r}")
    return {"round_number": round_number, "contributor_id": contributor_id, "ideas": list(ideas)}


def sheet(sheet_id: str, rounds: list[dict[str, Any]]) -> dict[str, Any]:
    """One INPUT entry for ``generate_six_three_five_session``'s own ``sheets`` parameter. Convenience
    constructor only -- does NOT itself enforce full-rotation completeness (checked once participant_ids is
    known, by ``generate_six_three_five_session``), same split ``round_entry`` above establishes."""
    if not _is_nonempty_str(sheet_id):
        raise InvariantViolation(f"SIXTHREEFIVE_EMPTY_SHEET_ID: sheet_id must be a non-empty string, got {sheet_id!r}")
    if not isinstance(rounds, list) or not rounds or not all(_round_shape_is_valid(r) for r in rounds):
        raise InvariantViolation(f"SIXTHREEFIVE_INVALID_ROUNDS: rounds must be a non-empty list of well-shaped round entries, got {rounds!r}")
    return {"sheet_id": sheet_id, "rounds": [dict(r) for r in rounds]}


def generate_six_three_five_session(
    session_id: str,
    participant_ids: list[str],
    sheets: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/six-three-five-session.schema.yaml``.

    Enforces the method contract's own structural preconditions fail-closed: ``participant_ids`` >= 2
    distinct non-empty entries, ``sheets`` a non-empty list of shape-valid entries with no two sheets
    sharing a ``sheet_id``, and EVERY sheet's own rounds' contributor_id multiset equal EXACTLY to
    ``participant_ids`` (real invariant #2) with every round carrying exactly 3 non-empty ideas (real
    invariant #1). Neither invariant is a builder parameter with a caller-suppliable override -- there is no
    code path through which a caller could construct a record that violates either fact; a hand-tampered
    record that bypasses this builder entirely is instead caught by
    ``evaluate_six_three_five_integrity_gate`` below.
    """
    if not _is_nonempty_str(session_id) or not session_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"SIXTHREEFIVE_INVALID_ID: session_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {session_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"SIXTHREEFIVE_INVALID_VERSION: version must be a string, got {version!r}")
    if not _unique_nonempty_str_list(participant_ids, min_items=2):
        raise InvariantViolation(
            f"SIXTHREEFIVE_INVALID_PARTICIPANTS: participant_ids must be a list of >=2 unique, non-empty strings "
            f"(a solo session has no rotation to perform), got {participant_ids!r}"
        )

    sheets_ok, sheets_reason = _sheets_are_valid(sheets, participant_ids)
    if not sheets_ok:
        if sheets_reason == "DUPLICATE_SHEET_ID":
            raise InvariantViolation(f"SIXTHREEFIVE_DUPLICATE_SHEET_ID: two or more sheets share the same sheet_id, got {sheets!r}")
        if sheets_reason == "INCOMPLETE_ROTATION":
            raise InvariantViolation(
                f"SIXTHREEFIVE_INCOMPLETE_ROTATION: every sheet's own rounds must be contributed by EACH participant EXACTLY ONCE "
                f"(Atlas's own literal '輪傳延伸' full-rotation completeness) -- a sheet here is missing a participant or has one appearing "
                f"twice, participant_ids={participant_ids!r}, sheets={sheets!r}"
            )
        raise InvariantViolation(
            f"SIXTHREEFIVE_INVALID_SHEETS: sheets must be a non-empty list of {{sheet_id, rounds}} entries, each round carrying "
            f"round_number/contributor_id/ideas (ideas EXACTLY {_IDEAS_PER_ROUND} non-empty strings), got {sheets!r}"
        )

    rebuilt_sheets = [
        {
            "sheet_id": s["sheet_id"],
            "rounds": [
                {"round_number": r["round_number"], "contributor_id": r["contributor_id"], "ideas": list(r["ideas"])}
                for r in s["rounds"]
            ],
        }
        for s in sheets
    ]

    return {
        "id": session_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "participant_ids": list(participant_ids),
        "sheets": rebuilt_sheets,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance is
    schema-valid. Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_six_three_five_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored value
    and does NOT call ``generate_six_three_five_session``, so a hand-tampered record that bypassed the
    builder entirely is caught here exactly as a builder-refused one would have been. FAILS CLOSED on
    malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("six_three_five_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("six_three_five_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("six_three_five_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    participant_ids = record.get("participant_ids")
    if not _unique_nonempty_str_list(participant_ids, min_items=2):
        return _result(
            "six_three_five_integrity",
            False,
            [{"reason": "participant_ids missing, not a list, fewer than 2 entries, or containing a duplicate/non-string entry"}],
            validator,
            timestamp,
        )

    sheets = record.get("sheets")
    sheets_ok, sheets_reason = _sheets_are_valid(sheets, participant_ids)
    if not sheets_ok:
        return _result(
            "six_three_five_integrity",
            False,
            [{"reason": f"sheets invalid ({sheets_reason}) -- must be a non-empty list of well-shaped, uniquely-sheet_id'd entries, each fully rotated through participant_ids, each round carrying exactly {_IDEAS_PER_ROUND} non-empty ideas"}],
            validator,
            timestamp,
        )

    return _result(
        "six_three_five_integrity",
        True,
        [{"participant_count": len(participant_ids), "sheet_count": len(sheets)}],
        validator,
        timestamp,
    )


def evaluate_six_three_five_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the one declared ``quality`` property (evidence
    labeling is NOT required -- see contract), then the independent structural integrity re-derivation."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_six_three_five_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
