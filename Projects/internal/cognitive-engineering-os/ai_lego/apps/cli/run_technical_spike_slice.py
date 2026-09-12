"""``experiment.technical_spike`` vertical slice -- F15 experiment & validation family (Atlas L741).

Builds a well-formed, bounded 3-day spike record over a synthetic caching-
library feasibility question, then proves Atlas's own timebox->decision
pipeline is a real invariant, not mere narrative order: a construction-time
attempt to submit a record whose actual closure exceeds its own declared
deadline is refused, and a hand-tampered valid record (the decision note
back-dated to before the spike even started, bypassing the builder) is
independently caught by the decision_grounded gate.

Run::

    python -m ai_lego.apps.cli.run_technical_spike_slice
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
from ai_lego.modules.experiment.technical_spike import (
    METHOD_ID,
    all_gates_pass,
    evaluate_decision_grounded_gate,
    evaluate_technical_spike_gates,
    generate_technical_spike_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-SPIKE-SYNTHETIC-001"
EXECUTION_ID = "EX-SPIKE-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-SPIKE-001"

S = {
    "technical_spike": "ai-lego://specs/cognitive/typed-objects/technical-spike-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-technical-spike-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "question": "Can library X sustain 10k req/s with our data shape?",
        "timebox": {
            "started_at": "2026-09-08T09:00:00Z",
            "deadline": "2026-09-11T09:00:00Z",
            "closed_at": "2026-09-11T08:30:00Z",
        },
        "findings": [
            {"source_type": "EXPERIMENT", "summary": "Benchmarked 12k req/s sustained over 1h under production-shaped load"},
            {"source_type": "DOCS", "summary": "Vendor docs confirm a horizontal-sharding path if load grows beyond this benchmark"},
        ],
        "decision_note": {
            "decision": "GO -- adopt library X for the caching layer",
            "rationale": "Benchmark exceeds the 10k req/s target with headroom; sharding path covers future growth",
            "decided_at": "2026-09-11T08:30:00Z",
        },
        "provenance": make_provenance("CALCULATED_RESULT", "HUMAN_APPROVED"),
    }


def run_technical_spike_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the well-formed, bounded spike record. ---
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_technical_spike_record,
        "SPIKE-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["technical_spike"], record, "technical spike record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TechnicalSpikeRecordGenerated", {"record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_technical_spike_gates(record, "run_technical_spike_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"technical spike gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"SPIKE_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TechnicalSpikeGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L741's own timebox is not toothless -- an actual closure PAST the declared
    # deadline MUST be refused before any record is constructed. ---
    exceeded_kwargs = copy.deepcopy(_well_formed_kwargs())
    exceeded_kwargs["timebox"]["closed_at"] = "2026-09-11T09:30:00Z"  # 30 minutes past the 09:00 deadline
    timebox_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_technical_spike_record("SPIKE-TIMEBOX-EXCEEDED-REFUSED-001", **exceeded_kwargs)
    except InvariantViolation as error:
        if "SPIKE_TIMEBOX_EXCEEDED" not in str(error):
            raise
        timebox_refusal_proof["raised"] = True
        timebox_refusal_proof["error_code"] = "SPIKE_TIMEBOX_EXCEEDED"
    if not timebox_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("SPIKE_INVARIANT_NOT_ENFORCED: a spike closed past its own declared deadline was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TimeboxExceededRefused", {"refusal_proof": timebox_refusal_proof}, 1.3)
    milestones.append("TIMEBOX_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT decision_grounded gate catches a decision note
    # back-dated to before the spike even started, even though the builder never re-runs on this record. ---
    tampered = copy.deepcopy(record)
    tampered["decision_note"]["decided_at"] = "2026-09-01T00:00:00Z"  # a full week before started_at
    tampered_gate = evaluate_decision_grounded_gate(tampered, "run_technical_spike_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("SPIKE_GATE_NOT_INDEPENDENT: the independent decision_grounded gate did NOT catch a hand-tampered decided_at before the spike's own started_at")
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
        "technical_spike_record": record,
        "gate_results": gate_results,
        "timebox_refusal_proof": timebox_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_cross_impact_analysis_slice.py)",
    }
    write_json(runtime / "results" / "technical_spike_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_technical_spike_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS experiment.technical_spike: TechnicalSpikeRecord {result['technical_spike_record']['id']} built "
        f"(bounded timebox, 2 findings, grounded decision), gates [{gate_summary}]; "
        f"SPIKE_TIMEBOX_EXCEEDED REFUSED a closure-past-deadline attempt ({result['timebox_refusal_proof']['error_code']}); "
        f"hand-tampered back-dated decision caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
