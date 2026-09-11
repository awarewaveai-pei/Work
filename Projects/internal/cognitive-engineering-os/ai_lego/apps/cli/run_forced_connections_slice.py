"""``divergent.forced_connections`` vertical slice -- F03 divergent-ideation family, opened this same batch (one
of 10 agents, see ``run_scamper_slice.py``/``run_brainwriting_slice.py``/etc. if/when they land).

Scenario: a forced connection between "雨傘" (umbrella, concept A) and "智慧型手機" (smartphone, concept B) --
2 features listed per side, 2 real cross-combinations, same synthetic style every sibling slice's CLI demo
uses. Builds a real, well-formed ``ForcedConnectionsSession``, then demonstrates each of the 2 real invariants
once as a construction-time REFUSAL:

* invariant #1 (feature-pool completeness) -- an empty ``concept_a_features`` list MUST be refused before any
  record is constructed.
* invariant #2 (two-sided referential integrity) -- a combination whose ``feature_a_ref`` names a real id that
  actually belongs to ``concept_b_features`` (not ``concept_a_features``) MUST be refused before any record is
  constructed -- the "wrong pool, not just no pool" case the module docstring calls out specifically.

A final step hand-tampers a VALID record directly (bypassing the builder) to prove the independent
``combination_referential_integrity`` gate, not just the builder, catches a dangling reference introduced after
construction -- same "show a real refusal, not only a real success" discipline every sibling slice's CLI demo
already establishes.

Run::

    python -m ai_lego.apps.cli.run_forced_connections_slice
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
from ai_lego.core.domain.tenant import NORDBROOK
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.divergent.forced_connections import (
    METHOD_ID,
    all_gates_pass,
    combination,
    evaluate_forced_connections_gates,
    feature,
    generate_forced_connections_session,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-FORCEDCONN-SYNTHETIC-001"
EXECUTION_ID = "EX-FORCEDCONN-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-FORCEDCONN-001"

S = {
    "forced_connections_session": "ai-lego://specs/cognitive/typed-objects/forced-connections-session.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-forced-connections-slice"


def _well_formed_concept_a_features() -> list[dict[str, Any]]:
    return [
        feature("A-CANOPY", "可撐開的防水傘面"),
        feature("A-HANDLE", "握把，收合時可當手杖"),
    ]


def _well_formed_concept_b_features() -> list[dict[str, Any]]:
    return [
        feature("B-GPS", "即時定位與導航"),
        feature("B-NOTIFY", "推播通知使用者"),
    ]


def _well_formed_combinations() -> list[dict[str, Any]]:
    return [
        combination("COMB-1", "A-CANOPY", "B-NOTIFY", "傘面內建震動提醒模組，偵測到降雨預報時推播提醒使用者攜帶雨傘"),
        combination("COMB-2", "A-HANDLE", "B-GPS", "傘柄內建定位晶片，遺失時可透過手機 App 定位找回"),
    ]


def run_forced_connections_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. divergent.forced_connections resolves because
    # its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice
    # uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed session -- both real invariants satisfied, invoked through the
    # catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, session = catalog.invoke(
        METHOD_ID,
        generate_forced_connections_session,
        "FORCEDCONN-2026-09-11-001",
        "雨傘",
        _well_formed_concept_a_features(),
        "智慧型手機",
        _well_formed_concept_b_features(),
        _well_formed_combinations(),
        make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
    )
    contracts.validate(S["forced_connections_session"], session, "forced connections session")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ForcedConnectionsSessionGenerated", {"session": session, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_forced_connections_gates(session, "run_forced_connections_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"divergent.forced_connections gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("FORCEDCONN_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 1 (feature-pool completeness) is not toothless -- an empty concept_a_features
    # list MUST be refused before any record is constructed. ---
    empty_pool_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_forced_connections_session(
            "FORCEDCONN-EMPTYPOOL-REFUSED-001",
            "雨傘",
            [],
            "智慧型手機",
            _well_formed_concept_b_features(),
            _well_formed_combinations(),
            make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
        )
    except InvariantViolation as error:
        if "FORCEDCONN_EMPTY_FEATURE_POOL" not in str(error):
            raise
        empty_pool_refusal_proof["raised"] = True
        empty_pool_refusal_proof["error_code"] = "FORCEDCONN_EMPTY_FEATURE_POOL"
    if not empty_pool_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("FORCEDCONN_INVARIANT_NOT_ENFORCED: an empty concept_a_features pool was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyFeaturePoolRefused", {"refusal_proof": empty_pool_refusal_proof}, 1.3)
    milestones.append("EMPTY_POOL_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 2 (two-sided referential integrity) is not toothless -- a combination whose
    # feature_a_ref names a real id that belongs to concept_b_features (not concept_a_features) MUST be
    # refused. This is the "wrong pool", not merely "no pool", case. ---
    cross_wired_combinations = [
        combination("COMB-CROSSWIRED", "B-GPS", "B-NOTIFY", "feature_a_ref 誤指向 concept_b 自己的 id"),
    ]
    cross_wired_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_forced_connections_session(
            "FORCEDCONN-CROSSWIRED-REFUSED-001",
            "雨傘",
            _well_formed_concept_a_features(),
            "智慧型手機",
            _well_formed_concept_b_features(),
            cross_wired_combinations,
            make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
        )
    except InvariantViolation as error:
        if "FORCEDCONN_DANGLING_FEATURE_REF" not in str(error):
            raise
        cross_wired_refusal_proof["raised"] = True
        cross_wired_refusal_proof["error_code"] = "FORCEDCONN_DANGLING_FEATURE_REF"
    if not cross_wired_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("FORCEDCONN_INVARIANT_NOT_ENFORCED: a cross-wired feature_a_ref (real id, wrong pool) was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "CrossWiredFeatureRefRefused", {"refusal_proof": cross_wired_refusal_proof}, 1.5)
    milestones.append("CROSSWIRED_REF_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (splices a dangling combination directly into a VALID record's own raw dict, after
    # construction). ---
    tampered = dict(session)
    tampered["combinations"] = [
        *session["combinations"],
        {"id": "COMB-TAMPERED", "feature_a_ref": "A-CANOPY", "feature_b_ref": "B-GHOST-FEATURE", "resulting_idea": "建構後直接插入、繞過 builder 的懸空參照"},
    ]
    tampered_gate = evaluate_forced_connections_gates(tampered, "run_forced_connections_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("FORCEDCONN_GATE_NOT_INDEPENDENT: the independent combination_referential_integrity gate did NOT catch a hand-tampered dangling feature reference")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_results": tampered_gate}, 2.1)
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
        "session": session,
        "gate_results": gate_results,
        "empty_pool_refusal_proof": empty_pool_refusal_proof,
        "cross_wired_refusal_proof": cross_wired_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_bcg_matrix_slice.py)",
    }
    write_json(runtime / "results" / "forced_connections_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_forced_connections_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS divergent.forced_connections: ForcedConnectionsSession {result['session']['id']} built with "
        f"{len(result['session']['combinations'])} combinations across 2 named concepts, gates [{gate_summary}]; "
        f"FORCEDCONN_EMPTY_FEATURE_POOL/FORCEDCONN_DANGLING_FEATURE_REF invariants each REFUSED a malformed "
        f"attempt ({result['empty_pool_refusal_proof']['error_code']}, {result['cross_wired_refusal_proof']['error_code']}); "
        f"hand-tampered dangling feature reference caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
