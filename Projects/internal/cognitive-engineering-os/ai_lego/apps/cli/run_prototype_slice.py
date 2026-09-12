"""``experiment.prototype`` vertical slice -- F15 experiment & validation family (Atlas L738).

Builds a 2-observation, 1-iteration low-fidelity prototype test over a
synthetic UI-navigation learning goal, then proves Atlas's own "iterate"
pipeline stage is a real invariant, not mere narrative order: a
construction-time attempt to submit an iteration that traces to a
NONEXISTENT observation is refused, and a hand-tampered valid record (a
second iteration appended pointing past the end of ``observations[]``,
bypassing the builder) is independently caught by the
``iteration_traceability`` gate.

Run::

    python -m ai_lego.apps.cli.run_prototype_slice
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
from ai_lego.modules.experiment.prototype import (
    METHOD_ID,
    all_gates_pass,
    evaluate_iteration_traceability_gate,
    evaluate_prototype_gates,
    generate_prototype,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-PROTOTYPE-SYNTHETIC-001"
EXECUTION_ID = "EX-PROTOTYPE-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-PROTOTYPE-001"

S = {
    "prototype": "ai-lego://specs/cognitive/typed-objects/prototype-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-prototype-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "learning_goal_": {
            "statement": "使用者能在低保真線框圖上找到『匯出報告』功能",
            "falsifiable_if": "多數受測者在 30 秒內找不到匯出入口",
        },
        "fidelity_": {"level": "LOW", "rationale": "紙本線框圖，無互動邏輯"},
        "user_test_": {
            "method": "5-人可用性測試",
            "participant_count": 5,
            "observations": [
                "3/5 受測者先點了右上角選單而非左側工具列",
                "改版後 5/5 受測者在 10 秒內找到匯出入口",
            ],
        },
        "iterations": [{"change": "把『匯出』移到右上角選單", "triggered_by_observation_index": 0}],
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_prototype_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the well-formed prototype -- 2 observations, 1 iteration tracing to a real observation. ---
    descriptor, prototype = catalog.invoke(
        METHOD_ID,
        generate_prototype,
        "PROTO-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["prototype"], prototype, "prototype")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "PrototypeGenerated", {"prototype": prototype, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_prototype_gates(prototype, "run_prototype_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"prototype gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"PROTO_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "PrototypeGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L738's own "iterate" pipeline stage is not toothless -- an iteration tracing to a
    # NONEXISTENT observation (index 5 against only 2 observations) MUST be refused before any record is
    # constructed. ---
    dangling_kwargs = copy.deepcopy(_well_formed_kwargs())
    dangling_kwargs["iterations"] = [{"change": "改版但沒有真的觀察依據", "triggered_by_observation_index": 5}]
    dangling_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_prototype("PROTO-DANGLING-REFUSED-001", **dangling_kwargs)
    except InvariantViolation as error:
        if "PROTO_DANGLING_OBSERVATION_REF" not in str(error):
            raise
        dangling_refusal_proof["raised"] = True
        dangling_refusal_proof["error_code"] = "PROTO_DANGLING_OBSERVATION_REF"
    if not dangling_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("PROTO_INVARIANT_NOT_ENFORCED: an iteration tracing to a nonexistent observation was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "DanglingObservationRefRefused", {"refusal_proof": dangling_refusal_proof}, 1.3)
    milestones.append("DANGLING_REF_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT iteration_traceability gate catches the same defect
    # class even when a caller bypasses the builder entirely (a second iteration appended pointing at index 9,
    # past the end of the 2-item observations[] list). ---
    tampered = copy.deepcopy(prototype)
    tampered["iterations"].append({"change": "手動塞進去的迭代，沒有對應觀察", "triggered_by_observation_index": 9})
    tampered_gate = evaluate_iteration_traceability_gate(tampered, "run_prototype_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("PROTO_GATE_NOT_INDEPENDENT: the independent iteration_traceability gate did NOT catch a hand-tampered out-of-range observation index")
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
        "prototype": prototype,
        "gate_results": gate_results,
        "dangling_refusal_proof": dangling_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "prototype_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_prototype_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS experiment.prototype: Prototype {result['prototype']['id']} built "
        f"(2 observations, 1 traceable iteration), gates [{gate_summary}]; "
        f"PROTO_DANGLING_OBSERVATION_REF REFUSED a dangling-iteration attempt ({result['dangling_refusal_proof']['error_code']}); "
        f"hand-tampered out-of-range iteration caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
