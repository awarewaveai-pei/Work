"""``root_cause.change_analysis`` vertical slice -- seventh member of the `root_cause` family (F05) built
(eighth of the F05 table's 9 rows), after `root_cause.fishbone`, `root_cause.five_whys`, `root_cause.pareto`,
`root_cause.fault_tree`, `root_cause.bow_tie`, and `root_cause.kepner_tregoe`. Same table-row-only sourcing
class as `root_cause.fault_tree` -- see ``ai_lego.modules.root_cause.change_analysis``'s own module
docstring for the full due-diligence read (``causal/dag.py``) and misuse-guard design decision.

Builds an INVENTED-BUT-REALISTIC scenario, disclosed honestly as such: a checkout-service incident (error
rate spiking from 0.1% to 40%) investigated by enumerating what changed just before it, ranked by
correlation -- one HIGH-correlation config change (an nginx upstream_timeout cut from 30s to 5s, deployed
minutes before the spike) and one essentially-irrelevant change that happened to occur in the same window
(an on-call roster rotation, days earlier, no plausible mechanism) -- so ``rank_changes_by_correlation``
visibly narrows the scope (Atlas F05 L441's own "快速縮小範圍" benefit) rather than merely listing changes in
input order.

Then proves BOTH headline invariants are real, at BOTH layers -- including the genuinely ASYMMETRIC case the
module docstring describes: the misuse guard's RECORD-level half can only be exercised by hand-tampering,
never through the real constructor, because ``generate_change_analysis_record``'s explicit keyword signature
has no way to inject a top-level forbidden key.

1. Misuse guard (``CHANGEANALYSIS_FORBIDDEN_CAUSAL_CLAIM_FIELD``): a hand-crafted change entry carrying a
   ``caused_by`` key must be refused at CONSTRUCTION. A copy of the valid record with a ``root_cause`` key
   added directly to the RECORD itself (not reachable through the constructor at all) must be caught
   independently at the GATE layer.
2. Before/after completeness (``CHANGEANALYSIS_INCOMPLETE_CHANGE_ENTRY`` / ``CHANGEANALYSIS_DEGENERATE_CHANGE_ENTRY``):
   a hand-crafted change entry missing ``after_state`` must be refused at CONSTRUCTION. A copy of the valid
   record with one entry's own stored ``after_state`` hand-tampered to equal its ``before_state`` must be
   caught independently at the GATE layer.

Run::

    python -m ai_lego.apps.cli.run_change_analysis_slice
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
from ai_lego.modules.root_cause.change_analysis import (
    METHOD_ID,
    all_gates_pass,
    change_entry,
    evaluate_change_analysis_gates,
    evaluate_change_analysis_integrity_gate,
    generate_change_analysis_record,
    rank_changes_by_correlation,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-CHANGEANALYSIS-SYNTHETIC-001"
EXECUTION_ID = "EX-CHANGEANALYSIS-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-CHANGEANALYSIS-001"

S = {
    "change_analysis_record": "ai-lego://specs/cognitive/typed-objects/change-analysis-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-change-analysis-slice"


def run_change_analysis_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Invented-but-realistic scenario (disclosed): a checkout-service incident, investigated by
    # enumerating what changed just before it, ranked by correlation -- NOT by asserted causation. ---
    baseline = {"before_state": "checkout error rate 0.1%, p99 latency 220ms", "after_state": "checkout error rate 40%, p99 latency 4100ms"}
    changes = [
        change_entry(
            "CA-001-C1",
            "nginx upstream_timeout config value",
            "30s",
            "5s",
            "IMMEDIATELY_BEFORE",
            "STRONG",
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
            supporting_evidence_refs=["E-701"],
        ),
        change_entry(
            "CA-001-C2",
            "on-call engineer roster rotation",
            "engineer A on call",
            "engineer B on call",
            "DISTANT_BEFORE",
            "NONE",
            make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
        ),
    ]
    descriptor, incident_record = catalog.invoke(
        METHOD_ID,
        generate_change_analysis_record,
        "CHANGEANALYSIS-2026-09-07-001",
        "checkout-service",
        "Checkout error rate spiked from 0.1% to 40% starting 14:02 UTC",
        baseline,
        changes,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["change_analysis_record"], incident_record, "checkout-service change analysis record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ChangeAnalysisRecordGenerated", {"change_analysis_record": incident_record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_change_analysis_gates(incident_record, "run_change_analysis_slice", clock.at(1.1))
    for g in gate_results:
        contracts.validate(S["gate_result"], g, f"change analysis gate {g['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"CHANGEANALYSIS_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ChangeAnalysisGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Real compute: rank the two changes by correlation. The STRONG/IMMEDIATELY_BEFORE config change
    # must outrank the NONE/DISTANT_BEFORE roster rotation -- the "快速縮小範圍" benefit made mechanical. ---
    ranked_ids = rank_changes_by_correlation(incident_record)
    if ranked_ids != ["CA-001-C1", "CA-001-C2"]:
        raise InvariantViolation(f"CHANGEANALYSIS_RANKING_UNEXPECTED: expected the config change to outrank the roster rotation, got {ranked_ids}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ChangeAnalysisRankingComputed", {"ranked_change_ids": ranked_ids}, 1.3)

    # --- Prove invariant #1 (misuse guard) is real at the CONSTRUCTION layer: a hand-crafted change entry
    # carrying a denylisted causal-claim key must be refused. ---
    misuse_guard_construction_blocked = False
    try:
        tampered_entry = change_entry(
            "CA-002-C1", "some config change", "before", "after", "IMMEDIATELY_BEFORE", "STRONG", make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")
        )
        tampered_entry["caused_by"] = "CA-002-C1"  # a caller trying to smuggle a causal claim past the convenience constructor
        generate_change_analysis_record(
            "CHANGEANALYSIS-2026-09-07-002", "some-system", "some fault", {"before_state": "b", "after_state": "a"}, [tampered_entry], make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")
        )
    except InvariantViolation as error:
        misuse_guard_construction_blocked = "CHANGEANALYSIS_FORBIDDEN_CAUSAL_CLAIM_FIELD" in str(error)
    if not misuse_guard_construction_blocked:
        raise InvariantViolation("CHANGEANALYSIS_INVARIANT_GUARD_DID_NOT_FIRE: a change entry carrying 'caused_by' was accepted (or a different guard fired instead)")

    # --- Prove invariant #2 (before/after completeness) is real at the CONSTRUCTION layer: a hand-crafted
    # change entry missing after_state must be refused. ---
    completeness_construction_blocked = False
    try:
        incomplete_entry = {
            "id": "CA-003-C1",
            "description": "some config change",
            "before_state": "30s",
            "after_state": "",  # missing -- an unqualified observation, not a change
            "temporal_proximity": "IMMEDIATELY_BEFORE",
            "correlation_strength": "STRONG",
            "provenance": make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
        }
        generate_change_analysis_record(
            "CHANGEANALYSIS-2026-09-07-003", "some-system", "some fault", {"before_state": "b", "after_state": "a"}, [incomplete_entry], make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")
        )
    except InvariantViolation as error:
        completeness_construction_blocked = "CHANGEANALYSIS_INCOMPLETE_CHANGE_ENTRY" in str(error)
    if not completeness_construction_blocked:
        raise InvariantViolation("CHANGEANALYSIS_INVARIANT_GUARD_DID_NOT_FIRE: a change entry missing after_state was accepted (or a different guard fired instead)")

    # --- Prove the SAME "re-derived, not trusted" discipline at the independent GATE layer -- including the
    # genuinely ASYMMETRIC record-level misuse-guard case CONSTRUCTION CANNOT PRODUCE AT ALL (no **kwargs on
    # generate_change_analysis_record's own signature can inject a top-level key). ---
    tampered_record_level = copy.deepcopy(incident_record)
    tampered_record_level["root_cause"] = "CA-001-C1"  # a caller hand-building the record directly, bypassing the constructor entirely
    misuse_guard_gate_result = evaluate_change_analysis_integrity_gate(tampered_record_level, "run_change_analysis_slice", clock.at(1.4))
    misuse_guard_gate_blocked = misuse_guard_gate_result["status"] == "FAIL" and misuse_guard_gate_result["evidence"][0]["reason"] == "record itself carries a denylisted causal-claim field"
    if not misuse_guard_gate_blocked:
        raise InvariantViolation(
            f"CHANGEANALYSIS_GATE_GUARD_DID_NOT_FIRE: change_analysis_integrity did not flag the hand-tampered top-level 'root_cause' key "
            f"(status={misuse_guard_gate_result['status']}, evidence={misuse_guard_gate_result['evidence']})"
        )

    tampered_degenerate = copy.deepcopy(incident_record)
    tampered_degenerate["changes"][0]["after_state"] = tampered_degenerate["changes"][0]["before_state"]  # "30s" -> "30s": no longer describes an actual change
    completeness_gate_result = evaluate_change_analysis_integrity_gate(tampered_degenerate, "run_change_analysis_slice", clock.at(1.5))
    completeness_gate_blocked = completeness_gate_result["status"] == "FAIL" and completeness_gate_result["evidence"][0]["reason"] == "a changes[] entry has identical before_state and after_state (not an actual change)"
    if not completeness_gate_blocked:
        raise InvariantViolation(
            f"CHANGEANALYSIS_GATE_GUARD_DID_NOT_FIRE: change_analysis_integrity did not flag the hand-tampered degenerate change entry "
            f"(status={completeness_gate_result['status']}, evidence={completeness_gate_result['evidence']})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "ChangeAnalysisInvariantVerified",
        {
            "misuse_guard_construction_blocked": misuse_guard_construction_blocked,
            "misuse_guard_gate_blocked": misuse_guard_gate_blocked,
            "completeness_construction_blocked": completeness_construction_blocked,
            "completeness_gate_blocked": completeness_gate_blocked,
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
        "change_analysis_record": incident_record,
        "gate_results": gate_results,
        "ranked_change_ids": ranked_ids,
        "invariant_verification": {
            "misuse_guard_construction_blocked": misuse_guard_construction_blocked,
            "misuse_guard_gate_blocked": misuse_guard_gate_blocked,
            "completeness_construction_blocked": completeness_construction_blocked,
            "completeness_gate_blocked": completeness_gate_blocked,
        },
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fault_tree_slice.py)",
    }
    write_json(runtime / "results" / "change_analysis_slice_result.json", result)
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
        result = run_change_analysis_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS root_cause.change_analysis: gates [{gate_summary}], ranked_change_ids={result['ranked_change_ids']}, "
        f"misuse_guard(construction={v['misuse_guard_construction_blocked']}, gate={v['misuse_guard_gate_blocked']}), "
        f"before_after_completeness(construction={v['completeness_construction_blocked']}, gate={v['completeness_gate_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
