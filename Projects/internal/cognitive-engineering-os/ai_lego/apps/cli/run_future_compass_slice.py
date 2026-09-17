"""``framing.future_compass`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_future_compass_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.framing.future_compass import METHOD_ID, all_gates_pass, evaluate_future_compass_gates, generate_future_compass

SCHEMA = "ai-lego://specs/cognitive/typed-objects/future-compass-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    b = [{"id": "B1", "direction_label": "北：學術", "meaning": "完成論文"}, {"id": "B2", "direction_label": "東：品牌", "meaning": "固定場地與名稱"}]
    return ("FCOMPASS-2026-09-17-001", "三年後 EdD 畢業並有自己的課程品牌", "論文第二章", b, {"description": "本月完成第三章大綱", "bearing_ref": "B1"}, P), {}


def refuse() -> Any:
    """Already at the destination."""
    a, k = fixture_args()
    return generate_future_compass("FCOMPASS-BAD-001", a[1], a[1], a[3], a[4], P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["next_waypoint"]["bearing_ref"] = "B9"
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_future_compass,
    gates=evaluate_future_compass_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="future_compass",
    summary=lambda r: f"{len(r['bearings'])} bearings,",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
