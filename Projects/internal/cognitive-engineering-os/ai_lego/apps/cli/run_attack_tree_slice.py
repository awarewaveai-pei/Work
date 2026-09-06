"""``security.attack_tree`` vertical slice -- the forty-sixth Method Atlas slice, THIRD member of the
`security` family (F20), the FIRST to structurally diverge from `run_stride_slice.py`/`run_linddun_slice.py`
(a recursive AND/OR tree, not a flat DFD-referencing threats[] list) and the first F20 `genuine_compute`
slice.

Builds Atlas's own §12.38 worked example (a customer-records-database
attack tree: OR of steal-credentials / exploit-vuln / get-backup, steal-
credentials itself OR-decomposed into Phishing/Credential Stuffing), and
a minimal single-leaf tree. Then proves the tree-shape invariant is real
at the CONSTRUCTION layer (a node mixing leaf and internal keys must be
refused), and the "re-derived, not trusted" discipline at the
independent GATE layer (hand-tampering a copy's own `root_aggregate` to
a value that disagrees with real bottom-up recomputation must be
caught).

Run::

    python -m ai_lego.apps.cli.run_attack_tree_slice
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
from ai_lego.modules.security.attack_tree import (
    METHOD_ID,
    all_gates_pass,
    evaluate_attack_tree_gates,
    generate_attack_tree_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-ATTACKTREE-SYNTHETIC-001"
EXECUTION_ID = "EX-ATTACKTREE-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-ATTACKTREE-001"

S = {
    "attack_tree_record": "ai-lego://specs/cognitive/typed-objects/attack-tree-record.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}


def _leaf(name: str, cost: float, skill: str, detectability: str, control: str, residual_risk: str, test_evidence: str) -> dict[str, Any]:
    return {"name": name, "cost": cost, "skill": skill, "detectability": detectability, "control": control, "residual_risk": residual_risk, "test_evidence": test_evidence}


def _internal(name: str, node_type: str, children: list[dict[str, Any]]) -> dict[str, Any]:
    return {"name": name, "node_type": node_type, "children": children}


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-attack-tree-slice"


def run_attack_tree_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Atlas's own §12.38 worked example: OR(steal-credentials, exploit-vuln, get-backup),
    # steal-credentials itself OR(Phishing, Credential Stuffing). Real cheapest-path expectation: Credential
    # Stuffing (cost=50) beats Phishing (cost=200) beats exploit-vuln (cost=5000) beats get-backup (cost=100)
    # -- OR takes the min, so root_aggregate.cost must be 50 (Credential Stuffing), not merely "any minimum". ---
    root = _internal(
        "取得敏感資料",
        "OR",
        [
            _internal(
                "竊取帳密",
                "OR",
                [
                    _leaf("Phishing", 200, "low", "medium", "Mandatory phishing-simulation training + email banner for external senders.", "Medium -- training reduces but does not eliminate click-through.", "Quarterly phishing simulation campaign results, 2026-08."),
                    _leaf("Credential Stuffing", 50, "low", "low", "MFA required for all VPN logins.", "Low -- MFA blocks reuse of stolen credentials alone.", "Pen test confirmed MFA enforcement, 2026-07."),
                ],
            ),
            _internal("利用漏洞", "OR", [_leaf("RCE", 5000, "high", "high", "WAF + quarterly dependency scanning.", "Low -- no known unpatched RCE as of last scan.", "Dependency scan report, 2026-08-15.")]),
            _internal("取得備份", "OR", [_leaf("Misconfigured Storage", 100, "medium", "low", "Backup bucket access restricted to CI role, public access blocked by policy.", "Low -- policy enforced, verified by automated drift check.", "Cloud storage policy audit, 2026-09-01.")]),
        ],
    )
    descriptor, customer_records_record = catalog.invoke(
        METHOD_ID,
        generate_attack_tree_record,
        "ATTACKTREE-2026-09-06-001",
        "customer records database",
        ["customer PII records"],
        [],
        ["employee VPN", "public support portal"],
        root,
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
    )
    contracts.validate(S["attack_tree_record"], customer_records_record, "customer-records-database attack tree record")
    expected_aggregate = {"cost": 50, "skill": "low", "detectability": "low"}
    if customer_records_record["root_aggregate"] != expected_aggregate:
        raise InvariantViolation(f"ATTACKTREE_EXPECTED_CHEAPEST_PATH: got {customer_records_record['root_aggregate']!r}, expected {expected_aggregate!r} (Credential Stuffing is the real cheapest/stealthiest path)")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "AttackTreeRecordGenerated", {"attack_tree_record": customer_records_record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_attack_tree_gates(customer_records_record, "run_attack_tree_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"attack tree gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"ATTACKTREE_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "AttackTreeGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- A minimal single-leaf tree. ---
    _, reference_record = catalog.invoke(
        METHOD_ID,
        generate_attack_tree_record,
        "ATTACKTREE-2026-09-06-002",
        "internal-reference lookup service",
        ["country-code reference table"],
        [],
        [],
        _leaf("read reference table", 10, "low", "low", "Read-only role, no write path exists.", "Low -- data is non-sensitive reference data.", "Access review, 2026-09-01."),
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["attack_tree_record"], reference_record, "internal-reference attack tree record")
    if reference_record["root_aggregate"] != {"cost": 10, "skill": "low", "detectability": "low"}:
        raise InvariantViolation(f"ATTACKTREE_EXPECTED_LEAF_AGGREGATE: got {reference_record['root_aggregate']!r}")

    # --- Prove the tree-shape invariant is real, at the CONSTRUCTION layer: a node mixing leaf keys
    # (cost/skill/...) with internal keys (children) must be refused. ---
    construction_layer_blocked = False
    try:
        generate_attack_tree_record(
            "ATTACKTREE-2026-09-06-003",
            "some-system",
            ["some-asset"],
            [],
            [],
            {"name": "malformed", "node_type": "OR", "children": [_leaf("a", 1, "low", "low", "c", "r", "t")], "cost": 1},
            make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
        )
    except InvariantViolation as error:
        construction_layer_blocked = "ATTACKTREE_INVALID_ROOT" in str(error)
    if not construction_layer_blocked:
        raise InvariantViolation("ATTACKTREE_INVARIANT_GUARD_DID_NOT_FIRE: a node mixing leaf and internal keys was accepted (or a different guard fired instead)")

    # --- Prove the SAME "re-derived, not trusted" discipline at the independent GATE layer: take a COPY of
    # the real, valid customer-records record and hand-tamper its own root_aggregate to a value that
    # disagrees with real recomputation, leaving the raw tree UNTOUCHED. Pinned to the SPECIFIC
    # attack_tree_integrity gate and its own evidence. ---
    tampered = copy.deepcopy(customer_records_record)
    tampered["root_aggregate"] = {"cost": 999999, "skill": "high", "detectability": "high"}
    tampered_gate_results = evaluate_attack_tree_gates(tampered, "run_attack_tree_slice", clock.at(1.25))
    integrity_result = next(g for g in tampered_gate_results if g["gate_id"] == "attack_tree_integrity")
    gate_layer_blocked = integrity_result["status"] == "FAIL" and integrity_result["evidence"][0]["reason"] == "stored root_aggregate disagrees with recomputation"
    if not gate_layer_blocked:
        raise InvariantViolation(
            f"ATTACKTREE_GATE_GUARD_DID_NOT_FIRE: attack_tree_integrity did not flag the falsely-tampered root_aggregate "
            f"(status={integrity_result['status']}, evidence={integrity_result['evidence']})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "AttackTreeInvariantVerified",
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
        "customer_records_attack_tree_record": customer_records_record,
        "reference_attack_tree_record": reference_record,
        "gate_results": gate_results,
        "invariant_verification": {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_stride_slice.py)",
    }
    write_json(runtime / "results" / "attack_tree_slice_result.json", result)
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
        result = run_attack_tree_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["customer_records_attack_tree_record"]
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS security.attack_tree: root_aggregate={record['root_aggregate']}, gates [{gate_summary}], "
        f"invariant_verified(construction={v['construction_layer_blocked']}, gate={v['gate_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
