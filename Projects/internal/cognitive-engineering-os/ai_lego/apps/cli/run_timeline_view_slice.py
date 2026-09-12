"""``representation.timeline_view`` vertical slice -- F24 representation family (Atlas L968).

Renders a 3-event timeline over a synthetic knowledge-object scenario whose events are DECLARED out of
chronological order (EVT-1, EVT-2, EVT-3 with event_time 100/300/200) but whose ordered_event_refs is
correctly sorted (EVT-1, EVT-3, EVT-2), then proves Atlas L968's own "events->time" pipeline stage is a real
invariant, not a caller's narrative: a construction-time attempt to submit a MIS-ORDERED sequence is refused,
and a hand-tampered valid record (two ordered_event_refs entries silently swapped after construction) is
independently caught by the chronological_order gate.

Run::

    python -m ai_lego.apps.cli.run_timeline_view_slice
"""

from __future__ import annotations

import argparse
import copy
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ai_lego import PRODUCT_ROOT, REPO_ROOT, __version__, resolve_spec_root
from ai_lego.core.contracts.ledger_guards import PiiLedgerGuard
from ai_lego.core.contracts.runtime_dir import guard_runtime_dir, prepare_runtime_dir
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.core.domain.tenant import CASCADIA
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.representation.timeline_view import (
    METHOD_ID,
    all_gates_pass,
    evaluate_chronological_order_gate,
    evaluate_timeline_view_gates,
    generate_timeline_view,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-TLVIEW-SYNTHETIC-001"
EXECUTION_ID = "EX-TLVIEW-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-TLVIEW-001"

S = {
    "timeline_view": "ai-lego://specs/cognitive/typed-objects/timeline-view-record.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-timeline-view-slice"


def _source_events() -> list[dict[str, Any]]:
    # Declared out of chronological order on purpose -- event_time is what actually orders them.
    return [
        {"event_id": "EVT-1", "event_time": 100},
        {"event_id": "EVT-2", "event_time": 300},
        {"event_id": "EVT-3", "event_time": 200},
    ]


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "knowledge_ref": "KO-2026-09-12-001",
        "events": _source_events(),
        "ordered_event_refs": [
            {"event_id": "EVT-1", "marker_type": "event"},
            {"event_id": "EVT-3", "marker_type": "decision"},
            {"event_id": "EVT-2", "marker_type": "change"},
        ],
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_timeline_view_slice(config: SliceConfig) -> dict[str, Any]:
    spec_root = resolve_spec_root(config.spec_root)
    runtime = (config.runtime_dir or default_runtime_dir()).resolve()
    allowed_repo_location = PRODUCT_ROOT / ".runtime"
    guard_runtime_dir(runtime, spec_root, REPO_ROOT, allowed_repo_location)
    prepare_runtime_dir(runtime, config.reset)

    clock = DEFAULT_CLOCK
    contracts = SchemaContracts(spec_root)
    pii_guard = PiiLedgerGuard()
    ledger = EventLedger(runtime / "data" / "events" / "ledger.jsonl", RUN_ID, clock, validator=contracts.validate, payload_guard=pii_guard)

    milestones: list[str] = ["RECEIVED"]

    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed timeline -- 3 events, genuinely sorted by event_time. ---
    descriptor, view = catalog.invoke(
        METHOD_ID,
        generate_timeline_view,
        "TLVIEW-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["timeline_view"], view, "timeline view")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TimelineViewGenerated", {"view": view, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_timeline_view_gates(view, _source_events(), "run_timeline_view_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"timeline view gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"TLVIEW_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TimelineViewGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L968's own "events->time" pipeline stage is not toothless -- a MIS-ORDERED
    # caller-proposed sequence (EVT-2 before EVT-3, though EVT-3's event_time is earlier) MUST be refused
    # before any record is constructed. ---
    misordered_kwargs = copy.deepcopy(_well_formed_kwargs())
    misordered_kwargs["ordered_event_refs"][1], misordered_kwargs["ordered_event_refs"][2] = (
        misordered_kwargs["ordered_event_refs"][2],
        misordered_kwargs["ordered_event_refs"][1],
    )
    order_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_timeline_view("TLVIEW-ORDER-REFUSED-001", **misordered_kwargs)
    except InvariantViolation as error:
        if "TLVIEW_ORDER_MISMATCH" not in str(error):
            raise
        order_refusal_proof["raised"] = True
        order_refusal_proof["error_code"] = "TLVIEW_ORDER_MISMATCH"
    if not order_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("TLVIEW_INVARIANT_NOT_ENFORCED: a mis-ordered ordered_event_refs sequence was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "OrderMismatchRefused", {"refusal_proof": order_refusal_proof}, 1.3)
    milestones.append("ORDER_MISMATCH_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT chronological_order gate catches the same defect
    # class even when a caller bypasses the builder entirely (the last two entries silently swapped after
    # construction). ---
    tampered = copy.deepcopy(view)
    tampered["ordered_event_refs"][1], tampered["ordered_event_refs"][2] = tampered["ordered_event_refs"][2], tampered["ordered_event_refs"][1]
    tampered_gate = evaluate_chronological_order_gate(tampered, _source_events(), "run_timeline_view_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("TLVIEW_GATE_NOT_INDEPENDENT: the independent chronological_order gate did NOT catch a hand-tampered order swap")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_result": tampered_gate}, 2.1)
    ledger.close_aggregate(AGGREGATE_ID)
    milestones.append("VERIFYING")

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_id": METHOD_ID,
        "method_resolution": resolution,
        "method_invocation": descriptor,
        "timeline_view": view,
        "gate_results": gate_results,
        "order_mismatch_refusal_proof": order_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "timeline_view_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_timeline_view_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS representation.timeline_view: TimelineView {result['timeline_view']['id']} built "
        f"(3 events, genuinely sorted by event_time), gates [{gate_summary}]; "
        f"TLVIEW_ORDER_MISMATCH REFUSED a mis-ordered sequence ({result['order_mismatch_refusal_proof']['error_code']}); "
        f"hand-tampered order swap caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
