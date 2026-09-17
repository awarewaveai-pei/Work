"""``art_therapy.wusheng_five_phase`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_wusheng_five_phase_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.wusheng_five_phase import PHASE_REFERENCE, METHOD_ID, all_gates_pass, evaluate_wusheng_five_phase_gates, generate_wusheng_five_phase

SCHEMA = "ai-lego://specs/cognitive/typed-objects/wusheng-five-phase-record.schema.yaml"


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    return (
        "WUSHENG-2026-09-18-001",
        "個案 A 的五階段歷程記錄",
        "WS-02",
        "個案本週回報連續三天完成晨間例行公事，提到「比較沒那麼卡住了」；但週五因工作截止日又出現失眠。",
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
    ), {"linked_tool_ids": ["ART-TOOL-014", "ART-TOOL-027"]}


def refuse() -> Any:
    """A free-text phase label, not one of the closed WS-01..WS-05 set."""
    return generate_wusheng_five_phase("WUSHENG-BAD-001", "x", "進步中，還沒到下一階段", "evidence", make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["current_phase"] = "WS-06"  # outside the closed set, bypassing the builder
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_wusheng_five_phase,
    gates=evaluate_wusheng_five_phase_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="wusheng_five_phase",
    summary=lambda r: f"phase={r['current_phase']} ({PHASE_REFERENCE[r['current_phase']]['name_en']}), linked_tools={len(r.get('linked_tool_ids') or [])},",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
