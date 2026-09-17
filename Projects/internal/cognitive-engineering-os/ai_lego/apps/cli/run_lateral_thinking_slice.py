"""``divergent.lateral_thinking`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_lateral_thinking_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.divergent.lateral_thinking import METHOD_ID, all_gates_pass, evaluate_lateral_thinking_gates, generate_lateral_thinking

SCHEMA = "ai-lego://specs/cognitive/typed-objects/lateral-thinking-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    prov = [{"id": "PO1", "technique": "REVERSAL", "statement": "Po: workshop 在早上六點", "movement": "早鳥班：晨間創作＋早餐，晚上留給論文"}]
    return ("LATERAL-2026-09-17-001", "找不到時間寫論文", "workshop 一定要在晚上", prov, P), {}


def refuse() -> Any:
    """Provocation with no movement beyond itself."""
    a, k = fixture_args()
    return generate_lateral_thinking("LATERAL-BAD-001", a[1], a[2], [{**a[3][0], "movement": a[3][0]["statement"]}], P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["provocations"][0]["technique"] = "MAGIC"
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_lateral_thinking,
    gates=evaluate_lateral_thinking_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="lateral_thinking",
    summary=lambda r: f"{len(r['provocations'])} provocations,",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
