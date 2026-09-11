"""``systems.rich_picture`` vertical slice -- F09 systems-thinking family, 1 of 2 members this agent opens in
a parallel batch alongside ``systems.systems_archetypes``.

Scenario: a municipal zoning dispute with 3 actors and 2 issues, same synthetic style every sibling slice's
CLI demo uses. Builds a real, well-formed ``RichPictureRecord`` satisfying both real invariants (structural
minimum, issue referential integrity + evidence minimum), then demonstrates each invariant once as a
construction-time REFUSAL (an issue naming zero involved actors; an issue referencing an actor id that was
never drawn), proving neither is toothless. A final step hand-tampers a VALID record directly (bypassing the
builder) to prove the independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_rich_picture_slice
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
from ai_lego.modules.systems.rich_picture import (
    METHOD_ID,
    actor,
    all_gates_pass,
    evaluate_rich_picture_gates,
    generate_rich_picture_record,
    issue,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-RICHPIC-SYNTHETIC-001"
EXECUTION_ID = "EX-RICHPIC-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-RICHPIC-001"

S = {
    "rich_picture_record": "ai-lego://specs/cognitive/typed-objects/rich-picture.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-rich-picture-slice"


def _actors() -> list[dict[str, Any]]:
    return [
        {"id": "A1", "name": "在地商圈協會"},
        {"id": "A2", "name": "自行車倡議團體"},
        {"id": "A3", "name": "都市計畫局"},
    ]


def _issues() -> list[dict[str, Any]]:
    return [
        {"id": "I1", "description": "商圈協會擔心縮減臨停格位會降低來客量，與自行車倡議團體的訴求直接衝突", "involves_actor_ids": ["A1", "A2"]},
        {"id": "I2", "description": "都市計畫局需在不引發訴訟的前提下推動修法，時程壓力大", "involves_actor_ids": ["A3"]},
    ]


def _well_formed_record_kwargs() -> dict[str, Any]:
    return {
        "context": "市中心停車格縮減案的利害關係人與衝突全貌",
        "actors": _actors(),
        "issues": _issues(),
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_rich_picture_slice(config: SliceConfig) -> dict[str, Any]:
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
        generate_rich_picture_record,
        "RP-2026-09-11-001",
        **_well_formed_record_kwargs(),
    )
    contracts.validate(S["rich_picture_record"], record, "rich picture record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "RichPictureRecordGenerated", {"record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_rich_picture_gates(record, "run_rich_picture_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"systems.rich_picture gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("RICHPIC_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 2 (evidence minimum) is not toothless -- an issue naming zero involved
    # actors MUST be refused before any record is constructed. ---
    no_actors_kwargs = {
        **_well_formed_record_kwargs(),
        "issues": [{"id": "I1", "description": "沒有連結任何實際 actor 的孤立問題", "involves_actor_ids": []}],
    }
    no_actors_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_rich_picture_record("RP-NO-ACTORS-REFUSED-001", **no_actors_kwargs)
    except InvariantViolation as error:
        if "RICHPIC_ISSUE_NO_ACTORS_INVOLVED" not in str(error):
            raise
        no_actors_refusal_proof["raised"] = True
        no_actors_refusal_proof["error_code"] = "RICHPIC_ISSUE_NO_ACTORS_INVOLVED"
    if not no_actors_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("RICHPIC_INVARIANT_NOT_ENFORCED: an issue naming zero involved actors was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "NoActorsInvolvedRefused", {"refusal_proof": no_actors_refusal_proof}, 1.3)
    milestones.append("NO_ACTORS_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 2 (referential integrity) is not toothless -- an issue referencing an actor
    # id that was never drawn MUST be refused before any record is constructed. ---
    dangling_ref_kwargs = {
        **_well_formed_record_kwargs(),
        "issues": [{"id": "I1", "description": "引用未畫入的 actor", "involves_actor_ids": ["A1", "A-UNKNOWN"]}],
    }
    dangling_ref_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_rich_picture_record("RP-DANGLING-REF-REFUSED-001", **dangling_ref_kwargs)
    except InvariantViolation as error:
        if "RICHPIC_ISSUE_DANGLING_ACTOR_REF" not in str(error):
            raise
        dangling_ref_refusal_proof["raised"] = True
        dangling_ref_refusal_proof["error_code"] = "RICHPIC_ISSUE_DANGLING_ACTOR_REF"
    if not dangling_ref_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("RICHPIC_INVARIANT_NOT_ENFORCED: a dangling actor reference was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DanglingActorRefRefused", {"refusal_proof": dangling_ref_refusal_proof}, 1.5)
    milestones.append("DANGLING_REF_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses
    # the builder entirely (splices a dangling actor id directly into a VALID record's own raw dict, after
    # construction). ---
    tampered = dict(record)
    tampered["issues"] = [dict(i) for i in record["issues"]]
    tampered["issues"][0] = {**tampered["issues"][0], "involves_actor_ids": ["A1", "A-GHOST"]}  # was a real actor id -- bypasses the builder directly
    tampered_gate = evaluate_rich_picture_gates(tampered, "run_rich_picture_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("RICHPIC_GATE_NOT_INDEPENDENT: the independent content-integrity gate did NOT catch a hand-tampered dangling actor reference")
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
        "no_actors_refusal_proof": no_actors_refusal_proof,
        "dangling_ref_refusal_proof": dangling_ref_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_coalition_mapping_slice.py)",
    }
    write_json(runtime / "results" / "rich_picture_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_rich_picture_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS systems.rich_picture: RichPictureRecord {result['record']['id']} built, gates [{gate_summary}]; "
        f"RICHPIC_ISSUE_NO_ACTORS_INVOLVED/RICHPIC_ISSUE_DANGLING_ACTOR_REF invariants each REFUSED a malformed attempt "
        f"({result['no_actors_refusal_proof']['error_code']}, {result['dangling_ref_refusal_proof']['error_code']}); "
        f"hand-tampered dangling actor reference caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
