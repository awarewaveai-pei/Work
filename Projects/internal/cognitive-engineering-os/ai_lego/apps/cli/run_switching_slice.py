"""``representation.switching`` vertical slice -- F24 representation family (Atlas L963, §11.55).

Builds a 3-way representation switch (Text -> Table -> Mind Map) over one
Knowledge Object with consistent knowledge_object_id and provenance across
every view, then proves Atlas §11.55's own "Provenance 保持一致" / "不會...
複製出多份互相衝突內容" benefits are real invariants, not mere narrative
order: a construction-time attempt to name a view with a DIFFERENT
knowledge_object_id is refused, and a hand-tampered valid record (one view's
provenance silently mutated after construction, bypassing the builder) is
independently caught by the cross_view_consistency gate.

Run::

    python -m ai_lego.apps.cli.run_switching_slice
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
from ai_lego.modules.representation.switching import (
    METHOD_ID,
    all_gates_pass,
    evaluate_representation_switch_event_gates,
    evaluate_cross_view_consistency_gate,
    generate_representation_switch_event,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-REPSWITCH-SYNTHETIC-001"
EXECUTION_ID = "EX-REPSWITCH-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-REPSWITCH-001"

S = {
    "representation_switch_event": "ai-lego://specs/cognitive/typed-objects/representation-switch-event.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-representation-switching-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    shared_provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
    return {
        "views": [
            {"category": "text", "knowledge_object_id": "KO-001", "provenance": shared_provenance},
            {"category": "table", "knowledge_object_id": "KO-001", "provenance": shared_provenance},
            {"category": "mindmap", "knowledge_object_id": "KO-001", "provenance": shared_provenance},
        ],
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_switching_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed 3-way switch -- consistent knowledge_object_id + provenance. ---
    descriptor, event = catalog.invoke(
        METHOD_ID,
        generate_representation_switch_event,
        "REPSWITCH-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["representation_switch_event"], event, "representation switch event")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "RepresentationSwitchEventGenerated", {"event": event, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_representation_switch_event_gates(event, "run_switching_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"representation switch event gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"REPSWITCH_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "RepresentationSwitchEventGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas §11.55's own knowledge-object-consistency requirement is not toothless -- a
    # view naming a DIFFERENT knowledge_object_id MUST be refused before any record is constructed. ---
    mismatched_kwargs = copy.deepcopy(_well_formed_kwargs())
    mismatched_kwargs["views"][-1]["knowledge_object_id"] = "KO-002"  # diverges from KO-001
    mismatch_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_representation_switch_event("REPSWITCH-MISMATCH-REFUSED-001", **mismatched_kwargs)
    except InvariantViolation as error:
        if "REPSWITCH_KNOWLEDGE_OBJECT_MISMATCH" not in str(error):
            raise
        mismatch_refusal_proof["raised"] = True
        mismatch_refusal_proof["error_code"] = "REPSWITCH_KNOWLEDGE_OBJECT_MISMATCH"
    if not mismatch_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("REPSWITCH_INVARIANT_NOT_ENFORCED: a switch record naming two different knowledge_object_ids was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "KnowledgeObjectMismatchRefused", {"refusal_proof": mismatch_refusal_proof}, 1.3)
    milestones.append("MISMATCH_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT cross_view_consistency gate catches the same defect
    # class even when a caller bypasses the builder entirely (one view's provenance silently mutated after
    # construction). ---
    tampered = copy.deepcopy(event)
    tampered["views"][-1]["provenance"]["epistemic_type"] = "HUMAN_OPINION"
    tampered_gate = evaluate_cross_view_consistency_gate(tampered, "run_switching_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("REPSWITCH_GATE_NOT_INDEPENDENT: the independent cross_view_consistency gate did NOT catch a hand-tampered divergent per-view provenance")
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
        "representation_switch_event": event,
        "gate_results": gate_results,
        "mismatch_refusal_proof": mismatch_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "switching_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_switching_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS representation.switching: RepresentationSwitchEvent {result['representation_switch_event']['id']} built "
        f"(3 views -- consistent knowledge_object_id + provenance), gates [{gate_summary}]; "
        f"REPSWITCH_KNOWLEDGE_OBJECT_MISMATCH REFUSED a divergent-object attempt ({result['mismatch_refusal_proof']['error_code']}); "
        f"hand-tampered divergent provenance caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
