"""``foresight.adjacent_discipline_search`` vertical slice -- F13 (Unknown Unknowns & Foresight) family.

Builds a real ``AdjacentDisciplineSearch`` importing an epidemiological
contact-tracing model to reason about cache-invalidation cascade blast
radius, then demonstrates the real invariant is enforced at both layers:
(1) a construction-time refusal when an "adjacent" field is actually already
one of the team's current disciplines (not adjacent at all), and (2) an
independent gate catching the same defect on a hand-tampered record that
bypassed the builder entirely.

Run::

    python -m ai_lego.apps.cli.run_adjacent_discipline_search_slice
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
from ai_lego.modules.foresight.adjacent_discipline_search import (
    METHOD_ID,
    all_gates_pass,
    evaluate_adjacent_discipline_search_gates,
    generate_adjacent_discipline_search,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-ADJACENTDISCIPLINESEARCH-SYNTHETIC-001"
EXECUTION_ID = "EX-ADJACENTDISCIPLINESEARCH-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-ADJACENTDISCIPLINESEARCH-001"

S = {
    "adjacent_discipline_search": "ai-lego://specs/cognitive/typed-objects/adjacent-discipline-search.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-adjacent-discipline-search-slice"


def run_adjacent_discipline_search_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real search: adjacent fields genuinely disjoint from current disciplines, one imported model that
    # resolves to a declared adjacent field. ---
    current_disciplines = ["distributed systems", "database engineering"]
    adjacent_fields = ["epidemiology", "ecology"]
    imported_models = [
        {
            "id": "IM-1",
            "field_ref": "epidemiology",
            "model_description": "SIR 傳染模型的 R0 概念，用來估算一次快取失效在依賴圖上的連鎖擴散速度，找出目前架構圖沒建模的擴散變數",
        }
    ]
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_adjacent_discipline_search,
        "ADJDISC-2026-09-12-001",
        current_disciplines,
        adjacent_fields,
        imported_models,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["adjacent_discipline_search"], record, "adjacent discipline search")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "AdjacentDisciplineSearchGenerated", {"adjacent_discipline_search": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_adjacent_discipline_search_gates(record, "run_adjacent_discipline_search_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"adjacent discipline search gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"ADJDISC_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "AdjacentDisciplineSearchGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove the real invariant is real, at both layers. ---
    # Layer 1: construction-time refusal -- an "adjacent" field that is already a current discipline is not
    # adjacent at all.
    construction_refused = False
    try:
        generate_adjacent_discipline_search(
            "ADJDISC-BAD-001",
            current_disciplines,
            ["distributed systems"],
            [],
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
        )
    except InvariantViolation:
        construction_refused = True

    # Layer 2: independent gate catches a hand-tampered record that bypassed the builder entirely (mutate a
    # deep copy so the already-validated `record` above is untouched).
    tampered = copy.deepcopy(record)
    tampered["adjacent_fields"].append("distributed systems")
    gate_on_tampered = evaluate_adjacent_discipline_search_gates(tampered, "run_adjacent_discipline_search_slice", clock.at(1.3))
    gate_caught_tamper = not all_gates_pass(gate_on_tampered)

    if not (construction_refused and gate_caught_tamper):
        raise InvariantViolation(
            f"ADJDISC_INVARIANT_GUARD_DID_NOT_FIRE: construction_refused={construction_refused}, gate_caught_tamper={gate_caught_tamper} -- "
            "both layers must independently refuse a non-adjacent 'adjacent field'"
        )
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "AdjacentDisciplineSearchInvariantVerified", {"construction_refused": construction_refused, "gate_caught_tamper": gate_caught_tamper}, 1.4)
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
        "adjacent_discipline_search": record,
        "gate_results": gate_results,
        "invariant_verification": {"construction_refused": construction_refused, "gate_caught_tamper": gate_caught_tamper},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "adjacent_discipline_search_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_adjacent_discipline_search_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    v = result["invariant_verification"]
    print(f"PASS foresight.adjacent_discipline_search: 2 adjacent fields, 1 imported model, gates [{gate_summary}], non_adjacent_field_refused(construction={v['construction_refused']}, gate={v['gate_caught_tamper']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
