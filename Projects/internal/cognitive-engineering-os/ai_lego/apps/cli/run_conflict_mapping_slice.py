"""``art_therapy.conflict_mapping`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_conflict_mapping_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.conflict_mapping import METHOD_ID, all_gates_pass, evaluate_conflict_mapping_gates, generate_conflict_mapping

SCHEMA = "ai-lego://specs/cognitive/typed-objects/conflict-mapping-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    parties = [{"id": "P1", "name": "想休息的我", "need": "恢復體力"}, {"id": "P2", "name": "想被需要的我", "need": "感到有價值"}]
    path = [{"id": "S1", "step": "把兩個聲音各畫成角色", "resource_gained": "看見兩者都是我"}, {"id": "S2", "step": "讓它們協商出隔週制", "resource_gained": "可以同時照顧兩個需求"}]
    return ("CONFMAP-2026-09-17-001", "要不要接新的 workshop", parties, path, P), {}


def refuse() -> Any:
    """Only one party -- not a conflict."""
    a, k = fixture_args()
    return generate_conflict_mapping("CONFMAP-BAD-001", a[1], a[2][:1], a[3], P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["transformation_path"][0]["resource_gained"] = ""
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_conflict_mapping,
    gates=evaluate_conflict_mapping_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="conflict_mapping",
    summary=lambda r: f"{len(r['parties'])} parties, {len(r['transformation_path'])} steps,",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
