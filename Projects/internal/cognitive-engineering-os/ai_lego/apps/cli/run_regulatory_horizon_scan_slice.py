"""``jurisdiction.regulatory_horizon_scan`` vertical slice -- F23 global jurisdiction/compliance/localization
family (Atlas L939).

Builds a 2-entry regulatory horizon scan (both official-channel-sourced) over a synthetic EU AI Act /
California Delete Act scenario, then proves Atlas L939's own "official source" pipeline stage is a real
invariant, not mere narrative order: a construction-time attempt to submit an entry sourced from an
UNOFFICIAL channel is refused, and a hand-tampered valid record (an entry's ``source_type`` rewritten to an
unofficial value, bypassing the builder) is independently caught by the official_source gate.

Run::

    python -m ai_lego.apps.cli.run_regulatory_horizon_scan_slice
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
from ai_lego.modules.jurisdiction.regulatory_horizon_scan import (
    METHOD_ID,
    all_gates_pass,
    evaluate_official_source_gate,
    evaluate_regulatory_horizon_scan_gates,
    generate_regulatory_horizon_scan,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-RHS-SYNTHETIC-001"
EXECUTION_ID = "EX-RHS-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-RHS-001"

S = {
    "regulatory_horizon_scan": "ai-lego://specs/cognitive/typed-objects/regulatory-horizon-scan-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-regulatory-horizon-scan-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "entries": [
            {
                "entry_id": "REG-1",
                "regulation_title": "EU AI Act Art.6 high-risk classification amendment",
                "source": "Official Journal of the European Union, C-series draft amendment 2026/0xxx",
                "source_type": "OFFICIAL_LEGISLATIVE_RECORD",
                "status": "proposed, in trilogue negotiation",
                "effective_date_or_estimate": "estimated H1 2028, pending final vote",
                "impact": "may reclassify our HCI30 scoring feature as high-risk, triggering conformity assessment",
                "owner": "Compliance Steward",
            },
            {
                "entry_id": "REG-2",
                "regulation_title": "California Delete Act enforcement regulations",
                "source": "California Privacy Protection Agency rulemaking docket",
                "source_type": "OFFICIAL_REGULATOR",
                "status": "final rule adopted, enforcement phase-in",
                "effective_date_or_estimate": "2026-08-01",
                "impact": "requires a single data-broker deletion mechanism integration",
                "owner": "Data Protection Steward",
            },
        ],
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_regulatory_horizon_scan_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed scan -- 2 entries, both official-channel-sourced. ---
    descriptor, scan = catalog.invoke(
        METHOD_ID,
        generate_regulatory_horizon_scan,
        "RHS-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["regulatory_horizon_scan"], scan, "regulatory horizon scan")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "RegulatoryHorizonScanGenerated", {"scan": scan, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_regulatory_horizon_scan_gates(scan, "run_regulatory_horizon_scan_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"regulatory horizon scan gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"REGHORIZON_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "RegulatoryHorizonScanGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L939's own "official source" pipeline stage is not toothless -- an entry sourced
    # from an UNOFFICIAL channel MUST be refused before any record is constructed. ---
    unofficial_kwargs = copy.deepcopy(_well_formed_kwargs())
    unofficial_kwargs["entries"][0]["source_type"] = "NEWS_ARTICLE"
    unofficial_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_regulatory_horizon_scan("RHS-UNOFFICIAL-REFUSED-001", **unofficial_kwargs)
    except InvariantViolation as error:
        if "REGHORIZON_UNOFFICIAL_SOURCE" not in str(error):
            raise
        unofficial_refusal_proof["raised"] = True
        unofficial_refusal_proof["error_code"] = "REGHORIZON_UNOFFICIAL_SOURCE"
    if not unofficial_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("REGHORIZON_INVARIANT_NOT_ENFORCED: an unofficial-channel source was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "UnofficialSourceRefused", {"refusal_proof": unofficial_refusal_proof}, 1.3)
    milestones.append("UNOFFICIAL_SOURCE_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT official_source gate catches an entry's source_type
    # rewritten to an unofficial value, bypassing the builder entirely. ---
    tampered = copy.deepcopy(scan)
    tampered["entries"][1]["source_type"] = "BLOG_POST"
    tampered_gate = evaluate_official_source_gate(tampered, "run_regulatory_horizon_scan_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("REGHORIZON_GATE_NOT_INDEPENDENT: the independent official_source gate did NOT catch a hand-tampered unofficial source_type")
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
        "regulatory_horizon_scan": scan,
        "gate_results": gate_results,
        "unofficial_source_refusal_proof": unofficial_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "regulatory_horizon_scan_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_regulatory_horizon_scan_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS jurisdiction.regulatory_horizon_scan: RegulatoryHorizonScan {result['regulatory_horizon_scan']['id']} built "
        f"(2 entries, both official-channel-sourced), gates [{gate_summary}]; "
        f"REGHORIZON_UNOFFICIAL_SOURCE REFUSED an unofficial-channel attempt ({result['unofficial_source_refusal_proof']['error_code']}); "
        f"hand-tampered unofficial source_type caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
