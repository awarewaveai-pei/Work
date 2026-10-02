"""``art_therapy.life_timeline`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_life_timeline_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.life_timeline import METHOD_ID, all_gates_pass, evaluate_life_timeline_gates, generate_life_timeline

SCHEMA = "ai-lego://specs/cognitive/typed-objects/life-timeline-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    events = [
        {"id": "F1", "when": "2028-06-01", "event": "辦一場小小的個展", "feeling": "期待", "meaning": "讓作品被看見", "first_step": "這週挑出三張想展的舊作"},
        {"id": "F2", "when": "2027-01-01", "event": "每週固定畫兩個晚上", "feeling": "踏實", "meaning": "創作回到生活裡", "first_step": "週三晚上先空出一小時"},
        {"id": "N1", "when": "2026-10-02", "event": "決定把畫具從箱子拿出來", "feeling": "有點緊張", "meaning": "承認自己還想畫"},
        {"id": "P1", "when": "2019-09-01", "event": "畢業後把畫具收進箱子", "feeling": "失落", "meaning": "以為要先顧好生活才能畫"},
    ]
    return ("LIFETL-2026-10-02-001", "我和創作的路", "2026-10-02", "白天上班，晚上偶爾畫，覺得自己離畫畫越來越遠", "backward", events, P), {}


def refuse() -> Any:
    """Backward walk listed oldest first."""
    a, _ = fixture_args()
    return generate_life_timeline("LIFETL-BAD-001", a[1], a[2], a[3], "backward", list(reversed(a[5])), P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["events"][-1]["phase"] = "future"   # a 2019 event claimed as future
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_life_timeline,
    gates=evaluate_life_timeline_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="life_timeline",
    summary=lambda r: f"{len(r['events'])} events, {r['direction']},",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
