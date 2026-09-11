"""``insight.service_blueprint`` vertical slice -- F06 human/customer insight family, new family, 5th member
(this batch opens all 9 F06 members concurrently; see sibling ``run_*_slice.py`` files for the others).

Scenario: a Service Blueprint for a local coffee shop's mobile pre-order-and-pickup service -- same
synthetic style every sibling slice's CLI demo uses. Builds a real, well-formed ``ServiceBlueprint`` covering
all 5 §12.16 layers (with 2 FRONTSTAGE entries, proving duplicates within a covered layer are legal -- this
method's coverage invariant is NOT porter_five_forces's exactly-once-each), then demonstrates each of the 3
real invariants once as a construction-time REFUSAL (a layer set missing SYSTEMS_DATA; an empty layer
description; an empty service_name), proving none is toothless, same "show a real refusal, not only a real
success" discipline every sibling slice's CLI demo already establishes. A final step hand-tampers a VALID
record directly (bypassing the builder) to prove the independent gate, not just the builder, catches the
same defect.

Run::

    python -m ai_lego.apps.cli.run_service_blueprint_slice
"""

from __future__ import annotations

import argparse
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
from ai_lego.modules.insight.service_blueprint import (
    METHOD_ID,
    all_gates_pass,
    evaluate_service_blueprint_gates,
    generate_service_blueprint,
    layer_entry,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-SVCBLUEPRINT-SYNTHETIC-001"
EXECUTION_ID = "EX-SVCBLUEPRINT-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-SVCBLUEPRINT-001"

S = {
    "service_blueprint": "ai-lego://specs/cognitive/typed-objects/service-blueprint.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}

SERVICE_NAME = "行動預訂＋店取咖啡服務"


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-service-blueprint-slice"


def _well_formed_layers() -> list[dict[str, Any]]:
    return [
        layer_entry("CUSTOMER_ACTIONS", "顧客開 App 選品項＋付款，抵店後掃碼取件"),
        layer_entry("FRONTSTAGE", "店員看到訂單通知，於取貨櫃檯核對取件碼並遞交飲品"),
        layer_entry("FRONTSTAGE", "若顧客到店時飲品尚未完成，店員口頭告知預估等待時間"),  # 2nd FRONTSTAGE entry -- coverage allows duplicates
        layer_entry("BACKSTAGE", "吧檯人員依訂單序號現場製作飲品，放入指定取貨櫃"),
        layer_entry("SUPPORT_PROCESSES", "庫存系統即時扣減原料庫存，觸發低庫存自動叫貨流程"),
        layer_entry("SYSTEMS_DATA", "POS／App 後端訂單資料庫記錄訂單狀態，供退款與客服查詢"),
    ]


def run_service_blueprint_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. insight.service_blueprint resolves because
    # its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling
    # slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed blueprint -- all 3 real invariants satisfied, invoked through
    # the catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, blueprint = catalog.invoke(
        METHOD_ID,
        generate_service_blueprint,
        "SVCBLUEPRINT-2026-09-11-001",
        SERVICE_NAME,
        _well_formed_layers(),
        make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
    )
    contracts.validate(S["service_blueprint"], blueprint, "service blueprint")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ServiceBlueprintGenerated", {"blueprint": blueprint, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_service_blueprint_gates(blueprint, "run_service_blueprint_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"insight.service_blueprint gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("SVCBLUEPRINT_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 1 (layer coverage) is not toothless -- a layer set missing SYSTEMS_DATA
    # (only 4 of the 5 required layer types covered) MUST be refused before any record is constructed. ---
    incomplete_layers = [layer for layer in _well_formed_layers() if layer["layer_type"] != "SYSTEMS_DATA"]
    incomplete_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_service_blueprint("SVCBLUEPRINT-INCOMPLETE-REFUSED-001", SERVICE_NAME, incomplete_layers, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "SVCBLUEPRINT_INCOMPLETE_LAYER_COVERAGE" not in str(error):
            raise
        incomplete_refusal_proof["raised"] = True
        incomplete_refusal_proof["error_code"] = "SVCBLUEPRINT_INCOMPLETE_LAYER_COVERAGE"
    if not incomplete_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("SVCBLUEPRINT_INVARIANT_NOT_ENFORCED: a layer set missing SYSTEMS_DATA was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "IncompleteLayerCoverageRefused", {"refusal_proof": incomplete_refusal_proof}, 1.3)
    milestones.append("INCOMPLETE_COVERAGE_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 2 (per-layer content) is not toothless -- an empty description on one
    # layer MUST be refused. layer_entry() itself validates layer_type only, so the empty-description defect
    # is constructed directly as a raw dict to exercise generate_service_blueprint's own check. ---
    empty_description_layers = _well_formed_layers()
    empty_description_layers[0] = {**empty_description_layers[0], "description": "   "}
    empty_description_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_service_blueprint("SVCBLUEPRINT-EMPTY-DESC-REFUSED-001", SERVICE_NAME, empty_description_layers, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "SVCBLUEPRINT_EMPTY_DESCRIPTION" not in str(error):
            raise
        empty_description_refusal_proof["raised"] = True
        empty_description_refusal_proof["error_code"] = "SVCBLUEPRINT_EMPTY_DESCRIPTION"
    if not empty_description_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("SVCBLUEPRINT_INVARIANT_NOT_ENFORCED: an empty layer description was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyDescriptionRefused", {"refusal_proof": empty_description_refusal_proof}, 1.5)
    milestones.append("EMPTY_DESCRIPTION_REFUSAL_PROVEN")

    # --- Step 4: proof invariant 3 (service_name) is not toothless -- a blank service_name MUST be refused:
    # a fully-covered, well-described layer set for no NAMED service has not blueprinted anything. ---
    empty_name_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_service_blueprint("SVCBLUEPRINT-EMPTY-NAME-REFUSED-001", "   ", _well_formed_layers(), make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "SVCBLUEPRINT_EMPTY_SERVICE_NAME" not in str(error):
            raise
        empty_name_refusal_proof["raised"] = True
        empty_name_refusal_proof["error_code"] = "SVCBLUEPRINT_EMPTY_SERVICE_NAME"
    if not empty_name_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("SVCBLUEPRINT_INVARIANT_NOT_ENFORCED: an empty service_name was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyServiceNameRefused", {"refusal_proof": empty_name_refusal_proof}, 1.7)
    milestones.append("EMPTY_SERVICE_NAME_REFUSAL_PROVEN")

    # --- Step 5: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses
    # the builder entirely (drops every BACKSTAGE entry from a raw copy of an already-valid record). ---
    tampered = dict(blueprint)
    tampered["layers"] = [layer for layer in blueprint["layers"] if layer["layer_type"] != "BACKSTAGE"]
    tampered_gate = evaluate_service_blueprint_gates(tampered, "run_service_blueprint_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("SVCBLUEPRINT_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered incomplete layer coverage")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_results": tampered_gate}, 2.1)
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
        "blueprint": blueprint,
        "gate_results": gate_results,
        "incomplete_refusal_proof": incomplete_refusal_proof,
        "empty_description_refusal_proof": empty_description_refusal_proof,
        "empty_name_refusal_proof": empty_name_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_porter_five_forces_slice.py)",
    }
    write_json(runtime / "results" / "service_blueprint_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_service_blueprint_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS insight.service_blueprint: ServiceBlueprint {result['blueprint']['id']} built with "
        f"{len(result['blueprint']['layers'])} layer entries covering all 5 layer types, gates [{gate_summary}]; "
        f"INCOMPLETE_LAYER_COVERAGE/EMPTY_DESCRIPTION/EMPTY_SERVICE_NAME invariants each REFUSED a malformed attempt "
        f"({result['incomplete_refusal_proof']['error_code']}, {result['empty_description_refusal_proof']['error_code']}, "
        f"{result['empty_name_refusal_proof']['error_code']}); "
        f"hand-tampered incomplete layer coverage caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
