"""``insight.contextual_inquiry`` vertical slice -- Method Atlas slice from the ``insight`` family (F06).

Builds a real ``ContextualInquirySession`` for a REAL, disclosed repo incident (not invented -- operator's
own memory note ``feedback_crosscheck_incident_runbooks``, 2026-08-18): observing how a draft KS-6 host
firewall plan got reviewed in its own real working environment (this repo's own AGENTS.md R0 architect-mode
workflow) surfaced a habit -- cross-checking ``runbooks/*SECURITY*`` before drafting -- that was never
written down as a step anywhere, only ever performed tacitly.

Run::

    python -m ai_lego.apps.cli.run_contextual_inquiry_slice
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
from ai_lego.modules.insight.contextual_inquiry import (
    METHOD_ID,
    all_gates_pass,
    evaluate_contextual_inquiry_gates,
    generate_contextual_inquiry_session,
    observation,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-CTXINQUIRY-SYNTHETIC-001"
EXECUTION_ID = "EX-CTXINQUIRY-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-CTXINQUIRY-001"

S = {
    "contextual_inquiry_session": "ai-lego://specs/cognitive/typed-objects/contextual-inquiry-session.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-contextual-inquiry-slice"


def run_contextual_inquiry_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Real, disclosed repo incident (memory note feedback_crosscheck_incident_runbooks, 2026-08-18): a
    # draft KS-6 firewall plan nearly repeated the exact UFW-only gap the 2026-04-20 crypto-mining intrusion
    # runbook already documents. Reframed here as a CONTEXTUAL INQUIRY (observing the review happening in its
    # own real environment -- this repo's own R0 architect-mode workflow -- rather than after_action_review's
    # own retrospective expected-vs-actual framing). ---
    observations = [
        observation(
            action_observed="操作者在草擬新主機防火牆計畫前，先手動 grep runbooks/*SECURITY* 找同款主機/服務類別的歷史事故",
            researcher_note="這個動作不在 AGENTS.md 任何一條寫死的步驟裡，只存在於這一次的真實工作環境觀察中 -- 是隱性習慣，不是文件化流程",
            followup_question="你每次規劃新主機都會做這個 grep 嗎？還是只有這次因為記得舊事故才做？",
        ),
        observation(
            action_observed="grep 結果比對到 2026-04-20 挖礦入侵 runbook 提到的 Docker chain 先於 UFW INPUT chain 執行的漏洞，當場修改草案",
            researcher_note="她能在動手部署前發現這個問題，靠的是這次臨場交叉比對，而非任何自動化檢查",
            followup_question="如果這次沒有先做這個 grep，你覺得這個漏洞會在哪個階段才被發現？",
        ),
    ]
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_contextual_inquiry_session,
        "CTXINQUIRY-2026-09-11-001",
        "本 repo 的 AGENTS.md R0 架構師模式真實工作環境：草擬 KS-6 主機防火牆計畫的當下審查過程（非事後回顧）",
        observations,
        make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
    )
    contracts.validate(S["contextual_inquiry_session"], record, "contextual inquiry session")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ContextualInquirySessionGenerated", {"contextual_inquiry_session": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_contextual_inquiry_gates(record, "run_contextual_inquiry_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"contextual inquiry gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"CTXINQUIRY_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ContextualInquiryGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")
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
        "contextual_inquiry_session": record,
        "gate_results": gate_results,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_after_action_review_slice.py)",
    }
    write_json(runtime / "results" / "contextual_inquiry_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_contextual_inquiry_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    record = result["contextual_inquiry_session"]
    print(f"PASS insight.contextual_inquiry: {len(record['observations'])} observations, gates [{gate_summary}]")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
