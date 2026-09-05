"""Reconciliation check comparison -- deterministic compute, backing ``database_data.reconciliation``.

Atlas F21's own formula (L908: "counts/checksums/business
invariants->diff->resolve") names three check vocabularies that do NOT
share one comparison semantics: a COUNT is a number where a real
numeric ``diff`` (target - source) is meaningful, while a CHECKSUM (an
opaque hash) or a BUSINESS_INVARIANT (a free-form assertion, e.g. "sum
of line items == order total") is not numerically subtractable -- only
exact-match equality is a well-defined claim for either. Same Trusted
Compute discipline every prior genuine-compute module in this package
already established (Master Plan Section 39: an LLM must never
"mentally compare" two long strings, e.g. two 64-character checksums,
and label the verdict CALCULATED_RESULT without the comparison actually
having been executed by code) -- both branches here are pure, hand-
verified functions, never a caller-asserted boolean.

COUNT parsing uses ``decimal.Decimal``, NOT ``float`` -- a critic
review of this module's first draft caught that ``float()`` silently
loses precision above 2^53 (integer row counts) and above ~1e14
(money-scale checksums), producing a FALSE ``matches: True`` for two
genuinely different values with no tampering required (e.g.
``float("9007199254740993") == float("9007199254740992")``). This is
exactly the "shared predicate is itself wrong, so both the builder and
the gate independently agree on the wrong answer" failure class
``ai_lego/compute/lineage/traversal.py``'s own docstring already
disclosed for a different compute module -- repeated here, now fixed
the same way that one was: exact arithmetic, not the float shortcut.

DELIBERATELY NO ROUNDING/TOLERANCE of any kind: ``diff`` is the EXACT
``Decimal`` subtraction, converted to ``float`` only at the very end.
The first draft rounded to 10 fractional decimal places (borrowed from
``ai_lego/compute/error_budget/budget.py``'s own float-noise rounding)
-- but that same critic review pointed out any FIXED absolute-decimal
tolerance is blind to the comparison's own magnitude: it would still
silently equate two values differing only at the 11th decimal place
even after switching to ``Decimal``, and would keep hiding a value
formatted with float-repr noise (e.g. ``"0.30000000000000004"``
instead of ``"0.3"``) as a false match. Atlas's own formula ("counts/
checksums/business invariants->diff->resolve") states no tolerance at
all; inventing one here would be exactly the kind of unstated
assumption this package's every prior contract already disciplines
itself against. A caller who KNOWS a specific tiny discrepancy is
expected (e.g. a documented float-formatting quirk in an upstream
system) has the correct tool for that already: the check's own
``resolution`` field, evaluated by ``resolved_as_expected`` -- a
disclosed human judgment, not a silent numeric guess.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from ai_lego.errors import InvariantViolation

VALID_CHECK_TYPES = frozenset({"COUNT", "CHECKSUM", "BUSINESS_INVARIANT"})


def compute_check_result(check_type: str, source_value: str, target_value: str) -> dict[str, object]:
    """Returns ``{"matches": bool, "diff": float | None}``.

    ``check_type: COUNT`` parses both values as ``Decimal`` (exact for
    arbitrary-precision integers and fixed-point money values alike --
    unlike ``float``, which loses precision above 2^53) and computes the
    EXACT ``diff = target - source``, with no rounding of any kind --
    ``matches`` is ``diff == 0``. The returned ``diff`` is converted to
    ``float`` only at the end, once it is already a small delta rather
    than the (potentially huge) raw values -- safe at any realistic
    reconciliation magnitude.

    ``check_type: CHECKSUM`` or ``BUSINESS_INVARIANT`` treats both values as
    opaque strings: ``matches`` is exact equality, ``diff`` is ``None``
    (not a well-defined numeric quantity for a hash or a free-form
    assertion).
    """
    if not isinstance(check_type, str) or check_type not in VALID_CHECK_TYPES:
        # isinstance guard first: an unhashable check_type (e.g. a list, from a rehydrated
        # malformed record) would otherwise raise TypeError out of the `in` check below instead
        # of failing closed with a real InvariantViolation.
        raise InvariantViolation(f"RECONCILIATION_UNKNOWN_CHECK_TYPE: {check_type!r} is not one of {sorted(VALID_CHECK_TYPES)}")
    if check_type == "COUNT":
        try:
            source_num = Decimal(source_value)
            target_num = Decimal(target_value)
        except (InvalidOperation, TypeError, ValueError) as error:
            raise InvariantViolation(f"RECONCILIATION_COUNT_NOT_NUMERIC: check_type COUNT requires numeric source_value/target_value, got {source_value!r}/{target_value!r}") from error
        if not (source_num.is_finite() and target_num.is_finite()):
            raise InvariantViolation(f"RECONCILIATION_COUNT_NOT_FINITE: check_type COUNT requires finite source_value/target_value, got {source_value!r}/{target_value!r}")
        diff = target_num - source_num
        return {"matches": diff == 0, "diff": float(diff)}
    return {"matches": source_value == target_value, "diff": None}
