"""``art_therapy.personal_swot`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_personal_swot_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.personal_swot import METHOD_ID, all_gates_pass, evaluate_personal_swot_gates, generate_personal_swot

SCHEMA = "ai-lego://specs/cognitive/typed-objects/personal-swot-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    factors = [
        {"id": "S1", "category": "STRENGTH", "statement": "能讓人放心說話", "moment": "上個月同事哭著來找我，聊完說輕鬆多了"},
        {"id": "W1", "category": "WEAKNESS", "statement": "寫長篇文字很慢", "moment": "去年寫計畫書拖了三週"},
        {"id": "O1", "category": "OPPORTUNITY", "statement": "公司有在職進修補助", "moment": "人資上週寄了申請公告"},
        {"id": "T1", "category": "THREAT", "statement": "家人擔心收入變少", "moment": "中秋聚餐時爸爸問了兩次薪水"},
    ]
    action = {"strength_id": "S1", "opportunity_id": "O1", "first_step": "這週五前問人資補助的申請條件"}
    return ("PSWOT-2026-10-02-001", "要不要回學校念藝術治療", factors, action, P), {}


def refuse() -> Any:
    """The action names a weakness as its strength."""
    a, _ = fixture_args()
    return generate_personal_swot("PSWOT-BAD-001", a[1], a[2], {**a[3], "strength_id": "W1"}, P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["factors"] = [f for f in record["factors"] if f["category"] != "THREAT"]   # three quadrants is not a SWOT
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_personal_swot,
    gates=evaluate_personal_swot_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="personal_swot",
    summary=lambda r: f"{len(r['factors'])} factors,",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
