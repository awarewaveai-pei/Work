"""``framing.value_sorting`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_value_sorting_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.framing.value_sorting import METHOD_ID, all_gates_pass, evaluate_value_sorting_gates, generate_value_sorting, top_values

SCHEMA = "ai-lego://specs/cognitive/typed-objects/value-sorting-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    cv = [{"id": f"V{i}", "value": v} for i, v in enumerate(["自主", "安全感", "學習", "陪伴", "收入"], 1)]
    return ("VSORT-2026-09-17-001", "選擇下一年的工作型態", cv, ["V1", "V3", "V4", "V5", "V2"], P), {}


def refuse() -> Any:
    """Ranking drops a candidate."""
    a, k = fixture_args()
    return generate_value_sorting("VSORT-BAD-001", a[1], a[2], a[3][:4], P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["ranking"][0] = record["ranking"][1]
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_value_sorting,
    gates=evaluate_value_sorting_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="value_sorting",
    summary=lambda r: f"top={top_values(r)},",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
