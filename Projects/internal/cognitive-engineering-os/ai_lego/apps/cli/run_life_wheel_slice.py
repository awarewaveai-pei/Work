"""``art_therapy.life_wheel`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_life_wheel_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.life_wheel import METHOD_ID, all_gates_pass, balance_summary, evaluate_life_wheel_gates, generate_life_wheel

SCHEMA = "ai-lego://specs/cognitive/typed-objects/life-wheel-record.schema.yaml"


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    dims = [
        {"id": "D1", "name": "健康", "score": 6},
        {"id": "D2", "name": "學業／論文", "score": 3, "note": "四週零進度"},
        {"id": "D3", "name": "工作", "score": 7},
        {"id": "D4", "name": "人際", "score": 6},
        {"id": "D5", "name": "休息", "score": 2},
        {"id": "D6", "name": "創作", "score": 8},
    ]
    return ("LWHEEL-2026-09-17-001", "我這學期的生活", dims, make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")), {}


def refuse() -> Any:
    """Only 3 dimensions -- below the 4-dimension floor."""
    return generate_life_wheel("LWHEEL-BAD-001", "x", [{"id": f"D{i}", "name": f"n{i}", "score": 5} for i in range(3)], make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["dimensions"][0]["score"] = 11  # out of range, bypassing the builder
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_life_wheel,
    gates=evaluate_life_wheel_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="life_wheel",
    summary=lambda r: f"{len(r['dimensions'])} dimensions, balance_gap={balance_summary(r)['balance_gap']},",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
