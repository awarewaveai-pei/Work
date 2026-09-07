"""``security.abuse_case`` vertical slice -- the fifty-second Method Atlas slice (task-assigned ordinal),
NINTH of Atlas's own ten F20 table rows by table position. Four other F20 rows are being built
concurrently by separate agents this same session; this slice does not assert a relative build-order
among them.

Builds a REAL, CLOSED abuse case for `docs/architecture/SECURITY_THREAT_MODEL.md`'s own T1 threat
(Supply Chain 簽章金鑰 tampering), mitigated by `docs/adr/ADR-015-supply-chain-security-tooling
-selection.md`'s keyless-signing control and its own Rekor transparency-log detection mechanism -- not a
fabricated scenario. Then proves the core real invariant (Atlas's own chain names `controls` and
`detection` as two SEPARATE final elements -- every abuse_flow step needs BOTH, independently) at THREE
layers:

1. CONSTRUCTION layer, synthetic mutation: a control retargeted to a nonexistent step_id is refused; an
   abuse_flow step left with zero controls is refused; a step covered by a control but left with ZERO
   detection is refused (the invariant's own distinguishing half -- controls alone are not enough).
2. CONSTRUCTION layer, a SECOND real scenario: `SECURITY_THREAT_MODEL.md`'s own T2/E4/Uw1 threat
   (Untrusted Content prompt injection into AI tool-call decisions and Knowledge Memory) is modeled
   FAITHFULLY (not weakened to make a point) and is REFUSED -- Prioritized Threat List item 6 names this
   exact gap as still unsolved, and this slice's own invariant catches it for real.
3. Independent GATE layer: hand-tampering a copy of the valid T1 record's own detection coverage (so one
   step loses all its detection entries, leaving its control intact) must be caught by fresh
   re-derivation from raw fields, not by trusting the stored record.

Run::

    python -m ai_lego.apps.cli.run_abuse_case_slice
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
from ai_lego.modules.security.abuse_case import (
    METHOD_ID,
    all_gates_pass,
    evaluate_abuse_case_gates,
    generate_abuse_case_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-ABUSE-CASE-SYNTHETIC-001"
EXECUTION_ID = "EX-ABUSE-CASE-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-ABUSE-CASE-001"

S = {
    "abuse_case_record": "ai-lego://specs/cognitive/typed-objects/abuse-case-record.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}


def _narrative(stage_id: str, summary: str) -> dict[str, Any]:
    return {"stage_id": stage_id, "summary": summary}


def _flow(*steps: dict[str, Any]) -> dict[str, Any]:
    return {"stage_id": "abuse_flow", "steps": list(steps)}


def _controls(*entries: dict[str, Any]) -> dict[str, Any]:
    return {"stage_id": "controls", "controls": list(entries)}


def _detection(*entries: dict[str, Any]) -> dict[str, Any]:
    return {"stage_id": "detection", "detections": list(entries)}


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-abuse-case-slice"


def run_abuse_case_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A REAL, CLOSED abuse case for SECURITY_THREAT_MODEL.md's own T1 threat (Supply Chain 簽章金鑰),
    # mitigated by ADR-015's keyless signing control and its own named Rekor transparency-log detection.
    # Not fabricated -- see method contract's own description and ADR-015 Sub-decisions (b)/(c). ---
    supply_chain_stages = [
        _narrative("actor", "External attacker, or a compromised CI credential holder, able to interact with the CI/CD pipeline -- e.g. one who has phished or exfiltrated a long-lived signing key, or an insider with CI access (SECURITY_THREAT_MODEL.md T1, P1-GAP-SEC-2 / P1-RISK-SEC-4)."),
        _narrative("goal", "Get a malicious or unauthorized artifact accepted as 'Verified Deployment' by the pipeline's own signature gate, or obtain long-lived signing key material for reuse in a future forgery, without detection."),
        _flow(
            {"step_id": "STEP-1", "description": "Attacker attempts to obtain or exfiltrate a long-lived CI artifact-signing private key -- the classic supply-chain key-theft target SECURITY_THREAT_MODEL.md T1 names as P1-RISK-SEC-4."},
            {"step_id": "STEP-2", "description": "Attacker uses (or attempts to forge, absent a real key) a signature over a malicious artifact, presenting it to the deployment gate as 'Verified Deployment'."},
            {"step_id": "STEP-3", "description": "If the forged/stolen-key artifact passes the gate, it is deployed to production, achieving the actor's goal undetected."},
        ),
        _controls(
            {"control_id": "CTRL-001", "description": "ADR-015 Sub-decision (b): Sigstore/cosign KEYLESS signing via GitHub Artifact Attestations (OIDC short-lived credentials + Fulcio) -- no long-lived private key exists in the system to steal, structurally eliminating STEP-1's own attack surface rather than merely mitigating it.", "addresses_step_ids": ["STEP-1"]},
            {"control_id": "CTRL-002", "description": "ADR-015 Sub-decision (c): GitHub Artifact Attestations reach SLSA Build L2 by default on GitHub-hosted runners -- the deployment gate verifies a real Sigstore/cosign signature and its OIDC-issued Fulcio certificate before accepting an artifact as 'Verified Deployment', refusing a forged or unsigned artifact at STEP-2/STEP-3.", "addresses_step_ids": ["STEP-2", "STEP-3"]},
        ),
        _detection(
            {"detection_id": "DET-001", "description": "Sigstore keyless signing (ADR-015 Sub-decision (b)) requires a live OIDC-authenticated request against Fulcio at sign time and publishes the resulting signature event to Rekor, a public append-only transparency log -- named explicitly in SECURITY_THREAT_MODEL.md's own T1 row ('OIDC 短期憑證 + Fulcio + Rekor 透明日誌'). Because no static key file exists to steal silently (STEP-1), any real signing attempt is a live, audit-visible OIDC/Fulcio event; and any artifact reaching 'Verified Deployment' (STEP-2/STEP-3) without a matching Rekor entry is a detectable anomaly on transparency-log audit.", "addresses_step_ids": ["STEP-1", "STEP-2", "STEP-3"]},
        ),
    ]
    descriptor, supply_chain_record = catalog.invoke(
        METHOD_ID,
        generate_abuse_case_record,
        "ABUSE-2026-09-06-SC-001",
        "CI/CD Artifact Signing & Deployment Pipeline (Source→Signed Commit→CI→SBOM→Dependency Scan→Artifact Signing→Verified Deployment, Master Plan §66)",
        supply_chain_stages,
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
    )
    contracts.validate(S["abuse_case_record"], supply_chain_record, "T1 supply-chain abuse case record")
    if [s["stage_id"] for s in supply_chain_record["stages"]] != list(("actor", "goal", "abuse_flow", "controls", "detection")):
        raise InvariantViolation(f"ABUSE_EXPECTED_ATLAS_ORDER: got {[s['stage_id'] for s in supply_chain_record['stages']]!r}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "AbuseCaseRecordGenerated", {"abuse_case_record": supply_chain_record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_abuse_case_gates(supply_chain_record, "run_abuse_case_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"abuse_case gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"ABUSE_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "AbuseCaseGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- A minimal, low-stakes second record: a single step, single control, single detection. ---
    minimal_stages = [
        _narrative("actor", "A caller with valid but overly broad read credentials attempting to enumerate the entire reference dataset beyond legitimate need."),
        _narrative("goal", "Bulk-exfiltrate the full reference dataset via repeated legitimate-looking read calls."),
        _flow({"step_id": "STEP-1", "description": "Caller issues a high volume of sequential read requests covering the full ID space of the reference table."}),
        _controls({"control_id": "CTRL-001", "description": "Rate limiting on the read endpoint caps requests per credential per minute.", "addresses_step_ids": ["STEP-1"]}),
        _detection({"detection_id": "DET-001", "description": "Read-endpoint access logs are monitored for anomalous request-volume spikes per credential; a spike above the rate limit's own historical baseline triggers an alert.", "addresses_step_ids": ["STEP-1"]}),
    ]
    _, minimal_record = catalog.invoke(
        METHOD_ID,
        generate_abuse_case_record,
        "ABUSE-2026-09-06-MIN-001",
        "Internal read-only reference-data lookup service",
        minimal_stages,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["abuse_case_record"], minimal_record, "minimal abuse case record")

    # --- Prove the FORWARD referential invariant at the CONSTRUCTION layer: a control retargeted to a
    # step_id that does not exist in the abuse_flow must be refused, even though the control's own shape
    # is otherwise valid. ---
    dangling_ref_stages = copy.deepcopy(supply_chain_stages)
    dangling_ref_stages[3]["controls"][0]["addresses_step_ids"] = ["STEP-999"]
    dangling_ref_guard_fired = False
    try:
        generate_abuse_case_record("ABUSE-2026-09-06-002", "some-system", dangling_ref_stages, make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        dangling_ref_guard_fired = "ABUSE_INVALID_STAGES" in str(error)
    if not dangling_ref_guard_fired:
        raise InvariantViolation("ABUSE_DANGLING_REF_GUARD_DID_NOT_FIRE: a control referencing a nonexistent step_id was accepted (or a different guard fired instead)")

    # --- Prove the REVERSE control-coverage invariant: a new abuse_flow step with NO control addressing
    # it must be refused, even though every other step is fully covered. ---
    orphan_control_stages = copy.deepcopy(supply_chain_stages)
    orphan_control_stages[2]["steps"].append({"step_id": "STEP-4", "description": "A fourth step no control or detection entry below addresses."})
    orphan_control_guard_fired = False
    try:
        generate_abuse_case_record("ABUSE-2026-09-06-003", "some-system", orphan_control_stages, make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        orphan_control_guard_fired = "ABUSE_INVALID_STAGES" in str(error)
    if not orphan_control_guard_fired:
        raise InvariantViolation("ABUSE_ORPHAN_CONTROL_GUARD_DID_NOT_FIRE: an abuse_flow step with zero controls (and zero detection) was accepted")

    # --- Prove the DISTINGUISHING half of the core invariant: a step with a REAL control but ZERO
    # detection must STILL be refused -- controls alone are not enough, Atlas names detection as its own
    # separate chain element. Add STEP-4 with a control addressing it, but no detection does. ---
    control_only_stages = copy.deepcopy(supply_chain_stages)
    control_only_stages[2]["steps"].append({"step_id": "STEP-4", "description": "A fourth step with a control below, but no detection entry addresses it."})
    control_only_stages[3]["controls"].append({"control_id": "CTRL-003", "description": "A real control that addresses STEP-4.", "addresses_step_ids": ["STEP-4"]})
    control_only_guard_fired = False
    try:
        generate_abuse_case_record("ABUSE-2026-09-06-004", "some-system", control_only_stages, make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        control_only_guard_fired = "ABUSE_INVALID_STAGES" in str(error)
    if not control_only_guard_fired:
        raise InvariantViolation("ABUSE_CONTROL_ONLY_GUARD_DID_NOT_FIRE: a step with a control but zero detection was accepted -- the controls-vs-detection distinction is not real")
    # Confirm the SAME record legalizes once a matching detection entry is added (proves the guard checks
    # detection COVERAGE specifically, not merely rejecting any record with a fourth step).
    control_only_stages[4]["detections"].append({"detection_id": "DET-002", "description": "A real detection mechanism that addresses STEP-4.", "addresses_step_ids": ["STEP-4"]})
    _, four_step_record = catalog.invoke(
        METHOD_ID,
        generate_abuse_case_record,
        "ABUSE-2026-09-06-004",
        "some-system",
        control_only_stages,
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
    )
    contracts.validate(S["abuse_case_record"], four_step_record, "four-step record with matching detection added")

    # --- Prove the SECOND real due-diligence claim: SECURITY_THREAT_MODEL.md's own T2/E4/Uw1 threat
    # (prompt injection into AI tool-call decisions and Knowledge Memory), modeled FAITHFULLY, is REFUSED
    # by this SAME construction-time invariant -- not a synthetic mutation, a real, currently-open gap
    # (Prioritized Threat List item 6) this repository's own threat model already discloses. ---
    prompt_injection_stages = [
        _narrative("actor", "External attacker able to place content into any source EC §35 classifies UNTRUSTED DATA (PDF/Web/Email/Upload/Tool Output) that an AI agent will later read as part of its task, per SECURITY_THREAT_MODEL.md's TB-1 trust boundary and STRIDE T2/Elevation-of-Privilege E4."),
        _narrative("goal", "Manipulate the AI agent's tool-call decision into an unintended elevated action, and/or get the injected content written into Knowledge Memory so it persists across sessions as if it were a verified fact, per SECURITY_THREAT_MODEL.md STRIDE T2/E4 and LINDDUN Uw1."),
        _flow(
            {"step_id": "STEP-1", "description": "Attacker crafts untrusted content (e.g. a PDF/web page/email the agent is asked to summarize or act on) embedding instructions disguised as data, exploiting the fact that EC §35's 'Policy/System Instructions != Retrieved Source Data' principle has no landed untrusted-span-marking mechanism (SECURITY_THREAT_MODEL.md T2 Residual Risk: '無落地機制：無 untrusted span 標記方案')."},
            {"step_id": "STEP-2", "description": "Agent retrieves and processes the untrusted content across TB-1; the injected instruction manipulates the agent's own tool-call decision into an action the legitimate task never authorized (STRIDE T2/E4 Elevation of Privilege)."},
            {"step_id": "STEP-3", "description": "The manipulated output (or the injected claim itself) is written into Knowledge Memory as if it were a verified fact, persisting the poisoned content across future sessions with no marker that it originated from an attacker rather than a validated source (LINDDUN Uw1)."},
        ),
        _controls(
            {"control_id": "CTRL-001", "description": "EC §35's structural principle -- Policy/System Instructions are architecturally distinct from Retrieved Source Data (SECURITY_THREAT_MODEL.md T2 Mitigation: 'EC§35 已定義結構原則...良好結構控制') -- addresses STEP-1 by design intent, though SECURITY_THREAT_MODEL.md's own Residual Risk column discloses this principle has no landed enforcement mechanism yet.", "addresses_step_ids": ["STEP-1"]},
        ),
        _detection(
            # Deliberately absent for STEP-2/STEP-3 -- SECURITY_THREAT_MODEL.md's own T2 Residual Risk
            # column discloses no landed detection mechanism exists. A detection entry is still required
            # by the schema's own minItems:1, so this models the honest state as "detection exists in
            # name only, addressing none of the steps that actually need it" rather than omitting the
            # stage outright (which the schema would reject at the shape level, not the coverage level).
            {"detection_id": "DET-001", "description": "PLACEHOLDER ONLY -- SECURITY_THREAT_MODEL.md's own T2 Residual Risk column explicitly discloses NO landed untrusted-span-marking or Knowledge-Memory-provenance detection mechanism exists yet (Prioritized Threat List item 6: 須在記憶子系統 ingestion pipeline 設計前解決). This entry intentionally addresses only STEP-1's own EC §35 principle-level awareness, leaving STEP-2/STEP-3 undetected, to model the real gap faithfully rather than inventing a mechanism that does not exist.", "addresses_step_ids": ["STEP-1"]},
        ),
    ]
    prompt_injection_refused = False
    prompt_injection_error_message = ""
    try:
        generate_abuse_case_record("ABUSE-2026-09-06-PI-001", "AI Agent ingestion of Untrusted External Content (TB-1) into tool-call decisions and Knowledge Memory writes", prompt_injection_stages, make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        prompt_injection_error_message = str(error)
        prompt_injection_refused = "ABUSE_INVALID_STAGES" in prompt_injection_error_message
    if not prompt_injection_refused:
        raise InvariantViolation(
            "ABUSE_REAL_GAP_NOT_CAUGHT: the T2/E4/Uw1 prompt-injection scenario, modeled faithfully from SECURITY_THREAT_MODEL.md's own disclosed "
            "still-open gap, was ACCEPTED -- this invariant is supposed to catch exactly this real, disclosed absence of a landed detection mechanism"
        )

    # --- Prove the SAME "re-derived, not trusted" discipline at the independent GATE layer: take a COPY
    # of the real, valid T1 supply-chain record, hand-tamper its OWN detection stage to drop coverage of
    # STEP-2/STEP-3 (leaving their controls untouched), pinned to the SPECIFIC abuse_case_integrity gate.
    # ---
    tampered = copy.deepcopy(supply_chain_record)
    tampered["stages"][4]["detections"][0]["addresses_step_ids"] = ["STEP-1"]
    tampered_gate_results = evaluate_abuse_case_gates(tampered, "run_abuse_case_slice", clock.at(1.3))
    integrity_result = next(g for g in tampered_gate_results if g["gate_id"] == "abuse_case_integrity")
    gate_layer_blocked = integrity_result["status"] == "FAIL" and "stages invalid" in integrity_result["evidence"][0]["reason"]
    if not gate_layer_blocked:
        raise InvariantViolation(
            f"ABUSE_GATE_GUARD_DID_NOT_FIRE: abuse_case_integrity did not flag the tampered detection-coverage gap "
            f"(status={integrity_result['status']}, evidence={integrity_result['evidence']})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "AbuseCaseInvariantVerified",
        {
            "dangling_ref_guard_fired": dangling_ref_guard_fired,
            "orphan_control_guard_fired": orphan_control_guard_fired,
            "control_only_guard_fired": control_only_guard_fired,
            "prompt_injection_refused": prompt_injection_refused,
            "gate_layer_blocked": gate_layer_blocked,
        },
        1.4,
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
        "supply_chain_abuse_case_record": supply_chain_record,
        "minimal_abuse_case_record": minimal_record,
        "gate_results": gate_results,
        "invariant_verification": {
            "dangling_ref_guard_fired": dangling_ref_guard_fired,
            "orphan_control_guard_fired": orphan_control_guard_fired,
            "control_only_guard_fired": control_only_guard_fired,
            "prompt_injection_refused": prompt_injection_refused,
            "prompt_injection_refusal_message": prompt_injection_error_message,
            "gate_layer_blocked": gate_layer_blocked,
        },
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_stride_slice.py)",
    }
    write_json(runtime / "results" / "abuse_case_slice_result.json", result)
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
        result = run_abuse_case_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["supply_chain_abuse_case_record"]
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS security.abuse_case: {len(record['stages'])} stages in order {[s['stage_id'] for s in record['stages']]}, gates [{gate_summary}], "
        f"invariant_verified(dangling_ref={v['dangling_ref_guard_fired']}, orphan_control={v['orphan_control_guard_fired']}, "
        f"control_only={v['control_only_guard_fired']}, gate={v['gate_layer_blocked']}), "
        f"real_gap_caught(T2/E4/Uw1 prompt-injection scenario refused={v['prompt_injection_refused']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
