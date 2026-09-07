"""``learning.decision_journal`` vertical slice -- the ninth Method Atlas slice, second from the
``learning`` family (F17), after ``learning.reversal_criteria``.

Builds a real ``DecisionJournalEntry`` for a synthetic (invented-but-
plausible, disclosed here) architecture decision genuinely grounded in this
codebase's own real domain: whether the Phase 5 runtime's manifest-
execution retry path should adopt an external managed queue service, or a
minimal file-backed queue built inside ``ai_lego/compute`` with no new
external dependency. Two real options, a forecast, and a confidence level
are captured BEFORE the outcome is known -- then, simulating time passing,
an outcome is attached via ``record_outcome``, and both invariants are
verified via the independent gates: (1) the entry genuinely had >= 2
options with exactly one chosen, (2) the stage-1 fields (context/options/
evidence/forecast/confidence) are still byte-for-byte what was recorded at
decision time. A final demonstration hand-tampers a COPY of the completed
record's ``confidence`` field directly (bypassing every real API) and shows
``evaluate_hindsight_bias_integrity_gate`` catches it -- proof the gate is
a genuine re-derivation, not a rubber stamp.

Run::

    python -m ai_lego.apps.cli.run_decision_journal_slice
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
from ai_lego.core.domain.tenant import NORDBROOK
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.learning.decision_journal import (
    METHOD_ID,
    all_gates_pass,
    evaluate_decision_journal_gates,
    evaluate_hindsight_bias_integrity_gate,
    evidence_item,
    generate_decision_journal_entry,
    option,
    record_outcome,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-DECISIONJOURNAL-SYNTHETIC-001"
EXECUTION_ID = "EX-DECISIONJOURNAL-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-DECISIONJOURNAL-001"

S = {
    "decision_journal_entry": "ai-lego://specs/cognitive/typed-objects/decision-journal-entry.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-decision-journal-slice"


def run_decision_journal_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Stage 1: capture context/options/evidence/forecast/confidence BEFORE the outcome is known
    # (Atlas L806 / §12.36). Synthetic architecture decision, disclosed as invented-but-plausible. ---
    options = [
        option("OPT-A", "Adopt a managed queue service for the manifest-execution retry path (external dependency, less code to operate)", False),
        option("OPT-B", "Build a minimal file-backed queue inside ai_lego/compute (no new external dependency, more code to maintain)", True),
    ]
    evidence = [
        evidence_item(
            "EV-1",
            "Current runtime has zero external network dependencies outside the read-only spec root.",
            make_provenance("SOURCE_FACT", "HUMAN_ORIGINAL"),
            source="ai_lego/core codebase inspection, 2026-09-07",
        ),
        evidence_item(
            "EV-2",
            "Assumed retry volume will stay low (< 100/day) based on current manifest step counts.",
            make_provenance("ASSUMPTION", "HUMAN_ORIGINAL"),
        ),
    ]
    descriptor, entry = catalog.invoke(
        METHOD_ID,
        generate_decision_journal_entry,
        "DJ-2026-09-07-001",
        "Phase 5 runtime needs a queue backend for the manifest-execution retry path before the next slice batch starts.",
        options,
        evidence,
        "The file-backed queue will handle real load without needing the managed service for at least 2 quarters.",
        65,
        make_provenance("DECISION", "HUMAN_APPROVED", locked="LOCKED_DECISION"),
    )
    contracts.validate(S["decision_journal_entry"], entry, "decision journal entry (stage 1)")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DecisionJournalEntryGenerated", {"decision_journal_entry": entry, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    stage1_gates = evaluate_decision_journal_gates(entry, "run_decision_journal_slice", clock.at(1.1))
    for gate in stage1_gates:
        contracts.validate(S["gate_result"], gate, f"decision journal stage-1 gate {gate['gate_id']}")
    if not all_gates_pass(stage1_gates):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"DECISIONJOURNAL_GATE_FAILED: {[g['gate_id'] for g in stage1_gates if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DecisionJournalGatesEvaluated", {"stage": "stage1", "gate_results": stage1_gates}, 1.2)
    milestones.append("STAGE1_GATES_PASSED")

    # --- Simulate time passing: the outcome becomes known. record_outcome has no parameter that could
    # change context/options/evidence/forecast/confidence -- it can only copy them forward. ---
    completed = record_outcome(
        entry,
        "File-backed queue handled real load for 2 quarters with no capacity issues, but needed one hotfix "
        "(a lock-file race under concurrent slice runs) discovered in month 1 and patched the same week.",
        make_provenance("SOURCE_FACT", "HUMAN_ORIGINAL"),
        "2026-11-15T00:00:00Z",
    )
    contracts.validate(S["decision_journal_entry"], completed, "decision journal entry (stage 2, outcome attached)")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DecisionJournalOutcomeRecorded", {"decision_journal_entry": completed}, 2)
    milestones.append("OUTCOME_RECORDED")

    stage2_gates = evaluate_decision_journal_gates(completed, "run_decision_journal_slice", clock.at(2.1))
    for gate in stage2_gates:
        contracts.validate(S["gate_result"], gate, f"decision journal stage-2 gate {gate['gate_id']}")
    if not all_gates_pass(stage2_gates):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"DECISIONJOURNAL_GATE_FAILED: {[g['gate_id'] for g in stage2_gates if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DecisionJournalGatesEvaluated", {"stage": "stage2", "gate_results": stage2_gates}, 2.2)
    milestones.append("STAGE2_GATES_PASSED")

    # --- Real tamper-detection demonstration: hand-edit a COPY of the completed record's confidence field
    # directly (the exact class of hindsight-bias edit this whole method exists to catch), bypassing every
    # real API, and confirm the independent gate genuinely fails it rather than rubber-stamping. ---
    tampered = copy.deepcopy(completed)
    tampered["confidence"] = 95  # a hindsight-biased actor bumping their stated confidence up after seeing the outcome went well
    tamper_gate_result = evaluate_hindsight_bias_integrity_gate(tampered, "run_decision_journal_slice", clock.at(2.3))
    if tamper_gate_result["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("DECISIONJOURNAL_TAMPER_DEMO_DID_NOT_FAIL: hand-tampered confidence was not caught -- the gate is not doing real re-derivation")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DecisionJournalTamperDetected", {"tampered_confidence": tampered["confidence"], "original_confidence": completed["confidence"], "gate_result": tamper_gate_result}, 2.4)
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
        "decision_journal_entry_stage1": entry,
        "decision_journal_entry_stage2": completed,
        "stage1_gate_results": stage1_gates,
        "stage2_gate_results": stage2_gates,
        "tamper_detection_demo": {"tampered_confidence": tampered["confidence"], "original_confidence": completed["confidence"], "gate_result": tamper_gate_result},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "decision_journal_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_decision_journal_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    stage1_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["stage1_gate_results"])
    stage2_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["stage2_gate_results"])
    tamper = result["tamper_detection_demo"]
    print(
        f"PASS learning.decision_journal: entry {result['decision_journal_entry_stage1']['id']!r}, "
        f"2 options (1 chosen), stage1 gates [{stage1_summary}], stage2 gates [{stage2_summary}], "
        f"tamper-detection demo: hand-edited confidence {tamper['original_confidence']}->{tamper['tampered_confidence']} "
        f"caught by hindsight_bias_integrity gate (status={tamper['gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
