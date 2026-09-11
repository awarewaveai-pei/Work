"""``insight.persona`` vertical slice -- F06 human/customer-insight family, 2nd member, FIRST-EVER F06
slice (9 concurrent siblings open F06 in this same batch, none read or touched here).

Scenario: a persona for an independent freelance marketer, grounded in 2 disclosed research sources -- same
synthetic style every sibling slice's CLI demo uses. Builds a real, well-formed ``PersonaProfile``, then
demonstrates the real invariant (Atlas's own "Persona ≠ 真實民意" caution, mechanized as
``research_basis`` non-emptiness) as a construction-time REFUSAL, plus the weaker "goals/behavior/context"
completeness invariant (an empty ``goals`` list) as a second construction-time REFUSAL, proving neither is
toothless, same "show a real refusal, not only a real success" discipline every sibling slice's CLI demo
already establishes. A final step hand-tampers a VALID record directly (bypassing the builder) to prove the
independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_persona_slice
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
from ai_lego.modules.insight.persona import (
    METHOD_ID,
    all_gates_pass,
    evaluate_persona_gates,
    generate_persona_profile,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-PERSONA-SYNTHETIC-001"
EXECUTION_ID = "EX-PERSONA-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-PERSONA-001"

S = {
    "persona_profile": "ai-lego://specs/cognitive/typed-objects/persona-profile.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-persona-slice"


def _well_formed_persona_kwargs() -> dict[str, Any]:
    return dict(
        persona_id="PERSONA-2026-09-11-001",
        persona_name="獨立接案行銷顧問 Mei",
        goals=[
            "在單一工作區內管理多個客戶的行銷活動成效",
            "減少每週花在手動報表整理上的時間",
        ],
        behaviors=[
            "每週一早上手動登入每個客戶的廣告後台匯出數據",
            "習慣用試算表比對不同客戶的成效指標",
        ],
        context="同時服務 5-8 個中小企業客戶，多數客戶預算有限，工具採購決策需自行負擔成本",
        research_basis=[
            "2026-08 對 6 位獨立接案行銷顧問的半結構式訪談逐字稿（coding 主題：跨客戶報表疲勞）",
            "2026-07 匿名問卷（n=42 獨立行銷顧問），78% 回報每週花 3 小時以上在手動報表整理",
        ],
        provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
    )


def run_persona_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. insight.persona resolves because its
    # contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice
    # uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed persona -- every real invariant satisfied, invoked through the
    # catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, persona = catalog.invoke(
        METHOD_ID,
        generate_persona_profile,
        **_well_formed_persona_kwargs(),
    )
    contracts.validate(S["persona_profile"], persona, "persona profile")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "PersonaProfileGenerated", {"persona": persona, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_persona_gates(persona, "run_persona_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"insight.persona gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("PERSONA_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof the REAL invariant (Atlas's own "Persona ≠ 真實民意" caution, mechanized as
    # research_basis non-emptiness) is not toothless -- an empty research_basis list MUST be refused before
    # any record is constructed. ---
    empty_research_basis_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_persona_profile(**{**_well_formed_persona_kwargs(), "persona_id": "PERSONA-EMPTY-RESEARCH-REFUSED-001", "research_basis": []})
    except InvariantViolation as error:
        if "PERSONA_EMPTY_RESEARCH_BASIS" not in str(error):
            raise
        empty_research_basis_refusal_proof["raised"] = True
        empty_research_basis_refusal_proof["error_code"] = "PERSONA_EMPTY_RESEARCH_BASIS"
    if not empty_research_basis_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("PERSONA_INVARIANT_NOT_ENFORCED: an empty research_basis list was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyResearchBasisRefused", {"refusal_proof": empty_research_basis_refusal_proof}, 1.3)
    milestones.append("EMPTY_RESEARCH_BASIS_REFUSAL_PROVEN")

    # --- Step 3: proof the weaker "goals/behavior/context" completeness invariant is not toothless -- an
    # empty goals list MUST be refused. ---
    empty_goals_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_persona_profile(**{**_well_formed_persona_kwargs(), "persona_id": "PERSONA-EMPTY-GOALS-REFUSED-001", "goals": []})
    except InvariantViolation as error:
        if "PERSONA_EMPTY_GOALS" not in str(error):
            raise
        empty_goals_refusal_proof["raised"] = True
        empty_goals_refusal_proof["error_code"] = "PERSONA_EMPTY_GOALS"
    if not empty_goals_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("PERSONA_INVARIANT_NOT_ENFORCED: an empty goals list was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyGoalsRefused", {"refusal_proof": empty_goals_refusal_proof}, 1.5)
    milestones.append("EMPTY_GOALS_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses
    # the builder entirely (splices research_basis: [] into a raw copy of an already-valid record). ---
    tampered = dict(persona)
    tampered["research_basis"] = []  # bypasses the builder directly
    tampered_gate = evaluate_persona_gates(tampered, "run_persona_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("PERSONA_GATE_NOT_INDEPENDENT: the independent research_basis gate did NOT catch a hand-tampered empty research_basis")
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
        "persona": persona,
        "gate_results": gate_results,
        "empty_research_basis_refusal_proof": empty_research_basis_refusal_proof,
        "empty_goals_refusal_proof": empty_goals_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_ansoff_slice.py)",
    }
    write_json(runtime / "results" / "persona_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_persona_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS insight.persona: PersonaProfile {result['persona']['id']} built with "
        f"{len(result['persona']['goals'])} goals, {len(result['persona']['behaviors'])} behaviors, "
        f"{len(result['persona']['research_basis'])} research_basis citations, gates [{gate_summary}]; "
        f"PERSONA_EMPTY_RESEARCH_BASIS/PERSONA_EMPTY_GOALS invariants each REFUSED a malformed attempt "
        f"({result['empty_research_basis_refusal_proof']['error_code']}, {result['empty_goals_refusal_proof']['error_code']}); "
        f"hand-tampered empty research_basis caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
