"""``systems.force_field_analysis`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_force_field_analysis_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.systems.force_field_analysis import METHOD_ID, all_gates_pass, evaluate_force_field_analysis_gates, generate_force_field_analysis, net_force

SCHEMA = "ai-lego://specs/cognitive/typed-objects/force-field-analysis-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    d = [{"id": "D1", "description": "論文需要平日晚上", "strength": 5}, {"id": "D2", "description": "學員也說太密集", "strength": 3}]
    r = [{"id": "R1", "description": "收入減半", "strength": 4}]
    return ("FFA-2026-09-17-001", "workshop 改成隔週", d, r, P), {}


def refuse() -> Any:
    """Force id reused across the two lists."""
    a, k = fixture_args()
    return generate_force_field_analysis("FFA-BAD-001", a[1], a[2], [{**a[3][0], "id": "D1"}], P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["driving_forces"][0]["strength"] = 0
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_force_field_analysis,
    gates=evaluate_force_field_analysis_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="force_field_analysis",
    summary=lambda r: f"net={net_force(r)['net']},",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
