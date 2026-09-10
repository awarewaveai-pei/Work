"""``association.morphological_analysis`` vertical slice -- 1st Method Atlas slice from the brand-new
``association`` family (F04), built alongside ``association.mind_map``/``concept_map``/``affinity_diagram``/
``attribute_listing`` in this same batch. See ``ai_lego.modules.association.morphological_analysis``'s own
module docstring for the full due-diligence read (Atlas F04 table row L414 + §11.11 worked table + §13.5
mermaid node, zero pre-existing implementation confirmed by whole-tree grep).

Self-referential scenario, same class ``run_non_goals_slice.py``/``run_5w1h_slice.py`` already establish
(the demo IS the thing it demonstrates, not an invented business narrative): morphological-analyzing THIS
OWN method's real build design space -- 3 real design dimensions this slice's own contract actually had to
decide (``compilation_decisions`` in ``association.morphological_analysis.contract.yaml``), one real
compatibility judgment among them, and the one combination this slice's own author actually chose, confirmed
present among the GENUINE_COMPUTE legal set.

Demonstrates both real invariants, each at BOTH layers:

1. Multidimensionality (``MORPHANALYSIS_TOO_FEW_DIMENSIONS``): a construction-time PASS (the real 3-dimension
   profile below) and a construction-time REFUSAL (dropping to 1 dimension) are both shown.
2. ``legal_combinations``/``legal_combination_count`` GENUINE_COMPUTE
   (``MORPHANALYSIS_LEGAL_COMBINATIONS_MISMATCH``): a hand-tampered COPY of the valid record, with its
   stored ``legal_combinations`` overwritten to claim all 8 raw combinations are legal (lying about the 2
   the real constraint excludes), bypasses the builder entirely -- the independent gate must catch the
   mismatch by re-deriving from ``dimensions``/``constraints`` itself, never trusting the stored field.

Run::

    python -m ai_lego.apps.cli.run_morphological_analysis_slice
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
from ai_lego.modules.association.morphological_analysis import (
    METHOD_ID,
    all_gates_pass,
    evaluate_morphological_analysis_gates,
    generate_morphological_analysis_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-MORPHANALYSIS-SYNTHETIC-001"
EXECUTION_ID = "EX-MORPHANALYSIS-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-MORPHANALYSIS-001"

S = {
    "evidence": "ai-lego://specs/evidence/evidence.schema.yaml",
    "morphological_analysis_record": "ai-lego://specs/cognitive/typed-objects/morphological-analysis-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-morphological-analysis-slice"


def run_morphological_analysis_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. association.morphological_analysis resolves
    # because its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every
    # sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: evidence the record's own dimension/option/constraint content cites. Both facts are REAL and
    # directly observable in this repo at write time (this slice's own contract file; its own module). ---
    dimensions_evidence = evidence_record(
        "E-1001",
        "association.morphological_analysis.contract.yaml's own compilation_decisions records 3 real design choices this build had to make: compute-location (inline vs separate submodule), zero-legal-combinations policy (refuse vs allow), constraint semantics (mutually-exclusive-only vs requires/implies)",
        "methods/contracts/association.morphological_analysis.contract.yaml compilation_decisions",
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
    )
    constraint_evidence = evidence_record(
        "E-1002",
        "the actual choice made -- SeparateSubmodule -- was driven by the same GENUINE_COMPUTE-gets-its-own-file precedent ai_lego/compute/five_w1h/gap_detection.py and ai_lego/compute/attack_tree/aggregate.py already establish; a richer REQUIRES/IMPLIES constraint grammar kept Inline would repeat the exact anti-pattern that precedent exists to avoid",
        "ai_lego/compute/morphological_analysis/combination_generation.py module docstring",
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
    )
    contracts.validate(S["evidence"], dimensions_evidence, "evidence E-1001")
    contracts.validate(S["evidence"], constraint_evidence, "evidence E-1002")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "EvidenceRecorded", {"evidence": [dimensions_evidence, constraint_evidence]}, 1)

    # --- Step 2: the complete, well-formed 3-dimension profile (2 options each -- 8 raw combinations) + the
    # one real compatibility judgment, and the one real combination this slice's own author actually chose. ---
    dimensions = [
        {"name": "ComputeLocation", "options": ["Inline", "SeparateSubmodule"]},
        {"name": "ZeroLegalCombinationsPolicy", "options": ["Refuse", "AllowAsMeaningfulState"]},
        {"name": "ConstraintSemantics", "options": ["MutuallyExclusiveOnly", "RequiresImpliesToo"]},
    ]
    constraints = [
        {"dimension_a": "ComputeLocation", "option_a": "Inline", "dimension_b": "ConstraintSemantics", "option_b": "RequiresImpliesToo"},
    ]
    real_choice = {"ComputeLocation": "SeparateSubmodule", "ZeroLegalCombinationsPolicy": "AllowAsMeaningfulState", "ConstraintSemantics": "MutuallyExclusiveOnly"}

    record = generate_morphological_analysis_record(
        "MORPHANALYSIS-2026-09-10-001",
        "association.morphological_analysis 方法切片本身的建置設計選擇",
        dimensions,
        constraints,
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
        informs_mcda_ref=None,
    )
    contracts.validate(S["morphological_analysis_record"], record, "morphological analysis record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MorphologicalAnalysisRecordGenerated", {"record": record}, 1.5)
    milestones.append("RECORD_BUILT")

    gate_results = evaluate_morphological_analysis_gates(record, "run_morphological_analysis_slice", clock.at(1.6))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"morphological analysis gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("MORPHANALYSIS_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")
    if record["legal_combination_count"] != 6:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"MORPHANALYSIS_DEMO_INVARIANT: expected legal_combination_count == 6 (8 raw - 2 excluded by the ComputeLocation=Inline/ConstraintSemantics=RequiresImpliesToo constraint), got {record['legal_combination_count']!r}")
    if real_choice not in record["legal_combinations"]:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"MORPHANALYSIS_DEMO_INVARIANT: the real choice actually made ({real_choice!r}) must be among the GENUINE_COMPUTE legal_combinations, got {record['legal_combinations']!r}")

    # --- Step 3: proof the core '多維' (multidimensional) invariant is not toothless -- dropping to a single
    # dimension (the exact degenerate case Atlas's own '多維' wording forbids) MUST be refused BEFORE any
    # record is constructed. ---
    refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    single_dimension = [dimensions[0]]
    try:
        generate_morphological_analysis_record("MORPHANALYSIS-REFUSED-001", "same subject, single dimension", single_dimension, [], make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        if "MORPHANALYSIS_TOO_FEW_DIMENSIONS" not in str(error):
            raise
        refusal_proof["raised"] = True
        refusal_proof["error_code"] = "MORPHANALYSIS_TOO_FEW_DIMENSIONS"
    if not refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("MORPHANALYSIS_INVARIANT_NOT_ENFORCED: a single-dimension profile was NOT refused -- the '多維' invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MalformedRecordRefused", {"refusal_proof": refusal_proof}, 2)
    milestones.append("REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the GENUINE_COMPUTE invariant (legal_combinations must equal the
    # real cartesian-product-minus-constraints enumeration) is caught by the INDEPENDENT gate even when a
    # caller bypasses the builder entirely and hand-edits the stored value to lie about reality. ---
    tampered = copy.deepcopy(record)
    tampered["legal_combinations"] = [
        {"ComputeLocation": a, "ZeroLegalCombinationsPolicy": b, "ConstraintSemantics": c}
        for a in ("Inline", "SeparateSubmodule")
        for b in ("Refuse", "AllowAsMeaningfulState")
        for c in ("MutuallyExclusiveOnly", "RequiresImpliesToo")
    ]  # lies: claims all 8 raw combinations are legal, ignoring the real constraint
    tampered["legal_combination_count"] = 8
    tampered_gate = evaluate_morphological_analysis_gates(tampered, "run_morphological_analysis_slice", clock.at(2.5))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("MORPHANALYSIS_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered legal_combinations that lies about the real constraint-filtered set")
    integrity_gate = next(g for g in tampered_gate if g["gate_id"] == "morphological_analysis_integrity")
    if integrity_gate["evidence"][0].get("reason") != "MORPHANALYSIS_LEGAL_COMBINATIONS_MISMATCH":
        milestones.append("BLOCKED")
        raise InvariantViolation(f"MORPHANALYSIS_DEMO_INVARIANT: expected MORPHANALYSIS_LEGAL_COMBINATIONS_MISMATCH, got {integrity_gate['evidence'][0]!r}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedCombinationsCaughtByGate", {"tampered_gate_results": tampered_gate}, 2.6)
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
    write_json(runtime / "results" / "morphological_analysis_slice_result.json", result)
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
        result = run_morphological_analysis_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(
        f"PASS association.morphological_analysis: MorphologicalAnalysisRecord {result['record']['id']} built with "
        f"{len(result['record']['dimensions'])} dimensions, legal_combination_count={result['record']['legal_combination_count']!r}, "
        f"{len(result['gate_results'])} gates all PASS; "
        f"single-dimension invariant REFUSED a malformed attempt ({result['refusal_proof']['error_code']}); "
        f"legal_combinations GENUINE_COMPUTE mismatch caught a hand-tampered record via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
