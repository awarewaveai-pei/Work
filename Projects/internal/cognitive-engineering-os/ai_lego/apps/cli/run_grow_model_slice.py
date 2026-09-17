"""``framing.grow_model`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_grow_model_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.framing.grow_model import METHOD_ID, all_gates_pass, evaluate_grow_model_gates, generate_grow_model

SCHEMA = "ai-lego://specs/cognitive/typed-objects/grow-model-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    opts = [{"id": "O1", "description": "每天早上 1 小時"}, {"id": "O2", "description": "週末各 3 小時"}]
    will = {"chosen_option_ref": "O1", "first_step": "明早先寫 300 字", "by_when": "2026-09-18"}
    return ("GROW-2026-09-17-001", "六週內交出第三章初稿", "每週能寫約 6 小時", opts, will, P), {}


def refuse() -> Any:
    """Will commits to an undeclared option."""
    a, k = fixture_args()
    return generate_grow_model("GROW-BAD-001", a[1], a[2], a[3], {**a[4], "chosen_option_ref": "O9"}, P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["will"]["by_when"] = "soon"
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_grow_model,
    gates=evaluate_grow_model_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="grow_model",
    summary=lambda r: f"{len(r['options'])} options, chosen {r['will']['chosen_option_ref']},",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
