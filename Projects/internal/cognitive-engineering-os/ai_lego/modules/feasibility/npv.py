"""``feasibility.npv`` -- second of two F14 "feasibility & economics" family members built in this batch (with
``feasibility.break_even``, the other F14 row assigned this batch; sibling ``break_even.py`` opened the family's
own ``__init__.py``, left alone here).

Atlas F14 table row, read directly at L728: "NPV｜折現未來現金流｜cash flows→discount rate→NPV｜比較不同時間投資"
(NPV: discount future cash flows; method: cash flows -> discount rate -> NPV; benefit: compare investments across
different time horizons). Atlas §12.28 (L2902-2909) gives a brief narrative section for this row ("把不同時間的
cash flow 折成可比較的今天價值" / "discount cash flows at different times into a comparable value today") but no
worked formula -- §13's own recipe text ("NPV + Sensitivity + Scenario + Monte Carlo") is a pipeline-composition
reference, not a definition, and is stated here plainly rather than silently treated as this method's own source.
Textbook Net Present Value formula, made a real structural invariant rather than an assertable field::

    npv = sum(cash_flows[i].amount / (1 + discount_rate) ** cash_flows[i].period for i in cash_flows)

``npv`` is GENUINE_COMPUTE -- ``generate_npv_analysis`` has no ``npv`` parameter at all (verified by
``tests/unit/test_npv.py`` via ``inspect.signature``, same idiom ``epistemic.bayesian_updating``'s own
``posterior``/sibling ``feasibility.break_even``'s own ``break_even_volume_units`` establish; a caller attempting
``npv=...`` gets a plain Python ``TypeError``), and ``evaluate_npv_content_integrity_gate`` independently
recomputes it from the record's own stored ``cash_flows``/``discount_rate`` and FAILs on any mismatch beyond a
documented float tolerance (``_FLOAT_TOLERANCE`` below).

THE real numerical trap this method exists to guard against: ``discount_rate`` must be strictly greater than -1.
At exactly ``discount_rate == -1``, the formula's own denominator ``(1 + discount_rate) ** period`` is 0 for every
``period > 0`` -- an undefined (division-by-zero) NPV, not a valid answer; below -1, ``(1 + discount_rate)`` is
negative, and raising a negative base to a non-integer exponent is undefined over the reals (this method's own
``period`` field is always a non-negative int, so that specific sub-case cannot arise here, but the refusal at
``<= -1`` is stated as a blanket rule rather than one that quietly depends on every future caller's periods staying
integral). Refused with its own distinct ``NPV_INVALID_DISCOUNT_RATE`` code inside ``compute_npv`` BEFORE any
division ever runs -- never a crash, never a silently-returned inf/nan value presented as a real answer.

A second real invariant: ``cash_flows[].period`` values must be unique within one record. Two entries both
claiming to be "period 0" (or any other period) is a malformed timeline, not a valid multi-flow schedule -- Atlas's
own pipeline text names a single ordered sequence of cash flows, and a duplicate period cannot be summed
unambiguously into that sequence. Refused with ``NPV_DUPLICATE_PERIOD``.

Every ``cash_flows[].period`` must be a real, non-negative ``int`` -- ``bool`` excluded (Python's ``bool`` is an
``int`` subclass, the same documented trap ``epistemic.bayesian_updating``'s own ``_is_valid_probability``
guards against); every ``cash_flows[].amount`` and ``discount_rate`` must be a real, finite number, ``bool``
excluded (``_is_finite_real_number`` below, identical idiom to sibling ``feasibility.break_even``).

Stored/compared with ``round(x, 8)``, matching ``epistemic.bayesian_updating``'s and sibling
``feasibility.break_even``'s own established rounding convention for a GENUINE_COMPUTE numeric field in this
corpus (a disclosed compilation decision: real-world monetary NPV is usually reported to 2dp, but this is a
computed record field feeding an independent gate re-derivation, not a currency display value -- see
``methods/contracts/feasibility.npv.contract.yaml`` compilation_decisions). Gate re-derivation tolerance is
``1e-9`` -- one order of magnitude tighter than the 8th-decimal-place unit itself (1e-8), enough to absorb JSON
round-trip float representation noise (proven by ``tests/unit/test_npv.py``'s explicit tiny-noise-passes case)
without masking a real tamper at or above the stored precision (proven by that same test suite's explicit
1%-off-true-value-fails case).

Grepped the full ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and ``Projects/internal/cognitive-engineering-os``
trees case-insensitively for "npv"/"net present value"/"discount rate"/"cash flow" before writing any of this
method's own files: the only hits were the Atlas table row (L728) and narrative section (L2902-2909), and the
backlog listing in ``methods/registry/method-inventory.yaml`` (a planned-but-unbuilt entry, not an
implementation). Zero pre-existing implementation found.
"""

from __future__ import annotations

import copy
import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "feasibility.npv"
RECORD_ID_PREFIX = "NPV-"

# Compilation decision (disclosed, module docstring): storage rounds to 8dp, so a 1e-9 gate tolerance is one order
# of magnitude tighter than that unit -- absorbs float round-trip noise, never masks a real tamper.
_FLOAT_TOLERANCE = 1e-9

_STORED_KEYS = frozenset({"id", "version", "generated_by_method", "subject_ref", "cash_flows", "discount_rate", "npv", "provenance"})
_CASH_FLOW_ENTRY_KEYS = frozenset({"period", "amount"})


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


def _is_valid_period(value: Any) -> bool:
    """A real, non-negative ``int`` -- ``bool`` excluded. Periods are ordinal counters (0, 1, 2, ...), never a
    float or a boolean."""
    if isinstance(value, bool):
        return False
    return isinstance(value, int) and value >= 0


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline every prior module in this corpus establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _validate_cash_flows_shape(cash_flows: Any) -> list[str]:
    """Structural validation shared by the builder and the gate: returns a list of problem strings (empty means
    valid). Never raises -- callers decide whether a problem list means "refuse at construction" or "gate FAIL"."""
    problems: list[str] = []
    if not isinstance(cash_flows, list) or not cash_flows:
        return ["cash_flows must be a non-empty list"]
    seen_periods: set[int] = set()
    for index, entry in enumerate(cash_flows):
        if not isinstance(entry, dict):
            problems.append(f"cash_flows[{index}] is not a dict: {_shallow_describe(entry)}")
            continue
        unknown = set(entry.keys()) - _CASH_FLOW_ENTRY_KEYS
        missing = _CASH_FLOW_ENTRY_KEYS - set(entry.keys())
        if unknown or missing:
            problems.append(f"cash_flows[{index}] key set mismatch -- unknown={sorted(unknown)}, missing={sorted(missing)}")
            continue
        period, amount = entry.get("period"), entry.get("amount")
        if not _is_valid_period(period):
            problems.append(f"cash_flows[{index}].period must be a non-negative int (bool excluded), got {period!r}")
        elif period in seen_periods:
            problems.append(f"cash_flows[{index}].period={period!r} duplicates an earlier entry's period")
        else:
            seen_periods.add(period)
        if not _is_finite_real_number(amount):
            problems.append(f"cash_flows[{index}].amount must be a real finite number (bool excluded), got {amount!r}")
    return problems


def compute_npv(cash_flows: list[dict[str, Any]], discount_rate: float) -> float:
    """GENUINE_COMPUTE: textbook NPV -- ``sum(amount / (1 + discount_rate) ** period)`` over every declared cash
    flow. Never accepted as an input -- always derived here, and independently re-derived by
    ``evaluate_npv_content_integrity_gate``. Raises ``NPV_INVALID_DISCOUNT_RATE`` (not a silent inf/nan value, not
    a crash) when ``discount_rate <= -1`` -- the formula's own denominator is zero or the base is negative, a
    genuinely undefined NPV, not a computable answer. Result rounded to 8 decimal places (module docstring).
    Callers must validate ``cash_flows`` shape (``_validate_cash_flows_shape``) and ``discount_rate``
    (``_is_finite_real_number``) BEFORE calling this -- this function trusts its own arguments, the same "pure
    compute, validated inputs only" boundary ``epistemic.bayesian_updating``'s own ``compute_posterior`` and
    sibling ``feasibility.break_even``'s own ``compute_break_even_volume`` already establish."""
    if discount_rate <= -1:
        raise InvariantViolation(
            f"NPV_INVALID_DISCOUNT_RATE: discount_rate={discount_rate!r} is <= -1 -- (1 + discount_rate) ** period "
            "is zero or the base is negative, an undefined NPV, not a computable answer"
        )
    total = sum(entry["amount"] / (1 + discount_rate) ** entry["period"] for entry in cash_flows)
    return round(total, 8)


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_npv_analysis(
    record_id: str,
    subject_ref: str,
    cash_flows: list[dict[str, Any]],
    discount_rate: float,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/net-present-value-analysis.schema.yaml``.

    Deliberately has NO ``npv`` parameter -- GENUINE_COMPUTE via ``compute_npv``, never caller-supplied (verified
    by ``tests/unit/test_npv.py`` via ``inspect.signature``; a caller attempting an ``npv=`` keyword argument gets
    a plain ``TypeError``). Enforces all real invariants fail-closed, in order: id/version/provenance shape, then
    subject_ref, then discount_rate numeric validity and the ``> -1`` floor, then cash_flows shape (non-empty,
    each entry a well-formed ``{period, amount}`` dict, periods unique and non-negative int), then the NPV
    computation itself (raises ``NPV_INVALID_DISCOUNT_RATE`` if the caller's own discount_rate slipped past the
    earlier floor check via a boundary re-derivation -- defense in depth, never crashes, never silently returns
    inf/nan). ``provenance`` and ``cash_flows`` are deep-copied at the return site -- never returned by reference
    (a caller mutating their own original ``provenance``/``cash_flows`` afterward must not retroactively change
    this record).
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"NPV_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"NPV_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"NPV_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")
    if not _is_nonempty_str(subject_ref):
        raise InvariantViolation(f"NPV_INVALID_SUBJECT_REF: subject_ref must be a non-empty string, got {subject_ref!r}")
    if not _is_finite_real_number(discount_rate) or discount_rate <= -1:
        raise InvariantViolation(f"NPV_INVALID_DISCOUNT_RATE: discount_rate must be a real finite number > -1 (bool excluded), got {discount_rate!r}")
    shape_problems = _validate_cash_flows_shape(cash_flows)
    if shape_problems:
        raise InvariantViolation(f"NPV_INVALID_CASH_FLOWS: {'; '.join(shape_problems)}")

    npv = compute_npv(cash_flows, discount_rate)

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "subject_ref": subject_ref,
        "cash_flows": copy.deepcopy(cash_flows),
        "discount_rate": discount_rate,
        "npv": npv,
        "provenance": copy.deepcopy(provenance),
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_npv_analysis -- a hand-tampered record that bypassed the builder entirely must be caught exactly as a
# builder-refused one would have been.
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


def evaluate_npv_content_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_npv_analysis``, so a hand-tampered record (e.g. a spliced-in wrong ``npv``, a
    duplicate period, or a stored ``discount_rate`` that is actually <= -1) is caught here exactly as a
    builder-refused one would have been. Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("npv_content_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("npv_content_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("npv_content_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    unknown_keys = set(record.keys()) - _STORED_KEYS
    missing_keys = (_STORED_KEYS - {"generated_by_method"}) - set(record.keys())
    if unknown_keys or missing_keys:
        return _result(
            "npv_content_integrity",
            False,
            [{"reason": f"record key set mismatch -- unknown={sorted(unknown_keys)}, missing={sorted(missing_keys)}"}],
            validator,
            timestamp,
        )

    problems: list[str] = []
    if not _is_nonempty_str(record.get("subject_ref")):
        problems.append("subject_ref missing, empty, or not a string")

    discount_rate = record.get("discount_rate")
    if not _is_finite_real_number(discount_rate) or discount_rate <= -1:
        problems.append(f"discount_rate is not a valid finite number > -1: {discount_rate!r}")

    cash_flows = record.get("cash_flows")
    problems.extend(_validate_cash_flows_shape(cash_flows))

    if problems:
        return _result("npv_content_integrity", False, [{"problems": problems}], validator, timestamp)

    try:
        expected_npv = compute_npv(cash_flows, discount_rate)
    except InvariantViolation as error:
        problems.append(f"npv is undefined for the record's own stored inputs: {error}")
        return _result("npv_content_integrity", False, [{"problems": problems}], validator, timestamp)

    stored_npv = record.get("npv")
    if not isinstance(stored_npv, (int, float)) or isinstance(stored_npv, bool) or abs(stored_npv - expected_npv) > _FLOAT_TOLERANCE:
        problems.append(f"npv={stored_npv!r} does not match recomputed {expected_npv!r} (tolerance {_FLOAT_TOLERANCE})")

    return _result("npv_content_integrity", not problems, [{"problems": problems}], validator, timestamp)


def evaluate_npv_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_npv_content_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
