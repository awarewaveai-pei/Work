"""``epistemic.contradiction_detection`` vertical slice -- F10 epistemic quality family (Atlas L566-600),
Contradiction Detection row (L579). See ``ai_lego.modules.epistemic.contradiction_detection``'s own module
docstring for how this differs from ``claim.schema.yaml``'s own ``contradicting_evidence`` field (claim-to-
evidence, not claim-to-claim).

Scenario: 3 real Claim records about the same market -- two directly conflicting growth forecasts, and a
third, region-dependent claim that is neither a clean support nor a clean contradiction of the first.

Demonstrates both real invariants, each at BOTH layers:

1. Unordered-pair uniqueness: a construction-time PASS (2 distinct relation pairs) and a construction-time
   REFUSAL (the SAME pair declared again in reversed order, with a different relation value) are both shown --
   the "subtle" case this method's own design specifically guards against.
2. Referential integrity: a hand-tampered COPY of the record, with a relation's claim_id_b overwritten to a
   claim id that was never declared, bypasses the builder entirely -- the independent gate must catch the
   dangling reference by re-deriving from claims/relations itself, never trusting the stored fields.

Run::

    python -m ai_lego.apps.cli.run_contradiction_detection_slice
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
from ai_lego.core.domain.claim import claim_record
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.core.domain.tenant import CASCADIA
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.epistemic.contradiction_detection import (
    METHOD_ID,
    all_gates_pass,
    claim_ref,
    contradiction_relation,
    evaluate_contradiction_detection_gates,
    generate_contradiction_detection,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-CONTRADICTIONDETECTION-SYNTHETIC-001"
EXECUTION_ID = "EX-CONTRADICTIONDETECTION-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-CONTRADICTIONDETECTION-001"

S = {
    "claim": "ai-lego://specs/evidence/claim.schema.yaml",
    "contradiction_detection": "ai-lego://specs/cognitive/typed-objects/contradiction-detection.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-contradiction-detection-slice"


def run_contradiction_detection_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: 3 real Claim records about the same market -- 2 directly conflict, 1 is region-dependent. ---
    growth_claim = claim_record("C-3001", "2027 年市場規模將成長 20%", [], make_provenance("AI_INFERENCE", "AI_GENERATED"))
    shrink_claim = claim_record("C-3002", "2027 年市場規模將萎縮 10%", [], make_provenance("AI_INFERENCE", "AI_GENERATED"))
    regional_claim = claim_record("C-3003", "市場規模成長與否取決於區域法規開放程度", [], make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    contracts.validate(S["claim"], growth_claim, "claim C-3001")
    contracts.validate(S["claim"], shrink_claim, "claim C-3002")
    contracts.validate(S["claim"], regional_claim, "claim C-3003")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ClaimsRecorded", {"claims": [growth_claim, shrink_claim, regional_claim]}, 1)

    # --- Step 2: the complete, well-formed contradiction set -- 2 distinct unordered pairs, no duplicates. ---
    claims = [claim_ref("C-3001"), claim_ref("C-3002"), claim_ref("C-3003")]
    relations = [
        contradiction_relation("C-3001", "C-3002", "CONTRADICTS"),
        contradiction_relation("C-3001", "C-3003", "CONTEXT_DEPENDENT"),
    ]
    record = generate_contradiction_detection(
        "CDET-2026-09-12-001",
        claims,
        relations,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["contradiction_detection"], record, "contradiction detection")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ContradictionDetectionGenerated", {"record": record}, 1.5)
    milestones.append("RECORD_BUILT")

    gate_results = evaluate_contradiction_detection_gates(record, "run_contradiction_detection_slice", clock.at(1.6))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"contradiction detection gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("CONTRADICTIONDETECTION_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 3: proof the unordered-pair-uniqueness invariant is not toothless -- the SAME pair (C-3001,
    # C-3002) declared again in REVERSED order with a DIFFERENT relation value MUST be refused BEFORE any
    # record is constructed. This is the subtle case: {A,B} and {B,A} are the same pair. ---
    refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    reversed_duplicate = relations + [contradiction_relation("C-3002", "C-3001", "SUPPORTS")]
    try:
        generate_contradiction_detection("CDET-REFUSED-001", claims, reversed_duplicate, make_provenance("AI_INFERENCE", "AI_GENERATED"))
    except InvariantViolation as error:
        if "CONTRADICTIONDETECTION_DUPLICATE_PAIR" not in str(error):
            raise
        refusal_proof["raised"] = True
        refusal_proof["error_code"] = "CONTRADICTIONDETECTION_DUPLICATE_PAIR"
    if not refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("CONTRADICTIONDETECTION_INVARIANT_NOT_ENFORCED: a reversed-order duplicate pair was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MalformedRecordRefused", {"refusal_proof": refusal_proof}, 2)
    milestones.append("REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- a relation naming a claim id that was NEVER declared in claims,
    # spliced into a COPY of the record after construction, is caught by the INDEPENDENT gate re-deriving from
    # raw fields, never trusting that generate_contradiction_detection's own construction-time check already
    # ran. ---
    tampered = copy.deepcopy(record)
    tampered["relations"][0]["claim_id_b"] = "C-9999"
    tampered_gate = evaluate_contradiction_detection_gates(tampered, "run_contradiction_detection_slice", clock.at(2.5))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("CONTRADICTIONDETECTION_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered dangling claim_id reference")
    integrity_gate = next(g for g in tampered_gate if g["gate_id"] == "contradiction_detection_integrity")
    if "DANGLING_REF" not in integrity_gate["evidence"][0].get("reason", ""):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"CONTRADICTIONDETECTION_DEMO_INVARIANT: expected a DANGLING_REF reason, got {integrity_gate['evidence'][0]!r}")
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
    write_json(runtime / "results" / "contradiction_detection_slice_result.json", result)
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
        result = run_contradiction_detection_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(
        f"PASS epistemic.contradiction_detection: ContradictionDetection {result['record']['id']} built with "
        f"{len(result['record']['claims'])} claims / {len(result['record']['relations'])} relations, "
        f"{len(result['gate_results'])} gates all PASS; "
        f"reversed-order duplicate-pair invariant REFUSED a malformed attempt ({result['refusal_proof']['error_code']}); "
        f"dangling claim_id reference caught by the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
