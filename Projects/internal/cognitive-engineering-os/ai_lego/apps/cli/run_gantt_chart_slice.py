"""``delivery.gantt_chart`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_gantt_chart_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.delivery.gantt_chart import METHOD_ID, all_gates_pass, evaluate_gantt_chart_gates, generate_gantt_chart, project_span

SCHEMA = "ai-lego://specs/cognitive/typed-objects/gantt-chart-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    tasks = [
        {"id": "T1", "name": "大綱", "start": "2026-09-18", "end": "2026-09-21", "depends_on": []},
        {"id": "T2", "name": "文獻段", "start": "2026-09-22", "end": "2026-10-05", "depends_on": ["T1"]},
        {"id": "T3", "name": "方法段", "start": "2026-10-06", "end": "2026-10-20", "depends_on": ["T1", "T2"]},
    ]
    return ("GANTT-2026-09-17-001", "第三章初稿", tasks, P), {}


def refuse() -> Any:
    """A task starting before its dependency ends."""
    a, k = fixture_args()
    tasks = [a[2][0], {**a[2][1], "start": "2026-09-20"}]
    return generate_gantt_chart("GANTT-BAD-001", a[1], tasks, P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["tasks"][0]["end"] = "2026-09-10"
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_gantt_chart,
    gates=evaluate_gantt_chart_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="gantt_chart",
    summary=lambda r: f"{len(r['tasks'])} tasks over {project_span(r)['days']} days,",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
