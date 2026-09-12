"""``delivery.stage_gate`` vertical slice -- F22 PM/Delivery/Governance family (Atlas L921, §11.52).

Builds a 2-stage review sequence (Discovery GOes with real evidence, Build HOLDs pending more data) then
proves §11.52's own sunk-cost-prevention benefit is a real invariant, not mere narrative order: a
construction-time attempt to declare GO with no evidence is refused, and a hand-tampered valid record
(evidence blanked out AFTER a GO decision was already set, bypassing the builder) is independently
caught by the go_decision_evidence gate.

Run::

    python -m ai_lego.apps.cli.run_stage_gate_slice
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
from ai_lego.modules.delivery.stage_gate import (
    METHOD_ID,
    all_gates_pass,
    evaluate_go_decision_evidence_gate,
    evaluate_stage_gate_gates,
    generate_stage_gate,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-STAGEGATE-SYNTHETIC-001"
EXECUTION_ID = "EX-STAGEGATE-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-STAGEGATE-001"

S = {
    "stage_gate": "ai-lego://specs/cognitive/typed-objects/stage-gate-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-stage-gate-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "stage_reviews": [
            {
                "stage_name": "Discovery",
                "evidence": ["12 customer interviews confirm the pain point", "3 competitors lack this feature"],
                "gate_criteria": [">=10 confirmed customer interviews", ">=1 differentiated angle vs competitors"],
                "gate_decision": "GO",
            },
            {
                "stage_name": "Build",
                "evidence": [],
                "gate_criteria": ["prototype clickthrough rate >=20%"],
                "gate_decision": "HOLD",
            },
        ],
        "provenance": make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
    }


def run_stage_gate_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the well-formed record -- Discovery GOes WITH evidence, Build HOLDs with no evidence
    # required (HOLD is not GO). ---
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_stage_gate,
        "STAGEGATE-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["stage_gate"], record, "stage gate record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "StageGateGenerated", {"record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_stage_gate_gates(record, "run_stage_gate_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"stage gate gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"STAGEGATE_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "StageGateGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove §11.52's own sunk-cost-prevention rule is not toothless -- a GO decision with NO
    # evidence MUST be refused before any record is constructed. ---
    go_no_evidence_kwargs = copy.deepcopy(_well_formed_kwargs())
    go_no_evidence_kwargs["stage_reviews"][1]["gate_decision"] = "GO"  # Build had evidence==[] -- now GO, still no evidence
    go_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_stage_gate("STAGEGATE-GO-NO-EVIDENCE-REFUSED-001", **go_no_evidence_kwargs)
    except InvariantViolation as error:
        if "STAGEGATE_GO_WITHOUT_EVIDENCE" not in str(error):
            raise
        go_refusal_proof["raised"] = True
        go_refusal_proof["error_code"] = "STAGEGATE_GO_WITHOUT_EVIDENCE"
    if not go_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("STAGEGATE_INVARIANT_NOT_ENFORCED: a GO decision with no evidence was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "GoWithoutEvidenceRefused", {"refusal_proof": go_refusal_proof}, 1.3)
    milestones.append("GO_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT go_decision_evidence gate catches the same
    # defect class even when a caller bypasses the builder entirely (evidence blanked on an already-GO
    # review). ---
    tampered = copy.deepcopy(record)
    tampered["stage_reviews"][0]["evidence"] = []  # Discovery was GO with real evidence -- blank it out post-construction
    tampered_gate = evaluate_go_decision_evidence_gate(tampered, "run_stage_gate_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("STAGEGATE_GATE_NOT_INDEPENDENT: the independent go_decision_evidence gate did NOT catch a hand-tampered GO review with blanked evidence")
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
        "stage_gate": record,
        "gate_results": gate_results,
        "go_refusal_proof": go_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "stage_gate_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_stage_gate_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS delivery.stage_gate: StageGateRecord {result['stage_gate']['id']} built "
        f"(2 stage reviews -- GO/HOLD), gates [{gate_summary}]; "
        f"STAGEGATE_GO_WITHOUT_EVIDENCE REFUSED a go-with-no-evidence attempt ({result['go_refusal_proof']['error_code']}); "
        f"hand-tampered blanked-evidence-after-go caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
