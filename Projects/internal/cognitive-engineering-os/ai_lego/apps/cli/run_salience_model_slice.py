"""``stakeholders.salience_model`` vertical slice -- F07 stakeholder/power/negotiation family, one of 10
concurrent members opened in the same parallel batch.

Scenario: a loyal-customer community stakeholder with real social legitimacy (a formal paid-membership
contract) but no formal power and no time-sensitive claim yet -- same synthetic style every sibling slice's CLI
demo uses (dimension_count=1, salience_class=LEGITIMACY_ONLY, deliberately chosen so Step 4's hand-tamper can
demonstrate the module's bool-is-int-subclass trap guard: a tampered ``dimension_count: True`` would silently
equal the real recomputed ``1`` under a naive ``==`` check, but the independent gate's type-aware
``_is_valid_dimension_count`` rejects it anyway). Builds a real, well-formed ``SalienceAssessment`` satisfying
every real invariant, then demonstrates 2 invariants as construction-time REFUSALS (a dimension checked
``present=True`` with no justification -- 不能只打勾沒證據; an empty ``stakeholder_name``), proving neither is
toothless. A final step hand-tampers a VALID record's ``dimension_count`` directly (bypassing the builder) to
prove the independent gate -- not just the builder, and not a naive int check -- catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_salience_model_slice
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
from ai_lego.modules.stakeholders.salience_model import (
    METHOD_ID,
    all_gates_pass,
    evaluate_salience_gates,
    generate_salience_assessment,
    salience_dimension,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-SALIENCE-SYNTHETIC-001"
EXECUTION_ID = "EX-SALIENCE-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-SALIENCE-001"

S = {
    "salience_assessment": "ai-lego://specs/cognitive/typed-objects/salience-model.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-salience-model-slice"


def _well_formed_statement_kwargs() -> dict[str, Any]:
    return {
        "stakeholder_name": "資深忠誠客戶社群（付費會員制意見領袖）",
        "power": salience_dimension(False),
        "legitimacy": salience_dimension(True, "簽有正式付費會員合約，社群意見在既有治理流程中被正式採納為產品回饋來源"),
        "urgency": salience_dimension(False),
        "provenance": make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
    }


def run_salience_model_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. stakeholders.salience_model resolves because
    # its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice
    # uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed assessment -- every real invariant satisfied, invoked through the
    # catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, statement = catalog.invoke(
        METHOD_ID,
        generate_salience_assessment,
        "SALNCE-2026-09-11-001",
        **_well_formed_statement_kwargs(),
    )
    contracts.validate(S["salience_assessment"], statement, "salience assessment")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SalienceAssessmentGenerated", {"statement": statement, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_salience_gates(statement, "run_salience_model_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"stakeholders.salience_model gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("SALIENCE_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof "不能只打勾沒證據" is not toothless -- a dimension checked present=True with NO
    # justification MUST be refused before any record is constructed. Hand-builds the dict directly (bypasses
    # salience_dimension, which would itself refuse it) so the PROOF exercises generate_salience_assessment's
    # own independent re-validation, not just the convenience constructor. ---
    missing_justification_kwargs = {**_well_formed_statement_kwargs(), "power": {"present": True, "justification": None}}
    missing_justification_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_salience_assessment("SALNCE-MISSING-JUSTIFICATION-REFUSED-001", **missing_justification_kwargs)
    except InvariantViolation as error:
        if "SALIENCE_INVALID_POWER" not in str(error):
            raise
        missing_justification_refusal_proof["raised"] = True
        missing_justification_refusal_proof["error_code"] = "SALIENCE_INVALID_POWER"
    if not missing_justification_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("SALIENCE_INVARIANT_NOT_ENFORCED: a present=True dimension with no justification was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "MissingJustificationRefused", {"refusal_proof": missing_justification_refusal_proof}, 1.3)
    milestones.append("MISSING_JUSTIFICATION_REFUSAL_PROVEN")

    # --- Step 3: proof stakeholder_name is not toothless -- an empty stakeholder_name MUST be refused before
    # any record is constructed. ---
    empty_name_kwargs = {**_well_formed_statement_kwargs(), "stakeholder_name": "   "}
    empty_name_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_salience_assessment("SALNCE-EMPTY-NAME-REFUSED-001", **empty_name_kwargs)
    except InvariantViolation as error:
        if "SALIENCE_EMPTY_STAKEHOLDER_NAME" not in str(error):
            raise
        empty_name_refusal_proof["raised"] = True
        empty_name_refusal_proof["error_code"] = "SALIENCE_EMPTY_STAKEHOLDER_NAME"
    if not empty_name_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("SALIENCE_INVARIANT_NOT_ENFORCED: an empty stakeholder_name was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyStakeholderNameRefused", {"refusal_proof": empty_name_refusal_proof}, 1.5)
    milestones.append("EMPTY_STAKEHOLDER_NAME_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof, specifically exercising the module's bool-is-int-subclass trap guard --
    # the VALID record's own dimension_count is REALLY the int 1 (only legitimacy present); splicing in the
    # bool True (which naively == 1) directly into a copy of the VALID record's own raw dict (bypassing the
    # builder) proves the INDEPENDENT gate's type-aware check, not a naive `==`/`isinstance(int)` check, is
    # what actually catches it. ---
    tampered = dict(statement)
    assert tampered["dimension_count"] == 1, "well-formed slice statement must have exactly 1 dimension present for this trap demonstration to be meaningful"
    tampered["dimension_count"] = True  # bool, not the real int 1 -- bypasses the builder directly
    tampered_gate = evaluate_salience_gates(tampered, "run_salience_model_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("SALIENCE_GATE_NOT_INDEPENDENT: the independent content-integrity gate did NOT catch a hand-tampered bool dimension_count (bool-is-int-subclass trap)")
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
        "statement": statement,
        "gate_results": gate_results,
        "missing_justification_refusal_proof": missing_justification_refusal_proof,
        "empty_name_refusal_proof": empty_name_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_bcg_matrix_slice.py)",
    }
    write_json(runtime / "results" / "salience_model_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_salience_model_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS stakeholders.salience_model: SalienceAssessment {result['statement']['id']} built "
        f"(dimension_count={result['statement']['dimension_count']}, salience_class={result['statement']['salience_class']}), gates [{gate_summary}]; "
        f"SALIENCE_INVALID_POWER/SALIENCE_EMPTY_STAKEHOLDER_NAME invariants each REFUSED a malformed attempt "
        f"({result['missing_justification_refusal_proof']['error_code']}, {result['empty_name_refusal_proof']['error_code']}); "
        f"hand-tampered bool dimension_count caught via the INDEPENDENT gate's type-aware check (not the builder, not a naive == check)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
