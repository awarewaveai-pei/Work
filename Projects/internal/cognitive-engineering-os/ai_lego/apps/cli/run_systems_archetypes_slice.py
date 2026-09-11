"""``systems.systems_archetypes`` vertical slice -- F09 systems-thinking family, 1 of 2 members this agent
opens in a parallel batch alongside ``systems.rich_picture``.

Scenario: a SaaS startup's growth-vs-support-quality tension, matched against one known archetype
(LIMITS_TO_GROWTH), evidenced by two observed symptoms. Then demonstrates BOTH real invariants are not
toothless: an unrecognized archetype name and a match with zero observed_symptoms are each refused BEFORE
any record is constructed. A final step hand-tampers a VALID record directly (bypassing the builder) to
prove the independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_systems_archetypes_slice
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
from ai_lego.modules.systems.systems_archetypes import (
    METHOD_ID,
    all_gates_pass,
    archetype_match,
    evaluate_systems_archetypes_gates,
    generate_systems_archetype_match_set,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-SYSARCH-SYNTHETIC-001"
EXECUTION_ID = "EX-SYSARCH-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-SYSARCH-001"

S = {
    "systems_archetype_match_set": "ai-lego://specs/cognitive/typed-objects/systems-archetype-match.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-systems-archetypes-slice"


def _archetype_matches() -> list[dict[str, Any]]:
    return [
        archetype_match(
            "ARCH-2026-09-11-001-M1",
            "LIMITS_TO_GROWTH",
            ["新用戶成長率連續三季下滑", "客服回應時間隨用戶數增加而惡化，未同步擴編"],
            "早期成長引擎(口碑推薦)本身觸發了限制成長的條件(客服產能跟不上用戶數)，符合 Limits to Growth 的增強迴路撞上抑制迴路模式。",
        ),
    ]


def _well_formed_record_kwargs() -> dict[str, Any]:
    return {
        "context": "SaaS 新創的成長與客服品質衝突分析",
        "archetype_matches": _archetype_matches(),
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_systems_archetypes_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed record -- both real invariants satisfied, invoked through the
    # catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_systems_archetype_match_set,
        "ARCH-2026-09-11-001",
        **_well_formed_record_kwargs(),
    )
    contracts.validate(S["systems_archetype_match_set"], record, "systems archetype match set")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "SystemsArchetypeMatchSetGenerated", {"record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_systems_archetypes_gates(record, "run_systems_archetypes_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"systems.systems_archetypes gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("SYSARCH_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 1 (closed vocabulary) is not toothless -- an unrecognized archetype name
    # MUST be refused before any record is constructed. ---
    invalid_name_kwargs = {
        **_well_formed_record_kwargs(),
        "archetype_matches": [archetype_match("ARCH-BAD-001-M1", "GROUPTHINK", ["some symptom"], "not a real archetype")],
    }
    invalid_name_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_systems_archetype_match_set("ARCH-INVALID-NAME-REFUSED-001", **invalid_name_kwargs)
    except InvariantViolation as error:
        if "SYSARCH_INVALID_ARCHETYPE_NAME" not in str(error):
            raise
        invalid_name_refusal_proof["raised"] = True
        invalid_name_refusal_proof["error_code"] = "SYSARCH_INVALID_ARCHETYPE_NAME"
    if not invalid_name_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("SYSARCH_INVARIANT_NOT_ENFORCED: an unrecognized archetype_name was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "InvalidArchetypeNameRefused", {"refusal_proof": invalid_name_refusal_proof}, 1.3)
    milestones.append("INVALID_NAME_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 2 (evidence minimum) is not toothless -- a match with zero observed_symptoms
    # MUST be refused before any record is constructed. ---
    no_symptoms_kwargs = {
        **_well_formed_record_kwargs(),
        "archetype_matches": [archetype_match("ARCH-BAD-002-M1", "ESCALATION", [], "unevidenced claim, no symptoms cited")],
    }
    no_symptoms_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_systems_archetype_match_set("ARCH-NO-SYMPTOMS-REFUSED-001", **no_symptoms_kwargs)
    except InvariantViolation as error:
        if "SYSARCH_MATCH_NO_OBSERVED_SYMPTOMS" not in str(error):
            raise
        no_symptoms_refusal_proof["raised"] = True
        no_symptoms_refusal_proof["error_code"] = "SYSARCH_MATCH_NO_OBSERVED_SYMPTOMS"
    if not no_symptoms_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("SYSARCH_INVARIANT_NOT_ENFORCED: a match with zero observed_symptoms was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "NoObservedSymptomsRefused", {"refusal_proof": no_symptoms_refusal_proof}, 1.5)
    milestones.append("NO_SYMPTOMS_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses
    # the builder entirely (splices an empty observed_symptoms list directly into a VALID record's own raw
    # dict, after construction). ---
    tampered = dict(record)
    tampered["archetype_matches"] = [dict(m) for m in record["archetype_matches"]]
    tampered["archetype_matches"][0] = {**tampered["archetype_matches"][0], "observed_symptoms": []}  # bypasses the builder directly
    tampered_gate = evaluate_systems_archetypes_gates(tampered, "run_systems_archetypes_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("SYSARCH_GATE_NOT_INDEPENDENT: the independent content-integrity gate did NOT catch a hand-tampered empty observed_symptoms list")
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
        "record": record,
        "gate_results": gate_results,
        "invalid_name_refusal_proof": invalid_name_refusal_proof,
        "no_symptoms_refusal_proof": no_symptoms_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_coalition_mapping_slice.py)",
    }
    write_json(runtime / "results" / "systems_archetypes_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_systems_archetypes_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS systems.systems_archetypes: SystemsArchetypeMatchSet {result['record']['id']} built, gates [{gate_summary}]; "
        f"SYSARCH_INVALID_ARCHETYPE_NAME/SYSARCH_MATCH_NO_OBSERVED_SYMPTOMS invariants each REFUSED a malformed attempt "
        f"({result['invalid_name_refusal_proof']['error_code']}, {result['no_symptoms_refusal_proof']['error_code']}); "
        f"hand-tampered empty observed_symptoms caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
