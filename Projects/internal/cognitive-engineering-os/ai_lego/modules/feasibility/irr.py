"""``feasibility.irr`` -- F14 feasibility family (Atlas L718-730, this method's own row L730).

Atlas F14 table row (L730, verbatim): "IRR｜投資內部報酬率｜cash flow→IRR→
hurdle rate｜直觀回報率". IRR is the rate ``r`` solving
``sum(cf.amount / (1+r)**cf.period for cf in cash_flows) == 0``. No closed
form for >2 cash flows -- solved here with a real bisection root-finder
(``_solve_irr_bisection``), never faked or approximated by a formula.

Two structural preconditions, checked BEFORE any solve attempt:
  1. ``cash_flows`` needs >=1 negative AND >=1 positive amount -- an
     all-same-sign series has an NPV(rate) curve that never crosses zero
     (no meaningful IRR). Refused with ``IRR_UNDEFINED_SAME_SIGN_CASH_FLOWS``.
  2. Unique, non-negative int ``period`` values (bool excluded) -- same
     discipline ``feasibility.npv``'s cash_flows uses (sibling method, same
     batch).

``irr`` and ``meets_hurdle`` are GENUINE_COMPUTE (no builder parameter for
either, verified via ``inspect.signature`` in
``tests/unit/test_irr.py``) -- ``evaluate_irr_content_integrity_gate``
independently RE-SOLVES from the record's own raw ``cash_flows`` (never
calls the builder) and compares within ``_GATE_TOLERANCE``.

Solver tolerance vs gate tolerance (deliberately chosen, not equal):
``_SOLVER_INTERVAL_TOLERANCE = 1e-10`` is the bisection's own stopping width
in rate-space -- the returned root is accurate to that precision before
rounding. The stored value is then ``round(irr, 8)`` (matching this corpus's
established float-storage convention, e.g. ``epistemic.bayesian_updating``).
``_GATE_TOLERANCE = 1e-6`` is deliberately LOOSER than both the 8dp storage
unit (~5e-9) and the solver's own 1e-10 precision: the gate re-solves from
scratch with an independent bisection run (different bracket-expansion
trace, same algorithm), so its raw result and the stored 8dp-rounded value
can differ by 8dp-rounding noise; 1e-6 absorbs that noise while still
catching a real tamper (e.g. a stored ``irr`` off by 1%).

Bracket search: fixed low bound ``lo=-0.999999`` (rate must stay > -1),
exponentially doubling ``hi`` from 1.0 until ``NPV(lo)`` and ``NPV(hi)`` have
opposite signs (or a cap is hit) -- a real non-convergence case (e.g. cash
flows with multiple sign changes whose actual root lies outside this search's
own bracket) raises the distinct ``IRR_NO_SOLUTION_FOUND``, never a silent
wrong answer and never an infinite loop. Bisection needs only NPV's sign, read
from ``_scaled_npv`` (NPV times a positive factor, every power at most 1): the
plain ``amount / (1+r)**period`` divided by an underflowed 0.0 at the low bound
from 54 periods on, and overflows at a large ``hi`` over many periods.

Independently verified (not merely trusted) in
``tests/unit/test_irr.py``/``run_irr_slice.py``: a 2-cash-flow case has a
closed-form IRR (``-1000`` at period 0, ``1200`` at period 1 -> IRR = 0.2
exactly, since ``1+r = 1200/1000``) -- the solver's output is asserted
against that hand-computed value. A second, multi-period case is verified
by substituting the solved rate back into the NPV formula and confirming
``NPV(irr) ~= 0`` within tolerance -- the defining equation itself, not the
solver's own trace.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` case-insensitively
for "internal rate of return"/"\\bIRR\\b"/"cash_flow"/"cash flow" before
writing: only hit is the F14 table's own backlog listing row
(``methods/registry/method-inventory.yaml`` L970) and
``methods/registry/contract-backlog.yaml``'s equivalent row -- both listing
entries, not implementations. No duplicate found.
"""

from __future__ import annotations

import copy
import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "feasibility.irr"
RECORD_ID_PREFIX = "IRR-"
_CASH_FLOW_KEYS = frozenset({"period", "amount"})

# Compilation decision (disclosed, module docstring): bisection stops once the search interval's half-width is
# below this rate-space precision -- the returned root is accurate to this unit before storage rounding.
_SOLVER_INTERVAL_TOLERANCE = 1e-10
_SOLVER_MAX_ITERATIONS = 200
_SOLVER_MAX_BRACKET_EXPANSIONS = 60
_SOLVER_LOW_RATE = -0.999999

# Compilation decision (disclosed, module docstring): deliberately LOOSER than both the solver's own 1e-10
# interval precision and the 8dp storage rounding unit -- absorbs independent-re-solve + rounding noise without
# masking a real tamper.
_GATE_TOLERANCE = 1e-6

_STORED_KEYS = frozenset({"id", "version", "generated_by_method", "subject_ref", "cash_flows", "hurdle_rate", "irr", "meets_hurdle", "provenance"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_finite_number(value: Any) -> bool:
    """Real, finite number -- ``bool`` excluded (Python's ``bool`` is an ``int`` subclass; a bare
    ``isinstance(value, (int, float))`` would silently accept ``True``/``False`` as 1/0, the documented trap
    ``epistemic.bayesian_updating``'s own ``_is_valid_probability`` already guards against). ``int`` is
    unconditionally finite in Python and is not passed through ``math.isfinite`` (that raises ``OverflowError``
    on a huge ``int``)."""
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    return False


def _is_valid_period(value: Any) -> bool:
    """A period must be a real non-negative int -- ``bool`` excluded."""
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def _cash_flow_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped cash flow entry" -- both ``cash_flow()`` (construction
    layer) and the gate's own re-derivation consult it, same shared-predicate discipline
    ``epistemic.evidence_matrix``'s ``_link_problem`` establishes. Does NOT check cross-entry invariants
    (uniqueness of period, same-sign refusal) -- those happen once, over the whole list. Returns None when
    valid."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _CASH_FLOW_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    missing = _CASH_FLOW_KEYS - value.keys()
    if missing:
        return f"missing key(s) {sorted(missing, key=repr)}"
    if not _is_valid_period(value.get("period")):
        return f"period must be a non-negative int (bool excluded), got {value.get('period')!r}"
    if not _is_finite_number(value.get("amount")):
        return f"amount must be a real finite number (bool excluded), got {value.get('amount')!r}"
    return None


def cash_flow(period: int, amount: float) -> dict[str, Any]:
    """One item of ``typed-objects/irr-analysis.schema.yaml#/properties/cash_flows``."""
    record = {"period": period, "amount": amount}
    problem = _cash_flow_problem(record)
    if problem is not None:
        raise InvariantViolation(f"IRR_INVALID_CASH_FLOW: {problem}")
    return record


def _scaled_npv(cash_flows: list[dict[str, Any]], rate: float) -> float:
    """NPV(rate) times a positive factor -- (1+rate)**horizon when rate <= 0, 1 otherwise -- so it has NPV's sign for every
    rate > -1, and every power in it is at most 1: nothing divides by a power that underflows to zero or overflows."""
    base = 1.0 + rate
    if base <= 1.0:
        horizon = max(cf["period"] for cf in cash_flows)
        return sum(cf["amount"] * base ** (horizon - cf["period"]) for cf in cash_flows)
    return sum(cf["amount"] * base ** -cf["period"] for cf in cash_flows)


def _sign(value: float) -> int:
    return (value > 0) - (value < 0)


def _solve_irr_bisection(cash_flows: list[dict[str, Any]]) -> float:
    """Real numerical solve -- bisection over ``NPV(rate) == 0``. Callers must have already validated
    ``cash_flows`` (well-shaped entries, unique periods, mixed signs) -- this function trusts its own input, the
    same "pure compute, validated inputs only" boundary ``epistemic.bayesian_updating``'s own ``compute_posterior``
    establishes. Raises ``IRR_NO_SOLUTION_FOUND`` if no sign-changing bracket is found within the expansion cap
    -- never an infinite loop, never a silently-wrong extrapolated answer."""
    lo = _SOLVER_LOW_RATE
    hi = 1.0
    f_lo = _sign(_scaled_npv(cash_flows, lo))
    f_hi = _sign(_scaled_npv(cash_flows, hi))
    expansions = 0
    while f_lo * f_hi > 0 and expansions < _SOLVER_MAX_BRACKET_EXPANSIONS:
        hi *= 2
        f_hi = _sign(_scaled_npv(cash_flows, hi))
        expansions += 1
    if f_lo * f_hi > 0:
        raise InvariantViolation(
            f"IRR_NO_SOLUTION_FOUND: no sign change in NPV(rate) found between rate={lo!r} and rate={hi!r} after "
            f"{expansions} bracket expansions -- the bisection solver did not converge"
        )
    for _ in range(_SOLVER_MAX_ITERATIONS):
        if (hi - lo) / 2 < _SOLVER_INTERVAL_TOLERANCE:
            break
        mid = (lo + hi) / 2
        f_mid = _sign(_scaled_npv(cash_flows, mid))
        if f_mid == 0:
            lo = hi = mid
            break
        if f_lo * f_mid < 0:
            hi, f_hi = mid, f_mid
        else:
            lo, f_lo = mid, f_mid
    else:
        raise InvariantViolation(f"IRR_DID_NOT_CONVERGE: bisection exceeded {_SOLVER_MAX_ITERATIONS} iterations without reaching interval tolerance {_SOLVER_INTERVAL_TOLERANCE}")
    return round((lo + hi) / 2, 8)


def compute_irr(cash_flows: list[dict[str, Any]]) -> float:
    """GENUINE_COMPUTE entry point. Trusts its own input is already well-shaped with unique periods (both
    callers -- ``generate_irr_analysis`` and ``evaluate_irr_content_integrity_gate`` -- independently validate
    shape/uniqueness themselves before calling this, the same "pure compute, validated inputs only" boundary
    ``epistemic.bayesian_updating``'s own ``compute_posterior`` establishes). Checks only the one precondition
    that is itself part of the mathematical definition of IRR -- mixed-sign amounts -- fail-closed, then
    delegates to ``_solve_irr_bisection``. Never accepted as a builder input -- always derived here, and
    independently RE-SOLVED (not merely re-checked) by ``evaluate_irr_content_integrity_gate``."""
    amounts = [cf["amount"] for cf in cash_flows]
    if not any(a < 0 for a in amounts) or not any(a > 0 for a in amounts):
        raise InvariantViolation(
            f"IRR_UNDEFINED_SAME_SIGN_CASH_FLOWS: cash_flows[] amounts {amounts!r} are all the same sign -- "
            "NPV(rate) never crosses zero, so no meaningful IRR exists"
        )
    return _solve_irr_bisection(cash_flows)


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_irr_analysis(
    record_id: str,
    subject_ref: str,
    cash_flows: list[dict[str, Any]],
    hurdle_rate: float,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/irr-analysis.schema.yaml``.

    Deliberately has NO ``irr``/``meets_hurdle`` parameters -- both GENUINE_COMPUTE (verified by
    ``tests/unit/test_irr.py`` via ``inspect.signature``; a caller attempting ``irr=`` or ``meets_hurdle=`` gets
    a plain ``TypeError``). Enforces every real invariant fail-closed, in order: id/version/provenance shape,
    subject_ref, hurdle_rate, then rebuilds every cash flow via ``cash_flow()`` (never trusting the caller's raw
    dicts), then ``compute_irr`` (unique periods, mixed signs, the real bisection solve) before returning.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"IRR_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"IRR_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"IRR_INVALID_PROVENANCE: provenance failed schema validation, got {provenance!r}")
    if not _is_nonempty_str(subject_ref):
        raise InvariantViolation(f"IRR_INVALID_SUBJECT_REF: subject_ref must be a non-empty string, got {subject_ref!r}")
    if not _is_finite_number(hurdle_rate) or hurdle_rate <= -1:
        raise InvariantViolation(f"IRR_INVALID_HURDLE_RATE: hurdle_rate must be a real finite number > -1 (bool excluded), got {hurdle_rate!r}")
    if not isinstance(cash_flows, list) or len(cash_flows) < 2:
        raise InvariantViolation(f"IRR_INSUFFICIENT_CASH_FLOWS: at least 2 cash flow entries are required, got {cash_flows!r}")

    rebuilt_cash_flows = [cash_flow(cf.get("period") if isinstance(cf, dict) else None, cf.get("amount") if isinstance(cf, dict) else None) for cf in cash_flows]

    periods = [cf["period"] for cf in rebuilt_cash_flows]
    duplicate_periods = sorted({p for p in periods if periods.count(p) > 1})
    if duplicate_periods:
        raise InvariantViolation(f"IRR_DUPLICATE_PERIOD: cash_flows[] periods must be unique, duplicates found: {duplicate_periods}")

    irr = compute_irr(rebuilt_cash_flows)
    meets_hurdle = irr >= hurdle_rate

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "subject_ref": subject_ref,
        "cash_flows": rebuilt_cash_flows,
        "hurdle_rate": hurdle_rate,
        "irr": irr,
        "meets_hurdle": meets_hurdle,
        "provenance": copy.deepcopy(provenance),
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_irr_analysis -- a hand-tampered record that bypassed the builder entirely must be caught exactly as a
# builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance is schema-valid."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_irr_content_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_irr_analysis``: re-validates cash_flows shape/uniqueness/mixed-signs, RE-SOLVES for
    IRR from scratch via ``compute_irr`` (not just re-checking bounds), and independently recomputes
    ``meets_hurdle``. Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("irr_content_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems: list[str] = []

    record_id = record.get("id")
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        problems.append(f"id must be a non-empty string starting with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(record.get("version"), str):
        problems.append(f"version must be a string, got {record.get('version')!r}")

    unknown_keys = set(record.keys()) - _STORED_KEYS
    missing_keys = _STORED_KEYS - {"generated_by_method"} - set(record.keys())
    if unknown_keys or missing_keys:
        problems.append(f"record key set mismatch -- unknown={sorted(unknown_keys)}, missing={sorted(missing_keys)}")
        return _result("irr_content_integrity", False, [{"problems": problems}], validator, timestamp)

    if not _is_nonempty_str(record.get("subject_ref")):
        problems.append("subject_ref missing, empty, or not a string")

    hurdle_rate = record.get("hurdle_rate")
    if not _is_finite_number(hurdle_rate) or hurdle_rate <= -1:
        problems.append(f"hurdle_rate is not a real finite number > -1 (bool excluded): {hurdle_rate!r}")

    cash_flows = record.get("cash_flows")
    if not isinstance(cash_flows, list) or len(cash_flows) < 2:
        problems.append("cash_flows must be a list of at least 2 entries")
        return _result("irr_content_integrity", False, [{"problems": problems}], validator, timestamp)

    malformed = [f"cash_flows[{i}]: {problem}" for i, problem in ((i, _cash_flow_problem(cf)) for i, cf in enumerate(cash_flows)) if problem]
    if malformed:
        problems.extend(malformed)
        return _result("irr_content_integrity", False, [{"problems": problems}], validator, timestamp)

    periods = [cf["period"] for cf in cash_flows]
    duplicate_periods = sorted({p for p in periods if periods.count(p) > 1})
    if duplicate_periods:
        problems.append(f"cash_flows[] periods are not unique, duplicates: {duplicate_periods}")
        return _result("irr_content_integrity", False, [{"problems": problems}], validator, timestamp)

    try:
        expected_irr = compute_irr(cash_flows)
    except InvariantViolation as error:
        problems.append(f"irr could not be independently re-solved from the record's own stored cash_flows: {error}")
        return _result("irr_content_integrity", False, [{"problems": problems}], validator, timestamp)

    stored_irr = record.get("irr")
    if not _is_finite_number(stored_irr) or abs(stored_irr - expected_irr) > _GATE_TOLERANCE:
        problems.append(f"irr={stored_irr!r} does not match independently re-solved {expected_irr!r} (tolerance {_GATE_TOLERANCE})")

    expected_meets_hurdle = expected_irr >= hurdle_rate
    stored_meets_hurdle = record.get("meets_hurdle")
    if not isinstance(stored_meets_hurdle, bool) or stored_meets_hurdle != expected_meets_hurdle:
        problems.append(f"meets_hurdle={stored_meets_hurdle!r} does not match independently recomputed {expected_meets_hurdle!r}")

    return _result("irr_content_integrity", not problems, [{"problems": problems}], validator, timestamp)


def evaluate_irr_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_irr_content_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
