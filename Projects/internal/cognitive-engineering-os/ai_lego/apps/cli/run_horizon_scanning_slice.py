"""``foresight.horizon_scanning`` vertical slice -- F13 foresight family (Atlas L672, §12.22 L2811-2818).

Builds a real ``HorizonScanRecord`` scanning 1 domain (AI 監管) via 1 source
(EU AI Act 官方公報), producing 1 signal carrying all six of §12.22 L2817's
mandatory fields. Then proves the six-field mandate is real, not mere
narrative intent: a construction-time attempt to declare a signal missing
``confidence`` is refused, and a hand-tampered valid record (same field
deleted directly, bypassing the builder) is independently caught by the
gate.

Run::

    python -m ai_lego.apps.cli.run_horizon_scanning_slice
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
from ai_lego.modules.foresight.horizon_scanning import (
    METHOD_ID,
    all_gates_pass,
    evaluate_horizon_scanning_gates,
    evaluate_signal_fields_gate,
    generate_horizon_scan_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-HSCAN-SYNTHETIC-001"
EXECUTION_ID = "EX-HSCAN-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-HSCAN-001"

S = {
    "horizon_scan_record": "ai-lego://specs/cognitive/typed-objects/horizon-scan-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-horizon-scanning-slice"


def _domains() -> list[dict[str, Any]]:
    return [{"domain_id": "D-REGULATION", "name": "AI 監管"}]


def _sources() -> list[dict[str, Any]]:
    return [{"source_id": "S-EUAIACT", "name": "EU AI Act 官方公報"}]


def _well_formed_signal() -> dict[str, Any]:
    return {
        "id": "SIG-1",
        "domain": "D-REGULATION",
        "source": "S-EUAIACT",
        "description": "高風險 AI 系統的合規期限提前",
        "date": "2026-09-01",
        "geography": "EU",
        "status": "CONFIRMING",
        "impact": "客戶合規產品線需提前 6 個月交付",
        "confidence": "MEDIUM",
    }


def run_horizon_scanning_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed scan -- 1 domain, 1 source, 1 signal carrying all six mandatory
    # fields. ---
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_horizon_scan_record,
        "HSCAN-2026-09-12-001",
        _domains(),
        _sources(),
        [_well_formed_signal()],
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["horizon_scan_record"], record, "horizon scan record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "HorizonScanRecordGenerated", {"horizon_scan_record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_horizon_scanning_gates(record, "run_horizon_scanning_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"horizon scanning gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"HSCAN_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "HorizonScanningGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas §12.22 L2817's own six-field mandate is not toothless -- a signal missing
    # ``confidence`` MUST be refused before any record is constructed. ---
    incomplete_signal = {k: v for k, v in _well_formed_signal().items() if k != "confidence"}
    incomplete_signal["id"] = "SIG-INCOMPLETE"
    refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_horizon_scan_record("HSCAN-INCOMPLETE-SIGNAL-REFUSED-001", _domains(), _sources(), [incomplete_signal], make_provenance("AI_INFERENCE", "AI_GENERATED"))
    except InvariantViolation as error:
        if "HSCAN_INVALID_SIGNAL" not in str(error):
            raise
        refusal_proof["raised"] = True
        refusal_proof["error_code"] = "HSCAN_INVALID_SIGNAL"
    if not refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("HSCAN_INVARIANT_NOT_ENFORCED: a signal missing a mandatory field was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "IncompleteSignalRefused", {"refusal_proof": refusal_proof}, 1.3)
    milestones.append("INCOMPLETE_SIGNAL_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT gate catches the same defect even when a caller
    # bypasses the builder entirely (deletes ``geography`` directly on a VALID record's own raw dict). ---
    tampered = copy.deepcopy(record)
    del tampered["signals"][0]["geography"]
    tampered_gate = evaluate_signal_fields_gate(tampered, "run_horizon_scanning_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("HSCAN_GATE_NOT_INDEPENDENT: the independent signal_six_fields_required gate did NOT catch a hand-tampered record missing a mandatory field")
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
        "horizon_scan_record": record,
        "gate_results": gate_results,
        "incomplete_signal_refusal_proof": refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_evidence_matrix_slice.py)",
    }
    write_json(runtime / "results" / "horizon_scanning_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_horizon_scanning_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS foresight.horizon_scanning: HorizonScanRecord {result['horizon_scan_record']['id']} built (1 domain, 1 source, 1 signal), gates [{gate_summary}]; "
        f"HSCAN_INVALID_SIGNAL REFUSED a signal missing a mandatory field ({result['incomplete_signal_refusal_proof']['error_code']}); "
        f"hand-tampered record (a mandatory field deleted) caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
