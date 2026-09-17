"""``art_therapy.turning_point_analysis`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_turning_point_analysis_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.turning_point_analysis import METHOD_ID, all_gates_pass, evaluate_turning_point_analysis_gates, generate_turning_point_analysis

SCHEMA = "ai-lego://specs/cognitive/typed-objects/turning-point-analysis-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    events = [
        {"id": "E1", "when": "2015-06-01", "event": "第一次個展", "emotion_before": "害怕被看見", "emotion_after": "被接住", "belief_shift": "我的作品可以被理解"},
        {"id": "E2", "when": "2022-03-15", "event": "決定念 EdD", "emotion_before": "停滯", "emotion_after": "期待又焦慮", "belief_shift": "學習可以是我自己的節奏"},
    ]
    return ("TURNPT-2026-09-17-001", "我與創作的關係", events, P), {}


def refuse() -> Any:
    """Events out of chronological order."""
    a, k = fixture_args()
    events = list(reversed(a[2]))
    return generate_turning_point_analysis("TURNPT-BAD-001", a[1], events, P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["events"][0]["when"] = "not-a-date"
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_turning_point_analysis,
    gates=evaluate_turning_point_analysis_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="turning_point_analysis",
    summary=lambda r: f"{len(r['events'])} events,",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
