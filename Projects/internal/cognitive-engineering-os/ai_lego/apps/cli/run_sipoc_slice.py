"""``systems.sipoc`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_sipoc_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.systems.sipoc import METHOD_ID, all_gates_pass, evaluate_sipoc_gates, generate_sipoc

SCHEMA = "ai-lego://specs/cognitive/typed-objects/sipoc-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    steps = [{"id": "P1", "step": "收到報名"}, {"id": "P2", "step": "寄行前信"}, {"id": "P3", "step": "第一堂"}]
    return ("SIPOC-2026-09-17-001", "workshop 報名到第一堂", ["社群貼文", "舊學員介紹"], ["報名表", "訂金"], steps, ["出席的學員", "第一張作品"], ["學員", "轉介的諮商師"], P), {}


def refuse() -> Any:
    """Empty customers column."""
    a, k = fixture_args()
    return generate_sipoc("SIPOC-BAD-001", a[1], a[2], a[3], a[4], a[5], [], P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["process_steps"][1]["id"] = "P1"
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_sipoc,
    gates=evaluate_sipoc_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="sipoc",
    summary=lambda r: f"{len(r['process_steps'])} steps,",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
