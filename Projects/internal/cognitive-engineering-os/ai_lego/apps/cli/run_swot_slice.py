"""``strategy.swot`` vertical slice -- the third Method Atlas slice (TASKS.md 2026-09-04 "全部做好" item, second slice was root_cause.fishbone).

Third structurally distinct shape: a classification method (Atlas L1327 --
split a situation into internal Strength/Weakness vs. external Opportunity/
Threat), whose forbidden_transition (SWOTAnalysis -> AutomaticProduction
Deployment, Atlas L3550-3552) is an entirely different hazard class from
Fishbone's: an irreversible EXTERNAL action, not a data-layer type
promotion. See ``ai_lego.modules.strategy.swot.assert_forbidden_deployment_path_blocked``
for why this run proves the guard by exercising the platform's existing
fail-closed ``MethodCatalog`` resolver rather than a bespoke local check --
reuse, once again, not reinvention.

New spec-root content this slice's method needed and did not yet have (built
in the same session, per R4 direct-transcription discipline, no ADR):
``specs/cognitive/typed-objects/swot-analysis.schema.yaml`` +
``tests/contracts/specs/cognitive/typed-objects/swot-analysis.fixtures.yaml``
-- unlike root_cause.fishbone, whose full typed-object chain was already
ratified in an earlier session, strategy.swot's contract existed but its
output type (SWOTAnalysis) did not yet have a schema. `KnowledgeSet` (the
input) is NOT given a new schema (swot-analysis.schema.yaml's own
OQ-SWOTANALYSIS-1): it is represented as a plain list of real, already-
ratified ``evidence/evidence.schema.yaml`` records.

Run::

    python -m ai_lego.apps.cli.run_swot_slice
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
from ai_lego.core.domain.evidence import evidence_record
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.core.domain.tenant import NORDBROOK
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.strategy.swot import (
    METHOD_ID,
    all_gates_pass,
    assert_forbidden_deployment_path_blocked,
    evaluate_swot_gates,
    generate_swot_analysis,
    swot_factor,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-SWOT-SYNTHETIC-001"
EXECUTION_ID = "EX-SWOT-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-SWOT-001"

S = {
    "evidence": "ai-lego://specs/evidence/evidence.schema.yaml",
    "swot_analysis": "ai-lego://specs/cognitive/typed-objects/swot-analysis.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-swot-slice"


def run_swot_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. strategy.swot resolves because its contract is
    # ACTIVE in the spec root's methods/contracts/, exactly the same mechanism the first two slices used. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Forbidden-transition guard, checked BEFORE any analysis is produced: the platform's existing fail-closed
    # resolver already refuses an automatic-production-deployment-shaped method id. Exercised for real, not asserted. ---
    deployment_resolution = assert_forbidden_deployment_path_blocked(catalog)
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "AutomaticDeploymentPathVerifiedBlocked", {"hazard_resolution": deployment_resolution}, 0.5)
    milestones.append("FORBIDDEN_DEPLOYMENT_PATH_VERIFIED_BLOCKED")

    # --- Step 1: KnowledgeSet -- a non-empty list of real evidence.schema.yaml records (no dedicated KnowledgeSet
    # typed-object schema exists yet, swot-analysis.schema.yaml OQ-SWOTANALYSIS-1). Synthetic Nordbrook scenario. ---
    knowledge_set = [
        evidence_record("E-201", "既有客戶續約率連續三季維持在 92% 以上", "SRC-RENEWAL-REPORT", make_provenance("EVIDENCE", "HUMAN_APPROVED")),
        evidence_record("E-202", "同區域出現兩家提供相同服務的新進入者", "SRC-MARKET-BRIEF", make_provenance("EVIDENCE", "AI_SUGGESTED")),
    ]
    for record in knowledge_set:
        contracts.validate(S["evidence"], record, f"evidence {record['evidence_id']}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "KnowledgeSetAssembled", {"knowledge_set": knowledge_set}, 1)
    milestones.append("KNOWLEDGE_SET_ASSEMBLED")

    # --- Step 2: strategy.swot invoked through the catalog's own per-invocation gate (ADR-023 Consequences 5's
    # pattern, unchanged): the implementation only runs if the descriptor names an ACTIVE contract. ---
    factors = [
        swot_factor("SWOT-2026-09-04-001-F1", "STRENGTH", "既有客戶續約率連續三季維持在 92% 以上", "TW", "2026-Q3", "內部訂閱續約報表", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-201"]),
        swot_factor("SWOT-2026-09-04-001-F2", "THREAT", "同區域出現兩家提供相同服務的新進入者", "TW", "2026-Q3", "市場情報簡報 2026-08", make_provenance("EVIDENCE", "AI_SUGGESTED"), supporting_evidence_refs=["E-202"]),
        swot_factor("SWOT-2026-09-04-001-F3", "OPPORTUNITY", "鄰近市場本季法規鬆綁", "SG", "2026-Q3", "現場觀察筆記", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
    ]
    descriptor, swot_analysis = catalog.invoke(
        METHOD_ID,
        generate_swot_analysis,
        "SWOT-2026-09-04-001",
        "KS-2026-09-04-001",
        knowledge_set,
        factors,
    )
    contracts.validate(S["swot_analysis"], swot_analysis, "swot analysis")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SwotAnalysisGenerated", {"swot_analysis": swot_analysis, "method_descriptor": descriptor}, 2)
    milestones.append("METHOD_EXECUTED")

    # --- Gates: the contract's own quality block (provenance_required, evidence_labeling_required), evaluated for
    # real against this run's actual factors -- a FAIL raises before anything downstream is written. ---
    timestamp = clock.at(2.2)
    gate_results = evaluate_swot_gates(swot_analysis, "run_swot_slice", timestamp)
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        failing = [gate["gate_id"] for gate in gate_results if gate["status"] not in {"PASS", "NOT_APPLICABLE"}]
        raise InvariantViolation(f"SWOT_GATE_FAILED: {', '.join(failing)}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SwotGatesEvaluated", {"gate_results": gate_results}, 2.3)
    ledger.close_aggregate(AGGREGATE_ID)
    milestones.append("GATES_PASSED")
    milestones.append("VERIFYING")

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_id": METHOD_ID,
        "method_resolution": resolution,
        "method_invocation": descriptor,
        "forbidden_deployment_path": {"verified_blocked": True, "resolution": deployment_resolution},
        "knowledge_set": knowledge_set,
        "swot_analysis": swot_analysis,
        "gate_results": gate_results,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "swot_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_swot_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(f"PASS strategy.swot: 3 factors, gates [{gate_summary}], forbidden_deployment_path_blocked={result['forbidden_deployment_path']['verified_blocked']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
