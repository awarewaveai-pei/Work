"""``foresight.weak_signal_detection`` vertical slice -- F13 foresight family (Atlas L673).

Builds a real ``WeakSignalDetectionRecord`` triangulating 1 weak signal (a
niche uptake pattern) via 2 distinct corroborating sources, ``monitor_status:
MONITORING``. Then proves Atlas L673's own "triangulate" pipeline word is
real, not mere narrative intent: a construction-time attempt to declare a
weak signal with a single source (plus a duplicate whitespace-variant of
that same source, proving normalization is real) is refused, and a
hand-tampered valid record (a corroborating source deleted directly,
bypassing the builder) is independently caught by the gate.

Run::

    python -m ai_lego.apps.cli.run_weak_signal_detection_slice
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
from ai_lego.modules.foresight.weak_signal_detection import (
    METHOD_ID,
    all_gates_pass,
    evaluate_triangulation_gate,
    evaluate_weak_signal_detection_gates,
    generate_weak_signal_detection_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-WSIG-SYNTHETIC-001"
EXECUTION_ID = "EX-WSIG-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-WSIG-001"

S = {
    "weak_signal_detection_record": "ai-lego://specs/cognitive/typed-objects/weak-signal-detection.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-weak-signal-detection-slice"


def _well_formed_weak_signal() -> dict[str, Any]:
    return {
        "id": "WS-1",
        "description": "東南亞小型工廠開始詢問客製化 AI 品檢方案",
        "corroborating_source_refs": ["越南展會攤位訪談紀錄", "泰國經銷商季度回報"],
        "monitor_status": "MONITORING",
    }


def run_weak_signal_detection_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed record -- 1 weak signal triangulated by 2 distinct sources. ---
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_weak_signal_detection_record,
        "WSIG-2026-09-12-001",
        [_well_formed_weak_signal()],
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["weak_signal_detection_record"], record, "weak signal detection record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "WeakSignalDetectionRecordGenerated", {"weak_signal_detection_record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_weak_signal_detection_gates(record, "run_weak_signal_detection_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"weak signal detection gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"WSIG_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "WeakSignalDetectionGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L673's own "triangulate" word is not toothless -- a weak signal corroborated by
    # 1 source plus a whitespace-variant duplicate of that SAME source (normalization proof: "越南展會攤位訪談紀錄"
    # vs "越南展會攤位訪談紀錄 " must still count as ONE distinct source, not two) MUST be refused. ---
    untriangulated = {**_well_formed_weak_signal(), "id": "WS-UNTRIANGULATED", "corroborating_source_refs": ["越南展會攤位訪談紀錄", "越南展會攤位訪談紀錄 "]}
    refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_weak_signal_detection_record("WSIG-UNTRIANGULATED-REFUSED-001", [untriangulated], make_provenance("AI_INFERENCE", "AI_GENERATED"))
    except InvariantViolation as error:
        if "WSIG_INVALID_WEAK_SIGNAL" not in str(error):
            raise
        refusal_proof["raised"] = True
        refusal_proof["error_code"] = "WSIG_INVALID_WEAK_SIGNAL"
    if not refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("WSIG_INVARIANT_NOT_ENFORCED: an untriangulated (single-distinct-source) weak signal was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "UntriangulatedSignalRefused", {"refusal_proof": refusal_proof}, 1.3)
    milestones.append("UNTRIANGULATED_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT gate catches the same defect even when a caller
    # bypasses the builder entirely (deletes down to 1 source directly on a VALID record's own raw dict). ---
    tampered = copy.deepcopy(record)
    tampered["weak_signals"][0]["corroborating_source_refs"] = tampered["weak_signals"][0]["corroborating_source_refs"][:1]
    tampered_gate = evaluate_triangulation_gate(tampered, "run_weak_signal_detection_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("WSIG_GATE_NOT_INDEPENDENT: the independent triangulation_required gate did NOT catch a hand-tampered record with only 1 remaining source")
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
        "weak_signal_detection_record": record,
        "gate_results": gate_results,
        "untriangulated_refusal_proof": refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_evidence_matrix_slice.py)",
    }
    write_json(runtime / "results" / "weak_signal_detection_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_weak_signal_detection_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS foresight.weak_signal_detection: WeakSignalDetectionRecord {result['weak_signal_detection_record']['id']} built (1 weak signal, 2 distinct sources), gates [{gate_summary}]; "
        f"WSIG_INVALID_WEAK_SIGNAL REFUSED an untriangulated (single-distinct-source) weak signal ({result['untriangulated_refusal_proof']['error_code']}); "
        f"hand-tampered record (deleted down to 1 source) caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
