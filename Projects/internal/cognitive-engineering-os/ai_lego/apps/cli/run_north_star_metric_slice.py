"""``framing.north_star_metric`` vertical slice -- Method Atlas slice for the F01 framing family's "North
Star Metric" tool (Atlas F01 table row, AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:337 -- the
method's only citation).

Scenario (grounded, disclosed honestly, self-referential): this run's own NorthStarMetricRecord names the
Cognitive OS program's own core value, the proxy metric that stands in for it, and why that proxy resists
gaming -- not a synthetic Cascadia scenario. Disclosed as self-referential rather than presented as an
independent example, same honesty discipline every sibling slice in this family already applies to its own
scenario grounding.

Question this run answers: does a 3-field flat record (core_value_proposition -> proxy_metric ->
anti_gaming_validation) assemble against the same shared LEGO framework with zero changes to any of it?
Every import below except ``ai_lego.modules.framing.north_star_metric`` itself is unchanged, reused code.

This run demonstrates the real invariant twice: once as a construction-time PASS (a complete, well-formed
record with a genuinely distinct proxy_metric), and once as a construction-time REFUSAL (proxy_metric
deliberately echoing core_value_proposition), proving the invariant is not toothless -- same "show a real
refusal, not only a real success" discipline every sibling slice's CLI demo already establishes. A final
step then hand-tampers a VALID record directly (bypassing the builder) to prove the independent gate, not
just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_north_star_metric_slice
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
from ai_lego.modules.framing.north_star_metric import (
    METHOD_ID,
    all_gates_pass,
    evaluate_north_star_metric_gates,
    generate_north_star_metric,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-NORTHSTARMETRIC-SYNTHETIC-001"
EXECUTION_ID = "EX-NORTHSTARMETRIC-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-NORTHSTARMETRIC-001"

S = {
    "north_star_metric": "ai-lego://specs/cognitive/typed-objects/north-star-metric-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-north-star-metric-slice"


def run_north_star_metric_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. framing.north_star_metric resolves
    # because its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every
    # sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed record -- the real invariant satisfied. Self-referential
    # scenario, see module docstring: this names the Cognitive OS program's own value/metric. ---
    record = generate_north_star_metric(
        "NSM-2026-09-10-001",
        "Cognitive OS 使用者能可靠地把模糊決策問題轉成有 gate 把關的結構化記錄",
        "每週有幾個 method record 通過全部 gate 且被下游至少一個其他方法引用",
        "只衝 record 數量無法灌高此指標——未被下游引用的 record 不計入分子，杜絕『灌水造 record 交差』的 gaming 路徑",
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
    )
    contracts.validate(S["north_star_metric"], record, "north star metric record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "NorthStarMetricRecorded", {"record": record}, 1)
    milestones.append("RECORD_BUILT")

    gate_results = evaluate_north_star_metric_gates(record, "run_north_star_metric_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"north_star_metric gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("NORTHSTARMETRIC_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof the completeness invariant is not toothless -- a deliberately empty
    # anti_gaming_validation MUST be refused before any record is constructed. ---
    refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_north_star_metric(
            "NSM-REFUSED-001",
            "同上",
            "同上但不同字串",
            "",  # empty anti_gaming_validation -- an unvalidated proxy metric is exactly the vague-metric shape this method exists to eliminate
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "NORTHSTARMETRIC_EMPTY_ANTI_GAMING_VALIDATION" not in str(error):
            raise
        refusal_proof["raised"] = True
        refusal_proof["error_code"] = "NORTHSTARMETRIC_EMPTY_ANTI_GAMING_VALIDATION"
    if not refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("NORTHSTARMETRIC_INVARIANT_NOT_ENFORCED: an empty anti_gaming_validation was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MalformedRecordRefused", {"refusal_proof": refusal_proof}, 1.5)
    milestones.append("REFUSAL_PROVEN")

    # --- Step 3: proof the echo invariant is not toothless -- proxy_metric identical to
    # core_value_proposition MUST be refused. ---
    echo_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_north_star_metric(
            "NSM-ECHO-REFUSED-001",
            "核心價值 X",
            "核心價值 X",  # identical to core_value_proposition -- an echo, not an actual measurable proxy
            "某驗證",
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "NORTHSTARMETRIC_PROXY_ECHOES_CORE_VALUE" not in str(error):
            raise
        echo_refusal_proof["raised"] = True
        echo_refusal_proof["error_code"] = "NORTHSTARMETRIC_PROXY_ECHOES_CORE_VALUE"
    if not echo_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("NORTHSTARMETRIC_INVARIANT_NOT_ENFORCED: proxy_metric==core_value_proposition was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "EchoRecordRefused", {"echo_refusal_proof": echo_refusal_proof}, 1.7)
    milestones.append("ECHO_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses
    # the builder entirely. ---
    tampered = dict(record)
    tampered["proxy_metric"] = ""  # bypasses the builder's own check directly on a raw copy
    tampered_gate = evaluate_north_star_metric_gates(tampered, "run_north_star_metric_slice", clock.at(1.9))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("NORTHSTARMETRIC_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered empty proxy_metric")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_results": tampered_gate}, 2.0)
    ledger.close_aggregate(AGGREGATE_ID)
    milestones.append("VERIFYING")

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_id": METHOD_ID,
        "method_resolution": resolution,
        "record": record,
        "gate_results": gate_results,
        "refusal_proof": refusal_proof,
        "echo_refusal_proof": echo_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_goal_statement_slice.py)",
    }
    write_json(runtime / "results" / "north_star_metric_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_north_star_metric_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(
        f"PASS framing.north_star_metric: NorthStarMetricRecord {result['record']['id']} built, "
        f"{len(result['gate_results'])} gates all PASS; "
        f"EMPTY_ANTI_GAMING_VALIDATION invariant REFUSED a malformed attempt ({result['refusal_proof']['error_code']}); "
        f"PROXY_ECHOES_CORE_VALUE invariant REFUSED an echoing attempt ({result['echo_refusal_proof']['error_code']}); "
        f"empty-proxy_metric tamper caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
