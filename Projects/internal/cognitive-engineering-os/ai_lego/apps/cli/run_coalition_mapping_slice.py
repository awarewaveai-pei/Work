"""``stakeholders.coalition_mapping`` vertical slice -- F07 stakeholder/power/negotiation family, 1 of 10
concurrent agents opening this family's members in the same parallel batch.

Scenario: a municipal zoning policy fight with 3 stakeholders and 2 overlapping candidate coalitions, same
synthetic style every sibling slice's CLI demo uses. Builds a real, well-formed ``CoalitionMappingRecord``
satisfying both real invariants (stakeholder-profile completeness, coalition-scenario referential integrity +
minimum size), then demonstrates each invariant once as a construction-time REFUSAL (a scenario naming only 1
member; a scenario referencing a stakeholder id that was never profiled), proving neither is toothless, same
"show a real refusal, not only a real success" discipline every sibling slice's CLI demo already establishes.
A final step hand-tampers a VALID record directly (bypassing the builder) to prove the independent gate, not
just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_coalition_mapping_slice
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
from ai_lego.modules.stakeholders.coalition_mapping import (
    METHOD_ID,
    all_gates_pass,
    evaluate_coalition_mapping_gates,
    generate_coalition_mapping_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-COALMAP-SYNTHETIC-001"
EXECUTION_ID = "EX-COALMAP-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-COALMAP-001"

S = {
    "coalition_mapping_record": "ai-lego://specs/cognitive/typed-objects/coalition-mapping.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-coalition-mapping-slice"


def _stakeholder_profiles() -> list[dict[str, Any]]:
    return [
        {"id": "S1", "name": "在地商圈協會", "interests": "維持街道停車位與人流，反對縮減臨停格位", "power": "可動員會員向議員陳情，媒體關注度中等", "resources": "會員基礎、地方媒體聯繫管道"},
        {"id": "S2", "name": "自行車倡議團體", "interests": "增加自行車道，支持縮減臨停格位", "power": "動員能力較小，但有議員個人支持", "resources": "志工人力、社群媒體聲量"},
        {"id": "S3", "name": "都市計畫局", "interests": "在不引發訴訟的前提下推動修法", "power": "法規制定權，但需議會通過", "resources": "技術報告、法規草案起草權"},
    ]


def _coalition_scenarios() -> list[dict[str, Any]]:
    return [
        {"id": "C1", "label": "商圈協會 + 都市計畫局：折衷分區方案", "member_ids": ["S1", "S3"]},
        {"id": "C2", "label": "自行車倡議團體 + 都市計畫局：全面自行車道方案", "member_ids": ["S2", "S3"]},
    ]


def _well_formed_record_kwargs() -> dict[str, Any]:
    return {
        "context": "市議會分區法規修訂案的利害關係人聯盟分析",
        "stakeholder_profiles": _stakeholder_profiles(),
        "coalition_scenarios": _coalition_scenarios(),
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_coalition_mapping_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. stakeholders.coalition_mapping resolves
    # because its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling
    # slice uses. ---
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
        generate_coalition_mapping_record,
        "COALMAP-2026-09-11-001",
        **_well_formed_record_kwargs(),
    )
    contracts.validate(S["coalition_mapping_record"], record, "coalition mapping record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "CoalitionMappingRecordGenerated", {"record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_coalition_mapping_gates(record, "run_coalition_mapping_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"stakeholders.coalition_mapping gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("COALMAP_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 2 (coalition minimum size) is not toothless -- a scenario naming only 1
    # member MUST be refused before any record is constructed. ---
    single_member_kwargs = {
        **_well_formed_record_kwargs(),
        "coalition_scenarios": [{"id": "C1", "label": "單一利害關係人（非聯盟）", "member_ids": ["S1"]}],
    }
    too_few_members_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_coalition_mapping_record("COALMAP-TOO-FEW-MEMBERS-REFUSED-001", **single_member_kwargs)
    except InvariantViolation as error:
        if "COALMAP_SCENARIO_TOO_FEW_MEMBERS" not in str(error):
            raise
        too_few_members_refusal_proof["raised"] = True
        too_few_members_refusal_proof["error_code"] = "COALMAP_SCENARIO_TOO_FEW_MEMBERS"
    if not too_few_members_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("COALMAP_INVARIANT_NOT_ENFORCED: a single-member 'coalition' was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TooFewMembersRefused", {"refusal_proof": too_few_members_refusal_proof}, 1.3)
    milestones.append("TOO_FEW_MEMBERS_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 2 (referential integrity) is not toothless -- a scenario referencing a
    # stakeholder id that was never profiled MUST be refused before any record is constructed. ---
    dangling_ref_kwargs = {
        **_well_formed_record_kwargs(),
        "coalition_scenarios": [{"id": "C1", "label": "引用未列冊的利害關係人", "member_ids": ["S1", "S-UNKNOWN"]}],
    }
    dangling_ref_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_coalition_mapping_record("COALMAP-DANGLING-REF-REFUSED-001", **dangling_ref_kwargs)
    except InvariantViolation as error:
        if "COALMAP_SCENARIO_DANGLING_MEMBER_REF" not in str(error):
            raise
        dangling_ref_refusal_proof["raised"] = True
        dangling_ref_refusal_proof["error_code"] = "COALMAP_SCENARIO_DANGLING_MEMBER_REF"
    if not dangling_ref_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("COALMAP_INVARIANT_NOT_ENFORCED: a dangling member reference was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DanglingMemberRefRefused", {"refusal_proof": dangling_ref_refusal_proof}, 1.5)
    milestones.append("DANGLING_REF_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (splices a dangling member id directly into a VALID record's own raw dict, after
    # construction). ---
    tampered = dict(record)
    tampered["coalition_scenarios"] = [dict(s) for s in record["coalition_scenarios"]]
    tampered["coalition_scenarios"][0] = {**tampered["coalition_scenarios"][0], "member_ids": ["S1", "S-GHOST"]}  # was a real stakeholder id -- bypasses the builder directly
    tampered_gate = evaluate_coalition_mapping_gates(tampered, "run_coalition_mapping_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("COALMAP_GATE_NOT_INDEPENDENT: the independent content-integrity gate did NOT catch a hand-tampered dangling member reference")
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
        "record": record,
        "gate_results": gate_results,
        "too_few_members_refusal_proof": too_few_members_refusal_proof,
        "dangling_ref_refusal_proof": dangling_ref_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_bcg_matrix_slice.py)",
    }
    write_json(runtime / "results" / "coalition_mapping_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_coalition_mapping_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS stakeholders.coalition_mapping: CoalitionMappingRecord {result['record']['id']} built, gates [{gate_summary}]; "
        f"COALMAP_SCENARIO_TOO_FEW_MEMBERS/COALMAP_SCENARIO_DANGLING_MEMBER_REF invariants each REFUSED a malformed attempt "
        f"({result['too_few_members_refusal_proof']['error_code']}, {result['dangling_ref_refusal_proof']['error_code']}); "
        f"hand-tampered dangling member reference caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
