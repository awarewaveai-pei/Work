"""``learning.dmaic`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_dmaic_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.learning.dmaic import METHOD_ID, all_gates_pass, evaluate_dmaic_gates, generate_dmaic

SCHEMA = "ai-lego://specs/cognitive/typed-objects/dmaic-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    ph = {
        "define": {"summary": "晚上 10 點後的手機使用", "items": []},
        "measure": {"summary": "用螢幕時間記一週", "items": ["基線：平均 74 分鐘"]},
        "analyze": {"summary": "都是回家後第一件事", "items": ["觸發點：坐到沙發"]},
        "improve": {"summary": "回家先換衣服再坐下", "items": ["手機放玄關"]},
        "control": {"summary": "每週日看螢幕時間", "items": ["超過 30 分鐘就重看觸發點"]},
    }
    return ("DMAIC-2026-09-17-001", "每晚滑手機超過一小時", ph, P), {}


def refuse() -> Any:
    """Measure phase with no metric."""
    a, k = fixture_args()
    return generate_dmaic("DMAIC-BAD-001", a[1], {**a[2], "measure": {"summary": "s", "items": []}}, P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["phases"]["control"]["items"] = []
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_dmaic,
    gates=evaluate_dmaic_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="dmaic",
    summary=lambda r: f"measures={len(r['phases']['measure']['items'])},",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
