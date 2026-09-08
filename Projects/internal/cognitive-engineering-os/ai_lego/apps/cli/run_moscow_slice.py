"""``decision.moscow`` vertical slice -- 3rd Method Atlas slice from the ``decision`` family (F16), after
``decision.ahp``/``decision.mcda``. Same table-row-only sourcing class as ``root_cause.fault_tree``/
``root_cause.change_analysis`` -- see ``ai_lego.modules.decision.moscow``'s own module docstring for the full
due-diligence read (F01 Non-goals unbuilt, structurally distinct from mcda/ahp).

Builds a self-referential, grep-verifiable scenario: this very Method Atlas slice's own 4 mandated
deliverables (methods/contracts/*.contract.yaml + typed-objects/*.schema.yaml + ai_lego/modules/*.py +
CLI/tests -- METHOD_ATLAS_SLICE_LEAN_STANDARD.md's own "不變的產出" list) scoped as MUST, a fuller test suite
as SHOULD, a visual gate-flow diagram as COULD, and a GraphQL API wrapper as WONT (with a stated reason) --
so the demo IS the thing it demonstrates, not an invented business scenario.

Then proves BOTH headline invariants are real, at BOTH layers:

1. Item-id uniqueness (``MOSCOW_DUPLICATE_ITEM_ID``): a hand-crafted second item reusing an existing item's
   id must be refused at CONSTRUCTION. A copy of the valid record with one item's stored id overwritten to
   collide with another must be caught independently at the GATE layer.
2. WONT-requires-reason (``MOSCOW_MISSING_WONT_REASON``): a hand-crafted WONT item with no ``reason`` must be
   refused at CONSTRUCTION. A copy of the valid record with a WONT item's stored ``reason`` stripped must be
   caught independently at the GATE layer.

Run::

    python -m ai_lego.apps.cli.run_moscow_slice
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
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.core.domain.tenant import NORDBROOK
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.decision.moscow import (
    METHOD_ID,
    all_gates_pass,
    bucket_counts,
    evaluate_moscow_gates,
    evaluate_moscow_integrity_gate,
    generate_moscow_prioritization_record,
    moscow_item,
    must_ratio,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-MOSCOW-SYNTHETIC-001"
EXECUTION_ID = "EX-MOSCOW-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-MOSCOW-001"

S = {
    "moscow_record": "ai-lego://specs/cognitive/typed-objects/moscow-prioritization-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-moscow-slice"


def run_moscow_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Self-referential scenario (disclosed): this Method Atlas slice's own mandated deliverable set,
    # scoped MUST/SHOULD/COULD/WONT -- the demo IS the thing it demonstrates. ---
    items = [
        moscow_item("MOSCOW-001-I1", "Method contract + typed-object schema (methods/contracts, specs/cognitive/typed-objects)", "MUST", make_provenance("DECISION", "HUMAN_APPROVED")),
        moscow_item("MOSCOW-001-I2", "ai_lego builder+gate module with two-layer invariant enforcement", "MUST", make_provenance("DECISION", "HUMAN_APPROVED")),
        moscow_item("MOSCOW-001-I3", "CLI demo proving both invariants at both layers", "MUST", make_provenance("DECISION", "HUMAN_APPROVED")),
        moscow_item("MOSCOW-001-I4", "60-100+ test mutation suite", "SHOULD", make_provenance("AI_SUGGESTION", "AI_GENERATED")),
        moscow_item("MOSCOW-001-I5", "Auto-generated visual diagram of the gate flow", "COULD", make_provenance("AI_SUGGESTION", "AI_GENERATED")),
        moscow_item(
            "MOSCOW-001-I6",
            "GraphQL API wrapper around the CLI",
            "WONT",
            make_provenance("DECISION", "HUMAN_APPROVED"),
            reason="No consumer or use case yet -- would add a dependency surface with zero present demand.",
        ),
    ]
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_moscow_prioritization_record,
        "MOSCOW-2026-09-08-001",
        "Cognitive OS Method Atlas slice deliverable set, decision.moscow build",
        items,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["moscow_record"], record, "decision.moscow slice deliverable-set record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "MoscowPrioritizationRecordGenerated", {"moscow_record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_moscow_gates(record, "run_moscow_slice", clock.at(1.1))
    for g in gate_results:
        contracts.validate(S["gate_result"], g, f"moscow gate {g['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"MOSCOW_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "MoscowGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Real compute: bucket_counts/must_ratio, recomputed fresh -- 3 MUST out of 6 items. ---
    counts = bucket_counts(record)
    ratio = must_ratio(record)
    if counts != {"COULD": 1, "MUST": 3, "SHOULD": 1, "WONT": 1}:
        raise InvariantViolation(f"MOSCOW_BUCKET_COUNTS_UNEXPECTED: expected 3 MUST/1 SHOULD/1 COULD/1 WONT, got {counts}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "MoscowBucketCountsComputed", {"bucket_counts": counts, "must_ratio": ratio}, 1.3)

    # --- Prove invariant #1 (item-id uniqueness) is real at the CONSTRUCTION layer: a second item reusing an
    # existing id must be refused. ---
    duplicate_id_construction_blocked = False
    try:
        duplicated = moscow_item("MOSCOW-001-I1", "a different description entirely", "SHOULD", make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
        generate_moscow_prioritization_record("MOSCOW-2026-09-08-002", "some scope", [items[0], duplicated], make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        duplicate_id_construction_blocked = "MOSCOW_DUPLICATE_ITEM_ID" in str(error)
    if not duplicate_id_construction_blocked:
        raise InvariantViolation("MOSCOW_INVARIANT_GUARD_DID_NOT_FIRE: a duplicate item id was accepted (or a different guard fired instead)")

    # --- Prove invariant #2 (WONT-requires-reason) is real at the CONSTRUCTION layer: a hand-crafted WONT
    # item with no reason must be refused. ---
    wont_reason_construction_blocked = False
    try:
        unreasoned_wont = {
            "id": "MOSCOW-001-I7",
            "description": "some out-of-scope idea",
            "bucket": "WONT",
            "provenance": make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
            # no reason -- an unstated-reason WONT is silence, not an explicit decision
        }
        generate_moscow_prioritization_record("MOSCOW-2026-09-08-003", "some scope", [unreasoned_wont], make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        wont_reason_construction_blocked = "MOSCOW_MISSING_WONT_REASON" in str(error)
    if not wont_reason_construction_blocked:
        raise InvariantViolation("MOSCOW_INVARIANT_GUARD_DID_NOT_FIRE: a WONT item with no reason was accepted (or a different guard fired instead)")

    # --- Prove the SAME "re-derived, not trusted" discipline at the independent GATE layer: a hand-tampered
    # copy of the already-valid record must still be caught. ---
    tampered_duplicate = copy.deepcopy(record)
    tampered_duplicate["items"][1]["id"] = tampered_duplicate["items"][0]["id"]  # collide two items' ids by hand-tampering, bypassing the constructor entirely
    duplicate_gate_result = evaluate_moscow_integrity_gate(tampered_duplicate, "run_moscow_slice", clock.at(1.4))
    duplicate_gate_blocked = duplicate_gate_result["status"] == "FAIL" and duplicate_gate_result["evidence"][0]["reason"] == "duplicate item id"
    if not duplicate_gate_blocked:
        raise InvariantViolation(
            f"MOSCOW_GATE_GUARD_DID_NOT_FIRE: moscow_integrity did not flag the hand-tampered duplicate item id "
            f"(status={duplicate_gate_result['status']}, evidence={duplicate_gate_result['evidence']})"
        )

    tampered_wont = copy.deepcopy(record)
    del tampered_wont["items"][5]["reason"]  # MOSCOW-001-I6 is the WONT item -- strip its reason by hand-tampering
    wont_gate_result = evaluate_moscow_integrity_gate(tampered_wont, "run_moscow_slice", clock.at(1.5))
    wont_gate_blocked = wont_gate_result["status"] == "FAIL" and wont_gate_result["evidence"][0]["reason"] == "a WONT-bucket item has no non-empty reason"
    if not wont_gate_blocked:
        raise InvariantViolation(
            f"MOSCOW_GATE_GUARD_DID_NOT_FIRE: moscow_integrity did not flag the hand-tampered reasonless WONT item "
            f"(status={wont_gate_result['status']}, evidence={wont_gate_result['evidence']})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "MoscowInvariantVerified",
        {
            "duplicate_id_construction_blocked": duplicate_id_construction_blocked,
            "duplicate_id_gate_blocked": duplicate_gate_blocked,
            "wont_reason_construction_blocked": wont_reason_construction_blocked,
            "wont_reason_gate_blocked": wont_gate_blocked,
        },
        1.6,
    )
    milestones.append("VERIFYING")
    ledger.close_aggregate(AGGREGATE_ID)

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_id": METHOD_ID,
        "method_resolution": resolution,
        "method_invocation": descriptor,
        "moscow_record": record,
        "gate_results": gate_results,
        "bucket_counts": counts,
        "must_ratio": ratio,
        "invariant_verification": {
            "duplicate_id_construction_blocked": duplicate_id_construction_blocked,
            "duplicate_id_gate_blocked": duplicate_gate_blocked,
            "wont_reason_construction_blocked": wont_reason_construction_blocked,
            "wont_reason_gate_blocked": wont_gate_blocked,
        },
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fault_tree_slice.py)",
    }
    write_json(runtime / "results" / "moscow_slice_result.json", result)
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
        result = run_moscow_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS decision.moscow: gates [{gate_summary}], bucket_counts={result['bucket_counts']}, must_ratio={result['must_ratio']:.2f}, "
        f"duplicate_id(construction={v['duplicate_id_construction_blocked']}, gate={v['duplicate_id_gate_blocked']}), "
        f"wont_reason(construction={v['wont_reason_construction_blocked']}, gate={v['wont_reason_gate_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
