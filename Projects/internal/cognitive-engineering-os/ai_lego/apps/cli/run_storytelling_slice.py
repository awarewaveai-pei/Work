"""``art_therapy.storytelling`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_storytelling_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.storytelling import METHOD_ID, all_gates_pass, evaluate_storytelling_gates, generate_storytelling

SCHEMA = "ai-lego://specs/cognitive/typed-objects/storytelling-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    arc = {"setting": "社區中心的小教室", "conflict": "沒有人願意先開口", "resolution": "我先畫了自己的害怕", "meaning": "示範脆弱比講技巧更有用"}
    chars = [{"id": "C1", "name": "我", "role": "帶領者"}, {"id": "C2", "name": "沉默的學員", "role": "鏡子"}]
    return ("STORY-2026-09-17-001", "第一次帶團體", arc, chars, P), {}


def refuse() -> Any:
    """Arc missing its meaning."""
    a, k = fixture_args()
    arc = {k2: v for k2, v in a[2].items() if k2 != "meaning"}
    return generate_storytelling("STORY-BAD-001", a[1], arc, a[3], P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["arc"]["resolution"] = " "
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_storytelling,
    gates=evaluate_storytelling_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="storytelling",
    summary=lambda r: f"{len(r['characters'])} characters,",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
