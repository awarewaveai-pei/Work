"""``experiment.proof_of_concept`` vertical slice -- F15 experiment & validation family (Atlas L740).

Builds an isolated-benchmark PoC record over a synthetic vector-retrieval
latency unknown where the benchmark beats the pre-defined success
criterion, then proves Atlas's own "isolated implementation" pipeline stage
is a real invariant, not mere narrative order: a construction-time attempt
to submit an implementation with ``production_integration: true`` is
refused, and a hand-tampered valid record (``feasibility_verdict`` flipped
to contradict its own benchmark, bypassing the builder) is independently
caught by the ``verdict_consistency`` gate.

Run::

    python -m ai_lego.apps.cli.run_proof_of_concept_slice
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
from ai_lego.modules.experiment.proof_of_concept import (
    METHOD_ID,
    all_gates_pass,
    evaluate_proof_of_concept_gates,
    evaluate_verdict_consistency_gate,
    generate_proof_of_concept,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-POC-SYNTHETIC-001"
EXECUTION_ID = "EX-POC-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-POC-001"

S = {
    "proof_of_concept": "ai-lego://specs/cognitive/typed-objects/proof-of-concept-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-proof-of-concept-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "technical_unknown_": {"statement": "向量檢索能否在 50ms 內回應 100 萬筆 embedding 的 top-10 查詢"},
        "success_criteria_": {"metric": "p95 延遲 (ms)", "threshold": 50, "comparison": "LTE"},
        "implementation_": {
            "description": "獨立沙盒服務，讀唯讀快照，未接任何 production 流量",
            "isolated": True,
            "production_integration": False,
        },
        "benchmark_result_": {"measured_value": 38, "environment": "沙盒 VM, 1M 筆合成 embedding", "methodology": "1000 次查詢取 p95"},
        "provenance": make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    }


def run_proof_of_concept_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the well-formed PoC -- isolated, benchmark (38ms) beats the pre-defined 50ms LTE bar. ---
    descriptor, poc = catalog.invoke(
        METHOD_ID,
        generate_proof_of_concept,
        "POC-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["proof_of_concept"], poc, "proof of concept")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ProofOfConceptGenerated", {"proof_of_concept": poc, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_proof_of_concept_gates(poc, "run_proof_of_concept_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"proof of concept gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"POC_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ProofOfConceptGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L740's own "isolated implementation" pipeline stage is not toothless -- an
    # implementation with production_integration=true MUST be refused before any record is constructed. ---
    non_isolated_kwargs = copy.deepcopy(_well_formed_kwargs())
    non_isolated_kwargs["implementation_"]["production_integration"] = True
    non_isolated_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_proof_of_concept("POC-NOT-ISOLATED-REFUSED-001", **non_isolated_kwargs)
    except InvariantViolation as error:
        if "POC_NOT_ISOLATED" not in str(error):
            raise
        non_isolated_refusal_proof["raised"] = True
        non_isolated_refusal_proof["error_code"] = "POC_NOT_ISOLATED"
    if not non_isolated_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("POC_INVARIANT_NOT_ENFORCED: an implementation with production_integration=true was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "NotIsolatedRefused", {"refusal_proof": non_isolated_refusal_proof}, 1.3)
    milestones.append("NOT_ISOLATED_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT verdict_consistency gate catches the same defect
    # class even when a caller bypasses the builder entirely (feasibility_verdict flipped to False despite the
    # benchmark_result actually beating the success_criteria). ---
    tampered = copy.deepcopy(poc)
    tampered["feasibility_verdict"] = not tampered["feasibility_verdict"]
    tampered_gate = evaluate_verdict_consistency_gate(tampered, "run_proof_of_concept_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("POC_GATE_NOT_INDEPENDENT: the independent verdict_consistency gate did NOT catch a hand-tampered feasibility_verdict contradicting its own benchmark")
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
        "proof_of_concept": poc,
        "gate_results": gate_results,
        "not_isolated_refusal_proof": non_isolated_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "proof_of_concept_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_proof_of_concept_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS experiment.proof_of_concept: ProofOfConcept {result['proof_of_concept']['id']} built "
        f"(isolated, feasibility_verdict={result['proof_of_concept']['feasibility_verdict']}), gates [{gate_summary}]; "
        f"POC_NOT_ISOLATED REFUSED a production_integration=true attempt ({result['not_isolated_refusal_proof']['error_code']}); "
        f"hand-tampered feasibility_verdict caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
