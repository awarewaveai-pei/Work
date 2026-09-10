"""``association.mind_map`` vertical slice -- 1st Method Atlas slice opening the `association` family (F04),
alongside `association.concept_map`/`association.affinity_diagram`/`association.morphological_analysis`/
`association.attribute_listing` built concurrently this same batch. See
``ai_lego.modules.association.mind_map``'s own module docstring for the full due-diligence read (§11.1
dedicated Atlas citation, the "Mind Map View" rendering-layer false positive ruled out, distinction from
association.concept_map's own typed-edge graph shape).

Self-referential scenario, same class ``run_non_goals_slice.py``/``run_five_w_one_h_slice.py`` already
establish (the demo IS the thing it demonstrates, not an invented business narrative): mind-mapping THIS OWN
F04 family-opening build batch. One main branch ("Mind Map 自己的結構") is expanded with 2 sub_branches each
carrying real keywords; a second main branch ("下一步分群") is left as a bare, unexpanded direction -- genuinely
true at write time (Affinity Diagram, Atlas's own named next step, is a concurrent sibling not yet landed).

Then proves BOTH headline invariants are real, at BOTH layers:

1. Tree shape/completeness (``MINDMAP_INVALID_BRANCH_ENTRY``): a hand-crafted sub_branch entry with a blank
   label must be refused at CONSTRUCTION. A copy of the valid record with one entry's stored label emptied
   out must be caught independently at the GATE layer.
2. Whole-tree id uniqueness (``MINDMAP_DUPLICATE_BRANCH_ID``): a second main_branch reusing an existing
   sub_branch's own id (proving the id namespace really is shared ACROSS levels, not merely within one) must
   be refused at CONSTRUCTION. A copy of the valid record with one entry's stored id overwritten to collide
   with another must be caught independently at the GATE layer.

Run::

    python -m ai_lego.apps.cli.run_mind_map_slice
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
from ai_lego.core.domain.tenant import CASCADIA
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.association.mind_map import (
    METHOD_ID,
    all_gates_pass,
    all_keywords,
    evaluate_mind_map_gates,
    evaluate_mind_map_integrity_gate,
    generate_mind_map_record,
    main_branch,
    sub_branch,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-MINDMAP-SYNTHETIC-001"
EXECUTION_ID = "EX-MINDMAP-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-MINDMAP-001"

S = {
    "mind_map_record": "ai-lego://specs/cognitive/typed-objects/mind-map-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-mind-map-slice"


def run_mind_map_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Self-referential scenario (disclosed): mind-mapping this own F04 family-opening build batch.
    # MB-1 is expanded with real sub_branches/keywords; MB-2 is genuinely left bare (Affinity Diagram, Atlas's
    # own named next step, is a concurrent sibling not yet landed at this write time). ---
    branches = [
        main_branch(
            "MB-1",
            "Mind Map 自己的結構",
            make_provenance("DECISION", "HUMAN_APPROVED"),
            sub_branches=[
                sub_branch(
                    "SB-1-1",
                    "巢狀 vs 圖",
                    make_provenance("DECISION", "HUMAN_APPROVED"),
                    keywords=["nested", "no cross-branch ref", "對比 Concept Map"],
                ),
                sub_branch(
                    "SB-1-2",
                    "層級深度",
                    make_provenance("DECISION", "HUMAN_APPROVED"),
                    keywords=["中心", "主枝", "次枝", "關鍵詞"],
                ),
            ],
        ),
        main_branch(
            "MB-2",
            "下一步分群",
            make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
        ),
    ]
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_mind_map_record,
        "MINDMAP-2026-09-10-001",
        "F04 關聯映射與組合家族該怎麼開局？",
        branches,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["mind_map_record"], record, "association.mind_map slice deliverable-set record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MindMapRecordGenerated", {"mind_map_record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_mind_map_gates(record, "run_mind_map_slice", clock.at(1.1))
    for g in gate_results:
        contracts.validate(S["gate_result"], g, f"mind_map gate {g['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"MINDMAP_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MindMapGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Real derived view: all_keywords, recomputed fresh -- exactly the 7 keywords under MB-1's own
    # sub_branches (MB-2 has none, no sub_branches at all). ---
    keywords = all_keywords(record)
    expected_keywords = ["nested", "no cross-branch ref", "對比 Concept Map", "中心", "主枝", "次枝", "關鍵詞"]
    if keywords != expected_keywords:
        raise InvariantViolation(f"MINDMAP_KEYWORDS_VIEW_UNEXPECTED: expected {expected_keywords}, got {keywords}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MindMapKeywordsViewComputed", {"all_keywords": keywords}, 1.3)

    # --- Prove invariant #1 (tree shape/completeness) is real at the CONSTRUCTION layer: a hand-crafted
    # sub_branch with a blank label must be refused. ---
    blank_label_construction_blocked = False
    try:
        malformed_branches = [
            main_branch(
                "MB-1",
                "Mind Map 自己的結構",
                make_provenance("DECISION", "HUMAN_APPROVED"),
                sub_branches=[{"id": "SB-BAD", "label": "   ", "provenance": make_provenance("DECISION", "HUMAN_APPROVED")}],
            )
        ]
        generate_mind_map_record("MINDMAP-2026-09-10-002", "some topic", malformed_branches, make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        blank_label_construction_blocked = "MINDMAP_INVALID_BRANCH_ENTRY" in str(error)
    if not blank_label_construction_blocked:
        raise InvariantViolation("MINDMAP_INVARIANT_GUARD_DID_NOT_FIRE: a sub_branch with a blank label was accepted (or a different guard fired instead)")

    # --- Prove invariant #2 (whole-tree id uniqueness) is real at the CONSTRUCTION layer: a second
    # main_branch reusing an EXISTING SUB_BRANCH's own id (SB-1-1) -- proving the id namespace really is
    # shared ACROSS levels, not merely checked within one -- must be refused. ---
    cross_level_duplicate_blocked = False
    try:
        colliding_branches = branches + [main_branch("SB-1-1", "collides with a nested sub_branch id", make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))]
        generate_mind_map_record("MINDMAP-2026-09-10-003", "some topic", colliding_branches, make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        cross_level_duplicate_blocked = "MINDMAP_DUPLICATE_BRANCH_ID" in str(error)
    if not cross_level_duplicate_blocked:
        raise InvariantViolation("MINDMAP_INVARIANT_GUARD_DID_NOT_FIRE: a main_branch id colliding with an existing nested sub_branch id was accepted (or a different guard fired instead)")

    # --- Prove the SAME "re-derived, not trusted" discipline at the independent GATE layer: hand-tampered
    # copies of the already-valid record must still be caught. ---
    tampered_label = copy.deepcopy(record)
    tampered_label["main_branches"][0]["sub_branches"][0]["label"] = ""  # SB-1-1, bypassing the constructor entirely
    label_gate_result = evaluate_mind_map_integrity_gate(tampered_label, "run_mind_map_slice", clock.at(1.4))
    label_gate_blocked = label_gate_result["status"] == "FAIL"
    if not label_gate_blocked:
        raise InvariantViolation(f"MINDMAP_GATE_GUARD_DID_NOT_FIRE: mind_map_integrity did not flag the hand-tampered blank label (status={label_gate_result['status']}, evidence={label_gate_result['evidence']})")

    tampered_duplicate = copy.deepcopy(record)
    tampered_duplicate["main_branches"][1]["id"] = tampered_duplicate["main_branches"][0]["sub_branches"][0]["id"]  # MB-2 collides into SB-1-1
    duplicate_gate_result = evaluate_mind_map_integrity_gate(tampered_duplicate, "run_mind_map_slice", clock.at(1.5))
    duplicate_gate_blocked = duplicate_gate_result["status"] == "FAIL" and duplicate_gate_result["evidence"][0]["reason"] == "MINDMAP_DUPLICATE_BRANCH_ID"
    if not duplicate_gate_blocked:
        raise InvariantViolation(
            f"MINDMAP_GATE_GUARD_DID_NOT_FIRE: mind_map_integrity did not flag the hand-tampered cross-level duplicate id "
            f"(status={duplicate_gate_result['status']}, evidence={duplicate_gate_result['evidence']})"
        )

    ledger.append(
        CASCADIA.tenant_id,
        AGGREGATE_ID,
        "MindMapInvariantVerified",
        {
            "blank_label_construction_blocked": blank_label_construction_blocked,
            "label_gate_blocked": label_gate_blocked,
            "cross_level_duplicate_construction_blocked": cross_level_duplicate_blocked,
            "cross_level_duplicate_gate_blocked": duplicate_gate_blocked,
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
        "mind_map_record": record,
        "gate_results": gate_results,
        "all_keywords": keywords,
        "invariant_verification": {
            "blank_label_construction_blocked": blank_label_construction_blocked,
            "label_gate_blocked": label_gate_blocked,
            "cross_level_duplicate_construction_blocked": cross_level_duplicate_blocked,
            "cross_level_duplicate_gate_blocked": duplicate_gate_blocked,
        },
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_non_goals_slice.py)",
    }
    write_json(runtime / "results" / "mind_map_slice_result.json", result)
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
        result = run_mind_map_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS association.mind_map: gates [{gate_summary}], all_keywords={result['all_keywords']!r}, "
        f"branch_shape(construction={v['blank_label_construction_blocked']}, gate={v['label_gate_blocked']}), "
        f"cross_level_duplicate_id(construction={v['cross_level_duplicate_construction_blocked']}, gate={v['cross_level_duplicate_gate_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
