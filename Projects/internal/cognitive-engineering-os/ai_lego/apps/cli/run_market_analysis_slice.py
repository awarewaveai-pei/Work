"""``strategy.market_analysis`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_market_analysis_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.strategy.market_analysis import METHOD_ID, all_gates_pass, evaluate_market_analysis_gates, generate_market_analysis

SCHEMA = "ai-lego://specs/cognitive/typed-objects/market-analysis-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    sizing = {"tam": 120000, "sam": 18000, "som": 600, "unit": "participants/year"}
    segs = [{"id": "SG1", "name": "助人工作者進修", "size_estimate": 9000, "growth_rate": 0.08, "evidence_ref": "E-MKT-1"}, {"id": "SG2", "name": "企業員工關懷", "size_estimate": 6000, "growth_rate": 0.15, "evidence_ref": "E-MKT-2"}]
    return ("MKT-2026-09-17-001", "台灣成人藝術療癒工作坊（非臨床）", sizing, segs, make_provenance("EVIDENCE", "HUMAN_APPROVED")), {}


def refuse() -> Any:
    """SOM larger than SAM -- funnel violated."""
    a, k = fixture_args()
    return generate_market_analysis("MKT-BAD-001", a[1], {**a[2], "som": 50000}, a[3], a[4])


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["segments"][0]["evidence_ref"] = ""
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_market_analysis,
    gates=evaluate_market_analysis_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="market_analysis",
    summary=lambda r: f"{len(r['segments'])} segments, SOM {r['sizing']['som']} {r['sizing']['unit']},",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
