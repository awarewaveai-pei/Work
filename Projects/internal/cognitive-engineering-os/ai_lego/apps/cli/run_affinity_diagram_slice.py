"""``association.affinity_diagram`` vertical slice -- Method Atlas slice for the F04 "Associative Mapping &
Combination" family's 1st real member, the Affinity Diagram / KJ method (Atlas F04 table row L413 + dedicated
§11.3, L1206-1224). See ``ai_lego.modules.association.affinity_diagram``'s own module docstring for the full
due-diligence read (zero pre-existing implementation confirmed by whole-tree grep, distinction of the
2-checkable-invariant subset from Atlas's own 5-step process).

Self-referential scenario, same class ``run_5w1h_slice.py``/``run_frame_storming_slice.py`` already establish
for this suite (the demo IS the thing it demonstrates, not an invented business narrative): clustering raw
observations about THIS OWN F04-family build batch into named groups, with one genuinely left ungrouped
(disclosed honestly as a real, not manufactured, leftover).

Demonstrates both real invariants, each at BOTH layers:

1. Card/group shape + referential integrity + mutual exclusivity
   (``AFFINITYDIAGRAM_CARD_IN_MULTIPLE_GROUPS`` family): a construction-time PASS (the real card/group set
   below) and a construction-time REFUSAL (a card hand-assigned to two groups) are both shown.
2. ``ungrouped_card_refs`` GENUINE_COMPUTE (``AFFINITYDIAGRAM_UNGROUPED_MISMATCH``): a hand-tampered COPY of
   the valid record, with its stored ``ungrouped_card_refs`` overwritten to claim full coverage while one
   card is genuinely uncovered, bypasses the builder entirely -- the independent gate must catch the mismatch
   by re-deriving from ``cards``/``groups`` itself, never trusting the stored field.

Run::

    python -m ai_lego.apps.cli.run_affinity_diagram_slice
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
from ai_lego.core.domain.evidence import evidence_record
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.core.domain.tenant import CASCADIA
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.association.affinity_diagram import (
    METHOD_ID,
    all_gates_pass,
    card_entry,
    evaluate_affinity_diagram_gates,
    generate_affinity_diagram_record,
    group_entry,
    higher_level_theme_entry,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-AFFINITY-DIAGRAM-SYNTHETIC-001"
EXECUTION_ID = "EX-AFFINITY-DIAGRAM-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-AFFINITY-DIAGRAM-001"

S = {
    "evidence": "ai-lego://specs/evidence/evidence.schema.yaml",
    "affinity_diagram_record": "ai-lego://specs/cognitive/typed-objects/affinity-diagram-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-affinity-diagram-slice"


def run_affinity_diagram_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. association.affinity_diagram resolves
    # because its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every
    # sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: evidence the EVIDENCE-labeled cards cite. Both facts are REAL and directly observable in
    # this repo at write time (contract-backlog.yaml's own F04 running count; git status of this batch). ---
    family_count_evidence = evidence_record(
        "E-961", "F04 association family had 0 real methods built before this batch -- grep-confirmed no ai_lego/modules/association/ directory existed", "git status + grep of ai_lego/modules/ before writing", make_provenance("EVIDENCE", "HUMAN_APPROVED")
    )
    atlas_citation_evidence = evidence_record(
        "E-962", "Atlas §11.3's own 5-step 使用方式 (L1206-1224): one card per idea, silent clustering before naming, higher-level themes last", "AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md L1206-1224", make_provenance("EVIDENCE", "HUMAN_APPROVED")
    )
    contracts.validate(S["evidence"], family_count_evidence, "evidence E-961")
    contracts.validate(S["evidence"], atlas_citation_evidence, "evidence E-962")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "EvidenceRecorded", {"evidence": [family_count_evidence, atlas_citation_evidence]}, 1)

    # --- Step 2: the complete, well-formed card/group profile -- 6 cards, 2 named groups, 1 genuinely
    # ungrouped card, 1 cross-group theme. ---
    cards = [
        card_entry("C1", "F04 association family 進本批前是 0/many（grep 確認無 ai_lego/modules/association/ 目錄）", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-961"]),
        card_entry("C2", "本批 5 個並行 agent 分別建 mind_map/concept_map/affinity_diagram/morphological_analysis/attribute_listing", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-961"]),
        card_entry("C3", "Atlas §11.3 的 5 步驟本身就是這個方法唯一的紀律：先分群、後命名，分類名稱不預先定義", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-962"]),
        card_entry("C4", "『不預先定義分類名稱』是流程約束，不是資料形狀可驗證的屬性 -- 沒有為它發明假欄位", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-962"]),
        card_entry("C5", "ungrouped_card_refs 用 GENUINE_COMPUTE 讓「哪些卡片沒被分群」變成可驗證欄位，而非靜默省略", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-962"]),
        card_entry("C6", "Atlas 推薦搭配 Concept Map / Issue Tree 與上游 Mind Map 都是同批其他 agent 尚未讀取的並行建置", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
    ]
    groups = [
        group_entry("G1", "本批建置背景事實", ["C1", "C2"], make_provenance("AI_INFERENCE", "AI_SUGGESTED")),
        group_entry("G2", "方法本身的結構性紀律", ["C3", "C4", "C5"], make_provenance("AI_INFERENCE", "AI_SUGGESTED")),
    ]
    higher_level_themes = [higher_level_theme_entry("兩群共同指向：本切片同時記錄「做了什麼」與「為何這樣設計」", ["G1", "G2"])]
    record = generate_affinity_diagram_record(
        "AFFINITY-2026-09-10-001",
        "association.affinity_diagram 方法切片本身的建置",
        cards,
        groups,
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        higher_level_themes=higher_level_themes,
    )
    contracts.validate(S["affinity_diagram_record"], record, "affinity diagram record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "AffinityDiagramRecordGenerated", {"record": record}, 1.5)
    milestones.append("RECORD_BUILT")

    gate_results = evaluate_affinity_diagram_gates(record, "run_affinity_diagram_slice", clock.at(1.6))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"affinity diagram gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("AFFINITYDIAGRAM_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")
    if record["ungrouped_card_refs"] != ["C6"]:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"AFFINITYDIAGRAM_DEMO_INVARIANT: expected ungrouped_card_refs == ['C6'], got {record['ungrouped_card_refs']!r}")

    # --- Step 3: proof the mutual-exclusivity invariant is not toothless -- a card hand-assigned to TWO
    # groups (the exact 'which group does it really belong to' ambiguity this method's design forbids) MUST
    # be refused BEFORE any record is constructed. ---
    refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    malformed_groups = [
        groups[0],
        group_entry("G2-DUP", "重複分派", ["C3", "C1"], make_provenance("AI_INFERENCE", "AI_SUGGESTED")),  # C1 already in G1 -- forbidden double membership
    ]
    try:
        generate_affinity_diagram_record("AFFINITY-REFUSED-001", "same topic, malformed dual membership", cards, malformed_groups, make_provenance("EVIDENCE", "HUMAN_APPROVED"))
    except InvariantViolation as error:
        if "AFFINITYDIAGRAM_CARD_IN_MULTIPLE_GROUPS" not in str(error):
            raise
        refusal_proof["raised"] = True
        refusal_proof["error_code"] = "AFFINITYDIAGRAM_CARD_IN_MULTIPLE_GROUPS"
    if not refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("AFFINITYDIAGRAM_INVARIANT_NOT_ENFORCED: a card assigned to two groups was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MalformedRecordRefused", {"refusal_proof": refusal_proof}, 2)
    milestones.append("REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the GENUINE_COMPUTE invariant (ungrouped_card_refs must equal the
    # actual uncovered set) is caught by the INDEPENDENT gate even when a caller bypasses the builder entirely
    # and hand-edits the stored coverage list to lie about reality. ---
    tampered = copy.deepcopy(record)
    tampered["ungrouped_card_refs"] = []  # lies: C6 is still genuinely uncovered by any group
    tampered_gate = evaluate_affinity_diagram_gates(tampered, "run_affinity_diagram_slice", clock.at(2.5))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("AFFINITYDIAGRAM_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered ungrouped_card_refs that lies about the real uncovered set")
    integrity_gate = next(g for g in tampered_gate if g["gate_id"] == "affinity_diagram_integrity")
    if integrity_gate["evidence"][0].get("reason") != "AFFINITYDIAGRAM_UNGROUPED_MISMATCH":
        milestones.append("BLOCKED")
        raise InvariantViolation(f"AFFINITYDIAGRAM_DEMO_INVARIANT: expected AFFINITYDIAGRAM_UNGROUPED_MISMATCH, got {integrity_gate['evidence'][0]!r}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedCoverageCaughtByGate", {"tampered_gate_results": tampered_gate}, 2.6)
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
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "affinity_diagram_slice_result.json", result)
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
        result = run_affinity_diagram_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(
        f"PASS association.affinity_diagram: AffinityDiagramRecord {result['record']['id']} built with "
        f"{len(result['record']['cards'])} cards / {len(result['record']['groups'])} groups, "
        f"ungrouped_card_refs={result['record']['ungrouped_card_refs']!r}, "
        f"{len(result['gate_results'])} gates all PASS; "
        f"card-in-multiple-groups invariant REFUSED a malformed attempt ({result['refusal_proof']['error_code']}); "
        f"ungrouped_card_refs GENUINE_COMPUTE mismatch caught a hand-tampered record via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
