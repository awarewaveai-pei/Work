"""``art_therapy.metaphor_dialogue`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_metaphor_dialogue_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.metaphor_dialogue import METHOD_ID, all_gates_pass, evaluate_metaphor_dialogue_gates, generate_metaphor_dialogue

SCHEMA = "ai-lego://specs/cognitive/typed-objects/metaphor-dialogue-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    figure = {"name": "灰雲", "origin": "視覺隱喻裡壓著房子的雲"}
    exchanges = [{"id": "X1", "speaker": "SELF", "line": "你為什麼一直不走？"}, {"id": "X2", "speaker": "FIGURE", "line": "因為你一直看著我，沒有看窗。"}]
    return ("METDLG-2026-09-17-001", figure, exchanges, "壓力不是敵人，是我把注意力放錯地方", P), {}


def refuse() -> Any:
    """Only SELF speaks -- a monologue."""
    a, k = fixture_args()
    mono = [{"id": "X1", "speaker": "SELF", "line": "a"}, {"id": "X2", "speaker": "SELF", "line": "b"}]
    return generate_metaphor_dialogue("METDLG-BAD-001", a[1], mono, a[3], P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["exchanges"] = record["exchanges"][:1]
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_metaphor_dialogue,
    gates=evaluate_metaphor_dialogue_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="metaphor_dialogue",
    summary=lambda r: f"{len(r['exchanges'])} exchanges with {r['figure']['name']},",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
