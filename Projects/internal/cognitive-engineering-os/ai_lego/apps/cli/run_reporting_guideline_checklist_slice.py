"""``research.reporting_guideline_checklist`` vertical slice. Run: ``python -m
ai_lego.apps.cli.run_reporting_guideline_checklist_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.research.reporting_guideline_checklist import (
    METHOD_ID,
    all_gates_pass,
    catalog_citation,
    catalog_items,
    completeness_summary,
    evaluate_reporting_guideline_checklist_gates,
    generate_reporting_guideline_checklist,
)

SCHEMA = "ai-lego://specs/cognitive/typed-objects/reporting-guideline-checklist-record.schema.yaml"
GUIDELINE_ID = "SRQR"
_PENDING_ITEM_ID = "S9"  # left as a placeholder on purpose, to exercise the recomputed completion %


def _fixture_items() -> list[dict[str, Any]]:
    items = []
    for entry in catalog_items(GUIDELINE_ID):
        if entry["item_id"] == _PENDING_ITEM_ID:
            items.append({**entry, "drafted_content": "TBD: IRB approval number and consent procedure not yet described", "status": "NOT_STARTED"})
        else:
            items.append({**entry, "drafted_content": f"Drafted response for {entry['item_id']} based on the study's own research facts.", "status": "DRAFTED"})
    return items


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    return ("RPTCHK-2026-09-18-001", GUIDELINE_ID, catalog_citation(GUIDELINE_ID), _fixture_items(), make_provenance("AI_SUGGESTION", "AI_SUGGESTED")), {}


def refuse() -> Any:
    """Drops item S21 (Funding) -- fails the exact-item-coverage invariant."""
    items = [item for item in _fixture_items() if item["item_id"] != "S21"]
    return generate_reporting_guideline_checklist("RPTCHK-BAD-001", GUIDELINE_ID, catalog_citation(GUIDELINE_ID), items, make_provenance("AI_SUGGESTION", "AI_SUGGESTED"))


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["items"][0]["requirement_text"] = "not the official wording"  # bypasses the builder's own check
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_reporting_guideline_checklist,
    gates=evaluate_reporting_guideline_checklist_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="reporting_guideline_checklist",
    summary=lambda r: f"{completeness_summary(r)['completion_percentage']}% complete ({completeness_summary(r)['complete_items']}/{completeness_summary(r)['total_items']}),",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
