"""``devops_sre.release_readiness_review`` vertical slice -- the thirty-second Method Atlas slice, seventh
from the `devops_sre` family.

Builds a real ready release (all six canonical domains assessed
ready) and a real not_ready release (security domain failed with a
documented reason). Then proves the completeness invariant is real by
attempting to construct a record missing one of the six canonical
domains (construction layer), and proves the aggregation invariant is
real by hand-tampering a valid ready record's own stored domain
verdict to not_ready while leaving `overall_status: ready` untouched
(gate layer).

Run::

    python -m ai_lego.apps.cli.run_release_readiness_review_slice
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
from ai_lego.modules.devops_sre.release_readiness_review import (
    METHOD_ID,
    all_gates_pass,
    domain_assessment,
    evaluate_release_readiness_review_gates,
    generate_release_readiness_review_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-RELEASEREADINESS-SYNTHETIC-001"
EXECUTION_ID = "EX-RELEASEREADINESS-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-RELEASEREADINESS-001"

S = {
    "release_readiness_review_record": "ai-lego://specs/cognitive/typed-objects/release-readiness-review-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-release-readiness-review-slice"


def run_release_readiness_review_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real ready release: all six canonical domains assessed ready. ---
    ready_assessments = [
        domain_assessment("change", "ready"),
        domain_assessment("data", "ready", note="no schema migration in this release"),
        domain_assessment("security", "ready"),
        domain_assessment("observability", "ready"),
        domain_assessment("rollback", "ready"),
        domain_assessment("capacity", "ready"),
    ]
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_release_readiness_review_record,
        "RRR-2026-09-05-001",
        "checkout-api v2.5.0",
        ready_assessments,
        "ready",
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["release_readiness_review_record"], record, "release readiness review record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ReleaseReadinessReviewRecordGenerated", {"release_readiness_review_record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_release_readiness_review_gates(record, "run_release_readiness_review_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"release readiness review gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"RELEASEREADINESS_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ReleaseReadinessReviewGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- A real not_ready release: security domain failed with a documented reason. ---
    not_ready_assessments = [
        domain_assessment("change", "ready"),
        domain_assessment("data", "ready"),
        domain_assessment("security", "not_ready", note="dependency scan flagged a critical CVE with no available patch"),
        domain_assessment("observability", "ready"),
        domain_assessment("rollback", "ready"),
        domain_assessment("capacity", "ready"),
    ]
    _, not_ready_record = catalog.invoke(
        METHOD_ID,
        generate_release_readiness_review_record,
        "RRR-2026-09-05-002",
        "checkout-api v2.5.0",
        not_ready_assessments,
        "not_ready",
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["release_readiness_review_record"], not_ready_record, "not-ready release readiness review record")

    # --- Prove the completeness invariant is real, at the CONSTRUCTION layer: attempt to build a record
    # missing one of the six canonical domains (only 5 supplied). Must be refused. ---
    construction_layer_blocked = False
    try:
        generate_release_readiness_review_record(
            "RRR-2026-09-05-003",
            "checkout-api v2.5.0",
            ready_assessments[:5],
            "ready",
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
        )
    except InvariantViolation as error:
        construction_layer_blocked = "RELEASEREADINESS_WRONG_COUNT" in str(error)
    if not construction_layer_blocked:
        raise InvariantViolation("RELEASEREADINESS_INVARIANT_GUARD_DID_NOT_FIRE: a record missing one of the six canonical domains was accepted (or a different guard fired instead)")

    # --- Prove the SAME "unified verdict reflects the worst domain" discipline at the independent GATE
    # layer: take a COPY of the real, valid ready record and hand-tamper ONE domain's own stored verdict to
    # not_ready (with a note, so the assessment shape itself stays valid) while leaving overall_status:ready
    # UNTOUCHED. Pinned to the SPECIFIC readiness_integrity gate and its own evidence. ---
    tampered = copy.deepcopy(record)
    for item in tampered["domain_assessments"]:
        if item["domain"] == "security":
            item["verdict"] = "not_ready"
            item["note"] = "hand-tampered for gate-layer verification"
    tampered_gate_results = evaluate_release_readiness_review_gates(tampered, "run_release_readiness_review_slice", clock.at(1.25))
    integrity_result = next(g for g in tampered_gate_results if g["gate_id"] == "readiness_integrity")
    evidence = integrity_result["evidence"][0]
    gate_layer_blocked = integrity_result["status"] == "FAIL" and "security" in evidence.get("not_ready_domains", [])
    if not gate_layer_blocked:
        raise InvariantViolation(
            f"RELEASEREADINESS_GATE_GUARD_DID_NOT_FIRE: readiness_integrity did not flag the tampered security domain "
            f"(status={integrity_result['status']}, evidence={evidence})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "ReleaseReadinessReviewInvariantVerified",
        {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked},
        1.3,
    )
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
        "release_readiness_review_record": record,
        "not_ready_release_readiness_review_record": not_ready_record,
        "gate_results": gate_results,
        "invariant_verification": {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "release_readiness_review_slice_result.json", result)
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
        result = run_release_readiness_review_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["release_readiness_review_record"]
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS devops_sre.release_readiness_review: {len(record['domain_assessments'])} domains assessed, overall_status={record['overall_status']}, "
        f"gates [{gate_summary}], invariant_verified(construction={v['construction_layer_blocked']}, gate={v['gate_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
