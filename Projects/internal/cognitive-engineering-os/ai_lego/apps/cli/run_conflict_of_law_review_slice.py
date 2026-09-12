"""``jurisdiction.conflict_of_law_review`` vertical slice -- F23 jurisdiction family (Atlas L944).

Builds a well-formed review with 2 conflicts (one finalized WITH a
legal_review, one still pending human review with applicable_law: null),
then proves Atlas's own "conflicts->legal review" pipeline stage is a real,
fail-closed invariant, not mere narrative order: a construction-time attempt
to finalize a conflict's applicable_law with NO legal_review attached is
refused, and a hand-tampered valid record (legal_review stripped from an
already-finalized conflict, bypassing the builder) is independently caught
by the legal_review_required gate.

Run::

    python -m ai_lego.apps.cli.run_conflict_of_law_review_slice
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
from ai_lego.modules.jurisdiction.conflict_of_law_review import (
    METHOD_ID,
    all_gates_pass,
    evaluate_conflict_of_law_review_gates,
    evaluate_legal_review_required_gate,
    generate_conflict_of_law_review,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-COLR-SYNTHETIC-001"
EXECUTION_ID = "EX-COLR-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-COLR-001"

S = {
    "conflict_of_law_review": "ai-lego://specs/cognitive/typed-objects/conflict-of-law-review-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-conflict-of-law-review-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "governing_laws": [
            {"law_id": "LAW-EU-GDPR", "jurisdiction": "EU", "description": "General Data Protection Regulation"},
            {"law_id": "LAW-US-CCPA", "jurisdiction": "US-CA", "description": "California Consumer Privacy Act"},
        ],
        "mandatory_rules": [
            {"rule_id": "RULE-EU-PUBLIC-POLICY", "jurisdiction": "EU", "description": "EU public policy override on data subject rights"},
        ],
        "conflicts": [
            {
                "conflict_id": "CONF-001",
                "disputed_law_ids": ["LAW-EU-GDPR", "LAW-US-CCPA"],
                "description": "Deletion request conflicts with a US retention obligation",
                "legal_review": {"reviewer": "J. Alvarez, Esq.", "date": "2026-09-01", "outcome": "GDPR erasure right upheld; US retention obligation does not override an EU data subject's request"},
                "applicable_law": "LAW-EU-GDPR",
            },
            {
                "conflict_id": "CONF-002",
                "disputed_law_ids": ["LAW-US-CCPA", "RULE-EU-PUBLIC-POLICY"],
                "description": "Cross-border transfer mechanism disputed between CCPA opt-out and EU public policy override",
                "legal_review": None,
                "applicable_law": None,
            },
        ],
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_conflict_of_law_review_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the well-formed review -- one conflict finalized WITH legal_review, one pending. ---
    descriptor, review = catalog.invoke(
        METHOD_ID,
        generate_conflict_of_law_review,
        "COLR-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["conflict_of_law_review"], review, "conflict of law review")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ConflictOfLawReviewGenerated", {"review": review, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_conflict_of_law_review_gates(review, "run_conflict_of_law_review_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"conflict of law review gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"COL_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ConflictOfLawReviewGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L944's own "conflicts->legal review" pipeline stage is not toothless --
    # finalizing applicable_law with NO legal_review attached MUST be refused before any record is
    # constructed. THIS is the star invariant: no auto-resolution without human sign-off. ---
    auto_resolved_kwargs = copy.deepcopy(_well_formed_kwargs())
    auto_resolved_kwargs["conflicts"][1]["applicable_law"] = "LAW-US-CCPA"  # finalize CONF-002 with legal_review still None
    missing_review_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_conflict_of_law_review("COLR-AUTO-RESOLVED-REFUSED-001", **auto_resolved_kwargs)
    except InvariantViolation as error:
        if "COL_MISSING_LEGAL_REVIEW" not in str(error):
            raise
        missing_review_refusal_proof["raised"] = True
        missing_review_refusal_proof["error_code"] = "COL_MISSING_LEGAL_REVIEW"
    if not missing_review_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("COL_INVARIANT_NOT_ENFORCED: an auto-resolved conflict with no legal_review was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "AutoResolvedConflictRefused", {"refusal_proof": missing_review_refusal_proof}, 1.3)
    milestones.append("MISSING_LEGAL_REVIEW_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT legal_review_required gate catches the same
    # defect class even when a caller bypasses the builder entirely (legal_review stripped from
    # CONF-001, an already-finalized conflict, while applicable_law is left in place). ---
    tampered = copy.deepcopy(review)
    tampered["conflicts"][0]["legal_review"] = None
    tampered_gate = evaluate_legal_review_required_gate(tampered, "run_conflict_of_law_review_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("COL_GATE_NOT_INDEPENDENT: the independent legal_review_required gate did NOT catch a hand-tampered stripped-legal_review finalized conflict")
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
        "conflict_of_law_review": review,
        "gate_results": gate_results,
        "missing_legal_review_refusal_proof": missing_review_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "conflict_of_law_review_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_conflict_of_law_review_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS jurisdiction.conflict_of_law_review: ConflictOfLawReview {result['conflict_of_law_review']['id']} built "
        f"(2 conflicts -- 1 finalized with legal_review, 1 pending), gates [{gate_summary}]; "
        f"COL_MISSING_LEGAL_REVIEW REFUSED an auto-resolved-without-review attempt ({result['missing_legal_review_refusal_proof']['error_code']}); "
        f"hand-tampered stripped-legal_review finalized conflict caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
