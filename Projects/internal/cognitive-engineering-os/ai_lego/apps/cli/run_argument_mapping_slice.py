"""``epistemic.argument_mapping`` vertical slice -- F10 epistemic-quality family (Atlas L573).

Builds a real `ArgumentMap` for a main claim (migrating a customer-service
knowledge base to vector search) with 2 supports, 1 objection, and 1
rebuttal answering that objection. Then proves Atlas's own referential-
integrity rule is real, not mere narrative intent: a construction-time
attempt to submit a rebuttal referencing an objection that was never raised
is refused, and a hand-tampered valid record (a dangling objection_id
spliced in, bypassing the builder) is independently caught by the gate.

Run::

    python -m ai_lego.apps.cli.run_argument_mapping_slice
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
from ai_lego.modules.epistemic.argument_mapping import (
    METHOD_ID,
    all_gates_pass,
    evaluate_argument_mapping_gates,
    evaluate_referential_integrity_gate,
    generate_argument_map,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-ARGMAP-SYNTHETIC-001"
EXECUTION_ID = "EX-ARGMAP-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-ARGMAP-001"

S = {
    "argument_map": "ai-lego://specs/cognitive/typed-objects/argument-map.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-argument-mapping-slice"


def _main_claim() -> dict[str, Any]:
    return {"claim_id": "C-1", "statement": "我們應該把客服知識庫遷移到向量搜尋", "provenance": make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")}


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "main_claim": _main_claim(),
        "supports": [
            {"id": "SUP-1", "text": "關鍵字搜尋在同義詞查詢上命中率偏低"},
            {"id": "SUP-2", "text": "向量搜尋在既有 POC 中命中率提升 40%"},
        ],
        "objections": [{"id": "OBJ-1", "text": "向量搜尋的維運成本與延遲可能高於現有方案"}],
        "rebuttals": [{"id": "REB-1", "objection_id": "OBJ-1", "text": "POC 量測延遲增加不到 50ms，且可用既有快取層抵銷"}],
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_argument_mapping_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed argument map -- main claim, 2 supports, 1 objection, 1 rebuttal
    # that actually answers the objection raised. ---
    descriptor, argument_map = catalog.invoke(
        METHOD_ID,
        generate_argument_map,
        "ARGMAP-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["argument_map"], argument_map, "argument map")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ArgumentMapGenerated", {"argument_map": argument_map, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_argument_mapping_gates(argument_map, "run_argument_mapping_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"argument map gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"ARGMAP_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ArgumentMappingGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove the referential-integrity rule is not toothless -- a rebuttal referencing an objection
    # that was never raised MUST be refused before any record is constructed. ---
    dangling_kwargs = {**_well_formed_kwargs(), "rebuttals": [{"id": "REB-BAD", "objection_id": "OBJ-NEVER-RAISED", "text": "this answers nothing real"}]}
    dangling_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_argument_map("ARGMAP-DANGLING-REBUTTAL-REFUSED-001", **dangling_kwargs)
    except InvariantViolation as error:
        if "ARGMAP_DANGLING_REBUTTAL" not in str(error):
            raise
        dangling_refusal_proof["raised"] = True
        dangling_refusal_proof["error_code"] = "ARGMAP_DANGLING_REBUTTAL"
    if not dangling_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("ARGMAP_INVARIANT_NOT_ENFORCED: a dangling rebuttal was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "DanglingRebuttalRefused", {"refusal_proof": dangling_refusal_proof}, 1.3)
    milestones.append("DANGLING_REBUTTAL_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT gate catches the same defect even when a caller
    # bypasses the builder entirely (splices a dangling objection_id directly into a VALID record's own raw
    # dict's rebuttals). ---
    tampered = copy.deepcopy(argument_map)
    tampered["rebuttals"][0] = {**tampered["rebuttals"][0], "objection_id": "OBJ-NEVER-RAISED"}
    tampered_gate = evaluate_referential_integrity_gate(tampered, "run_argument_mapping_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("ARGMAP_GATE_NOT_INDEPENDENT: the independent referential_integrity gate did NOT catch a hand-tampered record with a dangling rebuttal")
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
        "argument_map": argument_map,
        "gate_results": gate_results,
        "dangling_rebuttal_refusal_proof": dangling_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_behavior_over_time_slice.py)",
    }
    write_json(runtime / "results" / "argument_mapping_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_argument_mapping_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS epistemic.argument_mapping: ArgumentMap {result['argument_map']['id']} built (2 supports, 1 objection, 1 rebuttal), gates [{gate_summary}]; "
        f"ARGMAP_DANGLING_REBUTTAL REFUSED a rebuttal referencing an objection never raised ({result['dangling_rebuttal_refusal_proof']['error_code']}); "
        f"hand-tampered record (dangling objection_id spliced in) caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
