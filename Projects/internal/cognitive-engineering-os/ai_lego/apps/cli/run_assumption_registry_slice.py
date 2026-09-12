"""``epistemic.assumption_registry`` vertical slice -- 2nd of 2 F10 epistemic-family members built this batch.

Scenario: a 2-entry registry over a university AI-platform-adoption proposal (same synthetic subject
``epistemic.assumption_mapping``'s own CLI demo uses) -- one Critical/validated assumption (must be
``is_critical_assumption: true``), one non-critical/unverified assumption (``is_critical_assumption: false``).
Builds a real, well-formed ``AssumptionRegistry`` satisfying every real invariant, then demonstrates 2
independent invariant-violation refusals at construction (a smuggled ``is_critical_assumption`` key; a
"Validated" status with no ``validation`` field). A final step hand-tampers a VALID record directly (bypassing
the builder, splicing in an ``is_critical_assumption`` that disagrees with its own ``impact_if_wrong``) to prove
the independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_assumption_registry_slice
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
from ai_lego.modules.epistemic.assumption_registry import (
    METHOD_ID,
    all_gates_pass,
    assumption_entry,
    evaluate_assumption_registry_gates,
    generate_assumption_registry,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-ASSUMPTIONREGISTRY-SYNTHETIC-001"
EXECUTION_ID = "EX-ASSUMPTIONREGISTRY-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-ASSUMPTIONREGISTRY-001"

S = {
    "assumption_registry": "ai-lego://specs/cognitive/typed-objects/assumption-registry.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-assumption-registry-slice"


def _entries() -> list[dict[str, Any]]:
    return [
        assumption_entry(
            "ASM-1",
            "大學願意採用外部 AI 教育平台",
            "Validated",
            make_provenance("ASSUMPTION", "HUMAN_EDITED"),
            assumption_type="Market Adoption",
            impact_if_wrong="Critical",
            confidence=0.62,
            validation="Interview 30 universities",
            owner="product-research",
        ),
        assumption_entry(
            "ASM-2",
            "現有 IT 團隊有能力自行維運新平台",
            "Unverified",
            make_provenance("ASSUMPTION", "AI_GENERATED"),
            assumption_type="Technical Capability",
            impact_if_wrong="Moderate",
            owner="engineering",
        ),
    ]


def run_assumption_registry_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed registry -- every real invariant satisfied: ASM-1 is
    # Critical/Validated (is_critical_assumption must compute True), ASM-2 is Moderate/Unverified (must compute
    # False). ---
    descriptor, registry = catalog.invoke(
        METHOD_ID,
        generate_assumption_registry,
        "AREG-2026-09-12-001",
        _entries(),
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["assumption_registry"], registry, "assumption registry")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "AssumptionRegistryGenerated", {"registry": registry, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_assumption_registry_gates(registry, "run_assumption_registry_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"epistemic.assumption_registry gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("ASSUMPTIONREGISTRY_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    asm1 = next(e for e in registry["entries"] if e["id"] == "ASM-1")
    asm2 = next(e for e in registry["entries"] if e["id"] == "ASM-2")
    if asm1["is_critical_assumption"] is not True or asm2["is_critical_assumption"] is not False:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"ASSUMPTIONREGISTRY_UNEXPECTED_CRITICAL_FLAG: ASM-1={asm1['is_critical_assumption']!r}, ASM-2={asm2['is_critical_assumption']!r}")

    # --- Step 2: proof is_critical_assumption cannot be smuggled in as a caller-supplied value -- a
    # hand-crafted entry carrying it directly MUST be refused before any record is constructed. ---
    smuggled_entries = _entries()
    smuggled_entries[0] = {**smuggled_entries[0], "is_critical_assumption": True}
    smuggled_flag_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_assumption_registry("AREG-SMUGGLED-FLAG-REFUSED-001", smuggled_entries, make_provenance("AI_INFERENCE", "AI_GENERATED"))
    except InvariantViolation as error:
        if "ASSUMPTIONREGISTRY_INVALID_ENTRY" not in str(error):
            raise
        smuggled_flag_refusal_proof["raised"] = True
        smuggled_flag_refusal_proof["error_code"] = "ASSUMPTIONREGISTRY_INVALID_ENTRY"
    if not smuggled_flag_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("ASSUMPTIONREGISTRY_INVARIANT_NOT_ENFORCED: a caller-supplied is_critical_assumption was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "SmuggledCriticalFlagRefused", {"refusal_proof": smuggled_flag_refusal_proof}, 1.3)
    milestones.append("SMUGGLED_CRITICAL_FLAG_REFUSAL_PROVEN")

    # --- Step 3: proof a second invariant (validated status requires a non-empty validation field) is not
    # toothless -- a "Validated" status with no validation MUST be refused before any record is constructed. ---
    unvalidated_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        assumption_entry("ASM-9", "假設陳述", "Validated", make_provenance("ASSUMPTION", "AI_GENERATED"))
    except InvariantViolation as error:
        if "ASSUMPTIONREGISTRY_VALIDATED_STATUS_REQUIRES_VALIDATION" not in str(error):
            raise
        unvalidated_refusal_proof["raised"] = True
        unvalidated_refusal_proof["error_code"] = "ASSUMPTIONREGISTRY_VALIDATED_STATUS_REQUIRES_VALIDATION"
    if not unvalidated_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("ASSUMPTIONREGISTRY_INVARIANT_NOT_ENFORCED: a validated status with no validation field was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "UnvalidatedValidatedStatusRefused", {"refusal_proof": unvalidated_refusal_proof}, 1.5)
    milestones.append("UNVALIDATED_STATUS_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (splices an is_critical_assumption disagreeing with its own impact_if_wrong directly into
    # a VALID record's own raw dict, after construction). ---
    tampered = dict(registry)
    tampered["entries"] = [dict(e) for e in registry["entries"]]
    tampered["entries"][1]["is_critical_assumption"] = True  # ASM-2 is Moderate, not Critical
    tampered_gate = evaluate_assumption_registry_gates(tampered, "run_assumption_registry_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"ASSUMPTIONREGISTRY_GATE_NOT_INDEPENDENT: runtime_gate_caught={tamper_caught} -- the independent gate must catch a hand-tampered is_critical_assumption")
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
        "registry": registry,
        "gate_results": gate_results,
        "smuggled_flag_refusal_proof": smuggled_flag_refusal_proof,
        "unvalidated_refusal_proof": unvalidated_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_assumption_mapping_slice.py)",
    }
    write_json(runtime / "results" / "assumption_registry_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_assumption_registry_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    flags = ", ".join(f"{e['id']}={e['is_critical_assumption']}" for e in result["registry"]["entries"])
    print(
        f"PASS epistemic.assumption_registry: AssumptionRegistry {result['registry']['id']} built [{flags}], gates [{gate_summary}]; "
        f"smuggled is_critical_assumption REFUSED ({result['smuggled_flag_refusal_proof']['error_code']}); "
        f"unvalidated 'Validated' status REFUSED ({result['unvalidated_refusal_proof']['error_code']}); "
        f"hand-tampered is_critical_assumption caught via the INDEPENDENT gate (not just the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
