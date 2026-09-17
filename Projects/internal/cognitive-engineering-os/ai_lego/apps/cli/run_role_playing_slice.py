"""``art_therapy.role_playing`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_role_playing_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.role_playing import METHOD_ID, all_gates_pass, evaluate_role_playing_gates, generate_role_playing

SCHEMA = "ai-lego://specs/cognitive/typed-objects/role-playing-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    roles = [{"id": "R1", "name": "我", "played_by": "CLIENT", "stance": "想被理解但怕被責備"}, {"id": "R2", "name": "教授", "played_by": "EMPTY_CHAIR", "stance": "忙碌、就事論事"}]
    refl = [{"id": "F1", "role_ref": "R1", "observation": "我一開口就道歉三次", "prediction": "如果先講方案，對方比較不會不耐煩"}]
    return ("ROLEPLAY-2026-09-17-001", "跟指導教授說我需要延後兩週", roles, refl, P), {}


def refuse() -> Any:
    """Reflection references a role nobody played."""
    a, k = fixture_args()
    return generate_role_playing("ROLEPLAY-BAD-001", a[1], a[2], [{**a[3][0], "role_ref": "R9"}], P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["reflections"][0]["role_ref"] = "R9"
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_role_playing,
    gates=evaluate_role_playing_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="role_playing",
    summary=lambda r: f"{len(r['roles'])} roles, {len(r['reflections'])} reflections,",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
