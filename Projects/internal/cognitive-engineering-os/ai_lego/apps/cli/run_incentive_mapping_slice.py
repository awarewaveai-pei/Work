"""``stakeholders.incentive_mapping`` vertical slice -- F07 stakeholder/power/negotiation family, one of 10
concurrent members opened in this same batch (see ``run_empathy_map_slice.py`` for the CLI-demo structure,
reused here, and ``insight/contextual_inquiry.py`` for the per-entry-completeness convention this method's
own gate borrows).

Scenario: an incentive map for a vendor-selection decision with two stakeholders -- same synthetic style
every sibling slice's CLI demo uses. Builds a real, well-formed ``IncentiveMap`` with 2 complete cards, then
demonstrates each of the 2 real invariants once as a construction-time REFUSAL (an empty incentive_cards
list; a card missing the ``risks`` field), proving neither is toothless, same "show a real refusal, not only
a real success" discipline every sibling slice's CLI demo already establishes. A final step hand-tampers a
VALID record directly (bypassing the builder) to prove the independent gate, not just the builder, catches
the same defect.

Run::

    python -m ai_lego.apps.cli.run_incentive_mapping_slice
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
from ai_lego.modules.stakeholders.incentive_mapping import (
    METHOD_ID,
    all_gates_pass,
    card,
    evaluate_incentive_mapping_gates,
    generate_incentive_map,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-INCENTIVEMAPPING-SYNTHETIC-001"
EXECUTION_ID = "EX-INCENTIVEMAPPING-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-INCENTIVEMAPPING-001"

S = {
    "incentive_map": "ai-lego://specs/cognitive/typed-objects/incentive-mapping.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-incentive-mapping-slice"


def _well_formed_cards() -> list[dict[str, Any]]:
    return [
        card(
            "採購部主管",
            "在預算內完成年度供應商汰換，避免流程中斷",
            "年度考核看的是成本降幅，換供應商省下的差額直接算他的績效",
            "IT 部門要求新供應商必須通過資安稽核，時程只有 6 週",
            "若新供應商上線出包，第一個被究責的是他，不是提案的人",
        ),
        card(
            "IT 資安主管",
            "確保任何新系統上線前完成資安稽核，不留下未過稽核的例外",
            "資安事故發生時他要負責，穩健比速度更符合他的利益",
            "稽核團隊人手有限，6 週內只能排一次完整稽核",
            "若為了配合時程跳過稽核步驟，未來出事會直接指向他簽核放行",
        ),
    ]


def run_incentive_mapping_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. stakeholders.incentive_mapping resolves
    # because its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every
    # sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed incentive map -- both real invariants satisfied (2 cards, each
    # carrying all 5 required fields), invoked through the catalog's own per-invocation gate (ADR-023
    # Consequences 5's pattern, unchanged). ---
    descriptor, incentive_map = catalog.invoke(
        METHOD_ID,
        generate_incentive_map,
        "INCMAP-2026-09-11-001",
        _well_formed_cards(),
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
    )
    contracts.validate(S["incentive_map"], incentive_map, "incentive map")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "IncentiveMapGenerated", {"incentive_map": incentive_map, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_incentive_mapping_gates(incentive_map, "run_incentive_mapping_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"stakeholders.incentive_mapping gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("INCMAP_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 1 (non-empty incentive_cards) is not toothless -- an empty list MUST be
    # refused before any record is constructed. ---
    empty_cards_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_incentive_map("INCMAP-EMPTYCARDS-REFUSED-001", [], make_provenance("EVIDENCE", "HUMAN_APPROVED"))
    except InvariantViolation as error:
        if "INCMAP_EMPTY_CARDS" not in str(error):
            raise
        empty_cards_refusal_proof["raised"] = True
        empty_cards_refusal_proof["error_code"] = "INCMAP_EMPTY_CARDS"
    if not empty_cards_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("INCMAP_INVARIANT_NOT_ENFORCED: an empty incentive_cards list was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyCardsRefused", {"refusal_proof": empty_cards_refusal_proof}, 1.3)
    milestones.append("EMPTY_CARDS_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 2 (per-card 5-field completeness) is not toothless -- a card missing
    # `risks` MUST be refused. card() itself validates all 5 fields, so the defect is constructed directly as
    # a raw dict to exercise generate_incentive_map's own check. ---
    incomplete_cards = _well_formed_cards()
    incomplete_cards[0] = {**incomplete_cards[0], "risks": ""}
    incomplete_card_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_incentive_map("INCMAP-INCOMPLETECARD-REFUSED-001", incomplete_cards, make_provenance("EVIDENCE", "HUMAN_APPROVED"))
    except InvariantViolation as error:
        if "INCMAP_INCOMPLETE_CARD" not in str(error):
            raise
        incomplete_card_refusal_proof["raised"] = True
        incomplete_card_refusal_proof["error_code"] = "INCMAP_INCOMPLETE_CARD"
    if not incomplete_card_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("INCMAP_INVARIANT_NOT_ENFORCED: a card with an empty 'risks' field was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "IncompleteCardRefused", {"refusal_proof": incomplete_card_refusal_proof}, 1.5)
    milestones.append("INCOMPLETE_CARD_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses
    # the builder entirely (blanks out one card's own `constraints` field on a raw copy of an already-valid
    # record). ---
    tampered = dict(incentive_map)
    tampered["incentive_cards"] = [dict(entry) for entry in incentive_map["incentive_cards"]]
    tampered["incentive_cards"][0]["constraints"] = ""  # bypasses the builder directly
    tampered_gate = evaluate_incentive_mapping_gates(tampered, "run_incentive_mapping_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("INCMAP_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered incomplete card")
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
        "incentive_map": incentive_map,
        "gate_results": gate_results,
        "empty_cards_refusal_proof": empty_cards_refusal_proof,
        "incomplete_card_refusal_proof": incomplete_card_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_empathy_map_slice.py)",
    }
    write_json(runtime / "results" / "incentive_mapping_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_incentive_mapping_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS stakeholders.incentive_mapping: IncentiveMap {result['incentive_map']['id']} built with "
        f"{len(result['incentive_map']['incentive_cards'])} complete stakeholder cards, gates [{gate_summary}]; "
        f"INCMAP_EMPTY_CARDS/INCMAP_INCOMPLETE_CARD invariants each REFUSED a malformed attempt "
        f"({result['empty_cards_refusal_proof']['error_code']}, {result['incomplete_card_refusal_proof']['error_code']}); "
        f"hand-tampered incomplete card caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
