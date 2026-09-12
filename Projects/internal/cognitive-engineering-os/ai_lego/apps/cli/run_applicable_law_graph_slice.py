"""``jurisdiction.applicable_law_graph`` vertical slice -- F23 jurisdiction family (Atlas L936).

Builds a well-formed 2-jurisdiction, 3-law-entry graph (a non-overlapping
DE succession pair plus an independent FR entry), then proves Atlas L936's
own "支援版本與衝突法" (support versioning AND conflict-of-law) benefit is a
real invariant, not mere narrative order: a construction-time attempt to
submit two OVERLAPPING same-jurisdiction+scope entries with no ``conflict``
flag is refused, and a hand-tampered valid record (a second, temporally-
overlapping DE data_privacy entry appended with ``conflict: null`` on both
sides, bypassing the builder) is independently caught by the
conflict_flagging gate.

Run::

    python -m ai_lego.apps.cli.run_applicable_law_graph_slice
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
from ai_lego.modules.jurisdiction.applicable_law_graph import (
    METHOD_ID,
    all_gates_pass,
    evaluate_applicable_law_graph_gates,
    evaluate_conflict_flagging_gate,
    generate_applicable_law_graph,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-ALG-SYNTHETIC-001"
EXECUTION_ID = "EX-ALG-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-ALG-001"

S = {
    "applicable_law_graph": "ai-lego://specs/cognitive/typed-objects/applicable-law-graph-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-applicable-law-graph-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "jurisdiction_nodes": [
            {"jurisdiction_id": "DE", "description": "Germany"},
            {"jurisdiction_id": "FR", "description": "France"},
        ],
        "law_entries": [
            {"law_id": "LAW-DE-PRIVACY-2020", "jurisdiction_id": "DE", "scope": "data_privacy", "source": "Bundesdatenschutzgesetz 2020 consolidated text", "effective_date": "2020-01-01", "expiry_date": "2024-06-01", "conflict": None},
            {"law_id": "LAW-DE-PRIVACY-2024", "jurisdiction_id": "DE", "scope": "data_privacy", "source": "Bundesdatenschutzgesetz 2024 amendment", "effective_date": "2024-06-01", "expiry_date": None, "conflict": None},
            {"law_id": "LAW-FR-PRIVACY-2021", "jurisdiction_id": "FR", "scope": "data_privacy", "source": "Loi Informatique et Libertes 2021", "effective_date": "2021-03-01", "expiry_date": None, "conflict": None},
        ],
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_applicable_law_graph_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the well-formed graph -- 2 jurisdictions, 3 entries, DE succession is back-to-back
    # (non-overlapping, half-open interval), FR entry is independent. ---
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_applicable_law_graph,
        "ALG-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["applicable_law_graph"], record, "applicable law graph")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ApplicableLawGraphGenerated", {"record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_applicable_law_graph_gates(record, "run_applicable_law_graph_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"applicable law graph gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"ALG_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ApplicableLawGraphGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L936's own '支援版本與衝突法' benefit is not toothless -- two OVERLAPPING
    # same-jurisdiction+scope entries with no conflict flag MUST be refused before construction. ---
    overlapping_kwargs = copy.deepcopy(_well_formed_kwargs())
    overlapping_kwargs["law_entries"].append(
        {"law_id": "LAW-DE-PRIVACY-2023-DRAFT", "jurisdiction_id": "DE", "scope": "data_privacy", "source": "Draft amendment, contested", "effective_date": "2023-01-01", "expiry_date": "2023-12-31", "conflict": None}
    )
    conflict_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_applicable_law_graph("ALG-UNFLAGGED-CONFLICT-REFUSED-001", **overlapping_kwargs)
    except InvariantViolation as error:
        if "ALG_UNFLAGGED_CONFLICT" not in str(error):
            raise
        conflict_refusal_proof["raised"] = True
        conflict_refusal_proof["error_code"] = "ALG_UNFLAGGED_CONFLICT"
    if not conflict_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("ALG_INVARIANT_NOT_ENFORCED: an unflagged overlapping law entry pair was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "UnflaggedConflictRefused", {"refusal_proof": conflict_refusal_proof}, 1.3)
    milestones.append("UNFLAGGED_CONFLICT_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT conflict_flagging gate catches the same defect class
    # even when a caller bypasses the builder entirely (appending an overlapping DE data_privacy entry with
    # conflict left null on both sides, directly onto an already-valid record). ---
    tampered = copy.deepcopy(record)
    tampered["law_entries"].append(
        {"law_id": "LAW-DE-PRIVACY-2023-DRAFT", "jurisdiction_id": "DE", "scope": "data_privacy", "source": "Draft amendment, contested", "effective_date": "2023-01-01", "expiry_date": "2023-12-31", "conflict": None}
    )
    tampered_gate = evaluate_conflict_flagging_gate(tampered, "run_applicable_law_graph_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("ALG_GATE_NOT_INDEPENDENT: the independent conflict_flagging gate did NOT catch a hand-tampered unflagged overlapping pair")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_result": tampered_gate}, 2.1)
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
        "applicable_law_graph": record,
        "gate_results": gate_results,
        "conflict_refusal_proof": conflict_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "applicable_law_graph_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_applicable_law_graph_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS jurisdiction.applicable_law_graph: ApplicableLawGraph {result['applicable_law_graph']['id']} built "
        f"(2 jurisdictions, 3 law entries, 0 unflagged conflicts), gates [{gate_summary}]; "
        f"ALG_UNFLAGGED_CONFLICT REFUSED an unflagged-overlap attempt ({result['conflict_refusal_proof']['error_code']}); "
        f"hand-tampered unflagged overlap caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
