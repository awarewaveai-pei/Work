"""``foresight.outlier_analysis`` vertical slice -- F13 foresight family (Atlas L678).

Builds a real ``OutlierAnalysisRecord`` investigating 1 anomalous case (a
distributor whose order volume is 8x its regional peers), data error ruled
out, mechanism hypothesis proposed (a new wholesale channel, not a retail
anomaly). Then proves Atlas L678's own "identify→排除資料錯誤→深挖機制"
ordering is real, not mere narrative intent: a construction-time attempt
to attach a ``mechanism_hypothesis`` BEFORE ``data_error_ruled_out`` is
``True`` is refused, and a hand-tampered valid record (``data_error_ruled_out``
flipped to ``False`` directly, bypassing the builder, while the mechanism
hypothesis stays) is independently caught by the gate.

Run::

    python -m ai_lego.apps.cli.run_outlier_analysis_slice
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
from ai_lego.modules.foresight.outlier_analysis import (
    METHOD_ID,
    all_gates_pass,
    evaluate_data_error_ordering_gate,
    evaluate_outlier_analysis_gates,
    generate_outlier_analysis_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-OUTLIER-SYNTHETIC-001"
EXECUTION_ID = "EX-OUTLIER-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-OUTLIER-001"

S = {
    "outlier_analysis_record": "ai-lego://specs/cognitive/typed-objects/outlier-analysis.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-outlier-analysis-slice"


def _well_formed_outlier() -> dict[str, Any]:
    return {
        "id": "OUT-1",
        "description": "單一經銷商的月訂購量是同區其他經銷商的 8 倍",
        "data_error_ruled_out": True,
        "data_error_assessment": "已核對原始出貨單與 ERP 紀錄，數字一致，非重複計算或系統錯誤",
        "mechanism_hypothesis": "該經銷商同時服務一個新開的跨境電商客戶，屬於新的批發通路，非零售異常",
    }


def run_outlier_analysis_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed record -- 1 outlier, data error ruled out, mechanism hypothesis
    # proposed only after that ruling. ---
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_outlier_analysis_record,
        "OUTLIER-2026-09-12-001",
        [_well_formed_outlier()],
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["outlier_analysis_record"], record, "outlier analysis record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "OutlierAnalysisRecordGenerated", {"outlier_analysis_record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_outlier_analysis_gates(record, "run_outlier_analysis_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"outlier analysis gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"OUTLIER_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "OutlierAnalysisGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L678's own "identify→排除資料錯誤→深挖機制" ordering is not toothless -- a
    # mechanism_hypothesis attached while data_error_ruled_out is False MUST be refused. ---
    premature_mechanism = {**_well_formed_outlier(), "id": "OUT-PREMATURE", "data_error_ruled_out": False, "data_error_assessment": "尚未核對，初步懷疑但未排除資料錯誤"}
    refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_outlier_analysis_record("OUTLIER-PREMATURE-MECHANISM-REFUSED-001", [premature_mechanism], make_provenance("AI_INFERENCE", "AI_GENERATED"))
    except InvariantViolation as error:
        if "OUTLIER_INVALID_OUTLIER" not in str(error):
            raise
        refusal_proof["raised"] = True
        refusal_proof["error_code"] = "OUTLIER_INVALID_OUTLIER"
    if not refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("OUTLIER_INVARIANT_NOT_ENFORCED: a premature mechanism_hypothesis was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "PrematureMechanismRefused", {"refusal_proof": refusal_proof}, 1.3)
    milestones.append("PREMATURE_MECHANISM_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT gate catches the same defect even when a caller
    # bypasses the builder entirely (flips data_error_ruled_out to False directly on a VALID record's own raw
    # dict, while its mechanism_hypothesis stays). ---
    tampered = copy.deepcopy(record)
    tampered["outliers"][0]["data_error_ruled_out"] = False
    tampered_gate = evaluate_data_error_ordering_gate(tampered, "run_outlier_analysis_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("OUTLIER_GATE_NOT_INDEPENDENT: the independent data_error_ruled_out_before_mechanism gate did NOT catch a hand-tampered record")
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
        "outlier_analysis_record": record,
        "gate_results": gate_results,
        "premature_mechanism_refusal_proof": refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_evidence_matrix_slice.py)",
    }
    write_json(runtime / "results" / "outlier_analysis_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_outlier_analysis_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS foresight.outlier_analysis: OutlierAnalysisRecord {result['outlier_analysis_record']['id']} built (1 outlier, data error ruled out, mechanism hypothesis proposed), gates [{gate_summary}]; "
        f"OUTLIER_INVALID_OUTLIER REFUSED a premature mechanism_hypothesis ({result['premature_mechanism_refusal_proof']['error_code']}); "
        f"hand-tampered record (data_error_ruled_out flipped to False) caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
