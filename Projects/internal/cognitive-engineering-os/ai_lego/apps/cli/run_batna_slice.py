"""``stakeholders.batna`` vertical slice -- F07 stakeholder/power/negotiation family, OPENING member (F07 had
zero built methods before this batch; 1 of 10 concurrent agents opening ALL F07 members in this same parallel
batch).

Scenario: a BATNA analysis for a small studio's vendor-contract renewal negotiation, 3 candidate alternatives
with the best one selected and its own reservation_point derived -- same synthetic style every sibling slice's
CLI demo uses. Builds a real, well-formed ``BatnaAnalysis`` satisfying both real invariants (referential
integrity of ``best_alternative_id``, genuine-compute ``reservation_point``), then demonstrates the referential-
integrity invariant once as a construction-time REFUSAL (a ``best_alternative_id`` naming no real alternative),
proving it is not toothless, same "show a real refusal, not only a real success" discipline every sibling
slice's CLI demo already establishes. A final step hand-tampers a VALID record's own ``reservation_point``
directly (bypassing the builder) to prove the independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_batna_slice
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
from ai_lego.modules.stakeholders.batna import (
    METHOD_ID,
    all_gates_pass,
    evaluate_batna_gates,
    generate_batna_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-BATNA-SYNTHETIC-001"
EXECUTION_ID = "EX-BATNA-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-BATNA-001"

S = {
    "batna_analysis": "ai-lego://specs/cognitive/typed-objects/batna.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-batna-slice"


def _well_formed_analysis_kwargs() -> dict[str, Any]:
    return {
        "subject": "供應商合約續約談判 -- Q4",
        "alternatives": [
            {"id": "ALT-STATUS-QUO", "label": "維持現狀，不續約也不換供應商", "value_estimate": 20.0, "cost_estimate": 5.0},
            {"id": "ALT-SWITCH-VENDOR-B", "label": "改用供應商 B（已完成初步報價）", "value_estimate": 60.0, "cost_estimate": 15.0},
            {"id": "ALT-IN-HOUSE", "label": "自建內部能力", "value_estimate": 80.0, "cost_estimate": 50.0},
        ],
        "best_alternative_id": "ALT-SWITCH-VENDOR-B",
        "provenance": make_provenance("CALCULATED_RESULT", "HUMAN_ORIGINAL"),
    }


def run_batna_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. stakeholders.batna resolves because its
    # contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice uses.
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed analysis -- both real invariants satisfied, invoked through the
    # catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, analysis = catalog.invoke(
        METHOD_ID,
        generate_batna_analysis,
        "BATNA-2026-09-11-001",
        **_well_formed_analysis_kwargs(),
    )
    contracts.validate(S["batna_analysis"], analysis, "batna analysis")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "BatnaAnalysisGenerated", {"analysis": analysis, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_batna_gates(analysis, "run_batna_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"stakeholders.batna gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("BATNA_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof the referential-integrity invariant (step 3, best_alternative_id) is not toothless -- a
    # best_alternative_id naming no real alternative MUST be refused before any record is constructed. ---
    unknown_best_kwargs = {**_well_formed_analysis_kwargs(), "best_alternative_id": "ALT-DOES-NOT-EXIST"}
    unknown_best_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_batna_analysis("BATNA-UNKNOWN-BEST-REFUSED-001", **unknown_best_kwargs)
    except InvariantViolation as error:
        if "BATNA_BEST_ALTERNATIVE_NOT_FOUND" not in str(error):
            raise
        unknown_best_refusal_proof["raised"] = True
        unknown_best_refusal_proof["error_code"] = "BATNA_BEST_ALTERNATIVE_NOT_FOUND"
    if not unknown_best_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("BATNA_INVARIANT_NOT_ENFORCED: a best_alternative_id naming no real alternative was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "UnknownBestAlternativeRefused", {"refusal_proof": unknown_best_refusal_proof}, 1.3)
    milestones.append("UNKNOWN_BEST_ALTERNATIVE_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (splices a wrong reservation_point directly into a VALID record's own raw dict, after
    # construction). ---
    tampered = dict(analysis)
    tampered["reservation_point"] = analysis["reservation_point"] + 999.0  # was a real recomputed net value -- bypasses the builder directly
    tampered_gate = evaluate_batna_gates(tampered, "run_batna_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("BATNA_GATE_NOT_INDEPENDENT: the independent batna_integrity gate did NOT catch a hand-tampered reservation_point")
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
        "analysis": analysis,
        "gate_results": gate_results,
        "unknown_best_alternative_refusal_proof": unknown_best_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_bcg_matrix_slice.py)",
    }
    write_json(runtime / "results" / "batna_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_batna_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS stakeholders.batna: BatnaAnalysis {result['analysis']['id']} built, gates [{gate_summary}]; "
        f"BATNA_BEST_ALTERNATIVE_NOT_FOUND invariant REFUSED a malformed attempt "
        f"({result['unknown_best_alternative_refusal_proof']['error_code']}); "
        f"hand-tampered reservation_point caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
