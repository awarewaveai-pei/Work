"""``divergent.triz`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_triz_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.divergent.triz import METHOD_ID, all_gates_pass, evaluate_triz_gates, generate_triz

SCHEMA = "ai-lego://specs/cognitive/typed-objects/triz-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    c = {"improving_parameter": "親密感", "worsening_parameter": "自主空間"}
    p = [{"principle_number": 1, "name": "Segmentation", "application": "把相處切成固定時段"}, {"principle_number": 15, "name": "Dynamics", "application": "距離隨狀態調整"}]
    return ("TRIZ-2026-09-17-001", "想跟家人親近，又需要自己的空間", c, p, P), {}


def refuse() -> Any:
    """Same parameter on both sides -- not a contradiction."""
    a, k = fixture_args()
    return generate_triz("TRIZ-BAD-001", a[1], {"improving_parameter": "親密感", "worsening_parameter": "親密感 "}, a[3], P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["principles"][0]["principle_number"] = 41
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_triz,
    gates=evaluate_triz_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="triz",
    summary=lambda r: f"{len(r['principles'])} principles,",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
