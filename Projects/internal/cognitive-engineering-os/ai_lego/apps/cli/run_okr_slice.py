"""``framing.okr`` vertical slice -- Method Atlas slice for the F01 framing family's "OKR" tool (Atlas F01
table row, AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:336 -- the method's only citation).

Scenario (grounded, disclosed honestly, self-referential): this run's own OKRRecord IS this same F01 batch's
own real quarterly target, restated in the method's Objective/2-5-KR/owner/review shape -- not a synthetic
Cascadia scenario. Question this run answers: does a method with a BOUNDED VARIABLE-LENGTH list of structured
entries (2-5 key_results, unlike framing.smart's fixed positional 5-tuple, unlike framing.non_goals's
unbounded-length excluded_scope[]) assemble against the same shared LEGO framework with zero changes to any
of it? Every import below except ``ai_lego.modules.framing.okr`` itself is unchanged, reused code.

This run demonstrates BOTH real invariants at construction time (a PASS build, then two deliberate
REFUSALS -- KR count out of bounds, and a KR missing its owner), proving neither invariant is toothless, same
"show a real refusal, not only a real success" discipline every sibling slice in this family already
establishes. A final step then hand-tampers a VALID record directly (bypassing the builder) to prove the
independent gate, not just the builder, catches the same defect class.

Run::

    python -m ai_lego.apps.cli.run_okr_slice
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
from ai_lego.core.domain.tenant import CASCADIA
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.framing.okr import (
    METHOD_ID,
    all_gates_pass,
    evaluate_okr_gates,
    generate_okr_record,
    key_result_entry,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-OKR-SYNTHETIC-001"
EXECUTION_ID = "EX-OKR-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-OKR-001"

S = {
    "okr": "ai-lego://specs/cognitive/typed-objects/okr-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-okr-slice"


def run_okr_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. framing.okr resolves because its contract
    # is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    provenance = make_provenance("EVIDENCE", "HUMAN_APPROVED")

    # --- Step 1: the complete, well-formed record -- both invariants satisfied. Self-referential scenario,
    # see module docstring: this IS this same F01 batch's own real quarterly target. ---
    record = generate_okr_record(
        "OKR-2026-09-10-001",
        "讓 Cognitive OS F01 framing 家族成為團隊預設的目標框定工具",
        [
            key_result_entry("KR-1", "F01 家族 11 個方法中至少 6 個有完整 contract/schema/gate/CLI/test", "6/11 達標", "operator", provenance),
            key_result_entry("KR-2", "每個已建成方法的 CLI demo 皆真實執行過且全綠", "100% CLI demo PASS", "operator", provenance),
            key_result_entry("KR-3", "critic review 對每個新方法至少跑一次且無 unresolved critical finding", "0 個未解決 critical finding", "operator", provenance),
        ],
        "每季一次，team review",
        provenance,
    )
    contracts.validate(S["okr"], record, "okr record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "OKRRecorded", {"record": record}, 1)
    milestones.append("RECORD_BUILT")

    gate_results = evaluate_okr_gates(record, "run_okr_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"okr gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("OKR_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof Invariant #1 (KR count bound) is not toothless -- 1 key result (below the '2–5 KR'
    # bound) MUST be refused before any record is constructed. ---
    kr_count_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_okr_record(
            "OKR-REFUSED-001",
            "同上",
            [key_result_entry("KR-ONLY", "只有一個 KR", "同上", "operator", provenance)],  # 1 entry -- below the 2-5 bound
            "同上",
            provenance,
        )
    except InvariantViolation as error:
        if "OKR_INVALID_KR_COUNT" not in str(error):
            raise
        kr_count_refusal_proof["raised"] = True
        kr_count_refusal_proof["error_code"] = "OKR_INVALID_KR_COUNT"
    if not kr_count_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("OKR_INVARIANT_NOT_ENFORCED: a 1-entry key_results list was NOT refused -- the KR-count invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MalformedRecordRefused", {"refusal_proof": kr_count_refusal_proof}, 1.5)
    milestones.append("KR_COUNT_REFUSAL_PROVEN")

    # --- Step 3: proof Invariant #1 (per-field completeness) is not toothless -- a Key Result with a blank
    # owner MUST be refused before any record is constructed. ---
    unowned_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_okr_record(
            "OKR-UNOWNED-REFUSED-001",
            "同上",
            [
                key_result_entry("KR-1", "同上", "同上", "operator", provenance),
                key_result_entry("KR-2", "同上", "同上", "  ", provenance),  # blank owner -- unowned key result
            ],
            "同上",
            provenance,
        )
    except InvariantViolation as error:
        if "OKR_UNOWNED_KEY_RESULT" not in str(error):
            raise
        unowned_refusal_proof["raised"] = True
        unowned_refusal_proof["error_code"] = "OKR_UNOWNED_KEY_RESULT"
    if not unowned_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("OKR_INVARIANT_NOT_ENFORCED: a blank-owner key result was NOT refused -- the ownership invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "UnownedKeyResultRefused", {"unowned_refusal_proof": unowned_refusal_proof}, 1.7)
    milestones.append("UNOWNED_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses
    # the builder entirely. ---
    tampered = dict(record)
    tampered["key_results"] = list(record["key_results"][:1])  # bypasses the builder's own check directly on a raw copy -- now below the 2-5 bound
    tampered_gate = evaluate_okr_gates(tampered, "run_okr_slice", clock.at(1.9))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("OKR_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered 1-entry key_results list")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_results": tampered_gate}, 2.0)
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
        "kr_count_refusal_proof": kr_count_refusal_proof,
        "unowned_refusal_proof": unowned_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "okr_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_okr_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(
        f"PASS framing.okr: OKRRecord {result['record']['id']} built with "
        f"{len(result['record']['key_results'])} key results, {len(result['gate_results'])} gates all PASS; "
        f"KR-count invariant REFUSED a 1-entry attempt ({result['kr_count_refusal_proof']['error_code']}); "
        f"ownership invariant REFUSED a blank-owner attempt ({result['unowned_refusal_proof']['error_code']}); "
        f"1-entry tamper caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
