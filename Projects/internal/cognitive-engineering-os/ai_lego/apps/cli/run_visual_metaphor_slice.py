"""``art_therapy.visual_metaphor`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_visual_metaphor_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.visual_metaphor import METHOD_ID, all_gates_pass, evaluate_visual_metaphor_gates, generate_visual_metaphor

SCHEMA = "ai-lego://specs/cognitive/typed-objects/visual-metaphor-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    image = {"medium": "粉彩", "description": "灰藍色的雲壓在一座小房子上，屋頂有一扇亮著的窗"}
    elements = [{"id": "L1", "element": "雲", "stands_for": "論文和工作的壓力"}, {"id": "L2", "element": "亮著的窗", "stands_for": "還想創作的自己"}]
    return ("VISMET-2026-09-17-001", "說不清楚的悶", image, "我像那扇窗，雲再厚也還亮著", elements, P), {}


def refuse() -> Any:
    """An element with nothing it stands for."""
    a, k = fixture_args()
    return generate_visual_metaphor("VISMET-BAD-001", a[1], a[2], a[3], [{"id": "L1", "element": "雲", "stands_for": ""}], P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["image"] = {"medium": "粉彩"}
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_visual_metaphor,
    gates=evaluate_visual_metaphor_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="visual_metaphor",
    summary=lambda r: f"{len(r['elements'])} elements,",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
