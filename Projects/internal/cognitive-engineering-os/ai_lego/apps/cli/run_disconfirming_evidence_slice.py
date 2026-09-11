"""``challenge.disconfirming_evidence`` vertical slice -- F12 challenge/red-team/risk family, 7th built member
(grep-confirmed: red_team/blue_team/independent_judge already exist; 1 of 7 concurrent agents opening every
remaining F12 member in the same parallel batch, zero file overlap between agents).

Scenario: testing the belief "our new onboarding flow reduced signup drop-off" against two pre-declared
falsifiers -- same synthetic style every sibling slice's CLI demo uses. Builds a real, well-formed
``DisconfirmingEvidenceSearch`` satisfying every real invariant, then demonstrates THE real invariant (a
search_results entry referencing an undeclared falsifier) as a construction-time REFUSAL, and a second invariant
(``found:true`` with no ``evidence_description``) as a second REFUSAL -- proving neither is toothless, same "show
a real refusal, not only a real success" discipline every sibling slice's CLI demo already establishes. A final
step hand-tampers a VALID record directly (bypassing the builder, splicing a dangling falsifier reference into
search_results) to prove the independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_disconfirming_evidence_slice
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
from ai_lego.modules.challenge.disconfirming_evidence import (
    METHOD_ID,
    all_gates_pass,
    evaluate_disconfirming_evidence_gates,
    falsifier_criterion,
    generate_disconfirming_evidence_search,
    search_result,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-DISCONF-SYNTHETIC-001"
EXECUTION_ID = "EX-DISCONF-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-DISCONF-001"

S = {
    "disconfirming_evidence_search": "ai-lego://specs/cognitive/typed-objects/disconfirming-evidence-search.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-disconfirming-evidence-slice"


def _current_belief() -> str:
    return "新版 onboarding 流程降低了註冊流失率"


def _falsifier_criteria() -> list[dict[str, Any]]:
    return [
        falsifier_criterion("F1", "若 A/B 測試顯示新流程的流失率不低於舊流程（信賴區間重疊），則此信念被推翻"),
        falsifier_criterion("F2", "若流失率下降完全由同期行銷活動導致（去除該變因後差異消失），則此信念被推翻"),
    ]


def _search_results() -> list[dict[str, Any]]:
    return [
        search_result("F1", False),
        search_result("F2", True, evidence_description="移除同期行銷活動的流量後重新計算，流失率下降幅度從 12% 縮減到 2%，多數效果由行銷活動解釋而非流程改動"),
    ]


def _well_formed_search_kwargs() -> dict[str, Any]:
    return {
        "current_belief": _current_belief(),
        "falsifier_criteria": _falsifier_criteria(),
        "search_results": _search_results(),
        "provenance": make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL"),
    }


def run_disconfirming_evidence_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. challenge.disconfirming_evidence resolves
    # because its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling
    # slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed search -- every real invariant satisfied, invoked through the
    # catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, search = catalog.invoke(
        METHOD_ID,
        generate_disconfirming_evidence_search,
        "DISCONF-2026-09-11-001",
        **_well_formed_search_kwargs(),
    )
    contracts.validate(S["disconfirming_evidence_search"], search, "disconfirming evidence search")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DisconfirmingEvidenceSearchGenerated", {"search": search, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_disconfirming_evidence_gates(search, "run_disconfirming_evidence_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"challenge.disconfirming_evidence gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("DISCONF_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof THE real invariant (falsifier_criteria_id must reference a declared falsifier -- Atlas's
    # own Popperian 'belief→falsifier→search' order) is not toothless -- a search result naming an undeclared
    # falsifier MUST be refused before any record is constructed. ---
    dangling_reference_kwargs = {**_well_formed_search_kwargs(), "search_results": [*_search_results(), search_result("F99-NEVER-DECLARED", True, evidence_description="不應該能被記錄")]}
    dangling_reference_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_disconfirming_evidence_search("DISCONF-DANGLING-REF-REFUSED-001", **dangling_reference_kwargs)
    except InvariantViolation as error:
        if "DISCONF_SEARCH_RESULT_UNKNOWN_FALSIFIER" not in str(error):
            raise
        dangling_reference_refusal_proof["raised"] = True
        dangling_reference_refusal_proof["error_code"] = "DISCONF_SEARCH_RESULT_UNKNOWN_FALSIFIER"
    if not dangling_reference_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("DISCONF_INVARIANT_NOT_ENFORCED: a search result referencing an undeclared falsifier was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DanglingFalsifierReferenceRefused", {"refusal_proof": dangling_reference_refusal_proof}, 1.3)
    milestones.append("DANGLING_REFERENCE_REFUSAL_PROVEN")

    # --- Step 3: proof a second invariant (found:true requires a non-empty evidence_description) is not
    # toothless -- an unevidenced disconfirmation claim MUST be refused before any record is constructed. ---
    unevidenced_claim_kwargs = {**_well_formed_search_kwargs(), "search_results": [search_result("F1", True)]}
    unevidenced_claim_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_disconfirming_evidence_search("DISCONF-UNEVIDENCED-CLAIM-REFUSED-001", **unevidenced_claim_kwargs)
    except InvariantViolation as error:
        if "DISCONF_MISSING_EVIDENCE_DESCRIPTION" not in str(error):
            raise
        unevidenced_claim_refusal_proof["raised"] = True
        unevidenced_claim_refusal_proof["error_code"] = "DISCONF_MISSING_EVIDENCE_DESCRIPTION"
    if not unevidenced_claim_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("DISCONF_INVARIANT_NOT_ENFORCED: a found:true claim with no evidence_description was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "UnevidencedClaimRefused", {"refusal_proof": unevidenced_claim_refusal_proof}, 1.5)
    milestones.append("UNEVIDENCED_CLAIM_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (splices a dangling falsifier reference directly into a VALID record's own raw dict, after
    # construction). ---
    tampered = dict(search)
    tampered["search_results"] = [*search["search_results"], {"falsifier_criteria_id": "F99-SPLICED-POST-CONSTRUCTION", "found": True, "evidence_description": "繞過 builder 直接注入"}]
    tampered_gate = evaluate_disconfirming_evidence_gates(tampered, "run_disconfirming_evidence_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("DISCONF_GATE_NOT_INDEPENDENT: the independent content-integrity gate did NOT catch a hand-tampered, dangling falsifier reference")
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
        "search": search,
        "gate_results": gate_results,
        "dangling_reference_refusal_proof": dangling_reference_refusal_proof,
        "unevidenced_claim_refusal_proof": unevidenced_claim_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_game_theory_slice.py)",
    }
    write_json(runtime / "results" / "disconfirming_evidence_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_disconfirming_evidence_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS challenge.disconfirming_evidence: DisconfirmingEvidenceSearch {result['search']['id']} built, gates [{gate_summary}]; "
        f"DISCONF_SEARCH_RESULT_UNKNOWN_FALSIFIER/DISCONF_MISSING_EVIDENCE_DESCRIPTION invariants each REFUSED a malformed attempt "
        f"({result['dangling_reference_refusal_proof']['error_code']}, {result['unevidenced_claim_refusal_proof']['error_code']}); "
        f"hand-tampered dangling falsifier reference caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
