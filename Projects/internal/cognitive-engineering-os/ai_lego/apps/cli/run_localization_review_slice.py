"""``jurisdiction.localization_review`` vertical slice -- F23 Global Jurisdiction/Compliance/
Localization family (Atlas L940, §12.43).

Builds a fully-READY record (all 13 §12.43 dimensions MET or NOT_APPLICABLE) over a synthetic
zh-TW storefront checkout flow, then proves §12.43's own "不把翻譯當在地化" benefit is a real
invariant, not mere narrative order: a construction-time attempt to submit a record MISSING one
of the 13 dimensions (Tax) is refused, and a hand-tampered record (a genuinely NOT_MET Currency
dimension, with ``overall_status`` forced to READY anyway, bypassing the builder) is
independently caught by the ``status_derivation`` gate.

Run::

    python -m ai_lego.apps.cli.run_localization_review_slice
"""

from __future__ import annotations

import argparse
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
from ai_lego.modules.jurisdiction.localization_review import (
    DIMENSIONS,
    METHOD_ID,
    all_gates_pass,
    evaluate_localization_review_gates,
    evaluate_status_derivation_gate,
    generate_localization_review,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-LOCREVIEW-SYNTHETIC-001"
EXECUTION_ID = "EX-LOCREVIEW-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-LOCREVIEW-001"

S = {
    "localization_review": "ai-lego://specs/cognitive/typed-objects/localization-review-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-localization-review-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "target": "zh-TW Taiwan storefront checkout flow",
        "dimensions": {
            "language": {"status": "MET", "note": "zh-Hant strings reviewed by native copywriter, not machine-translated"},
            "date_time": {"status": "MET", "note": "yyyy/MM/dd + 24h clock rendered via locale-aware formatter"},
            "timezone": {"status": "MET", "note": "Asia/Taipei used for all order timestamps"},
            "currency": {"status": "MET", "note": "TWD, no decimal places, symbol placement verified"},
            "number_format": {"status": "MET", "note": "thousands separator verified against zh-TW convention"},
            "units": {"status": "NOT_APPLICABLE", "note": "no physical measurements shown in this checkout flow"},
            "address": {"status": "MET", "note": "TW address field order (postal code first) implemented"},
            "name": {"status": "MET", "note": "surname-first display order implemented for TW locale"},
            "phone": {"status": "MET", "note": "+886 format validated"},
            "tax": {"status": "MET", "note": "統一編號 (business tax ID) field added for B2B checkout"},
            "ui_layout": {"status": "MET", "note": "zh-Hant string length checked against button/label overflow"},
            "accessibility": {"status": "MET", "note": "screen-reader pass completed with zh-TW VoiceOver"},
            "content_expectations": {"status": "MET", "note": "trust badges swapped to locally recognized payment providers"},
        },
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_localization_review_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the well-formed, fully-READY record -- all 13 §12.43 dimensions MET or NOT_APPLICABLE. ---
    descriptor, review = catalog.invoke(
        METHOD_ID,
        generate_localization_review,
        "LOCREVIEW-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["localization_review"], review, "localization review record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "LocalizationReviewGenerated", {"localization_review": review, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_localization_review_gates(review, "run_localization_review_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"localization review gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"LOCREVIEW_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "LocalizationReviewGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove §12.43's own 13-dimension gate is not toothless -- a record MISSING one
    # dimension (Tax dropped entirely, the exact "just translation" shortcut L940 forbids) MUST be
    # refused before any record is constructed. ---
    missing_dimension_kwargs = copy.deepcopy(_well_formed_kwargs())
    del missing_dimension_kwargs["dimensions"]["tax"]
    missing_dimension_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_localization_review("LOCREVIEW-MISSING-DIMENSION-REFUSED-001", **missing_dimension_kwargs)
    except InvariantViolation as error:
        if "LOCREVIEW_INVALID_DIMENSIONS" not in str(error):
            raise
        missing_dimension_refusal_proof["raised"] = True
        missing_dimension_refusal_proof["error_code"] = "LOCREVIEW_INVALID_DIMENSIONS"
    if not missing_dimension_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("LOCREVIEW_INVARIANT_NOT_ENFORCED: a record missing a required §12.43 dimension was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MissingDimensionRefused", {"refusal_proof": missing_dimension_refusal_proof}, 1.3)
    milestones.append("MISSING_DIMENSION_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT status_derivation gate catches the same
    # defect class even when a caller bypasses the builder entirely (Currency flipped to a genuine
    # NOT_MET, but overall_status left forced at READY -- exactly the anti-pattern §12.43 exists to
    # prevent). ---
    tampered = copy.deepcopy(review)
    tampered["dimensions"]["currency"] = {"status": "NOT_MET", "note": "prices still shown in USD, no TWD conversion"}
    tampered_gate = evaluate_status_derivation_gate(tampered, "run_localization_review_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("LOCREVIEW_GATE_NOT_INDEPENDENT: the independent status_derivation gate did NOT catch a NOT_MET dimension left under a forced READY overall_status")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_result": tampered_gate}, 2.1)
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
        "localization_review": review,
        "gate_results": gate_results,
        "missing_dimension_refusal_proof": missing_dimension_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "dimension_count": len(DIMENSIONS),
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "localization_review_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_localization_review_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS jurisdiction.localization_review: LocalizationReviewRecord {result['localization_review']['id']} built "
        f"(all {result['dimension_count']} §12.43 dimensions declared, overall_status={result['localization_review']['overall_status']!r}), gates [{gate_summary}]; "
        f"LOCREVIEW_INVALID_DIMENSIONS REFUSED a missing-dimension attempt ({result['missing_dimension_refusal_proof']['error_code']}); "
        f"hand-tampered NOT_MET-under-forced-READY caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
