"""``root_cause.kepner_tregoe`` vertical slice -- Method Atlas slice for the F05 root_cause family's
"Is/Is Not 差異分析" tool (Atlas F05 table row, L440 -- the method's only citation).

Scenario (grounded, disclosed honestly): DURING this same session's own R0 due-diligence read of
``Projects/internal/hci30/scripts/``, ``ls -la`` showed ``mutation-check-wave1.ps1`` at two real sizes --
19925 bytes (timestamped Sep 6 20:57) and 81481 bytes (timestamped Sep 7 12:41), a real ~4x growth this
session actually observed. This slice's own timeout narrative is a CONSTRUCTED, plausible demo scenario
built around that one real, observed fact (repo commit ``5bbade8a7`` -- "mutation harness BEGIN/ROLLBACK
rewrite (8x+ faster)" -- independently confirms the harness's own execution shape changed around the same
window) -- not a real incident this slice has direct timeout-log evidence for. Both the real fact and the
constructed symptom are disclosed here rather than blended silently, the same honesty discipline every
sibling slice in this family already applies to its own synthetic Cascadia scenarios.

Question this run answers: does a THIRD, structurally different F05 method (no coder-agreement loop like
``research.qualitative_coding``, no forbidden-transition promotion chain like ``root_cause.fishbone``, no
computed self-check like ``root_cause.five_whys`` -- a fixed 2x4 grid plus two OPTIONAL downstream stages)
assemble against the same shared LEGO framework with zero changes to any of it? Every import below except
``ai_lego.modules.root_cause.kepner_tregoe`` itself is unchanged, reused code.

This run demonstrates BOTH real invariants twice each: once as a construction-time PASS (a complete,
well-formed specification), and once as a construction-time REFUSAL (a deliberately malformed attempt),
proving neither invariant is toothless -- the same "show a real refusal, not only a real success" discipline
``security.abuse_case``'s own CLI demo already establishes.

Run::

    python -m ai_lego.apps.cli.run_kepner_tregoe_slice
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
from ai_lego.core.domain.evidence import evidence_record
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.core.domain.tenant import CASCADIA
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.root_cause.fishbone import build_problem_statement
from ai_lego.modules.root_cause.kepner_tregoe import (
    METHOD_ID,
    all_gates_pass,
    change_entry,
    dimension_entry,
    distinction_entry,
    evaluate_kepner_tregoe_gates,
    generate_kepner_tregoe_specification,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-KEPNERTREGOE-SYNTHETIC-001"
EXECUTION_ID = "EX-KEPNERTREGOE-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-KEPNERTREGOE-001"

S = {
    "evidence": "ai-lego://specs/evidence/evidence.schema.yaml",
    "problem_statement": "ai-lego://specs/cognitive/typed-objects/problem-statement.schema.yaml",
    "kepner_tregoe_specification": "ai-lego://specs/cognitive/typed-objects/kepner-tregoe-problem-specification.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-kepner-tregoe-slice"


def run_kepner_tregoe_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. root_cause.kepner_tregoe resolves because
    # its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: ProblemStatement, reusing root_cause.fishbone's own builder unchanged (same family entry-point
    # type, see the method contract's own compilation_decisions). ---
    problem_statement = build_problem_statement(
        "PROB-KEPNERTREGOE-2026-09-07-001",
        {
            "current_state": "mutation-check-wave1.ps1 在 ks-aw-01 遠端主機上執行時經常超時（>10 分鐘）",
            "expected_state": "mutation-check-wave1.ps1 在任何主機上都於數分鐘內完成",
            "gap": "遠端主機執行不完成；本機執行正常，起始於腳本本身近期的一次大幅擴充",
            "affected_stakeholders": ["HCI30 開發者", "P0-04 mutation-coverage gate 的下游消費者"],
            "impact": "wave1 mutation gate 無法在 CI/遠端環境完成，只能在筆電本機手動跑",
            "evidence": ["mutation-check-wave1.ps1 file size/timestamp diff (19925 -> 81481 bytes)"],
            "constraints": ["不可停用 mutation gate 本身做實驗"],
            "scope_non_goals": "只涵蓋 wave1 SQL mutation harness；mutation-check-node-gates.ps1 另案處理",
        },
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        origin_method="problem_framing.problem_statement",
    )
    contracts.validate(S["problem_statement"], problem_statement, "problem statement")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ProblemStatementValidated", {"problem_statement": problem_statement}, 1)

    # --- Step 2: evidence records the 2x4 grid's IS/IS-NOT pairs cite. The WHEN dimension's file-size/timestamp
    # facts are REAL (observed directly via ls -la this session); the timeout symptom itself is the disclosed
    # constructed scenario -- see module docstring. ---
    size_diff_evidence = evidence_record(
        "E-901", "mutation-check-wave1.ps1 從 19925 bytes (Sep 6 20:57) 成長到 81481 bytes (Sep 7 12:41)", "ls -la Projects/internal/hci30/scripts/", make_provenance("EVIDENCE", "HUMAN_APPROVED")
    )
    host_evidence = evidence_record("E-902", "同一支腳本本機執行完成；遠端 ks-aw-01 執行超時", "operator observation", make_provenance("EVIDENCE", "HUMAN_APPROVED"))
    contracts.validate(S["evidence"], size_diff_evidence, "evidence E-901")
    contracts.validate(S["evidence"], host_evidence, "evidence E-902")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "EvidenceRecorded", {"evidence": [size_diff_evidence, host_evidence]}, 1.5)

    # --- Step 3: the complete, well-formed 2x4 grid -- both invariants satisfied. ---
    dimensions = [
        dimension_entry(
            "WHAT",
            "mutation-check-wave1.ps1 完整 SQL mutation sweep 執行超時（>10 分鐘）",
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
            is_not="mutation-check-node-gates.ps1（同 repo 的 Node-level gate mutation check）沒有超時",
            supporting_evidence_refs=["E-902"],
        ),
        dimension_entry(
            "WHERE",
            "在 ks-aw-01 (145.239.195.47) 遠端 SSH session 執行",
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
            is_not="在筆電本機 (LAPTOP-R7I86OR5) 執行同一支腳本正常完成",
            supporting_evidence_refs=["E-902"],
        ),
        dimension_entry(
            "WHEN",
            "腳本從 19925 bytes 擴充到 81481 bytes 之後才開始超時",
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
            is_not="擴充前的版本（19925 bytes）在同一台主機上執行不會超時",
            supporting_evidence_refs=["E-901"],
        ),
        dimension_entry(
            "EXTENT",
            "已知連續 3 次遠端執行都超時",
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
            is_not="本機執行 0 次超時；目前 repo 只有這一台正式遠端主機可比較（單機現況，非資料缺失）",
            supporting_evidence_refs=["E-902"],
        ),
    ]
    distinctions = [
        distinction_entry(
            "DIST-KT-001",
            "WHEN",
            "超時只在腳本擴充後、且只在遠端主機上出現 -- 本機執行同一支擴充後的腳本仍需驗證是否也超時",
            make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
        ),
    ]
    changes = [
        change_entry(
            "CHG-KT-001",
            "DIST-KT-001",
            "mutation sweep 新增大量 SQL mutation 案例，每個案例都需一次 SSH round-trip 到遠端 Postgres，放大網路延遲的影響",
            make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
        ),
    ]
    specification = generate_kepner_tregoe_specification(
        "KTPS-KEPNERTREGOE-2026-09-07-001",
        problem_statement,
        dimensions,
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        distinctions=distinctions,
        changes=changes,
    )
    contracts.validate(S["kepner_tregoe_specification"], specification, "kepner-tregoe specification")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "KepnerTregoeSpecificationGenerated", {"specification": specification}, 2)
    milestones.append("SPECIFICATION_BUILT")

    gate_results = evaluate_kepner_tregoe_gates(specification, "run_kepner_tregoe_slice", clock.at(2.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"kepner_tregoe gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("KEPNERTREGOE_GATE_FAILED on the deliberately well-formed specification")
    milestones.append("GATES_PASSED")

    # --- Step 4: proof the invariant is not toothless -- a deliberately malformed attempt (WHAT dimension's
    # IS and IS-NOT collapsed to the identical string) MUST be refused before any record is constructed. ---
    refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    malformed_dimensions = [
        dimension_entry("WHAT", "腳本執行超時", make_provenance("EVIDENCE", "HUMAN_APPROVED"), is_not="腳本執行超時"),  # identical to is -- a no-op, not a contrast
        dimensions[1],
        dimensions[2],
        dimensions[3],
    ]
    try:
        generate_kepner_tregoe_specification("KTPS-KEPNERTREGOE-REFUSED-001", problem_statement, malformed_dimensions, make_provenance("EVIDENCE", "HUMAN_APPROVED"))
    except InvariantViolation as error:
        if "KEPNERTREGOE_IS_EQUALS_ISNOT" not in str(error):
            raise
        refusal_proof["raised"] = True
        refusal_proof["error_code"] = "KEPNERTREGOE_IS_EQUALS_ISNOT"
    if not refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("KEPNERTREGOE_INVARIANT_NOT_ENFORCED: the identical IS/IS-NOT pair was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MalformedSpecificationRefused", {"refusal_proof": refusal_proof}, 2.5)
    milestones.append("REFUSAL_PROVEN")

    # --- Step 5: hand-tampering proof -- the SECOND real invariant (distinction must cite a complete dimension)
    # is caught by the INDEPENDENT gate even when a caller bypasses the builder entirely. ---
    tampered = dict(specification)
    # Every real dimension in `specification` already has both is and is_not, so to prove the gate catches
    # an INCOMPLETE dimension, strip WHERE's is_not directly on a raw copy -- something the builder would
    # have refused at construction, this path bypasses the builder entirely.
    tampered["dimensions"] = [dict(d) for d in specification["dimensions"]]
    del tampered["dimensions"][1]["is_not"]  # WHERE now has no is_not -- an incomplete dimension
    tampered["distinctions"] = [distinction_entry("DIST-KT-BAD", "WHERE", "citing WHERE, which this tampered copy just made incomplete", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]
    tampered_gate = evaluate_kepner_tregoe_gates(tampered, "run_kepner_tregoe_slice", clock.at(2.6))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("KEPNERTREGOE_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered distinction citing an incomplete dimension")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedSpecificationCaughtByGate", {"tampered_gate_results": tampered_gate}, 2.7)
    ledger.close_aggregate(AGGREGATE_ID)
    milestones.append("VERIFYING")

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_id": METHOD_ID,
        "method_resolution": resolution,
        "problem_statement": problem_statement,
        "specification": specification,
        "gate_results": gate_results,
        "refusal_proof": refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "kepner_tregoe_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_kepner_tregoe_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(
        f"PASS root_cause.kepner_tregoe: KepnerTregoeProblemSpecification {result['specification']['id']} built with "
        f"{len(result['specification']['dimensions'])}/4 dimensions, {len(result['gate_results'])} gates all PASS; "
        f"IS==IS-NOT invariant REFUSED a malformed attempt ({result['refusal_proof']['error_code']}); "
        f"distinction-completeness invariant caught a hand-tampered record via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
