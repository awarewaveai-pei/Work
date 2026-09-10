"""``association.concept_map`` vertical slice -- Method Atlas slice opening the F04 "Associative Mapping &
Combination" family's 1st member (Atlas F04 table row L412 + dedicated §11.2, L1176-1203). See
``ai_lego.modules.association.concept_map``'s own module docstring for the full due-diligence read
(referential-integrity invariant, provenance.epistemic_type-reuse decision instead of a redundant
is_inference boolean, zero pre-existing implementation confirmed by whole-tree grep).

Scenario: Atlas §11.2's own worked mermaid example (L1181-1187), transcribed directly -- an AI education
platform's relationships to students, education regulations, personal data, privacy law, and a separate
teacher-adoption-influences-school-adoption pair. One 8th node (競品觀察, competitor observation) is added
beyond the literal citation, disclosed as a CLI-demo-only addition, specifically to exercise
``orphan_node_ids`` GENUINE_COMPUTE with a real non-empty case.

Demonstrates both real invariants, each at BOTH layers:

1. Shape + referential integrity (``CONCEPTMAP_EDGE_DANGLING_REF`` family): a construction-time PASS (the
   real 8-node/5-edge graph below) and a construction-time REFUSAL (an edge naming a node id that was never
   declared) are both shown.
2. ``orphan_node_ids`` GENUINE_COMPUTE (``CONCEPTMAP_ORPHAN_NODE_IDS_MISMATCH``): a hand-tampered COPY of the
   valid record, with its stored ``orphan_node_ids`` overwritten to claim zero orphans while N8 is still
   referenced by no edge, bypasses the builder entirely -- the independent gate must catch the mismatch by
   re-deriving from ``nodes``/``edges`` itself, never trusting the stored field.

Run::

    python -m ai_lego.apps.cli.run_concept_map_slice
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
from ai_lego.modules.association.concept_map import (
    METHOD_ID,
    all_gates_pass,
    concept_edge,
    concept_node,
    evaluate_concept_map_gates,
    generate_concept_map_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-CONCEPTMAP-SYNTHETIC-001"
EXECUTION_ID = "EX-CONCEPTMAP-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-CONCEPTMAP-001"

S = {
    "evidence": "ai-lego://specs/evidence/evidence.schema.yaml",
    "concept_map_record": "ai-lego://specs/cognitive/typed-objects/concept-map-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-concept-map-slice"


def run_concept_map_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. association.concept_map resolves because its
    # contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: evidence the EVIDENCE-labeled edges cite -- real, directly observable facts about this own
    # platform's own service/compliance/data-handling relationships. ---
    service_evidence = evidence_record("E-1001", "AI 教育平台的服務對象是學生，產品文件與使用者條款皆載明", "product terms of service", make_provenance("EVIDENCE", "HUMAN_APPROVED"))
    compliance_evidence = evidence_record("E-1002", "平台需符合教育規範並處理受隱私法規範的個人資料", "compliance review checklist", make_provenance("EVIDENCE", "HUMAN_APPROVED"))
    data_evidence = evidence_record("E-1003", "平台在登入與學習歷程紀錄流程中直接處理個人資料", "data flow diagram", make_provenance("EVIDENCE", "HUMAN_APPROVED"))
    contracts.validate(S["evidence"], service_evidence, "evidence E-1001")
    contracts.validate(S["evidence"], compliance_evidence, "evidence E-1002")
    contracts.validate(S["evidence"], data_evidence, "evidence E-1003")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "EvidenceRecorded", {"evidence": [service_evidence, compliance_evidence, data_evidence]}, 1)

    # --- Step 2: the complete, well-formed graph -- Atlas §11.2's own worked example (L1181-1187) transcribed
    # verbatim, plus one deliberately isolated 8th node (競品觀察) not part of the Atlas citation. ---
    nodes = [
        concept_node("N1", "AI 教育平台"),
        concept_node("N2", "學生"),
        concept_node("N3", "教育規範"),
        concept_node("N4", "個人資料"),
        concept_node("N5", "隱私法"),
        concept_node("N6", "教師採用率"),
        concept_node("N7", "學校採用"),
        concept_node("N8", "競品觀察"),
    ]
    edges = [
        concept_edge("N1", "N2", "服務", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-1001"]),
        concept_edge("N1", "N3", "需符合", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-1002"]),
        concept_edge("N1", "N4", "處理", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-1003"]),
        concept_edge("N4", "N5", "受規範於", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-1002"]),
        concept_edge("N6", "N7", "影響", make_provenance("AI_INFERENCE", "AI_SUGGESTED")),  # Atlas step 5: not yet proven causally, no evidence claimed
    ]
    record = generate_concept_map_record(
        "CONCEPTMAP-2026-09-10-001",
        "AI 教育平台的概念關係圖 (Atlas §11.2 worked example)",
        nodes,
        edges,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["concept_map_record"], record, "concept map record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ConceptMapRecordGenerated", {"record": record}, 1.5)
    milestones.append("RECORD_BUILT")

    gate_results = evaluate_concept_map_gates(record, "run_concept_map_slice", clock.at(1.6))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"concept map gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("CONCEPTMAP_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")
    if record["orphan_node_ids"] != ["N8"]:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"CONCEPTMAP_DEMO_INVARIANT: expected orphan_node_ids == ['N8'], got {record['orphan_node_ids']!r}")

    # --- Step 3: proof the referential-integrity invariant is not toothless -- an edge naming a node id that
    # was NEVER declared in nodes (the exact 'dangling reference' this method's design forbids) MUST be
    # refused BEFORE any record is constructed. ---
    refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    dangling_edges = edges + [concept_edge("N1", "N99", "指向不存在的節點", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]
    try:
        generate_concept_map_record("CONCEPTMAP-REFUSED-001", "same context, dangling edge", nodes, dangling_edges, make_provenance("AI_INFERENCE", "AI_GENERATED"))
    except InvariantViolation as error:
        if "CONCEPTMAP_EDGE_DANGLING_REF" not in str(error):
            raise
        refusal_proof["raised"] = True
        refusal_proof["error_code"] = "CONCEPTMAP_EDGE_DANGLING_REF"
    if not refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("CONCEPTMAP_INVARIANT_NOT_ENFORCED: an edge referencing an undeclared node was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MalformedRecordRefused", {"refusal_proof": refusal_proof}, 2)
    milestones.append("REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the GENUINE_COMPUTE invariant (orphan_node_ids must equal the actual
    # unreferenced-node set) is caught by the INDEPENDENT gate even when a caller bypasses the builder entirely
    # and hand-edits the stored orphans list to lie about reality. ---
    tampered = copy.deepcopy(record)
    tampered["orphan_node_ids"] = []  # lies: N8 is still referenced by zero edges
    tampered_gate = evaluate_concept_map_gates(tampered, "run_concept_map_slice", clock.at(2.5))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("CONCEPTMAP_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered orphan_node_ids that lies about reality")
    integrity_gate = next(g for g in tampered_gate if g["gate_id"] == "concept_map_integrity")
    if integrity_gate["evidence"][0].get("reason") != "CONCEPTMAP_ORPHAN_NODE_IDS_MISMATCH":
        milestones.append("BLOCKED")
        raise InvariantViolation(f"CONCEPTMAP_DEMO_INVARIANT: expected CONCEPTMAP_ORPHAN_NODE_IDS_MISMATCH, got {integrity_gate['evidence'][0]!r}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedOrphansCaughtByGate", {"tampered_gate_results": tampered_gate}, 2.6)
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
    write_json(runtime / "results" / "concept_map_slice_result.json", result)
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
        result = run_concept_map_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(
        f"PASS association.concept_map: ConceptMapRecord {result['record']['id']} built with "
        f"{len(result['record']['nodes'])} nodes/{len(result['record']['edges'])} edges, orphan_node_ids={result['record']['orphan_node_ids']!r}, "
        f"{len(result['gate_results'])} gates all PASS; "
        f"dangling-edge-reference invariant REFUSED a malformed attempt ({result['refusal_proof']['error_code']}); "
        f"orphan_node_ids GENUINE_COMPUTE mismatch caught a hand-tampered record via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
