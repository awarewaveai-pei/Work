"""``jurisdiction.obligation_to_control_mapping`` vertical slice -- F23 global jurisdiction/compliance/
localization family (Atlas L937).

Builds a 2-obligation, 3-control mapping (full coverage, no orphan control) over a synthetic GDPR/PCI-DSS
scenario, then proves Atlas L937's own "obligation->control" pipeline stage is a real invariant, not mere
narrative order: a construction-time attempt to submit a mapping with an UNCOVERED obligation (zero controls
mapped to it) is refused, and a hand-tampered valid record (a control's ``obligation_id`` rewritten to an
undeclared obligation, bypassing the builder) is independently caught by the referential_integrity gate.

Run::

    python -m ai_lego.apps.cli.run_obligation_to_control_mapping_slice
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
from ai_lego.modules.jurisdiction.obligation_to_control_mapping import (
    METHOD_ID,
    all_gates_pass,
    evaluate_obligation_to_control_mapping_gates,
    evaluate_referential_integrity_gate,
    generate_obligation_to_control_mapping,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-OCM-SYNTHETIC-001"
EXECUTION_ID = "EX-OCM-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-OCM-001"

S = {
    "obligation_to_control_mapping": "ai-lego://specs/cognitive/typed-objects/obligation-to-control-mapping-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-obligation-to-control-mapping-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "obligations": [
            {"obligation_id": "OBL-1", "description": "GDPR Art.17 -- honor data subject erasure requests within 1 month"},
            {"obligation_id": "OBL-2", "description": "PCI-DSS 3.2.1 -- encrypt cardholder data at rest"},
        ],
        "controls": [
            {"control_id": "CTRL-1", "obligation_id": "OBL-1", "owner": "Data Protection Steward", "evidence": "erasure-request audit log", "test": "monthly sample of 10 closed erasure tickets, confirm all closed within 30 days"},
            {"control_id": "CTRL-2", "obligation_id": "OBL-1", "owner": "Platform Eng Lead", "evidence": "deletion pipeline runbook", "test": "quarterly game-day: submit a synthetic erasure request, confirm end-to-end deletion"},
            {"control_id": "CTRL-3", "obligation_id": "OBL-2", "owner": "Security Lead", "evidence": "AES-256 at-rest encryption config export", "test": "annual PCI-DSS QSA audit"},
        ],
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_obligation_to_control_mapping_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed mapping -- 2 obligations, 3 controls, full coverage. ---
    descriptor, mapping = catalog.invoke(
        METHOD_ID,
        generate_obligation_to_control_mapping,
        "OCM-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["obligation_to_control_mapping"], mapping, "obligation to control mapping")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ObligationToControlMappingGenerated", {"mapping": mapping, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_obligation_to_control_mapping_gates(mapping, "run_obligation_to_control_mapping_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"obligation to control mapping gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"OCM_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ObligationToControlMappingGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L937's own "obligation->control" pipeline stage is not toothless -- an obligation
    # with ZERO controls mapped to it MUST be refused before any record is constructed. ---
    uncovered_kwargs = copy.deepcopy(_well_formed_kwargs())
    uncovered_kwargs["controls"] = [c for c in uncovered_kwargs["controls"] if c["obligation_id"] != "OBL-2"]  # drop OBL-2's only control
    uncovered_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_obligation_to_control_mapping("OCM-UNCOVERED-REFUSED-001", **uncovered_kwargs)
    except InvariantViolation as error:
        if "OCM_UNCOVERED_OBLIGATION" not in str(error):
            raise
        uncovered_refusal_proof["raised"] = True
        uncovered_refusal_proof["error_code"] = "OCM_UNCOVERED_OBLIGATION"
    if not uncovered_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("OCM_INVARIANT_NOT_ENFORCED: a mapping with an uncovered obligation was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "UncoveredObligationRefused", {"refusal_proof": uncovered_refusal_proof}, 1.3)
    milestones.append("UNCOVERED_OBLIGATION_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT referential_integrity gate catches a control's
    # obligation_id rewritten to an undeclared obligation, bypassing the builder entirely. ---
    tampered = copy.deepcopy(mapping)
    tampered["controls"][0]["obligation_id"] = "OBL-NONEXISTENT"
    tampered_gate = evaluate_referential_integrity_gate(tampered, "run_obligation_to_control_mapping_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("OCM_GATE_NOT_INDEPENDENT: the independent referential_integrity gate did NOT catch a hand-tampered orphan control")
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
        "obligation_to_control_mapping": mapping,
        "gate_results": gate_results,
        "uncovered_obligation_refusal_proof": uncovered_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "obligation_to_control_mapping_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_obligation_to_control_mapping_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS jurisdiction.obligation_to_control_mapping: ObligationToControlMapping {result['obligation_to_control_mapping']['id']} built "
        f"(2 obligations, 3 controls -- full coverage), gates [{gate_summary}]; "
        f"OCM_UNCOVERED_OBLIGATION REFUSED an uncovered-obligation attempt ({result['uncovered_obligation_refusal_proof']['error_code']}); "
        f"hand-tampered orphan control caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
