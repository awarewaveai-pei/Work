"""``finance.financial_assumptions`` -- the reviewed numeric assumptions a business plan's financial nodes consume.

First Finance domain-pack method (ADR-025 lifts ADR-008's deferral on operator directive 2026-09-17). It is
NOT a forecast: it records assumptions with their basis so downstream computation (feasibility.npv etc.) is
traceable to a named, provenance-bearing input instead of a number typed into a form.

Invariants (builder raises; gate re-derives): ``currency`` is a 3-letter ISO-style code; ``discount_rate`` a
real number in [0, 1]; ``horizon_years`` an int 1..30; >= 1 assumption with unique ids, finite numeric value,
unit, basis and its own provenance; ``cash_flow_projection`` has exactly ``horizon_years + 1`` entries with
periods 0..horizon_years in order (period 0 = initial outlay) -- so NPV can bind to it directly.
"""

from __future__ import annotations

import re
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.core.domain.record_kit import all_gates_pass, base_record, entries_problem, first_duplicate, integrity_gate, is_int_in, is_nonempty_str, is_number_in, is_real_number, provenance_required_gate, require, require_header

METHOD_ID = "finance.financial_assumptions"
RECORD_ID_PREFIX = "FINASSUM-"
MAX_HORIZON_YEARS = 30
_CURRENCY = re.compile(r"^[A-Z]{3}$")
_A_REQUIRED = frozenset({"id", "name", "value", "unit", "basis", "provenance"})
_A_CHECKS = {"id": is_nonempty_str, "name": is_nonempty_str, "value": is_real_number, "unit": is_nonempty_str, "basis": is_nonempty_str, "provenance": provenance_is_valid}
_CF_REQUIRED = frozenset({"period", "amount"})
_CF_CHECKS = {"period": lambda v: is_int_in(v, 0, MAX_HORIZON_YEARS), "amount": is_real_number}

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "generate_financial_assumptions", "evaluate_financial_assumptions_gates", "all_gates_pass"]


def _core_problem(subject_ref: Any, currency: Any, discount_rate: Any, horizon_years: Any, assumptions: Any, cash_flow_projection: Any) -> str | None:
    if not is_nonempty_str(subject_ref):
        return "subject_ref missing or empty"
    if not isinstance(currency, str) or not _CURRENCY.fullmatch(currency):
        return "currency must be a 3-letter uppercase code"
    if not is_number_in(discount_rate, 0, 1):
        return "discount_rate must be a real number in [0, 1]"
    if not is_int_in(horizon_years, 1, MAX_HORIZON_YEARS):
        return f"horizon_years must be an int 1..{MAX_HORIZON_YEARS}"
    problem = entries_problem(assumptions, _A_REQUIRED, _A_REQUIRED, _A_CHECKS)
    if problem is not None:
        return f"assumptions {problem}"
    if first_duplicate(a["id"] for a in assumptions) is not None:
        return "assumption ids must be unique"
    problem = entries_problem(cash_flow_projection, _CF_REQUIRED, _CF_REQUIRED, _CF_CHECKS, min_items=horizon_years + 1)
    if problem is not None:
        return f"cash_flow_projection {problem}"
    periods = [cf["period"] for cf in cash_flow_projection]
    if periods != list(range(horizon_years + 1)):
        return f"cash_flow_projection periods must be exactly 0..{horizon_years} in order"
    return None


def generate_financial_assumptions(record_id: str, subject_ref: str, currency: str, discount_rate: float, horizon_years: int, assumptions: list[dict[str, Any]], cash_flow_projection: list[dict[str, Any]], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("FINASSUM", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(subject_ref, currency, discount_rate, horizon_years, assumptions, cash_flow_projection)
    require(problem is None, "FINASSUM_INVALID_ASSUMPTIONS", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, subject_ref=subject_ref, currency=currency, discount_rate=discount_rate, horizon_years=horizon_years, assumptions=assumptions, cash_flow_projection=cash_flow_projection)


def evaluate_financial_assumptions_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp, nested=("assumptions",)),
        integrity_gate("financial_assumptions_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("subject_ref"), r.get("currency"), r.get("discount_rate"), r.get("horizon_years"), r.get("assumptions"), r.get("cash_flow_projection")), lambda r: {"assumption_count": len(r["assumptions"]), "horizon_years": r["horizon_years"], "undiscounted_total": sum(cf["amount"] for cf in r["cash_flow_projection"])}, validator, timestamp),
    ]
