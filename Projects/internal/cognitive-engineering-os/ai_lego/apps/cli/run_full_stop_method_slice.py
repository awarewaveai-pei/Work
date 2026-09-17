"""``art_therapy.full_stop_method`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_full_stop_method_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.full_stop_method import METHOD_ID, all_gates_pass, evaluate_full_stop_method_gates, generate_full_stop_method, flagged_segments

SCHEMA = "ai-lego://specs/cognitive/typed-objects/full-stop-method-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    segments = [
        {"id": "S1", "sentence": "我又搞砸了。", "pattern": "NONE"},
        {"id": "S2", "sentence": "大家一定覺得我很沒用。", "pattern": "MIND_READING", "revision": "我不知道大家怎麼想，我可以問。"},
        {"id": "S3", "sentence": "反正我永遠做不好。", "pattern": "OVERGENERALIZATION", "revision": "這次沒做好，不代表每次。"},
    ]
    return ("FSTOP-2026-09-17-001", "我又搞砸了。大家一定覺得我很沒用。反正我永遠做不好。", segments, P), {}


def refuse() -> Any:
    """A tagged segment without a revision."""
    a, k = fixture_args()
    seg = {"id": "S2", "sentence": "大家一定覺得我很沒用。", "pattern": "MIND_READING"}
    return generate_full_stop_method("FSTOP-BAD-001", a[1], [seg], P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    del record["segments"][1]["revision"]
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_full_stop_method,
    gates=evaluate_full_stop_method_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="full_stop_method",
    summary=lambda r: f"{len(r['segments'])} segments, {len(flagged_segments(r))} flagged,",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
