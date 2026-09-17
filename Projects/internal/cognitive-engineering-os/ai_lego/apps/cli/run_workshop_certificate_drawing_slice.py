"""``art_therapy.workshop_certificate_drawing`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_workshop_certificate_drawing_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.workshop_certificate_drawing import METHOD_ID, all_gates_pass, evaluate_workshop_certificate_drawing_gates, generate_workshop_certificate_drawing

SCHEMA = "ai-lego://specs/cognitive/typed-objects/workshop-certificate-drawing-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    ms = [{"id": "M1", "label": "第一次願意分享作品"}, {"id": "M2", "label": "畫出自己的邊界"}]
    return ("WCERT-2026-09-17-001", "八週創作療癒團體", ms, "願你記得，窗一直亮著。", "2026-09-17", "學員自繪", P), {}


def refuse() -> Any:
    """sealed_on is not a date."""
    a, k = fixture_args()
    return generate_workshop_certificate_drawing("WCERT-BAD-001", a[1], a[2], a[3], "yesterday", a[5], P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["milestones"] = []
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_workshop_certificate_drawing,
    gates=evaluate_workshop_certificate_drawing_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="workshop_certificate_drawing",
    summary=lambda r: f"{len(r['milestones'])} milestones sealed {r['sealed_on']},",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
