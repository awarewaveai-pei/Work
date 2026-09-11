"""``systems.agent_based_modeling`` vertical slice -- F09 systems-thinking family, second built member.

Scenario: a two-sided online marketplace, modeled as buyer and seller agents each with their own rules, one run
showing an emergent price-convergence effect (Atlas F09 L552's own "處理 heterogeneity 與 emergent effects")--
same synthetic-but-plausible style every sibling slice's CLI demo uses. Builds a real, well-formed
``AgentBasedModel`` satisfying every real invariant, then demonstrates two of them each as a construction-time
REFUSAL (an agent declared with zero rules; a run referencing a dangling/unknown agent id), proving neither is
toothless. A final step hand-tampers a VALID record directly (bypassing the builder, deleting the only agent a
run references) to prove the independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_agent_based_modeling_slice
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
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.systems.agent_based_modeling import (
    METHOD_ID,
    all_gates_pass,
    evaluate_agent_based_modeling_gates,
    generate_agent_based_model,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-AGENTBASED-SYNTHETIC-001"
EXECUTION_ID = "EX-AGENTBASED-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-AGENTBASED-001"

S = {
    "agent_based_model": "ai-lego://specs/cognitive/typed-objects/agent-based-model.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-agent-based-modeling-slice"


def _agents() -> list[dict[str, Any]]:
    return [
        {"id": "AGENT-BUYER", "name": "買家", "rules": ["若商品價格低於自身預算上限則購買", "若同類商品有更低價則延後購買"]},
        {"id": "AGENT-SELLER", "name": "賣家", "rules": ["若庫存過多則降價出清", "若近期售出速度快則調升價格"]},
    ]


def _runs() -> list[dict[str, Any]]:
    return [
        {
            "id": "RUN-001",
            "summary": "500 回合後，價格自發收斂到接近均衡點，即使沒有任何代理人被賦予「均衡」的全域知識",
            "agent_ids_involved": ["AGENT-BUYER", "AGENT-SELLER"],
        },
    ]


def _well_formed_model_kwargs() -> dict[str, Any]:
    return {
        "agents": _agents(),
        "environment_description": "一個模擬的線上市場，買家與賣家代理人每回合各自依規則決策，市場價格由供需即時結算",
        "runs": _runs(),
        "provenance": make_provenance("SIMULATED_RESULT", "AI_GENERATED"),
    }


def run_agent_based_modeling_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed model -- every real invariant satisfied. ---
    descriptor, model = catalog.invoke(
        METHOD_ID,
        generate_agent_based_model,
        "ABM-2026-09-11-001",
        **_well_formed_model_kwargs(),
    )
    contracts.validate(S["agent_based_model"], model, "agent-based model")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "AgentBasedModelGenerated", {"model": model, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_agent_based_modeling_gates(model, "run_agent_based_modeling_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"systems.agent_based_modeling gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("AGENTBASED_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof an agent with zero rules is not toothless -- Atlas F09 L552's own "agents→rules" stage
    # MUST be refused before any record is constructed. ---
    ruleless_agents = _agents()
    ruleless_agents[0] = {**ruleless_agents[0], "rules": []}
    ruleless_agent_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_agent_based_model(
            "ABM-RULELESS-AGENT-REFUSED-001",
            ruleless_agents,
            _well_formed_model_kwargs()["environment_description"],
            _runs(),
            make_provenance("SIMULATED_RESULT", "AI_GENERATED"),
        )
    except InvariantViolation as error:
        if "AGENTBASED_INVALID_AGENT_ENTRY" not in str(error):
            raise
        ruleless_agent_refusal_proof["raised"] = True
        ruleless_agent_refusal_proof["error_code"] = "AGENTBASED_INVALID_AGENT_ENTRY"
    if not ruleless_agent_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("AGENTBASED_INVARIANT_NOT_ENFORCED: an agent with zero rules was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "RulelessAgentRefused", {"refusal_proof": ruleless_agent_refusal_proof}, 1.3)
    milestones.append("RULELESS_AGENT_REFUSAL_PROVEN")

    # --- Step 3: proof referential integrity (runs[].agent_ids_involved) is not toothless -- a run naming an
    # unknown agent id MUST be refused before any record is constructed. ---
    dangling_runs = [{**_runs()[0], "agent_ids_involved": ["AGENT-BUYER", "AGENT-GHOST"]}]
    dangling_run_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_agent_based_model("ABM-DANGLING-REF-REFUSED-001", **{**_well_formed_model_kwargs(), "runs": dangling_runs})
    except InvariantViolation as error:
        if "AGENTBASED_RUN_UNKNOWN_AGENT" not in str(error):
            raise
        dangling_run_refusal_proof["raised"] = True
        dangling_run_refusal_proof["error_code"] = "AGENTBASED_RUN_UNKNOWN_AGENT"
    if not dangling_run_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("AGENTBASED_INVARIANT_NOT_ENFORCED: a run referencing an unknown agent id was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "DanglingRunReferenceRefused", {"refusal_proof": dangling_run_refusal_proof}, 1.5)
    milestones.append("DANGLING_REFERENCE_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (deletes the only agent AGENT-SELLER directly from a VALID record's own raw dict, leaving
    # RUN-001's own agent_ids_involved dangling, after construction). ---
    tampered = dict(model)
    tampered["agents"] = [a for a in model["agents"] if a["id"] != "AGENT-SELLER"]
    tampered_gate = evaluate_agent_based_modeling_gates(tampered, "run_agent_based_modeling_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    schema_layer_note = "n/a -- referential integrity is a runtime-only invariant, not schema-expressible (see contract compilation_decisions)"
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("AGENTBASED_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered dangling agent reference")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_results": tampered_gate}, 2.1)
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
        "model": model,
        "gate_results": gate_results,
        "ruleless_agent_refusal_proof": ruleless_agent_refusal_proof,
        "dangling_run_refusal_proof": dangling_run_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "schema_layer_note": schema_layer_note,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_pre_mortem_slice.py)",
    }
    write_json(runtime / "results" / "agent_based_modeling_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_agent_based_modeling_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS systems.agent_based_modeling: AgentBasedModel {result['model']['id']} built, gates [{gate_summary}]; "
        f"ruleless-agent / dangling-reference invariants each REFUSED a malformed attempt "
        f"({result['ruleless_agent_refusal_proof']['error_code']}, {result['dangling_run_refusal_proof']['error_code']}); "
        f"hand-tampered dangling agent reference caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
