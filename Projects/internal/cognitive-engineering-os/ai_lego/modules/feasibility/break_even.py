"""``feasibility.break_even`` -- first of two F14 "feasibility & economics" family members built in this batch
(with ``feasibility.npv``, the other F14 row assigned this batch; the family opened fresh, zero prior siblings).

Atlas F14 table row, read directly at L727: "Break-even｜何時損益平衡｜fixed cost/contribution margin→volume｜找
最低可行規模" (Break-even: when does the business reach the point of neither profit nor loss; method: fixed
cost/contribution margin -> volume; benefit: finds the minimum viable scale). No dedicated §12.x narrative section
exists for this row beyond the table itself (grep-confirmed against the full Atlas doc before writing this file --
NPV has §12.28, Break-even does not). Textbook formula, made a real structural invariant rather than an assertable
field::

    break_even_volume_units = fixed_cost / contribution_margin_per_unit

``break_even_volume_units`` is GENUINE_COMPUTE -- ``generate_break_even_analysis`` has no
``break_even_volume_units`` parameter at all (verified by ``tests/unit/test_break_even.py`` via
``inspect.signature``, same idiom ``epistemic.bayesian_updating``'s own ``posterior`` establishes; a caller
attempting ``break_even_volume_units=...`` gets a plain Python ``TypeError``), and
``evaluate_break_even_content_integrity_gate`` independently recomputes it from the record's own stored
``fixed_cost``/``contribution_margin_per_unit`` and FAILs on any mismatch beyond a documented float tolerance
(``_FLOAT_TOLERANCE`` below).

THE real invariant this method exists to guard against: ``contribution_margin_per_unit`` must be strictly greater
than zero. A zero or negative per-unit contribution margin means the business NEVER breaks even at any finite
volume -- each additional unit sold either contributes nothing (zero margin, the ratio is undefined at the exact
boundary a real business would call "never") or actively loses more money as volume grows (negative margin, the
naive ratio would even come out as a nonsense NEGATIVE "break-even volume", which reads as an achievable target
when the true answer is "this product structurally cannot break even by raising volume alone"). Refused with its
own distinct ``BREAKEVEN_NONPOSITIVE_CONTRIBUTION_MARGIN`` code inside ``compute_break_even_volume`` BEFORE the
division ever runs -- never a crash, never a silently-returned negative/zero/inf value presented as a real answer.

Every ``fixed_cost``/``contribution_margin_per_unit`` must be a real, finite number -- Python's ``bool`` is an
``int`` subclass, excluded explicitly (``_is_finite_real_number`` below), matching
``epistemic.bayesian_updating``'s own corrected ``_is_valid_probability`` idiom (``int`` is range-checked/used
directly, never passed through ``math.isfinite``, which raises ``OverflowError`` on a huge ``int``).
``fixed_cost`` is additionally required to be ``>= 0`` (a negative fixed cost is not a real business fact this
method's own Atlas row models); ``contribution_margin_per_unit`` carries no such floor at the validation stage --
its sign is exactly what the real invariant above tests, so a non-positive value must reach that check to produce
the distinct, informative error code rather than being rejected earlier by a generic range check.

Stored/compared with ``round(x, 8)``, matching ``epistemic.bayesian_updating``'s own established rounding
convention for a GENUINE_COMPUTE numeric field in this corpus. Gate re-derivation tolerance is ``1e-9`` -- one
order of magnitude tighter than the 8th-decimal-place unit itself (1e-8), enough to absorb JSON round-trip float
representation noise without masking a real tamper at or above the stored precision.

Grepped the full ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and ``Projects/internal/cognitive-engineering-os``
trees case-insensitively for "break-even"/"break_even"/"contribution margin" before writing any of this method's
own files: the only hits were the Atlas table row itself (L727) and the backlog listing in
``methods/registry/method-inventory.yaml`` (a planned-but-unbuilt entry, not an implementation). Zero pre-existing
implementation found.
"""

from __future__ import annotations

import copy
import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "feasibility.break_even"
RECORD_ID_PREFIX = "BEVEN-"

# Compilation decision (disclosed, module docstring): storage rounds to 8dp, so a 1e-9 gate tolerance is one order
# of magnitude tighter than that unit -- absorbs float round-trip noise, never masks a real tamper.
_FLOAT_TOLERANCE = 1e-9

_STORED_KEYS = frozenset({"id", "version", "generated_by_method", "subject_ref", "fixed_cost", "contribution_margin_per_unit", "break_even_volume_units", "provenance"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_finite_real_number(value: Any) -> bool:
    """A real, finite number -- ``bool`` excluded (Python's ``bool`` is an ``int`` subclass, the same documented
    trap ``epistemic.bayesian_updating``'s own ``_is_valid_probability`` guards against). ``int`` is unconditionally
    finite in Python (arbitrary precision, never inf/nan) and is accepted directly rather than passed through
    ``math.isfinite`` -- that function raises ``OverflowError`` on a huge ``int``, a trap only reachable via the
    ``float`` branch below."""
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    return False


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline every prior module in this corpus establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def compute_break_even_volume(fixed_cost: float, contribution_margin_per_unit: float) -> float:
    """GENUINE_COMPUTE: ``fixed_cost / contribution_margin_per_unit``. Never accepted as an input -- always
    derived here, and independently re-derived by ``evaluate_break_even_content_integrity_gate``. Raises
    ``BREAKEVEN_NONPOSITIVE_CONTRIBUTION_MARGIN`` (not ``ZeroDivisionError``, not a silent negative/inf value)
    when ``contribution_margin_per_unit <= 0`` -- a non-positive per-unit margin means no finite volume ever
    breaks even, not a valid (if unusual) answer. Result rounded to 8 decimal places (module docstring). Callers
    must validate each argument is a real finite number BEFORE calling this (``_is_finite_real_number``) -- this
    function trusts its own two numeric arguments, the same "pure compute, validated inputs only" boundary
    ``epistemic.bayesian_updating``'s own ``compute_posterior`` already establishes."""
    if contribution_margin_per_unit <= 0:
        raise InvariantViolation(
            f"BREAKEVEN_NONPOSITIVE_CONTRIBUTION_MARGIN: contribution_margin_per_unit={contribution_margin_per_unit!r} is <= 0 "
            "-- a non-positive per-unit contribution margin means this business never breaks even at any finite volume, not a computable answer"
        )
    return round(fixed_cost / contribution_margin_per_unit, 8)


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_break_even_analysis(
    record_id: str,
    subject_ref: str,
    fixed_cost: float,
    contribution_margin_per_unit: float,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/break-even-analysis.schema.yaml``.

    Deliberately has NO ``break_even_volume_units`` parameter -- GENUINE_COMPUTE via
    ``compute_break_even_volume``, never caller-supplied (verified by ``tests/unit/test_break_even.py`` via
    ``inspect.signature``; a caller attempting a ``break_even_volume_units=`` keyword argument gets a plain
    ``TypeError``). Enforces all real invariants fail-closed, in order: id/version/provenance shape, then
    subject_ref, then fixed_cost/contribution_margin_per_unit numeric validity, then the break-even computation
    itself (raises ``BREAKEVEN_NONPOSITIVE_CONTRIBUTION_MARGIN`` on a non-positive margin -- never crashes, never
    silently returns a negative/inf value). ``provenance`` is deep-copied at the return site -- never returned by
    reference (a caller mutating their own original ``provenance`` dict afterward must not retroactively change
    this record).
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"BREAKEVEN_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"BREAKEVEN_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"BREAKEVEN_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")
    if not _is_nonempty_str(subject_ref):
        raise InvariantViolation(f"BREAKEVEN_INVALID_SUBJECT_REF: subject_ref must be a non-empty string, got {subject_ref!r}")
    if not _is_finite_real_number(fixed_cost) or fixed_cost < 0:
        raise InvariantViolation(f"BREAKEVEN_INVALID_FIXED_COST: fixed_cost must be a real finite number >= 0 (bool excluded), got {fixed_cost!r}")
    if not _is_finite_real_number(contribution_margin_per_unit):
        raise InvariantViolation(f"BREAKEVEN_INVALID_CONTRIBUTION_MARGIN: contribution_margin_per_unit must be a real finite number (bool excluded), got {contribution_margin_per_unit!r}")

    break_even_volume_units = compute_break_even_volume(fixed_cost, contribution_margin_per_unit)

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "subject_ref": subject_ref,
        "fixed_cost": fixed_cost,
        "contribution_margin_per_unit": contribution_margin_per_unit,
        "break_even_volume_units": break_even_volume_units,
        "provenance": copy.deepcopy(provenance),
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_break_even_analysis -- a hand-tampered record that bypassed the builder entirely must be caught exactly
# as a builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance is schema-valid.
    Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_break_even_content_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_break_even_analysis``, so a hand-tampered record (e.g. a spliced-in wrong
    ``break_even_volume_units``, or one whose stored ``contribution_margin_per_unit`` is actually non-positive) is
    caught here exactly as a builder-refused one would have been. Fails closed on malformed input rather than
    crashing."""
    if not isinstance(record, dict):
        return _result("break_even_content_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("break_even_content_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("break_even_content_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    unknown_keys = set(record.keys()) - _STORED_KEYS
    missing_keys = (_STORED_KEYS - {"generated_by_method"}) - set(record.keys())
    if unknown_keys or missing_keys:
        return _result(
            "break_even_content_integrity",
            False,
            [{"reason": f"record key set mismatch -- unknown={sorted(unknown_keys)}, missing={sorted(missing_keys)}"}],
            validator,
            timestamp,
        )

    problems: list[str] = []
    if not _is_nonempty_str(record.get("subject_ref")):
        problems.append("subject_ref missing, empty, or not a string")

    fixed_cost, contribution_margin_per_unit = record.get("fixed_cost"), record.get("contribution_margin_per_unit")
    if not _is_finite_real_number(fixed_cost) or (isinstance(fixed_cost, (int, float)) and not isinstance(fixed_cost, bool) and fixed_cost < 0):
        problems.append(f"fixed_cost is not a valid finite number >= 0: {fixed_cost!r}")
    if not _is_finite_real_number(contribution_margin_per_unit):
        problems.append(f"contribution_margin_per_unit is not a valid finite number: {contribution_margin_per_unit!r}")

    if problems:
        return _result("break_even_content_integrity", False, [{"problems": problems}], validator, timestamp)

    try:
        expected_volume = compute_break_even_volume(fixed_cost, contribution_margin_per_unit)
    except InvariantViolation as error:
        problems.append(f"break_even_volume_units is undefined for the record's own stored inputs: {error}")
        return _result("break_even_content_integrity", False, [{"problems": problems}], validator, timestamp)

    stored_volume = record.get("break_even_volume_units")
    if not isinstance(stored_volume, (int, float)) or isinstance(stored_volume, bool) or abs(stored_volume - expected_volume) > _FLOAT_TOLERANCE:
        problems.append(f"break_even_volume_units={stored_volume!r} does not match recomputed {expected_volume!r} (tolerance {_FLOAT_TOLERANCE})")

    return _result("break_even_content_integrity", not problems, [{"problems": problems}], validator, timestamp)


def evaluate_break_even_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_break_even_content_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
