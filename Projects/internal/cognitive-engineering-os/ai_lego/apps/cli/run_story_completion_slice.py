"""``art_therapy.story_completion`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_story_completion_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.story_completion import METHOD_ID, all_gates_pass, evaluate_story_completion_gates, generate_story_completion

SCHEMA = "ai-lego://specs/cognitive/typed-objects/story-completion-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    chars = [{"id": "C1", "name": "她", "inner_role": "現在的我"}, {"id": "C2", "name": "畫室", "inner_role": "被遺忘的創造力"}]
    return ("STORYC-2026-09-17-001", "她站在一扇上鎖的門前……", "她試了，門開了一條縫，裡面是小時候的畫室。", chars, P), {"felt_dynamics": ["猶豫", "鬆一口氣"]}


def refuse() -> Any:
    """Continuation merely repeats the stem."""
    a, k = fixture_args()
    return generate_story_completion("STORYC-BAD-001", a[1], a[1], a[3], P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["continuation"] = record["story_stem"]
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_story_completion,
    gates=evaluate_story_completion_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="story_completion",
    summary=lambda r: f"{len(r['characters'])} characters,",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
