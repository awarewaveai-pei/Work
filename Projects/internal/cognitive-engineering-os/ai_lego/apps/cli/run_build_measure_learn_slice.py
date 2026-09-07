"""``learning.build_measure_learn`` vertical slice -- F17 learning family member, built alongside
``learning.pdca``/``learning.ooda`` this batch.

Real record grounded in memory note ``project_meeting_to_ppt_pipeline`` (2026-08-17): a real 60-minute
recording (BU5.m4a) run through faster-whisper + pyannote transcription/diarization, GPU and CPU each once,
as the smallest test that could settle whether a pure-CPU self-hosted EU VPS route was viable. Measured:
7.0x/24.4x realtime on GPU, 0.3x on CPU. Learned: CPU route judged dead (0.3x means a 60-minute recording
takes 3.6 hours), GPU route kept.

Run::

    python -m ai_lego.apps.cli.run_build_measure_learn_slice
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
from ai_lego.modules.learning.build_measure_learn import (
    METHOD_ID,
    all_gates_pass,
    build_stage,
    evaluate_build_measure_learn_gates,
    generate_build_measure_learn_record,
    learn_stage,
    measure_stage,
    metric,
    resolve_learned_metrics,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-BUILDMEASURELEARN-SYNTHETIC-001"
EXECUTION_ID = "EX-BUILDMEASURELEARN-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-BUILDMEASURELEARN-001"

S = {
    "build_measure_learn_cycle": "ai-lego://specs/cognitive/typed-objects/build-measure-learn-cycle.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-build-measure-learn-slice"


def run_build_measure_learn_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Real scenario: memory note project_meeting_to_ppt_pipeline, 2026-08-17. A real 60-minute
    # recording (BU5.m4a) run through transcription+diarization, GPU and CPU each once -- the smallest test
    # that could settle whether a pure-CPU self-hosted EU VPS route was viable. ---
    build_prov = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")
    calc_prov = make_provenance("CALCULATED_RESULT", "AI_GENERATED")
    decision_prov = make_provenance("DECISION", "HUMAN_APPROVED")

    build = build_stage(
        "以真實 60 分鐘餐敘錄音（BU5.m4a）跑 faster-whisper large-v3 轉錄 + pyannote 3.1 講者分離，"
        "GPU／CPU 各跑一次，作為判斷純 CPU 自架是否可行的最小測試。",
        "ARTIFACT-2026-08-17-BU5-TRANSCRIBE-DIARIZE-RUN",
        [
            "PPT/報告教練/會議記錄產出階段未測 -- 本次只測轉錄+講者分離兩步",
            "摘要階段人工回路未自動化（操作者要求零額外花費、只用訂閱額度）",
            "多語言/多講者規模未涵蓋 -- 單一 60 分鐘中文餐敘錄音樣本",
            "180 秒短切片 benchmark 刻意排除 -- 已知會嚴重低估吞吐，一律用完整檔",
        ],
        build_prov,
    )
    measure = measure_stage(
        "量測轉錄與講者分離在 GPU／CPU 兩種硬體路徑下的 realtime 倍率。",
        "ARTIFACT-2026-08-17-BU5-TRANSCRIBE-DIARIZE-RUN",
        [
            metric("METRIC-001", "whisper_transcription_speed_gpu", 7.0, "x_realtime", calc_prov),
            metric("METRIC-002", "pyannote_diarization_speed_gpu", 24.4, "x_realtime", calc_prov),
            metric("METRIC-003", "whisper_transcription_speed_cpu", 0.3, "x_realtime", calc_prov),
        ],
        calc_prov,
    )
    learn = learn_stage(
        "GPU 路線本機零費用且夠快（7.0x/24.4x realtime）；CPU-only 0.3x（60 分鐘要 3.6 小時）不可行 -- "
        "EU VPS 純 CPU 自架路線判死，改本機 GPU 路線。",
        ["METRIC-001", "METRIC-002", "METRIC-003"],
        decision_prov,
    )

    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_build_measure_learn_record,
        "BML-2026-08-17-001",
        "會議錄音→逐字稿/PPT/報告教練 pipeline -- EU VPS 純 CPU 自架路線 vs 本機 GPU 路線",
        build,
        measure,
        learn,
        decision_prov,
    )
    contracts.validate(S["build_measure_learn_cycle"], record, "build-measure-learn cycle")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "BuildMeasureLearnRecordGenerated", {"build_measure_learn_cycle": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_build_measure_learn_gates(record, "run_build_measure_learn_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"build_measure_learn gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"BUILDMEASURELEARN_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "BuildMeasureLearnGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Real compute: resolve what Learn actually cited, by full metric dict, not just id. ---
    learned_metrics = resolve_learned_metrics(record)
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "BuildMeasureLearnMetricsResolved", {"record_id": record["id"], "learned_metrics": learned_metrics}, 1.3)
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
        "build_measure_learn_cycle": record,
        "gate_results": gate_results,
        "learned_metrics": learned_metrics,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_kill_criteria_slice.py)",
    }
    write_json(runtime / "results" / "build_measure_learn_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_build_measure_learn_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    learned = result["learned_metrics"]
    print(
        f"PASS learning.build_measure_learn: build->measure (3 metrics)->learn, gates [{gate_summary}], "
        f"learn cited {len(learned)} metric(s): {[(m['id'], m['name'], m['value'], m['unit']) for m in learned]}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
