"""``art_therapy.motivation_matrix`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_motivation_matrix_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.motivation_matrix import METHOD_ID, all_gates_pass, evaluate_motivation_matrix_gates, generate_motivation_matrix, quadrant_totals

SCHEMA = "ai-lego://specs/cognitive/typed-objects/motivation-matrix-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    entries = [
        {"id": "M1", "source": "INTRINSIC", "polarity": "DRIVES", "description": "想把研究講清楚", "weight": 4},
        {"id": "M2", "source": "EXTRINSIC", "polarity": "DRIVES", "description": "指導教授期限", "weight": 3},
        {"id": "M3", "source": "INTRINSIC", "polarity": "BLOCKS", "description": "怕寫得不夠好", "weight": 4},
        {"id": "M4", "source": "EXTRINSIC", "polarity": "BLOCKS", "description": "晚上被 workshop 佔滿", "weight": 5},
    ]
    return ("MOTMX-2026-09-17-001", "完成論文第三章", entries, P), {}


def refuse() -> Any:
    """Only DRIVES entries -- not a matrix."""
    a, k = fixture_args()
    return generate_motivation_matrix("MOTMX-BAD-001", a[1], a[2][:2], P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["entries"][0]["weight"] = 6
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_motivation_matrix,
    gates=evaluate_motivation_matrix_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="motivation_matrix",
    summary=lambda r: f"{len(r['entries'])} entries, net_drive={quadrant_totals(r)['net_drive']},",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
