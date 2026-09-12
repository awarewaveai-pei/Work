"""``foresight.cross_country_comparison`` vertical slice -- F13 foresight family (Atlas L676).

Compares a synthetic minimum-wage-to-median-income ratio across three
jurisdictions under a stated PPP-adjusted normalization basis, then proves
Atlas's own "normalize" pipeline stage is a real invariant: a construction-
time attempt to add a comparison with an EMPTY ``normalization_basis`` is
refused, and a hand-tampered valid record (a ``values[]`` jurisdiction
rewritten to one never declared, bypassing the builder) is independently
caught by the gate.

Run::

    python -m ai_lego.apps.cli.run_cross_country_comparison_slice
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
from ai_lego.modules.foresight.cross_country_comparison import (
    METHOD_ID,
    all_gates_pass,
    evaluate_comparison_integrity_gate,
    evaluate_cross_country_comparison_gates,
    generate_cross_country_comparison,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-XCOUNTRY-SYNTHETIC-001"
EXECUTION_ID = "EX-XCOUNTRY-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-XCOUNTRY-001"

S = {
    "cross_country_comparison": "ai-lego://specs/cognitive/typed-objects/cross-country-comparison.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-cross-country-comparison-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "jurisdictions": ["TW", "JP", "KR"],
        "comparisons": [
            {
                "metric": "minimum_wage_to_median_income_ratio",
                "normalization_basis": "PPP-adjusted, 2025 OECD basis",
                "values": [
                    {"jurisdiction": "TW", "value": 0.42},
                    {"jurisdiction": "JP", "value": 0.38},
                    {"jurisdiction": "KR", "value": 0.45},
                ],
            }
        ],
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_cross_country_comparison_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed comparison -- 3 jurisdictions, 1 metric, a stated normalization basis. ---
    descriptor, comparison = catalog.invoke(
        METHOD_ID,
        generate_cross_country_comparison,
        "XCOUNTRY-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["cross_country_comparison"], comparison, "cross country comparison")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "CrossCountryComparisonGenerated", {"comparison": comparison, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_cross_country_comparison_gates(comparison, "run_cross_country_comparison_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"cross country comparison gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"XCOUNTRY_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "CrossCountryComparisonGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L676's own "normalize" pipeline stage is not toothless -- an EMPTY
    # normalization_basis MUST be refused before any record is constructed. ---
    missing_basis_kwargs = copy.deepcopy(_well_formed_kwargs())
    missing_basis_kwargs["comparisons"][0]["normalization_basis"] = ""
    missing_basis_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_cross_country_comparison("XCOUNTRY-MISSING-BASIS-REFUSED-001", **missing_basis_kwargs)
    except InvariantViolation as error:
        if "XCOUNTRY_INVALID_COMPARISON" not in str(error):
            raise
        missing_basis_refusal_proof["raised"] = True
        missing_basis_refusal_proof["error_code"] = "XCOUNTRY_INVALID_COMPARISON"
    if not missing_basis_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("XCOUNTRY_INVARIANT_NOT_ENFORCED: an empty normalization_basis was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MissingNormalizationBasisRefused", {"refusal_proof": missing_basis_refusal_proof}, 1.3)
    milestones.append("MISSING_BASIS_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT gate catches the same defect class even when a caller
    # bypasses the builder entirely (a values[] jurisdiction rewritten to one never declared). ---
    tampered = copy.deepcopy(comparison)
    tampered["comparisons"][0]["values"][0]["jurisdiction"] = "US"
    tampered_gate = evaluate_comparison_integrity_gate(tampered, "run_cross_country_comparison_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("XCOUNTRY_GATE_NOT_INDEPENDENT: the independent comparison_integrity gate did NOT catch a hand-tampered record with a dangling jurisdiction reference")
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
        "cross_country_comparison": comparison,
        "gate_results": gate_results,
        "missing_basis_refusal_proof": missing_basis_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "cross_country_comparison_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_cross_country_comparison_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS foresight.cross_country_comparison: CrossCountryComparison {result['cross_country_comparison']['id']} built "
        f"(3 jurisdictions, 1 comparison), gates [{gate_summary}]; "
        f"XCOUNTRY_INVALID_COMPARISON REFUSED an empty-normalization_basis attempt ({result['missing_basis_refusal_proof']['error_code']}); "
        f"hand-tampered record (dangling jurisdiction ref) caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
