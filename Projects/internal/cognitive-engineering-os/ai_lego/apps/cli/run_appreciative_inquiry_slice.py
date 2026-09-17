"""``learning.appreciative_inquiry`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_appreciative_inquiry_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.learning.appreciative_inquiry import METHOD_ID, all_gates_pass, evaluate_appreciative_inquiry_gates, generate_appreciative_inquiry

SCHEMA = "ai-lego://specs/cognitive/typed-objects/appreciative-inquiry-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    return ("AI4D-2026-09-17-001", "團體最有生命力的時刻", ["學員自己接話的那五分鐘", "沒有人看時鐘的那堂"], "每堂都有一段不需要我帶的時間", ["前 20 分鐘不講話", "用一張圖開場"], ["下週三試沉默開場"], P), {}


def refuse() -> Any:
    """No first action -- the cycle is incomplete."""
    a, k = fixture_args()
    return generate_appreciative_inquiry("AI4D-BAD-001", a[1], a[2], a[3], a[4], [], P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["dream"] = ""
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_appreciative_inquiry,
    gates=evaluate_appreciative_inquiry_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="appreciative_inquiry",
    summary=lambda r: f"discover={len(r['discover'])}, destiny={len(r['destiny'])},",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
