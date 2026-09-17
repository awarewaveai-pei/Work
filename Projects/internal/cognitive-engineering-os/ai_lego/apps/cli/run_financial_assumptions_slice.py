"""``finance.financial_assumptions`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_financial_assumptions_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.finance.financial_assumptions import METHOD_ID, all_gates_pass, evaluate_financial_assumptions_gates, generate_financial_assumptions

SCHEMA = "ai-lego://specs/cognitive/typed-objects/financial-assumptions-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    ev = make_provenance("EVIDENCE", "HUMAN_APPROVED")
    assumptions = [{"id": "A1", "name": "每梯次學員數", "value": 12, "unit": "participants", "basis": "過去 4 梯平均 11.5", "provenance": ev}, {"id": "A2", "name": "每人學費", "value": 6000, "unit": "TWD", "basis": "2026 定價表", "provenance": make_provenance("SOURCE_FACT", "HUMAN_ORIGINAL")}]
    cf = [{"period": 0, "amount": -150000}, {"period": 1, "amount": 180000}, {"period": 2, "amount": 210000}]
    return ("FINASSUM-2026-09-17-001", "PLAN-WORKSHOP-2027", "TWD", 0.08, 2, assumptions, cf, ev), {}


def refuse() -> Any:
    """Projection missing period 2 for a 2-year horizon."""
    a, k = fixture_args()
    return generate_financial_assumptions("FINASSUM-BAD-001", a[1], a[2], a[3], a[4], a[5], a[6][:2], a[7])


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["discount_rate"] = 1.5
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_financial_assumptions,
    gates=evaluate_financial_assumptions_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="financial_assumptions",
    summary=lambda r: f"{len(r['assumptions'])} assumptions, {r['horizon_years']}y {r['currency']},",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
