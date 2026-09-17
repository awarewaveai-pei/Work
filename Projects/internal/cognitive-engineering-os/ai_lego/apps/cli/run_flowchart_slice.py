"""``systems.flowchart`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_flowchart_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.systems.flowchart import METHOD_ID, all_gates_pass, evaluate_flowchart_gates, generate_flowchart

SCHEMA = "ai-lego://specs/cognitive/typed-objects/flowchart-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    nodes = [{"id": "N0", "kind": "START", "label": "下課回家"}, {"id": "N1", "kind": "DECISION", "label": "累不累？"}, {"id": "N2", "kind": "PROCESS", "label": "滑手機"}, {"id": "N3", "kind": "PROCESS", "label": "寫論文"}, {"id": "N4", "kind": "END", "label": "睡覺"}]
    edges = [{"from_ref": "N0", "to_ref": "N1"}, {"from_ref": "N1", "to_ref": "N2", "condition": "累"}, {"from_ref": "N1", "to_ref": "N3", "condition": "還好"}, {"from_ref": "N2", "to_ref": "N4"}, {"from_ref": "N3", "to_ref": "N4"}]
    return ("FLOW-2026-09-17-001", "晚上時間怎麼不見的", nodes, edges, P), {}


def refuse() -> Any:
    """A DECISION with a single exit."""
    a, k = fixture_args()
    edges = [e for e in a[3] if not (e["from_ref"] == "N1" and e["to_ref"] == "N3")]
    nodes = [n for n in a[2] if n["id"] != "N3"]
    return generate_flowchart("FLOW-BAD-001", a[1], nodes, edges, P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["edges"].append({"from_ref": "N4", "to_ref": "N0"})
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_flowchart,
    gates=evaluate_flowchart_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="flowchart",
    summary=lambda r: f"{len(r['nodes'])} nodes, {len(r['edges'])} edges,",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
