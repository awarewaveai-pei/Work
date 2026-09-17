"""``divergent.six_thinking_hats`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_six_thinking_hats_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.divergent.six_thinking_hats import METHOD_ID, all_gates_pass, evaluate_six_thinking_hats_gates, generate_six_thinking_hats

SCHEMA = "ai-lego://specs/cognitive/typed-objects/six-thinking-hats-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    hats = [{"hat": h, "statements": [s]} for h, s in [("WHITE", "目前每週 3 晚"), ("RED", "想到週末也要工作就累"), ("BLACK", "出席率可能掉"), ("YELLOW", "平日晚上空出來"), ("GREEN", "隔週制"), ("BLUE", "先試一個月")]]
    return ("SIXHATS-2026-09-17-001", "workshop 改到週末", hats, P), {}


def refuse() -> Any:
    """Missing the BLUE hat."""
    a, k = fixture_args()
    return generate_six_thinking_hats("SIXHATS-BAD-001", a[1], a[2][:5], P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["hats"][0]["hat"] = "RED"
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_six_thinking_hats,
    gates=evaluate_six_thinking_hats_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="six_thinking_hats",
    summary=lambda r: f"{sum(len(h['statements']) for h in r['hats'])} statements,",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
