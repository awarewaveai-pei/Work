"""``framing.boundary_critique`` vertical slice -- Method Atlas slice for the F01 framing family's "Boundary
Critique" tool (Atlas F01 table row, AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:344 -- primary
citation; F01 mermaid flowchart L348-354 and §13.7 Public Policy Recipe L3378-3389 corroborate).

Scenario, grounded in Atlas's own usage-context column ("政策、公共、高風險" -- policy, public, high-risk): a
municipal seismic-retrofit subsidy policy, examined across the 5 fixed categories to surface who holds
decision power, who is affected, who might be excluded, what resources exist, and what values are at stake.

Run::

    python -m ai_lego.apps.cli.run_boundary_critique_slice
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
from ai_lego.modules.framing.boundary_critique import (
    CATEGORY_ORDER,
    METHOD_ID,
    all_gates_pass,
    boundary_item,
    category_entry,
    evaluate_boundary_critique_gates,
    evaluate_boundary_critique_integrity_gate,
    generate_boundary_critique_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-BOUNDARYCRITIQUE-SYNTHETIC-001"
EXECUTION_ID = "EX-BOUNDARYCRITIQUE-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-BOUNDARYCRITIQUE-001"

S = {
    "boundary_critique_record": "ai-lego://specs/cognitive/typed-objects/boundary-critique-record.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}

_DECISION_CONTEXT = "都市老舊建物耐震補助政策（市府擬編列年度預算，補助民眾老屋耐震評估與補強）"


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-boundary-critique-slice"


def _evidence_provenance() -> dict[str, Any]:
    return make_provenance("EVIDENCE", "HUMAN_APPROVED")


def _hypothesis_provenance() -> dict[str, Any]:
    return make_provenance("HYPOTHESIS", "AI_SUGGESTED")


def _well_formed_categories() -> list[dict[str, Any]]:
    """All 5 categories POPULATED -- the happy-path demonstration of a complete boundary analysis."""
    return [
        category_entry(
            "DECISION_MAKER",
            "POPULATED",
            [
                boundary_item("市政府都市發展局", _evidence_provenance(), description="政策核准與年度預算編列權責單位", supporting_evidence_refs=["E-702"]),
                boundary_item("市議會", _evidence_provenance(), description="年度預算審議與通過權", supporting_evidence_refs=["E-703"]),
            ],
        ),
        category_entry(
            "AFFECTED",
            "POPULATED",
            [
                boundary_item("老舊建物屋主", _evidence_provenance(), description="補助方案的直接受益對象", supporting_evidence_refs=["E-704"]),
                boundary_item("承租戶", _hypothesis_provenance(), description="耐震補強施工期間居住權益受影響，但非補助申請人"),
            ],
        ),
        category_entry(
            "EXCLUDED",
            "POPULATED",
            [boundary_item("非設籍屋主", _hypothesis_provenance(), description="草案初稿僅限設籍市民申請，外地屋主被排除在補助資格外")],
        ),
        category_entry(
            "RESOURCES",
            "POPULATED",
            [
                boundary_item("年度耐震補助預算 5000 萬元", _evidence_provenance(), supporting_evidence_refs=["E-701"]),
                boundary_item("結構技師公會審查量能", _hypothesis_provenance(), description="補強計畫書審查需要的專業人力"),
            ],
        ),
        category_entry(
            "VALUES",
            "POPULATED",
            [
                boundary_item("居住安全優先", _evidence_provenance(), supporting_evidence_refs=["E-705"]),
                boundary_item("資源分配公平性", _hypothesis_provenance(), description="避免補助集中於特定行政區或所得族群"),
            ],
        ),
    ]


def _categories_with_one_declared_empty() -> list[dict[str, Any]]:
    """Same 5 categories, but EXCLUDED is legitimately DECLARED_EMPTY with a real justification -- proves
    the escape hatch is not just a refusal target, it is a real, schema-legal, gate-passing state."""
    cats = _well_formed_categories()
    cats[2] = category_entry(
        "EXCLUDED",
        "DECLARED_EMPTY",
        [],
        empty_justification="初步分析未發現制度性排除對象；方案草案未設籍住限制，已諮詢里長與民政局確認無已知排除群體，惟此結論待利害關係人訪談進一步驗證",
    )
    return cats


def run_boundary_critique_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. framing.boundary_critique resolves because
    # its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed record -- all 5 categories POPULATED, both real invariants
    # satisfied. ---
    record = generate_boundary_critique_record(
        "BCRIT-2026-09-10-001",
        _DECISION_CONTEXT,
        _well_formed_categories(),
        _evidence_provenance(),
        problem_statement_ref="PROB-2026-09-10-001",
    )
    contracts.validate(S["boundary_critique_record"], record, "boundary critique record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "BoundaryCritiqueRecorded", {"record": record}, 1)
    milestones.append("RECORD_BUILT")

    gate_results = evaluate_boundary_critique_gates(record, "run_boundary_critique_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"boundary_critique gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("BOUNDARYCRITIQUE_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant #1 (half A) is not toothless -- a POPULATED category with zero items MUST
    # be refused before any record is constructed. ---
    populated_missing_items_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        bad_categories = _well_formed_categories()
        bad_categories[2] = category_entry("EXCLUDED", "POPULATED", [])  # POPULATED but zero items
        generate_boundary_critique_record("BCRIT-REFUSED-001", _DECISION_CONTEXT, bad_categories, _evidence_provenance())
    except InvariantViolation as error:
        if "BOUNDARYCRITIQUE_POPULATED_MISSING_ITEMS" not in str(error):
            raise
        populated_missing_items_refusal_proof["raised"] = True
        populated_missing_items_refusal_proof["error_code"] = "BOUNDARYCRITIQUE_POPULATED_MISSING_ITEMS"
    if not populated_missing_items_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("BOUNDARYCRITIQUE_INVARIANT_NOT_ENFORCED: a POPULATED category with zero items was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MalformedRecordRefused", {"refusal_proof": populated_missing_items_refusal_proof}, 1.3)
    milestones.append("POPULATED_MISSING_ITEMS_REFUSAL_PROVEN")

    # --- Step 3: proof invariant #1 (half B) is not toothless -- a DECLARED_EMPTY category with NO
    # justification MUST be refused. This is the core invariant this method exists to enforce: an empty
    # category can never be silent. ---
    declared_empty_missing_justification_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        bad_categories = _well_formed_categories()
        bad_categories[2] = category_entry("EXCLUDED", "DECLARED_EMPTY", [])  # no empty_justification
        generate_boundary_critique_record("BCRIT-REFUSED-002", _DECISION_CONTEXT, bad_categories, _evidence_provenance())
    except InvariantViolation as error:
        if "BOUNDARYCRITIQUE_DECLARED_EMPTY_MISSING_JUSTIFICATION" not in str(error):
            raise
        declared_empty_missing_justification_refusal_proof["raised"] = True
        declared_empty_missing_justification_refusal_proof["error_code"] = "BOUNDARYCRITIQUE_DECLARED_EMPTY_MISSING_JUSTIFICATION"
    if not declared_empty_missing_justification_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation(
            "BOUNDARYCRITIQUE_INVARIANT_NOT_ENFORCED: a DECLARED_EMPTY category with no justification was NOT refused -- the invariant is toothless"
        )
    ledger.append(
        CASCADIA.tenant_id, AGGREGATE_ID, "MalformedRecordRefused", {"refusal_proof": declared_empty_missing_justification_refusal_proof}, 1.5
    )
    milestones.append("DECLARED_EMPTY_MISSING_JUSTIFICATION_REFUSAL_PROVEN")

    # --- Step 4: proof the escape hatch is REAL, not just a refusal target -- a category legitimately
    # DECLARED_EMPTY with a genuine justification is schema-legal and passes every gate, and empty_categories
    # correctly names exactly that one category. ---
    declared_empty_legal_record = generate_boundary_critique_record(
        "BCRIT-2026-09-10-002", _DECISION_CONTEXT, _categories_with_one_declared_empty(), _evidence_provenance()
    )
    contracts.validate(S["boundary_critique_record"], declared_empty_legal_record, "boundary critique record with 1 legitimately declared-empty category")
    if declared_empty_legal_record["empty_categories"] != ["EXCLUDED"]:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"BOUNDARYCRITIQUE_EMPTY_CATEGORIES_WRONG: expected ['EXCLUDED'], got {declared_empty_legal_record['empty_categories']!r}")
    declared_empty_legal_gate_results = evaluate_boundary_critique_gates(declared_empty_legal_record, "run_boundary_critique_slice", clock.at(1.7))
    if not all_gates_pass(declared_empty_legal_gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("BOUNDARYCRITIQUE_GATE_FAILED on the deliberately-legal declared-empty record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "DeclaredEmptyCategoryAccepted", {"record": declared_empty_legal_record}, 1.7)
    milestones.append("DECLARED_EMPTY_LEGAL_PROVEN")

    # --- Step 5: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses
    # the builder entirely (lies about empty_categories directly on a raw copy). ---
    tampered = dict(record)
    tampered["empty_categories"] = ["EXCLUDED"]  # lies -- every category in `record` is POPULATED
    tampered_gate = evaluate_boundary_critique_integrity_gate(tampered, "run_boundary_critique_slice", clock.at(1.9))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("BOUNDARYCRITIQUE_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered empty_categories value")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_result": tampered_gate}, 2.0)
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
        "populated_missing_items_refusal_proof": populated_missing_items_refusal_proof,
        "declared_empty_missing_justification_refusal_proof": declared_empty_missing_justification_refusal_proof,
        "declared_empty_legal_record": declared_empty_legal_record,
        "declared_empty_legal_gate_results": declared_empty_legal_gate_results,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "category_order": list(CATEGORY_ORDER),
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_problem_statement_slice.py)",
    }
    write_json(runtime / "results" / "boundary_critique_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_boundary_critique_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(
        f"PASS framing.boundary_critique: BoundaryCritiqueRecord {result['record']['id']} built with all 5 categories POPULATED, "
        f"{len(result['gate_results'])} gates all PASS; POPULATED-with-zero-items invariant REFUSED a malformed attempt "
        f"({result['populated_missing_items_refusal_proof']['error_code']}); DECLARED_EMPTY-missing-justification invariant REFUSED a "
        f"malformed attempt ({result['declared_empty_missing_justification_refusal_proof']['error_code']}); a legitimately DECLARED_EMPTY "
        f"category ({result['declared_empty_legal_record']['empty_categories']}) passed as a real, gate-legal record; "
        f"hand-tampered empty_categories caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
