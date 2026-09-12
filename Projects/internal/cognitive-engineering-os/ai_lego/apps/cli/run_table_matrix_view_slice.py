"""``representation.table_matrix_view`` vertical slice -- F24 Representation family (Atlas L965).

Builds a 2-entity x 2-criteria comparison view (one filter, one sort spec, one view-level computed score)
over a synthetic Knowledge Object, then proves two real invariants are not toothless: (1) a construction-time
attempt to submit a score WITHOUT `computed: true` is refused, and (2) a hand-tampered valid record (a score
entry referencing a criterion_id that was never declared, bypassing the builder) is independently caught by
the reference_integrity gate.

Run::

    python -m ai_lego.apps.cli.run_table_matrix_view_slice
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
from ai_lego.modules.representation.table_matrix_view import (
    METHOD_ID,
    all_gates_pass,
    evaluate_reference_integrity_gate,
    evaluate_table_matrix_view_gates,
    generate_table_matrix_view,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-TBLVIEW-SYNTHETIC-001"
EXECUTION_ID = "EX-TBLVIEW-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-TBLVIEW-001"

S = {
    "table_matrix_view": "ai-lego://specs/cognitive/typed-objects/table-matrix-view-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-table-matrix-view-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "source_knowledge_object_id": "KO-2026-09-12-002",
        "entities": ["ENT-VENDOR-A", "ENT-VENDOR-B"],
        "criteria": ["CRIT-COST", "CRIT-SLA"],
        "filters": [{"criterion_id": "CRIT-SLA", "operator": "gte", "value": 99.5}],
        "sort_spec": {"criterion_id": "CRIT-COST", "direction": "asc"},
        "score_config": {"method": "weighted_sum", "weights": {"CRIT-COST": 0.6, "CRIT-SLA": 0.4}},
        "scores": [{"entity_id": "ENT-VENDOR-A", "criterion_id": "CRIT-COST", "score": 0.8, "computed": True}],
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_table_matrix_view_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the well-formed record -- reference-shaped ids, referentially-sound filter/sort/score. ---
    descriptor, view = catalog.invoke(
        METHOD_ID,
        generate_table_matrix_view,
        "TBLVIEW-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["table_matrix_view"], view, "table matrix view")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TableMatrixViewGenerated", {"view": view, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_table_matrix_view_gates(view, "run_table_matrix_view_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"table matrix view gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"TBLVIEW_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TableMatrixViewGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove the computed-artifact labeling invariant is not toothless -- a score WITHOUT
    # computed:true MUST be refused before any record is constructed. ---
    uncomputed_kwargs = copy.deepcopy(_well_formed_kwargs())
    uncomputed_kwargs["scores"][0]["computed"] = False
    uncomputed_score_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_table_matrix_view("TBLVIEW-UNCOMPUTED-SCORE-REFUSED-001", **uncomputed_kwargs)
    except InvariantViolation as error:
        if "TBLVIEW_SCORE_NOT_MARKED_COMPUTED" not in str(error):
            raise
        uncomputed_score_refusal_proof["raised"] = True
        uncomputed_score_refusal_proof["error_code"] = "TBLVIEW_SCORE_NOT_MARKED_COMPUTED"
    if not uncomputed_score_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("TBLVIEW_INVARIANT_NOT_ENFORCED: a score without computed:true was NOT refused -- the labeling invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "UncomputedScoreRefused", {"refusal_proof": uncomputed_score_refusal_proof}, 1.3)
    milestones.append("UNCOMPUTED_SCORE_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT reference_integrity gate catches a dangling
    # criterion_id reference written directly onto an already-valid record, bypassing the builder. ---
    tampered = copy.deepcopy(view)
    tampered["scores"][0]["criterion_id"] = "CRIT-NEVER-DECLARED"
    tampered_gate = evaluate_reference_integrity_gate(tampered, "run_table_matrix_view_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("TBLVIEW_GATE_NOT_INDEPENDENT: the independent reference_integrity gate did NOT catch a hand-tampered dangling criterion_id reference")
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
        "table_matrix_view": view,
        "gate_results": gate_results,
        "uncomputed_score_refusal_proof": uncomputed_score_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "table_matrix_view_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_table_matrix_view_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS representation.table_matrix_view: TableMatrixViewRecord {result['table_matrix_view']['id']} built "
        f"(2 entities, 2 criteria, 1 filter, 1 sort spec, 1 computed score), gates [{gate_summary}]; "
        f"TBLVIEW_SCORE_NOT_MARKED_COMPUTED REFUSED an uncomputed-score attempt ({result['uncomputed_score_refusal_proof']['error_code']}); "
        f"hand-tampered dangling criterion_id reference caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
