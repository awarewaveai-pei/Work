"""``divergent.creative_constraints`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_creative_constraints_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.divergent.creative_constraints import METHOD_ID, all_gates_pass, evaluate_creative_constraints_gates, generate_creative_constraints

SCHEMA = "ai-lego://specs/cognitive/typed-objects/creative-constraints-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    cs = [{"id": "K1", "constraint_type": "COLOR", "rule": "只能用紅色"}, {"id": "K2", "constraint_type": "BODY", "rule": "只能用左手"}]
    outs = [{"id": "O1", "constraint_refs": ["K1", "K2"], "description": "抖動的紅色輪廓"}]
    return ("CCONSTR-2026-09-17-001", "鬆動慣性的線條", cs, outs, P), {}


def refuse() -> Any:
    """Output references an undeclared constraint."""
    a, k = fixture_args()
    return generate_creative_constraints("CCONSTR-BAD-001", a[1], a[2], [{**a[3][0], "constraint_refs": ["K9"]}], P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["outputs"][0]["constraint_refs"] = []
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_creative_constraints,
    gates=evaluate_creative_constraints_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="creative_constraints",
    summary=lambda r: f"{len(r['constraints'])} constraints, {len(r['outputs'])} outputs,",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
