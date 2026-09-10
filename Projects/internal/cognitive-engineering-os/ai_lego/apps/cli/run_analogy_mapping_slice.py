"""``association.analogy_mapping`` vertical slice -- Method Atlas slice for the F04 associative-mapping
family's 6th and LAST member (F04 table row L416, the ONLY Atlas citation). See
``ai_lego.modules.association.analogy_mapping``'s own module docstring for the full due-diligence read (zero
pre-existing implementation, no dedicated §11.x section, no §22.3/EC §32 row, 3-way disambiguation against
Synectics/Historical Analogy/Cross-industry Transfer).

Self-referential scenario, same class ``run_attribute_listing_slice.py``/``run_morphological_analysis_slice.py``
already establish (the demo IS a real thing observed during this build, not an invented business narrative):
mapping a real external mechanism (double-entry bookkeeping's two-independent-ledgers reconciliation) onto the
real architectural problem this whole method-slice suite actually solves (how a hand-tampered record that
bypasses the builder entirely still gets caught) -- the abstracted mechanism this record names is the literal
"construction-time check AND independent gate re-derivation, never trusting the stored value" discipline every
sibling module in this suite, including this one, already implements.

Demonstrates the real invariant at BOTH layers, across all 3 pairwise checks:

1. ``ANALOGYMAPPING_MECHANISM_ECHOES_SOURCE``: an abstracted_mechanism that merely echoes source_domain_description
   (case/whitespace-insensitive) is refused at CONSTRUCTION.
2. ``ANALOGYMAPPING_MAPPING_ECHOES_MECHANISM``: a target_mapping that merely echoes abstracted_mechanism is
   refused at CONSTRUCTION.
3. The 3rd pair, re-derived independently: a hand-tampered COPY of a valid record, with target_mapping
   overwritten to echo source_domain_description instead, bypasses the builder entirely -- the independent
   gate must catch it (``MAPPING_ECHOES_SOURCE``) by re-deriving pairwise distinctness itself, never trusting
   the stored value.

Run::

    python -m ai_lego.apps.cli.run_analogy_mapping_slice
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
from ai_lego.core.domain.evidence import evidence_record
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.core.domain.tenant import CASCADIA
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.association.analogy_mapping import (
    METHOD_ID,
    all_gates_pass,
    evaluate_analogy_mapping_gates,
    generate_analogy_mapping_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-ANALOGYMAPPING-SYNTHETIC-001"
EXECUTION_ID = "EX-ANALOGYMAPPING-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-ANALOGYMAPPING-001"

S = {
    "evidence": "ai-lego://specs/evidence/evidence.schema.yaml",
    "analogy_mapping_record": "ai-lego://specs/cognitive/typed-objects/analogy-mapping-record.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}

TARGET_PROBLEM = "如何確保這整批方法切片模組裡，被 builder 建構前檢查過的核心不變量，不會被繞過 builder、直接竄改 raw dict 的呼叫者躲過"
SOURCE_DOMAIN_DESCRIPTION = "複式簿記（double-entry bookkeeping）：每筆交易必須同時記在借方帳本與貸方帳本兩個獨立位置，兩邊金額必須互相核對；只竄改其中一本帳而不動另一本，核對時立刻兜不攏"
ABSTRACTED_MECHANISM = "關鍵不變量不能只靠單一路徑寫入後就信任——要求兩個獨立推導的結果互相核對（reconciliation），任何只改動其中一條路徑的竄改都會在核對時被抓到，因為另一條路徑是獨立重新計算，不是複製前者的結果"
TARGET_MAPPING = "這批方法模組都在 builder 端於建構前檢查不變量，AND 由獨立的 gate 端從 record 的 raw 欄位重新推導同一組不變量；gate 從不呼叫 builder，也不信任已存的值——一筆繞過 builder、直接竄改 raw dict 的記錄，會在 gate 重新推導時被抓到，同一份「兩條獨立路徑互相核對」的複式簿記邏輯"


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-analogy-mapping-slice"


def run_analogy_mapping_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. association.analogy_mapping resolves
    # because its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every
    # sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: evidence the source domain claim cites -- a real, independently verifiable fact about
    # double-entry bookkeeping's own reconciliation mechanism. ---
    source_evidence = evidence_record(
        "E-981", "double-entry bookkeeping requires every transaction posted to two independent ledgers (debit + credit) that must reconcile -- a well-established accounting control, not this suite's own invention", "general accounting practice, cited as the source_domain_description's own grounding fact", make_provenance("EVIDENCE", "HUMAN_APPROVED")
    )
    contracts.validate(S["evidence"], source_evidence, "evidence E-981")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "EvidenceRecorded", {"evidence": [source_evidence]}, 1)

    # --- Step 2: the complete, well-formed record -- 3 pairwise-distinct stages, self-referentially
    # describing this same method suite's own two-layer invariant discipline. ---
    record = generate_analogy_mapping_record(
        "ANALOGY-2026-09-10-001",
        TARGET_PROBLEM,
        SOURCE_DOMAIN_DESCRIPTION,
        ABSTRACTED_MECHANISM,
        TARGET_MAPPING,
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        supporting_evidence_refs=["E-981"],
        informs_historical_analogy_ref="HISTANALOGY-2026-09-10-001",
    )
    contracts.validate(S["analogy_mapping_record"], record, "analogy mapping record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "AnalogyMappingRecordGenerated", {"record": record}, 1.5)
    milestones.append("RECORD_BUILT")

    gate_results = evaluate_analogy_mapping_gates(record, "run_analogy_mapping_slice", clock.at(1.6))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"analogy_mapping gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("ANALOGYMAPPING_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 3: proof pair #1 (mechanism vs source) is not toothless -- an abstracted_mechanism that merely
    # echoes source_domain_description (case/whitespace-insensitive) MUST be refused before any record is
    # constructed ("抽象機制" requires real abstraction work, not a copy). ---
    mechanism_echo_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_analogy_mapping_record(
            "ANALOGY-ECHO-MECHANISM-001",
            TARGET_PROBLEM,
            SOURCE_DOMAIN_DESCRIPTION,
            f"  {SOURCE_DOMAIN_DESCRIPTION}  ",  # whitespace-padded echo of source_domain_description
            TARGET_MAPPING,
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "ANALOGYMAPPING_MECHANISM_ECHOES_SOURCE" not in str(error):
            raise
        mechanism_echo_proof["raised"] = True
        mechanism_echo_proof["error_code"] = "ANALOGYMAPPING_MECHANISM_ECHOES_SOURCE"
    if not mechanism_echo_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("ANALOGYMAPPING_INVARIANT_NOT_ENFORCED: an abstracted_mechanism echoing source_domain_description was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MechanismEchoRefused", {"mechanism_echo_proof": mechanism_echo_proof}, 1.7)
    milestones.append("MECHANISM_ECHO_REFUSAL_PROVEN")

    # --- Step 4: proof pair #2 (mapping vs mechanism) is not toothless -- a target_mapping that merely echoes
    # abstracted_mechanism MUST be refused before any record is constructed. ---
    mapping_echoes_mechanism_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_analogy_mapping_record(
            "ANALOGY-ECHO-MAPPING-001",
            TARGET_PROBLEM,
            SOURCE_DOMAIN_DESCRIPTION,
            ABSTRACTED_MECHANISM,
            f"  {ABSTRACTED_MECHANISM}  ",  # whitespace-padded echo of abstracted_mechanism
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "ANALOGYMAPPING_MAPPING_ECHOES_MECHANISM" not in str(error):
            raise
        mapping_echoes_mechanism_proof["raised"] = True
        mapping_echoes_mechanism_proof["error_code"] = "ANALOGYMAPPING_MAPPING_ECHOES_MECHANISM"
    if not mapping_echoes_mechanism_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("ANALOGYMAPPING_INVARIANT_NOT_ENFORCED: a target_mapping echoing abstracted_mechanism was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MappingEchoesMechanismRefused", {"mapping_echoes_mechanism_proof": mapping_echoes_mechanism_proof}, 1.9)
    milestones.append("MAPPING_ECHOES_MECHANISM_REFUSAL_PROVEN")

    # --- Step 5: hand-tampering proof -- the INDEPENDENT gate catches pair #3 (mapping vs source) even when a
    # caller bypasses the builder entirely and hand-edits a valid record's own target_mapping. ---
    tampered = copy.deepcopy(record)
    tampered["target_mapping"] = tampered["source_domain_description"]  # bypasses the builder's own check directly on a raw copy
    tampered_gate = evaluate_analogy_mapping_gates(tampered, "run_analogy_mapping_slice", clock.at(2.1))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("ANALOGYMAPPING_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered target_mapping echoing source_domain_description")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_results": tampered_gate}, 2.2)
    ledger.close_aggregate(AGGREGATE_ID)
    milestones.append("VERIFYING")

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_id": METHOD_ID,
        "method_resolution": resolution,
        "record": record,
        "gate_results": gate_results,
        "mechanism_echo_proof": mechanism_echo_proof,
        "mapping_echoes_mechanism_proof": mapping_echoes_mechanism_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_attribute_listing_slice.py)",
    }
    write_json(runtime / "results" / "analogy_mapping_slice_result.json", result)
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
        result = run_analogy_mapping_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(
        f"PASS association.analogy_mapping: AnalogyMappingRecord {result['record']['id']} built, "
        f"{len(result['gate_results'])} gates all PASS; "
        f"MECHANISM_ECHOES_SOURCE invariant REFUSED a malformed attempt ({result['mechanism_echo_proof']['error_code']}); "
        f"MAPPING_ECHOES_MECHANISM invariant REFUSED a malformed attempt ({result['mapping_echoes_mechanism_proof']['error_code']}); "
        f"MAPPING_ECHOES_SOURCE tamper caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
