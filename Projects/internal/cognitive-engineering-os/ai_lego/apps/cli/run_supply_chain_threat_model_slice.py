"""``security.supply_chain_threat_model`` vertical slice -- the fifty-first Method Atlas slice (this
session), SIXTH member of the `security` family (F20), and the SECOND F20 member confirmed genuinely absent
from Execution Contract §32 entirely (after `security.dpia_pia`).

Builds a REAL supply-chain review for this repository's own `ai_lego`
package release pipeline (not a fabricated scenario), and a minimal
low-dependency second record. Then proves TWO real invariants: dependency
-consideration completeness at the CONSTRUCTION layer (a dependency entry
missing even one of EC §34's own seven named considerations must be
refused), and the production-verified-artifact gate at BOTH the
CONSTRUCTION layer (production_deployment_occurred=True with
artifact_verified=False must be refused) and the independent GATE layer
(hand-tampering a copy's own artifact_verified back to False after
production deployment must be caught).

Run::

    python -m ai_lego.apps.cli.run_supply_chain_threat_model_slice
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
from ai_lego.modules.security.supply_chain_threat_model import (
    METHOD_ID,
    all_gates_pass,
    evaluate_supply_chain_threat_model_gates,
    generate_supply_chain_threat_model_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-SUPPLY-CHAIN-THREAT-MODEL-SYNTHETIC-001"
EXECUTION_ID = "EX-SUPPLY-CHAIN-THREAT-MODEL-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-SUPPLY-CHAIN-THREAT-MODEL-001"

S = {
    "sctm_record": "ai-lego://specs/cognitive/typed-objects/supply-chain-threat-model-record.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}


def _process(stage_id: str, summary: str) -> dict[str, Any]:
    return {"stage_id": stage_id, "summary": summary}


def _considerations(**fields: str) -> dict[str, Any]:
    return dict(fields)


def _dependency(*entries: dict[str, Any]) -> dict[str, Any]:
    return {"stage_id": "dependency", "dependency_entries": list(entries)}


def _sign_verify(summary: str, artifact_verified: bool, production_deployment_occurred: bool, verification_method: str) -> dict[str, Any]:
    return {
        "stage_id": "sign_verify",
        "summary": summary,
        "artifact_verified": artifact_verified,
        "production_deployment_occurred": production_deployment_occurred,
        "verification_method": verification_method,
    }


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-supply-chain-threat-model-slice"


def run_supply_chain_threat_model_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A REAL supply-chain review of THIS repository's own ai_lego package release pipeline, all seven
    # of Atlas's own F20-row stages in Atlas's own literal order, production deployment gated on
    # artifact verification. Not fabricated -- see method contract's own description and Atlas L889. ---
    release_stages = [
        _process("source", "GitHub repository, main branch protected, two-reviewer rule enforced for merges touching ai_lego/."),
        _dependency(
            {
                "name": "jsonschema",
                "considerations": _considerations(
                    maintenance="Actively maintained, multiple releases per year, large user base.",
                    license="MIT -- compatible with this project's own licensing.",
                    vulnerability_history="No open CVEs at time of review; last CVE (2021) already patched upstream and pinned version is well past it.",
                    replaceability="Low switching cost -- Draft202012Validator interface is narrow and already isolated behind SchemaContracts.",
                    transitive_dependencies="Two small transitive deps (attrs, pyrsistent), both widely used and independently reviewed.",
                    size_performance="Pure-Python, negligible install size, validation cost is not a hot path in this codebase.",
                    long_term_support="Reference implementation of the JSON Schema spec itself -- unlikely to be abandoned.",
                ),
            },
            {
                "name": "PyYAML",
                "considerations": _considerations(
                    maintenance="Actively maintained, de facto standard YAML library for Python.",
                    license="MIT -- compatible with this project's own licensing.",
                    vulnerability_history="Historical unsafe-load CVEs (arbitrary code execution) -- this codebase uses yaml.safe_load exclusively, confirmed by grep.",
                    replaceability="Moderate switching cost -- used across the spec-loading layer, but the safe_load call surface is narrow.",
                    transitive_dependencies="None of note.",
                    size_performance="Small, C-accelerated parser available; not a performance concern at this codebase's scale.",
                    long_term_support="De facto standard for the ecosystem, long track record.",
                ),
            },
        ),
        _process("ci", "GitHub Actions runs the full unit test suite and jsonschema validation on every push and PR."),
        _process("artifact", "sdist and wheel built via the standard build backend from the tagged commit."),
        _process("registry", "Internal package index; no public PyPI publication at this stage."),
        _process("deploy", "Pulled by internal runtime images at container build time, pinned to an exact version."),
        _sign_verify(
            "GitHub Artifact Attestations generated for the built wheel; internal image build verifies the attestation before accepting the artifact.",
            True,
            True,
            "GitHub Artifact Attestations (Sigstore/cosign-backed, per policies/security/supply-chain-security.policy.yaml signing.mechanism) verified at image-build time before the artifact is accepted.",
        ),
    ]
    descriptor, release_record = catalog.invoke(
        METHOD_ID,
        generate_supply_chain_threat_model_record,
        "SCTM-2026-09-06-001",
        "ai_lego package release pipeline",
        release_stages,
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
    )
    contracts.validate(S["sctm_record"], release_record, "ai_lego release pipeline supply-chain review")
    if [s["stage_id"] for s in release_record["stages"]] != list(("source", "dependency", "ci", "artifact", "registry", "deploy", "sign_verify")):
        raise InvariantViolation(f"SCTM_EXPECTED_ATLAS_ORDER: got {[s['stage_id'] for s in release_record['stages']]!r}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SupplyChainThreatModelRecordGenerated", {"sctm_record": release_record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_supply_chain_threat_model_gates(release_record, "run_supply_chain_threat_model_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"supply_chain_threat_model gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"SCTM_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SupplyChainThreatModelGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- A minimal, single-dependency review, not yet reaching production. ---
    minimal_stages = [
        _process("source", "Internal-only tooling repository, single maintainer."),
        _dependency(
            {
                "name": "click",
                "considerations": _considerations(
                    maintenance="Actively maintained CLI framework.",
                    license="BSD-3-Clause.",
                    vulnerability_history="No known CVEs.",
                    replaceability="High -- thin CLI-argument-parsing usage only.",
                    transitive_dependencies="None of note.",
                    size_performance="Negligible.",
                    long_term_support="Long-established, widely used.",
                ),
            }
        ),
        _process("ci", "Local pre-commit hook only; no hosted CI configured yet."),
        _process("artifact", "Wheel built locally on release."),
        _process("registry", "Not yet published anywhere."),
        _process("deploy", "Not yet deployed anywhere."),
        _sign_verify("No signing pipeline exists yet for this internal-only tool.", False, False, "Not applicable -- no artifact has been signed or deployed yet."),
    ]
    _, minimal_record = catalog.invoke(
        METHOD_ID,
        generate_supply_chain_threat_model_record,
        "SCTM-2026-09-06-003",
        "internal-only CLI tooling repository",
        minimal_stages,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["sctm_record"], minimal_record, "minimal supply-chain review")

    # --- Prove the DEPENDENCY-CONSIDERATION COMPLETENESS invariant is real, at the CONSTRUCTION layer: a
    # dependency entry missing even ONE of EC §34's own seven named considerations must be refused. ---
    incomplete_stages = copy.deepcopy(release_stages)
    del incomplete_stages[1]["dependency_entries"][0]["considerations"]["vulnerability_history"]
    considerations_guard_fired = False
    try:
        generate_supply_chain_threat_model_record("SCTM-2026-09-06-002", "some-system", incomplete_stages, make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        considerations_guard_fired = "SCTM_INVALID_STAGES" in str(error)
    if not considerations_guard_fired:
        raise InvariantViolation("SCTM_CONSIDERATIONS_GUARD_DID_NOT_FIRE: a dependency entry missing one of EC §34's seven considerations was accepted (or a different guard fired instead)")

    # --- Prove the PRODUCTION-VERIFIED-ARTIFACT GATE is real, at the CONSTRUCTION layer: the SAME release
    # content, but with artifact_verified pushed to False while production_deployment_occurred stays True. ---
    unverified_stages = copy.deepcopy(release_stages)
    unverified_stages[6]["artifact_verified"] = False
    production_guard_fired = False
    try:
        generate_supply_chain_threat_model_record("SCTM-2026-09-06-004", "some-system", unverified_stages, make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        production_guard_fired = "SCTM_INVALID_STAGES" in str(error)
    if not production_guard_fired:
        raise InvariantViolation("SCTM_PRODUCTION_GUARD_DID_NOT_FIRE: production_deployment_occurred=True with artifact_verified=False was accepted (or a different guard fired instead)")
    # Confirm the SAME record legalizes once production_deployment_occurred is set to False instead (proves
    # the guard checks the CONJUNCTION, not merely the presence of an unverified artifact in general).
    unverified_stages[6]["production_deployment_occurred"] = False
    _, not_yet_deployed_record = catalog.invoke(
        METHOD_ID,
        generate_supply_chain_threat_model_record,
        "SCTM-2026-09-06-004",
        "some-system",
        unverified_stages,
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
    )
    contracts.validate(S["sctm_record"], not_yet_deployed_record, "unverified-but-not-yet-deployed record")

    # --- Prove the SAME "re-derived, not trusted" discipline at the independent GATE layer: take a COPY of
    # the real, valid release record, hand-tamper its OWN artifact_verified back to False while
    # production_deployment_occurred stays True, leaving every other raw field untouched, pinned to the
    # SPECIFIC supply_chain_threat_model_integrity gate. ---
    tampered = copy.deepcopy(release_record)
    tampered["stages"][6]["artifact_verified"] = False
    tampered_gate_results = evaluate_supply_chain_threat_model_gates(tampered, "run_supply_chain_threat_model_slice", clock.at(1.25))
    integrity_result = next(g for g in tampered_gate_results if g["gate_id"] == "supply_chain_threat_model_integrity")
    gate_layer_blocked = integrity_result["status"] == "FAIL" and "stages invalid" in integrity_result["evidence"][0]["reason"]
    if not gate_layer_blocked:
        raise InvariantViolation(
            f"SCTM_GATE_GUARD_DID_NOT_FIRE: supply_chain_threat_model_integrity did not flag the tampered de-verification "
            f"(status={integrity_result['status']}, evidence={integrity_result['evidence']})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "SupplyChainThreatModelInvariantVerified",
        {"considerations_guard_fired": considerations_guard_fired, "production_guard_fired": production_guard_fired, "gate_layer_blocked": gate_layer_blocked},
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
        "release_pipeline_record": release_record,
        "minimal_record": minimal_record,
        "gate_results": gate_results,
        "invariant_verification": {"considerations_guard_fired": considerations_guard_fired, "production_guard_fired": production_guard_fired, "gate_layer_blocked": gate_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_stride_slice.py)",
    }
    write_json(runtime / "results" / "supply_chain_threat_model_slice_result.json", result)
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
        result = run_supply_chain_threat_model_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["release_pipeline_record"]
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS security.supply_chain_threat_model: {len(record['stages'])} stages in order {[s['stage_id'] for s in record['stages']]}, gates [{gate_summary}], "
        f"invariant_verified(considerations={v['considerations_guard_fired']}, production={v['production_guard_fired']}, gate={v['gate_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
