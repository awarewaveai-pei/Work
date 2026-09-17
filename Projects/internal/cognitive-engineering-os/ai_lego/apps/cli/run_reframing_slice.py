"""``framing.reframing`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_reframing_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.framing.reframing import METHOD_ID, all_gates_pass, evaluate_reframing_gates, generate_reframing

SCHEMA = "ai-lego://specs/cognitive/typed-objects/reframing-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    of = {"statement": "我又沒趕上期限，我根本不適合念博士", "label": "FAILURE"}
    rf = [{"id": "RF1", "perspective": "十年後的我", "statement": "那學期我同時在養活自己，晚兩週交不是失敗"}, {"id": "RF2", "perspective": "指導教授", "statement": "延期是常態，重點是有沒有進度"}]
    return ("REFRAME-2026-09-17-001", of, rf, P), {}


def refuse() -> Any:
    """Reframe repeats the original statement."""
    a, k = fixture_args()
    return generate_reframing("REFRAME-BAD-001", a[1], [{"id": "RF1", "perspective": "x", "statement": a[1]["statement"]}], P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["original_frame"]["label"] = "GUILT"
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_reframing,
    gates=evaluate_reframing_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="reframing",
    summary=lambda r: f"{len(r['reframes'])} reframes,",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
