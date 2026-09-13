"""``feasibility.unit_economics`` -- F14 feasibility & economics family (Atlas L718-730, this method's own row
L726), second of 2 sibling methods built this batch (with ``feasibility.tco``; 3 disjoint sibling agents build
the family's other 7 members concurrently).

Atlas F14 table row (L726, verbatim): "Unit Economics｜每客戶/交易是否賺錢｜ARPU/gross margin/CAC/LTV/payback/
churn｜判斷商模可擴張性". The dedicated §12.27 section (L2882-2900) gives the real, binding metric list (a text
fence): CAC, LTV, Gross Margin, Payback, Churn, ARPU, Contribution Margin. Benefit: "避免「營收成長但越賣越虧」"
(avoid "revenue growing but losing more per sale").

Two real invariants, both GENUINE_COMPUTE (never caller-supplied -- neither has a builder parameter at all, so a
caller attempting either as a keyword argument gets a plain ``TypeError``, the same idiom
``epistemic.bayesian_updating``'s own ``posterior`` establishes):

  1. ``ltv_to_cac_ratio`` = ltv / cac. ``cac`` must be strictly positive -- refused with its own distinct
     ``UECON_INVALID_CAC`` code (the ratio is undefined at cac=0, and a non-positive acquisition cost is
     nonsensical), so the division here never raises ``ZeroDivisionError``.
  2. ``scalable`` = ``contribution_margin >= 0``. This is the minimal structural encoding of §12.27's OWN named
     failure mode ("營收成長但越賣越虧") and nothing more: a business cannot be called scalable while it loses
     money on every unit sold, regardless of revenue growth elsewhere. A richer scalability heuristic (e.g. an
     LTV:CAC ratio threshold) is NOT modeled -- Atlas cites no such threshold, and inventing one would be an
     undisclosed compilation decision beyond what §12.27 itself asserts (see open_questions).

Independently re-derived by ``evaluate_unit_economics_content_integrity_gate``, which does not call the
builder -- a hand-tampered record (e.g. a spliced-in ``scalable: true`` alongside a negative
``contribution_margin``) is caught exactly as a builder-refused one would have been.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and ``Projects/internal/cognitive-engineering-os``
case-insensitively for "unit economics"/"unit_economics" before writing any of this method's own files: hits
were only ``strategy.business_model_canvas``'s own forward-reference to a not-yet-built
``strategy.unit_economics`` (Atlas L527's "最佳搭配" column) -- a DIFFERENT, still-nonexistent machine_id in a
DIFFERENT family (``strategy``, not ``feasibility``); no collision, no prior implementation found. That
sibling contract's own OQ is left as-is (out of scope for this task; see this file's own open_questions for the
cross-reference disclosed instead).
"""

from __future__ import annotations

import copy
import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "feasibility.unit_economics"
RECORD_ID_PREFIX = "UECON-"

# Compilation decision (disclosed): ltv_to_cac_ratio stored/compared at round(x, 8), matching this corpus's
# established ratio/probability rounding convention (epistemic.bayesian_updating's own posterior). Gate
# re-derivation tolerance is 1e-9 -- one order of magnitude tighter than the 8th-decimal-place unit itself.
_FLOAT_TOLERANCE = 1e-9

_STORED_KEYS = frozenset(
    {
        "id", "version", "generated_by_method", "subject_ref",
        "cac", "ltv", "gross_margin", "payback_period", "churn_rate", "arpu", "contribution_margin",
        "ltv_to_cac_ratio", "scalable", "provenance",
    }
)


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_real_number(value: Any) -> bool:
    """A real, finite number. ``bool`` excluded (Python's ``bool`` is an ``int`` subclass -- the same documented
    trap ``stakeholders.game_theory``'s own corrected ``_is_number_excluding_bool`` guards against). ``int`` is
    unconditionally finite in Python (arbitrary precision, never inf/nan) and is never passed through
    ``math.isfinite`` -- that raises ``OverflowError`` on a huge ``int``, a trap only reachable via the
    ``float`` branch."""
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    return False


def _in_range(value: Any, minimum: float | None, maximum: float | None) -> bool:
    if minimum is not None and value < minimum:
        return False
    if maximum is not None and value > maximum:
        return False
    return True


# (field name, error code, minimum, maximum, "exclusive minimum" flag) -- the single definition of each
# field's own numeric shape, consulted by both the builder and the gate so the two layers cannot drift apart.
_NUMERIC_FIELDS: tuple[tuple[str, str, float | None, float | None, bool], ...] = (
    ("cac", "UECON_INVALID_CAC", 0.0, None, True),
    ("ltv", "UECON_INVALID_LTV", 0.0, None, False),
    ("gross_margin", "UECON_INVALID_GROSS_MARGIN", 0.0, 1.0, False),
    ("payback_period", "UECON_INVALID_PAYBACK_PERIOD", 0.0, None, False),
    ("churn_rate", "UECON_INVALID_CHURN_RATE", 0.0, 1.0, False),
    ("arpu", "UECON_INVALID_ARPU", 0.0, None, False),
    ("contribution_margin", "UECON_INVALID_CONTRIBUTION_MARGIN", None, None, False),
)


def _numeric_field_problem(name: str, code: str, minimum: float | None, maximum: float | None, exclusive_min: bool, value: Any) -> str | None:
    """Returns an error message when ``value`` fails field ``name``'s own numeric shape, else None. Bundles the
    error code into the message so both the builder (raises it) and the gate (collects it as evidence) report
    the identical diagnostic."""
    if not _is_real_number(value):
        return f"{code}: {name} must be a real finite number (bool excluded), got {value!r}"
    if exclusive_min and minimum is not None and not (value > minimum):
        return f"{code}: {name} must be strictly greater than {minimum}, got {value!r} (cac<=0 makes ltv_to_cac_ratio undefined and is not a sensible acquisition cost)"
    if not exclusive_min and not _in_range(value, minimum, maximum):
        bound = f"[{minimum}, {maximum}]" if maximum is not None else f">= {minimum}" if minimum is not None else "any finite value"
        return f"{code}: {name} must be {bound}, got {value!r}"
    return None


def compute_ltv_to_cac_ratio(ltv: float, cac: float) -> float:
    """GENUINE_COMPUTE. Never accepted as an input -- always derived here, and independently re-derived by
    ``evaluate_unit_economics_content_integrity_gate``. Trusts ``cac`` is already validated strictly positive
    (callers validate before calling this, the same "pure compute, validated inputs only" boundary
    ``epistemic.bayesian_updating``'s own ``compute_posterior`` already establishes) -- never raises
    ``ZeroDivisionError`` under that contract."""
    return round(ltv / cac, 8)


def compute_scalable(contribution_margin: float) -> bool:
    """GENUINE_COMPUTE. Atlas section 12.27's own named failure mode ("營收成長但越賣越虧"), operationalized as
    the minimal structural rule it actually states: a negative contribution margin can never be called
    scalable. See module docstring for why no richer heuristic is modeled."""
    return contribution_margin >= 0


def generate_unit_economics(
    record_id: str,
    subject_ref: str,
    cac: float,
    ltv: float,
    gross_margin: float,
    payback_period: float,
    churn_rate: float,
    arpu: float,
    contribution_margin: float,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/unit-economics-analysis.schema.yaml``.

    Deliberately has NO ``ltv_to_cac_ratio`` and NO ``scalable`` parameter -- both GENUINE_COMPUTE, never
    caller-supplied (a caller attempting either as a keyword argument gets a plain ``TypeError``). Enforces
    every real invariant fail-closed, in order: id/version/provenance shape, then subject_ref, then each of the
    7 named metrics (real finite number, bool excluded, field-specific range -- ``cac`` strictly positive), then
    computes both derived fields.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"UECON_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"UECON_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("UECON_INVALID_PROVENANCE: provenance must be a valid provenance_record")
    if not _is_nonempty_str(subject_ref):
        raise InvariantViolation(f"UECON_INVALID_SUBJECT_REF: subject_ref must be a non-empty string, got {subject_ref!r}")

    values = {"cac": cac, "ltv": ltv, "gross_margin": gross_margin, "payback_period": payback_period, "churn_rate": churn_rate, "arpu": arpu, "contribution_margin": contribution_margin}
    for name, code, minimum, maximum, exclusive_min in _NUMERIC_FIELDS:
        problem = _numeric_field_problem(name, code, minimum, maximum, exclusive_min, values[name])
        if problem is not None:
            raise InvariantViolation(problem)

    ltv_to_cac_ratio = compute_ltv_to_cac_ratio(ltv, cac)
    scalable = compute_scalable(contribution_margin)

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "subject_ref": subject_ref,
        "cac": cac,
        "ltv": ltv,
        "gross_margin": gross_margin,
        "payback_period": payback_period,
        "churn_rate": churn_rate,
        "arpu": arpu,
        "contribution_margin": contribution_margin,
        "ltv_to_cac_ratio": ltv_to_cac_ratio,
        "scalable": scalable,
        "provenance": copy.deepcopy(provenance),
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_unit_economics -- a hand-tampered record that bypassed the builder entirely must be caught exactly
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


def evaluate_unit_economics_content_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_unit_economics``, so a hand-tampered record (e.g. a spliced-in wrong
    ``ltv_to_cac_ratio``, or a ``scalable: true`` alongside a negative ``contribution_margin``) is caught here
    exactly as a builder-refused one would have been. Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("unit_economics_content_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("unit_economics_content_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("unit_economics_content_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("subject_ref")):
        return _result("unit_economics_content_integrity", False, [{"reason": "subject_ref missing, empty, or not a string"}], validator, timestamp)

    unknown_keys = set(record.keys()) - _STORED_KEYS
    missing_keys = (_STORED_KEYS - {"generated_by_method"}) - set(record.keys())
    if unknown_keys or missing_keys:
        return _result(
            "unit_economics_content_integrity",
            False,
            [{"reason": f"record key set mismatch -- unknown={sorted(unknown_keys)}, missing={sorted(missing_keys)}"}],
            validator,
            timestamp,
        )

    problems: list[str] = []
    for name, code, minimum, maximum, exclusive_min in _NUMERIC_FIELDS:
        problem = _numeric_field_problem(name, code, minimum, maximum, exclusive_min, record.get(name))
        if problem is not None:
            problems.append(problem)

    if any(_numeric_field_problem(*field, record.get(field[0])) is not None for field in (("cac", "UECON_INVALID_CAC", 0.0, None, True), ("ltv", "UECON_INVALID_LTV", 0.0, None, False))):
        problems.append("ltv_to_cac_ratio could not be independently recomputed: cac/ltv failed validation above")
        return _result("unit_economics_content_integrity", not problems, [{"problems": problems}], validator, timestamp)

    expected_ratio = compute_ltv_to_cac_ratio(record["ltv"], record["cac"])
    stored_ratio = record.get("ltv_to_cac_ratio")
    if not isinstance(stored_ratio, (int, float)) or isinstance(stored_ratio, bool) or abs(stored_ratio - expected_ratio) > _FLOAT_TOLERANCE:
        problems.append(f"ltv_to_cac_ratio={stored_ratio!r} does not match recomputed {expected_ratio!r} (tolerance {_FLOAT_TOLERANCE})")

    contribution_margin_problem = _numeric_field_problem("contribution_margin", "UECON_INVALID_CONTRIBUTION_MARGIN", None, None, False, record.get("contribution_margin"))
    if contribution_margin_problem is None:
        expected_scalable = compute_scalable(record["contribution_margin"])
        stored_scalable = record.get("scalable")
        if not isinstance(stored_scalable, bool) or stored_scalable != expected_scalable:
            problems.append(f"scalable={stored_scalable!r} does not match recomputed {expected_scalable!r} from contribution_margin={record.get('contribution_margin')!r}")
    else:
        problems.append("scalable could not be independently recomputed: contribution_margin failed validation above")

    return _result("unit_economics_content_integrity", not problems, [{"problems": problems}], validator, timestamp)


def evaluate_unit_economics_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_unit_economics_content_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
