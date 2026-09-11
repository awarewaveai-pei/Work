"""``challenge.devils_advocate`` -- F12 challenge/red-team/risk family, fourth built member (after
red_team/blue_team/independent_judge).

Atlas §12.21 (L2803-2809, the only dedicated section) is brief: 用途「刻意建立『如果主流觀點是錯的』的
最強版本」(deliberately build the strongest version of "what if the mainstream view is wrong"), 效益
「防 groupthink」, plus an explicit scope line (L2807, verbatim): "Devil's Advocate 側重觀點與論證；Red
Team 可以攻擊整個系統、流程、控制與實作" (Devil's Advocate focuses on a VIEWPOINT/ARGUMENT; Red Team can
attack an entire system/process/controls/implementation). That differentiation is why this module's
record shape does NOT borrow ``red_team.py``'s 11-dimension checklist/findings shape -- doing so would
misrepresent the exact boundary Atlas draws between the two methods.

Real invariants, ALL re-derived independently at both construction time and gate time (never trusting a
stored flag), same two-layer discipline ``red_team.py``/``game_theory.py`` already establish in this
corpus:

1. **mainstream_position / alternative_position are both required non-empty strings, and must be
   substantively DIFFERENT after normalization** (``DEVADV_INVALID_MAINSTREAM_POSITION`` /
   ``DEVADV_INVALID_ALTERNATIVE_POSITION`` / ``DEVADV_POSITIONS_NOT_DISTINCT``): a DevilsAdvocatePosition
   whose "alternative" is just a copy of the mainstream position (module whitespace/case aside) did not
   actually argue anything.
2. **supporting_arguments must contain AT LEAST ONE non-empty entry**
   (``DEVADV_NO_SUPPORTING_ARGUMENTS`` / ``DEVADV_INVALID_SUPPORTING_ARGUMENT``): Atlas's own 用途 says
   "建...最強版本" (build the STRONGEST version) -- an alternative position asserted with zero supporting
   arguments is a bare assertion, not a steelman.

No numeric field exists on this record (no confidence score, no severity scale -- Atlas §12.21 gives
neither), so the corpus-wide ``isinstance(x, bool)``-before-``isinstance(x, int)`` trap
(``game_theory.py``'s own ``_is_number_excluding_bool``) does not apply here; noted rather than silently
omitted.

Grepped the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` trees case-insensitively for
"devils_advocate"/"DEVADV"/"DevilsAdvocate"/"devils-advocate" before writing any of this method's own
files: zero pre-existing implementation, zero contract-backlog entry.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "challenge.devils_advocate"
RECORD_ID_PREFIX = "DEVADV-"
_STORED_CONTENT_KEYS = frozenset({"id", "version", "generated_by_method", "mainstream_position", "alternative_position", "supporting_arguments", "provenance"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _normalize(value: str) -> str:
    """Strip + casefold -- the minimum normalization this method's own invariant requires (module
    docstring). Casefold rather than lower(): correct for non-ASCII case-folding edge cases that
    ``str.lower()`` misses, same choice made wherever this corpus needs case-insensitive comparison."""
    return value.strip().casefold()


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over
    caller-supplied input of unknown size, same discipline ``game_theory.py``/``jtbd``/``bcg_matrix``
    already establish in this corpus."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _validate_supporting_arguments(supporting_arguments: Any) -> list[str]:
    """Returns the validated list, or raises. THE real invariant this method exists to enforce (module
    docstring point 2): Atlas's own 'strongest version' framing requires actual argument content."""
    if not isinstance(supporting_arguments, list) or not supporting_arguments:
        raise InvariantViolation(
            f"DEVADV_NO_SUPPORTING_ARGUMENTS: supporting_arguments must be a non-empty list -- an alternative position "
            f"asserted with zero supporting arguments is a bare assertion, not the 'strongest version' Atlas L2805 "
            f"requires, got {_shallow_describe(supporting_arguments)}"
        )
    for index, argument in enumerate(supporting_arguments):
        if not _is_nonempty_str(argument):
            raise InvariantViolation(f"DEVADV_INVALID_SUPPORTING_ARGUMENT: supporting_arguments[{index}] must be a non-empty string, got {argument!r}")
    return list(supporting_arguments)


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_devils_advocate_position(
    record_id: str,
    mainstream_position: str,
    alternative_position: str,
    supporting_arguments: list[str],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/devils-advocate-position.schema.yaml``.

    Enforces all real invariants fail-closed, in order: id/version/provenance shape, then
    mainstream_position and alternative_position each non-empty, then the cross-field distinctness
    invariant (the two positions must differ after normalization -- Atlas §12.21's own scope line, L2807,
    is why this stays argument-level rather than borrowing Red Team's system-attack checklist shape), and
    only THEN supporting_arguments completeness (at least one real argument). A position that merely
    restates the mainstream view under a different label is refused before its supporting arguments are
    even inspected.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"DEVADV_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"DEVADV_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"DEVADV_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    if not _is_nonempty_str(mainstream_position):
        raise InvariantViolation(f"DEVADV_INVALID_MAINSTREAM_POSITION: mainstream_position must be a non-empty string, got {mainstream_position!r}")
    if not _is_nonempty_str(alternative_position):
        raise InvariantViolation(f"DEVADV_INVALID_ALTERNATIVE_POSITION: alternative_position must be a non-empty string, got {alternative_position!r}")
    if _normalize(mainstream_position) == _normalize(alternative_position):
        raise InvariantViolation(
            "DEVADV_POSITIONS_NOT_DISTINCT: alternative_position normalizes to the same text as mainstream_position -- "
            "a Devil's Advocate record where the 'alternative' is just a copy of the mainstream position did not "
            "actually argue anything (Atlas L2807's own viewpoint/argument scope)"
        )

    validated_arguments = _validate_supporting_arguments(supporting_arguments)

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "mainstream_position": mainstream_position,
        "alternative_position": alternative_position,
        "supporting_arguments": validated_arguments,
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never
# call generate_devils_advocate_position -- a hand-tampered record that bypassed the builder entirely must
# be caught exactly as a builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance is
    schema-valid. Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_devils_advocate_content_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant from the record's OWN raw fields -- does not trust any stored value
    and does NOT call ``generate_devils_advocate_position``, so a hand-tampered record that bypassed the
    builder entirely (e.g. ``alternative_position`` overwritten to match ``mainstream_position`` after
    construction, or ``supporting_arguments`` emptied out) is caught here exactly as a builder-refused one
    would have been. Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("devils_advocate_content_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)

    unknown_keys = set(record.keys()) - _STORED_CONTENT_KEYS
    missing_keys = (_STORED_CONTENT_KEYS - {"generated_by_method"}) - set(record.keys())
    if unknown_keys or missing_keys:
        return _result(
            "devils_advocate_content_integrity",
            False,
            [{"reason": f"record key set mismatch -- unknown={sorted(unknown_keys)}, missing={sorted(missing_keys)}"}],
            validator,
            timestamp,
        )

    problems: list[str] = []
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        problems.append(f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}")
    if not isinstance(record.get("version"), str):
        problems.append("version missing or not a string")

    mainstream = record.get("mainstream_position")
    alternative = record.get("alternative_position")
    if not _is_nonempty_str(mainstream):
        problems.append("mainstream_position missing or empty")
    if not _is_nonempty_str(alternative):
        problems.append("alternative_position missing or empty")
    if _is_nonempty_str(mainstream) and _is_nonempty_str(alternative) and _normalize(mainstream) == _normalize(alternative):
        problems.append("alternative_position normalizes to the same text as mainstream_position (DEVADV_POSITIONS_NOT_DISTINCT)")

    try:
        _validate_supporting_arguments(record.get("supporting_arguments"))
    except InvariantViolation as error:
        problems.append(str(error))

    return _result("devils_advocate_content_integrity", not problems, [{"problems": problems}], validator, timestamp)


def evaluate_devils_advocate_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_devils_advocate_content_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
