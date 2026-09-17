"""``divergent.design_thinking`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_design_thinking_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.divergent.design_thinking import METHOD_ID, all_gates_pass, evaluate_design_thinking_gates, generate_design_thinking

SCHEMA = "ai-lego://specs/cognitive/typed-objects/design-thinking-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    st = {
        "empathize": {"summary": "訪談 5 位沒來的人", "items": ["不知道要準備什麼", "怕自己不會畫"]},
        "define": {"summary": "新學員需要知道不用會畫", "items": []},
        "ideate": {"summary": "三個做法", "items": ["報名頁放學員塗鴉", "寄空白明信片", "第一堂改戶外散步"]},
        "prototype": {"summary": "先做明信片", "items": ["手寫 10 張"]},
        "test": {"summary": "下一梯試", "items": ["出席率 60%→85%"]},
    }
    return ("DTHINK-2026-09-17-001", "新學員報名後常常第一堂就沒來", st, P), {}


def refuse() -> Any:
    """Ideate with a single idea."""
    a, k = fixture_args()
    st = {**a[2], "ideate": {"summary": "s", "items": ["only one"]}}
    return generate_design_thinking("DTHINK-BAD-001", a[1], st, P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["stages"]["test"]["items"] = []
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_design_thinking,
    gates=evaluate_design_thinking_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="design_thinking",
    summary=lambda r: f"ideas={len(r['stages']['ideate']['items'])},",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
