"""``jurisdiction.cultural_context_review`` vertical slice -- F23 Global Jurisdiction/Compliance/
Localization family (Atlas L941, §12.44).

Builds a review of a synthetic JP enterprise B2B outreach context with one HIGH-risk factor
(authority) backed by 2 real evidence items, then proves §12.44's own 關鍵規則 (a cultural model
is a hypothesis/context, not a stereotype; high-risk decisions require Local Data/Interview/
Survey/Expert Review) is a real invariant, not mere guidance text: a construction-time attempt to
submit a HIGH-risk factor with EMPTY evidence (exactly the "刻板印象"/stereotype shortcut the rule
forbids) is refused, and a hand-tampered valid record (evidence stripped from a HIGH-risk factor
after construction, bypassing the builder) is independently caught by the
``evidence_required_for_high_risk`` gate.

Run::

    python -m ai_lego.apps.cli.run_cultural_context_review_slice
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
from ai_lego.modules.jurisdiction.cultural_context_review import (
    FACTORS,
    METHOD_ID,
    all_gates_pass,
    evaluate_cultural_context_review_gates,
    evaluate_evidence_required_for_high_risk_gate,
    generate_cultural_context_review,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-CULTCTX-SYNTHETIC-001"
EXECUTION_ID = "EX-CULTCTX-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-CULTCTX-001"

S = {
    "cultural_context_review": "ai-lego://specs/cognitive/typed-objects/cultural-context-review-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-cultural-context-review-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "target": "JP enterprise B2B sales motion -- direct-outreach cold-call campaign",
        "factors": {
            "trust": {"risk_level": "MEDIUM", "note": "brand trust builds slower than in the home market; third-party intro preferred", "evidence": ["LOCAL_DATA"]},
            "authority": {
                "risk_level": "HIGH",
                "note": "junior-staff direct outreach to senior decision-makers reads as a status violation, not merely 'formal' -- confirmed via 3 local interviews, not assumed",
                "evidence": ["INTERVIEW", "EXPERT_REVIEW"],
            },
            "communication_style": {"risk_level": "MEDIUM", "note": "indirect refusal patterns mean a 'maybe' in email is often a soft no", "evidence": ["EXPERT_REVIEW"]},
            "privacy_perception": {"risk_level": "LOW", "note": "B2B contact data handling matches existing GDPR-equivalent posture", "evidence": []},
            "risk_preference": {"risk_level": "MEDIUM", "note": "conservative vendor-switching norms observed in the target sector", "evidence": ["SURVEY"]},
            "technology_acceptance": {"risk_level": "LOW", "note": "target sector already uses comparable SaaS tooling", "evidence": []},
            "education_expectation": {"risk_level": "LOW", "note": "no unusual credentialing expectation surfaced", "evidence": []},
            "historical_context": {"risk_level": "LOW", "note": "no adverse historical association with the product category found", "evidence": []},
        },
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_cultural_context_review_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the well-formed record -- one HIGH-risk factor (authority), backed by 2 real
    # evidence items, not a bare stereotype label. ---
    descriptor, review = catalog.invoke(
        METHOD_ID,
        generate_cultural_context_review,
        "CULTCTX-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["cultural_context_review"], review, "cultural context review record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "CulturalContextReviewGenerated", {"cultural_context_review": review, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_cultural_context_review_gates(review, "run_cultural_context_review_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"cultural context review gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"CULTCTX_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "CulturalContextReviewGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove §12.44's own 關鍵規則 is not toothless -- a HIGH-risk factor asserted with
    # EMPTY evidence (exactly the 刻板印象/stereotype shortcut the rule forbids) MUST be refused
    # before any record is constructed. ---
    stereotype_kwargs = copy.deepcopy(_well_formed_kwargs())
    stereotype_kwargs["factors"]["authority"] = {"risk_level": "HIGH", "note": "this culture is just hierarchical", "evidence": []}
    stereotype_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_cultural_context_review("CULTCTX-STEREOTYPE-REFUSED-001", **stereotype_kwargs)
    except InvariantViolation as error:
        if "CULTCTX_MISSING_EVIDENCE_FOR_HIGH_RISK" not in str(error):
            raise
        stereotype_refusal_proof["raised"] = True
        stereotype_refusal_proof["error_code"] = "CULTCTX_MISSING_EVIDENCE_FOR_HIGH_RISK"
    if not stereotype_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("CULTCTX_INVARIANT_NOT_ENFORCED: a HIGH-risk factor with no evidence was NOT refused -- the anti-stereotype invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "StereotypeRefused", {"refusal_proof": stereotype_refusal_proof}, 1.3)
    milestones.append("STEREOTYPE_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT evidence_required_for_high_risk gate
    # catches the same defect class even when a caller bypasses the builder entirely (evidence
    # stripped from the already-HIGH authority factor after construction). ---
    tampered = copy.deepcopy(review)
    tampered["factors"]["authority"]["evidence"] = []
    tampered_gate = evaluate_evidence_required_for_high_risk_gate(tampered, "run_cultural_context_review_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("CULTCTX_GATE_NOT_INDEPENDENT: the independent evidence_required_for_high_risk gate did NOT catch a HIGH-risk factor with evidence stripped after construction")
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
        "cultural_context_review": review,
        "gate_results": gate_results,
        "stereotype_refusal_proof": stereotype_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "factor_count": len(FACTORS),
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "cultural_context_review_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_cultural_context_review_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS jurisdiction.cultural_context_review: CulturalContextReviewRecord {result['cultural_context_review']['id']} built "
        f"(all {result['factor_count']} §12.44 factors declared, 1 HIGH-risk factor backed by real evidence), gates [{gate_summary}]; "
        f"CULTCTX_MISSING_EVIDENCE_FOR_HIGH_RISK REFUSED a stereotype attempt ({result['stereotype_refusal_proof']['error_code']}); "
        f"hand-tampered evidence-stripped-after-construction caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
