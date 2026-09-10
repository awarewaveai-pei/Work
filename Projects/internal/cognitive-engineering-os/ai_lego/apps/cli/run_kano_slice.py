"""``decision.kano`` vertical slice -- Method Atlas slice, 12th concrete member of the ``decision`` family
(F16). Same table-row-only sourcing class as ``decision.moscow`` (bare F16 row, no dedicated Atlas section) --
see ``ai_lego.modules.decision.kano``'s own module docstring for the full due-diligence read (distinct from
moscow/impact_effort, GENUINE_COMPUTE design call, evaluation-table cross-verification).

Builds a real Q4 feature-backlog Kano pass: 6 features, one hand-picked to land in each of the 6 canonical
categories (basic/performance/delighter/indifferent/reverse/questionable), computed by
``ai_lego/compute/kano/classification.py::classify_features`` (hand-verified against the classical evaluation
table before this CLI was written -- same discipline ``run_impact_effort_slice.py``'s own pre-verified
quadrant spread already establishes).

Then proves the headline invariant is real, at BOTH layers, the same "raise before write" / "re-derive, don't
trust" two-layer discipline every genuine-compute sibling in this family already establishes:

1. Category genuine-compute: a hand-tampered COPY of the valid record, with one feature's stored ``category``
   overwritten to a value that does not match its own functional/dysfunctional responses, must be caught by
   ``evaluate_kano_integrity_gate`` -- the gate never trusts a stored label.
2. Shape invariants at CONSTRUCTION: a duplicate feature id (``KANO_DUPLICATE_FEATURE_ID``) and an illegal
   response value (``KANO_INVALID_FEATURES``) must each be refused before a malformed record is ever built.

Run::

    python -m ai_lego.apps.cli.run_kano_slice
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
from ai_lego.core.domain.tenant import NORDBROOK
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.decision.kano import (
    METHOD_ID,
    all_gates_pass,
    evaluate_kano_gates,
    evaluate_kano_integrity_gate,
    generate_kano_classification_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-KANO-SYNTHETIC-001"
EXECUTION_ID = "EX-KANO-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-KANO-001"

S = {
    "kano_classification": "ai-lego://specs/cognitive/typed-objects/kano-classification-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-kano-slice"


def run_kano_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real Q4 feature-backlog Kano pass: 6 features, one hand-picked per canonical category (Atlas F16
    # L765's own "功能需求分類" -- feature-requirement classification). Deliberately spans all 6 so the demo
    # shows real classification spread, not a single trivial case. ---
    features = [
        {"id": "KANO-001-F1", "label": "行動裝置生物辨識登入", "functional_response": "LIKE", "dysfunctional_response": "NEUTRAL"},
        {"id": "KANO-001-F2", "label": "頁面載入時間 < 2 秒", "functional_response": "LIKE", "dysfunctional_response": "DISLIKE"},
        {"id": "KANO-001-F3", "label": "HTTPS 加密傳輸", "functional_response": "MUST_BE", "dysfunctional_response": "DISLIKE"},
        {"id": "KANO-001-F4", "label": "介面提供 17 種語言切換", "functional_response": "NEUTRAL", "dysfunctional_response": "NEUTRAL"},
        {"id": "KANO-001-F5", "label": "強制每小時重新登入一次", "functional_response": "DISLIKE", "dysfunctional_response": "LIKE"},
        {"id": "KANO-001-F6", "label": "矛盾回覆測試項", "functional_response": "LIKE", "dysfunctional_response": "LIKE"},
    ]
    descriptor, classification = catalog.invoke(
        METHOD_ID,
        generate_kano_classification_record,
        "KANO-2026-09-08-001",
        "Q4 feature backlog Kano pass",
        features,
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    )
    contracts.validate(S["kano_classification"], classification, "kano classification")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "KanoClassificationRecordGenerated", {"kano_classification": classification, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    expected_categories = {
        "KANO-001-F1": "delighter",
        "KANO-001-F2": "performance",
        "KANO-001-F3": "basic",
        "KANO-001-F4": "indifferent",
        "KANO-001-F5": "reverse",
        "KANO-001-F6": "questionable",
    }
    actual_categories = {f["id"]: f["category"] for f in classification["features"]}
    if actual_categories != expected_categories:
        raise InvariantViolation(f"KANO_CATEGORY_SPREAD_UNEXPECTED: expected {expected_categories}, got {actual_categories}")

    gate_results = evaluate_kano_gates(classification, "run_kano_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"kano gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"KANO_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "KanoGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove the shape invariants are real at the CONSTRUCTION layer. ---
    duplicate_id_construction_blocked = False
    try:
        duplicated = {"id": "KANO-001-F1", "label": "a different label entirely", "functional_response": "NEUTRAL", "dysfunctional_response": "NEUTRAL"}
        generate_kano_classification_record("KANO-2026-09-08-002", "some subject", [features[0], duplicated], make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        duplicate_id_construction_blocked = "KANO_DUPLICATE_FEATURE_ID" in str(error)
    if not duplicate_id_construction_blocked:
        raise InvariantViolation("KANO_INVARIANT_GUARD_DID_NOT_FIRE: a duplicate feature id was accepted (or a different guard fired instead)")

    invalid_response_construction_blocked = False
    try:
        illegal = {"id": "KANO-001-F7", "label": "an illegal response value", "functional_response": "MAYBE", "dysfunctional_response": "NEUTRAL"}
        generate_kano_classification_record("KANO-2026-09-08-003", "some subject", [illegal], make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        invalid_response_construction_blocked = "KANO_INVALID_FEATURES" in str(error)
    if not invalid_response_construction_blocked:
        raise InvariantViolation("KANO_INVARIANT_GUARD_DID_NOT_FIRE: an illegal functional_response value was accepted (or a different guard fired instead)")

    # --- Prove the SAME "re-derived, not trusted" discipline at the independent GATE layer: a hand-tampered
    # copy of the already-valid record must still be caught. KANO-001-F1 is a real delighter
    # (LIKE/NEUTRAL) -- hand-flip its stored category to "basic" without touching its responses. ---
    tampered = copy.deepcopy(classification)
    tampered["features"][0]["category"] = "basic"
    category_gate_result = evaluate_kano_integrity_gate(tampered, "run_kano_slice", clock.at(1.3))
    category_gate_blocked = category_gate_result["status"] == "FAIL" and "does not match recomputed" in str(category_gate_result["evidence"])
    if not category_gate_blocked:
        raise InvariantViolation(
            f"KANO_GATE_GUARD_DID_NOT_FIRE: kano_integrity did not flag the hand-tampered category mismatch "
            f"(status={category_gate_result['status']}, evidence={category_gate_result['evidence']})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "KanoInvariantVerified",
        {
            "duplicate_id_construction_blocked": duplicate_id_construction_blocked,
            "invalid_response_construction_blocked": invalid_response_construction_blocked,
            "category_mismatch_gate_blocked": category_gate_blocked,
        },
        1.4,
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
        "kano_classification": classification,
        "gate_results": gate_results,
        "category_spread": actual_categories,
        "invariant_verification": {
            "duplicate_id_construction_blocked": duplicate_id_construction_blocked,
            "invalid_response_construction_blocked": invalid_response_construction_blocked,
            "category_mismatch_gate_blocked": category_gate_blocked,
        },
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_moscow_slice.py)",
    }
    write_json(runtime / "results" / "kano_slice_result.json", result)
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
        result = run_kano_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS decision.kano: category_spread={result['category_spread']}, gates [{gate_summary}], "
        f"duplicate_id_construction_blocked={v['duplicate_id_construction_blocked']}, "
        f"invalid_response_construction_blocked={v['invalid_response_construction_blocked']}, "
        f"category_mismatch_gate_blocked={v['category_mismatch_gate_blocked']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
