"""``epistemic.evidence_hierarchy`` vertical slice -- F10 epistemic quality family (Atlas L566-600), Evidence
Hierarchy row (L576). See ``ai_lego.modules.epistemic.evidence_hierarchy``'s own module docstring for the full
seam this method closes in ``specs/evidence/evidence.schema.yaml``'s deliberately domain-specific
``hierarchy_tier`` field.

Scenario: a clinical-research domain hierarchy (RCT > cohort study > case report) with 3 real Evidence records
assigned into it.

Demonstrates both real invariants, each at BOTH layers:

1. Declared-ordering integrity: a construction-time PASS (3 levels with distinct ranks) and a construction-time
   REFUSAL (two levels claiming the same rank) are both shown.
2. Referential integrity: a hand-tampered COPY of the record, with a dangling ``evidence_assignments[].level_id``
   appended after construction, is caught by the INDEPENDENT gate (bypassing the builder entirely).

Run::

    python -m ai_lego.apps.cli.run_evidence_hierarchy_slice
"""

from __future__ import annotations

import copy
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
from ai_lego.core.domain.tenant import CASCADIA
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.epistemic.evidence_hierarchy import (
    METHOD_ID,
    all_gates_pass,
    evaluate_evidence_hierarchy_gates,
    evidence_assignment,
    generate_evidence_hierarchy,
    hierarchy_level,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-EVIDENCEHIERARCHY-SYNTHETIC-001"
EXECUTION_ID = "EX-EVIDENCEHIERARCHY-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-EVIDENCEHIERARCHY-001"

S = {
    "evidence": "ai-lego://specs/evidence/evidence.schema.yaml",
    "evidence_hierarchy": "ai-lego://specs/cognitive/typed-objects/evidence-hierarchy.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-evidence-hierarchy-slice"


def run_evidence_hierarchy_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: 3 real Evidence records, the kind a clinical-research domain would actually be ranking. ---
    rct_evidence = evidence_record("E-2001", "隨機對照試驗顯示藥物 A 降低死亡率 15%", "RCT trial registry NCT-000123", make_provenance("EVIDENCE", "HUMAN_APPROVED"))
    cohort_evidence = evidence_record("E-2002", "世代研究觀察到藥物 A 使用者死亡率較低", "cohort study, 5-year follow-up", make_provenance("EVIDENCE", "HUMAN_APPROVED"))
    case_report_evidence = evidence_record("E-2003", "單一病例報告記錄藥物 A 使用後康復", "case report, single patient", make_provenance("EVIDENCE", "HUMAN_APPROVED"))
    contracts.validate(S["evidence"], rct_evidence, "evidence E-2001")
    contracts.validate(S["evidence"], cohort_evidence, "evidence E-2002")
    contracts.validate(S["evidence"], case_report_evidence, "evidence E-2003")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "EvidenceRecorded", {"evidence": [rct_evidence, cohort_evidence, case_report_evidence]}, 1)

    # --- Step 2: a real, well-formed clinical-research hierarchy -- RCT strongest, case report weakest. ---
    levels = [
        hierarchy_level("L-RCT", "Randomized Controlled Trial", 1),
        hierarchy_level("L-COHORT", "Cohort Study", 2),
        hierarchy_level("L-CASE", "Case Report", 3),
    ]
    assignments = [
        evidence_assignment("E-2001", "L-RCT"),
        evidence_assignment("E-2002", "L-COHORT"),
        evidence_assignment("E-2003", "L-CASE"),
    ]
    record = generate_evidence_hierarchy(
        "EVHIER-2026-09-12-001",
        "clinical research",
        levels,
        assignments,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["evidence_hierarchy"], record, "evidence hierarchy")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "EvidenceHierarchyGenerated", {"record": record}, 1.5)
    milestones.append("RECORD_BUILT")

    gate_results = evaluate_evidence_hierarchy_gates(record, "run_evidence_hierarchy_slice", clock.at(1.6))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"evidence hierarchy gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("EVIDENCEHIERARCHY_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 3: proof the rank-uniqueness invariant is not toothless -- two levels claiming the same rank
    # (the exact "來源等價化" collapse this method exists to prevent) MUST be refused BEFORE construction. ---
    refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    tied_levels = [hierarchy_level("L-RCT", "Randomized Controlled Trial", 1), hierarchy_level("L-COHORT", "Cohort Study", 1)]
    try:
        generate_evidence_hierarchy("EVHIER-REFUSED-001", "clinical research", tied_levels, [], make_provenance("AI_INFERENCE", "AI_GENERATED"))
    except InvariantViolation as error:
        if "EVIDENCEHIERARCHY_DUPLICATE_RANK" not in str(error):
            raise
        refusal_proof["raised"] = True
        refusal_proof["error_code"] = "EVIDENCEHIERARCHY_DUPLICATE_RANK"
    if not refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("EVIDENCEHIERARCHY_INVARIANT_NOT_ENFORCED: two levels tied at the same rank were NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MalformedRecordRefused", {"refusal_proof": refusal_proof}, 2)
    milestones.append("REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- a dangling evidence_assignments[].level_id reference, spliced into a
    # COPY of the record after construction, is caught by the INDEPENDENT gate re-deriving from raw fields,
    # never trusting that generate_evidence_hierarchy's own construction-time check already ran. ---
    tampered = copy.deepcopy(record)
    tampered["evidence_assignments"].append({"evidence_id": "E-9999", "level_id": "L-DOES-NOT-EXIST"})
    tampered_gate = evaluate_evidence_hierarchy_gates(tampered, "run_evidence_hierarchy_slice", clock.at(2.5))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("EVIDENCEHIERARCHY_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered dangling level_id reference")
    integrity_gate = next(g for g in tampered_gate if g["gate_id"] == "evidence_hierarchy_integrity")
    if "DANGLING_REF" not in integrity_gate["evidence"][0].get("reason", ""):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"EVIDENCEHIERARCHY_DEMO_INVARIANT: expected a DANGLING_REF reason, got {integrity_gate['evidence'][0]!r}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedDanglingRefCaughtByGate", {"tampered_gate_results": tampered_gate}, 2.6)
    ledger.close_aggregate(AGGREGATE_ID)
    milestones.append("VERIFYING")

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_id": METHOD_ID,
        "method_resolution": resolution,
        "record": record,
        "gate_results": gate_results,
        "refusal_proof": refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "evidence_hierarchy_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_evidence_hierarchy_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(
        f"PASS epistemic.evidence_hierarchy: EvidenceHierarchy {result['record']['id']} built for domain "
        f"{result['record']['domain']!r} with {len(result['record']['hierarchy_levels'])} levels / "
        f"{len(result['record']['evidence_assignments'])} assignments, {len(result['gate_results'])} gates all PASS; "
        f"duplicate-rank invariant REFUSED a malformed attempt ({result['refusal_proof']['error_code']}); "
        f"dangling level_id reference caught by the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
