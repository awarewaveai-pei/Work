"""``art_therapy.value_clarification`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_value_clarification_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.value_clarification import METHOD_ID, all_gates_pass, evaluate_value_clarification_gates, generate_value_clarification

SCHEMA = "ai-lego://specs/cognitive/typed-objects/value-clarification-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    values = [
        {"id": "V1", "value": "自主", "why_it_matters": "決定自己的節奏", "life_direction": "接案而非受雇"},
        {"id": "V2", "value": "陪伴", "why_it_matters": "看見別人被接住", "life_direction": "持續帶團體"},
        {"id": "V3", "value": "學習", "why_it_matters": "一直有新東西可以懂", "life_direction": "完成 EdD"},
    ]
    return ("VCLAR-2026-09-17-001", "離開全職工作後", values, P), {}


def refuse() -> Any:
    """Six values -- too many to be a core."""
    vals = [{"id": f"V{i}", "value": f"v{i}", "why_it_matters": "w", "life_direction": "d"} for i in range(6)]
    return generate_value_clarification("VCLAR-BAD-001", "ctx", vals, P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["core_values"][1]["value"] = record["core_values"][0]["value"]
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_value_clarification,
    gates=evaluate_value_clarification_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="value_clarification",
    summary=lambda r: f"{len(r['core_values'])} core values,",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
