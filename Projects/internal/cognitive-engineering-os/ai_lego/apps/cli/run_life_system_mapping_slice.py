"""``systems.life_system_mapping`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_life_system_mapping_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.systems.life_system_mapping import METHOD_ID, all_gates_pass, evaluate_life_system_mapping_gates, generate_life_system_mapping

SCHEMA = "ai-lego://specs/cognitive/typed-objects/life-system-mapping-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    subs = [
        {"id": "S1", "domain": "WORK", "role": "workshop 帶領者", "influences": [{"target_ref": "S2", "direction": "STRAINS", "note": "晚上都被佔走"}]},
        {"id": "S2", "domain": "LEARNING", "role": "EdD 學生", "influences": []},
        {"id": "S3", "domain": "CREATIVE", "role": "創作者", "influences": [{"target_ref": "S1", "direction": "SUPPORTS", "note": "創作是課程素材"}]},
    ]
    return ("LSYSMAP-2026-09-17-001", "我", subs, P), {}


def refuse() -> Any:
    """A subsystem influencing itself."""
    a, k = fixture_args()
    subs = [{**a[2][0], "influences": [{"target_ref": "S1", "direction": "MIXED", "note": "x"}]}, a[2][1]]
    return generate_life_system_mapping("LSYSMAP-BAD-001", a[1], subs, P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["subsystems"][0]["influences"][0]["target_ref"] = "S9"
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_life_system_mapping,
    gates=evaluate_life_system_mapping_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="life_system_mapping",
    summary=lambda r: f"{len(r['subsystems'])} subsystems,",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
