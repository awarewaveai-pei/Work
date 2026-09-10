"""``association.attribute_listing`` vertical slice -- Method Atlas slice for the F04 associative-mapping
family's 1st real member (F04 table row L415, the ONLY Atlas citation). See
``ai_lego.modules.association.attribute_listing``'s own module docstring for the full due-diligence read
(zero pre-existing implementation, no dedicated §11.x section, no §22.3/EC §32 row).

Self-referential scenario, same class ``run_frame_storming_slice.py``/``run_5w1h_slice.py`` already establish
for this batch (the demo IS a real thing observed during this build, not an invented business narrative):
this method's own contract ``compilation_decisions`` -- 2 real design choices made while building THIS SAME
slice -- reframed here as the 2 attributes of "this slice's own recombination field design", each with its
own original (first-considered) value individually transformed into the actually-adopted design, then
recombined into one final proposal.

Demonstrates all three real invariants, each at BOTH layers:

1. ``ATTRIBUTELISTING_VARIANT_ECHOES_ORIGINAL``: a transformed_variant whose text merely echoes its own
   attribute's original_value (case/whitespace-insensitive) is refused at CONSTRUCTION -- proves "genuinely
   distinct transformation" is not toothless.
2. ``ATTRIBUTELISTING_COMBINED_FROM_NOT_FOUND``: a recombination referencing a (attribute_name, variant_id)
   pair that was never generated is refused at CONSTRUCTION -- proves the core "recombination must be
   grounded in real transformed variants" invariant is not toothless.
3. The same mismatch, re-derived independently: a hand-tampered COPY of a valid record, with
   ``recombination.combined_from`` overwritten to reference a non-existent variant, bypasses the builder
   entirely -- the independent gate must catch it by re-deriving the known (attribute_name, variant_id) pairs
   itself, never trusting the stored value.

Run::

    python -m ai_lego.apps.cli.run_attribute_listing_slice
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
from ai_lego.modules.association.attribute_listing import (
    METHOD_ID,
    all_gates_pass,
    attribute_entry,
    evaluate_attribute_listing_gates,
    generate_attribute_listing_record,
    recombination_entry,
    transformed_variant,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-ATTRIBUTELISTING-SYNTHETIC-001"
EXECUTION_ID = "EX-ATTRIBUTELISTING-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-ATTRIBUTELISTING-001"

S = {
    "evidence": "ai-lego://specs/evidence/evidence.schema.yaml",
    "attribute_listing_record": "ai-lego://specs/cognitive/typed-objects/attribute-listing-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-attribute-listing-slice"


def run_attribute_listing_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. association.attribute_listing resolves
    # because its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every
    # sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: evidence the 2 attributes' original_value claims cite. Both facts are REAL and directly
    # verifiable in this same contract's own compilation_decisions at write time. ---
    scope_evidence = evidence_record(
        "E-971", "association.attribute_listing.contract.yaml's own compilation_decisions first weighed, then rejected, skipping recombination entirely (treating it as a pure downstream step)", "methods/contracts/association.attribute_listing.contract.yaml compilation_decisions[1]", make_provenance("EVIDENCE", "HUMAN_APPROVED")
    )
    distinctness_evidence = evidence_record(
        "E-972", "the module's own _normalize helper (NFKC + casefold) was adopted directly from framing.frame_storming's own precedent rather than a bare non-empty-string check", "ai_lego/modules/association/attribute_listing.py _normalize + ai_lego/modules/framing/frame_storming.py _normalize", make_provenance("EVIDENCE", "HUMAN_APPROVED")
    )
    contracts.validate(S["evidence"], scope_evidence, "evidence E-971")
    contracts.validate(S["evidence"], distinctness_evidence, "evidence E-972")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "EvidenceRecorded", {"evidence": [scope_evidence, distinctness_evidence]}, 1)

    # --- Step 2: the complete, well-formed record -- 2 attributes, each with 1 genuinely-transformed variant,
    # recombined into one final proposal referencing both. ---
    attributes = [
        attribute_entry(
            "recombination_field_scope",
            "最初考慮的立場：重組完全跳過，record 只涵蓋 attributes/變換兩步",
            [
                transformed_variant(
                    "V1",
                    "重組改為 record 內建、OPTIONAL 的 recombination 欄位，combined_from 交叉引用已存在的 transformed_variant，而非省略或發明未經 Atlas 佐證的新 typed object",
                    make_provenance("EVIDENCE", "HUMAN_APPROVED"),
                    supporting_evidence_refs=["E-971"],
                )
            ],
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
            supporting_evidence_refs=["E-971"],
        ),
        attribute_entry(
            "variant_distinctness_check",
            "最初只檢查 variant_text 非空字串，不比對是否與 original_value 或其他 variant 重複",
            [
                transformed_variant(
                    "V1",
                    "改為 NFKC normalize + casefold 大小寫/空白不敏感比對，禁止 variant 逐字複製 original_value 或彼此重複，重用 framing.frame_storming 自己的 _normalize 慣例",
                    make_provenance("EVIDENCE", "HUMAN_APPROVED"),
                    supporting_evidence_refs=["E-972"],
                )
            ],
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
            supporting_evidence_refs=["E-972"],
        ),
    ]
    recombination = recombination_entry(
        [
            {"attribute_name": "recombination_field_scope", "variant_id": "V1"},
            {"attribute_name": "variant_distinctness_check", "variant_id": "V1"},
        ],
        "最終方案：OPTIONAL recombination 欄位 + NFKC/casefold 不敏感比對，兩個屬性的轉換共同構成本方法切片的核心不變量設計",
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
    )
    record = generate_attribute_listing_record(
        "ATTRLIST-2026-09-10-001",
        "association.attribute_listing 方法切片本身的 recombination 欄位設計",
        attributes,
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        recombination=recombination,
        informs_scamper_ref="SCAMPER-2026-09-10-001",
    )
    contracts.validate(S["attribute_listing_record"], record, "attribute listing record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "AttributeListingRecordGenerated", {"record": record}, 1.5)
    milestones.append("RECORD_BUILT")

    gate_results = evaluate_attribute_listing_gates(record, "run_attribute_listing_slice", clock.at(1.6))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"attribute_listing gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("ATTRIBUTELISTING_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 3: proof invariant #1 is not toothless -- a transformed_variant that merely echoes its own
    # attribute's original_value (case/whitespace-insensitive) MUST be refused before any record is
    # constructed ("逐項變換" requires a real transformation, not a copy). ---
    echo_proof: dict[str, Any] = {"attempted": True, "raised": False}
    echoing_attributes = [
        attribute_entry(
            "recombination_field_scope",
            "最初考慮的立場：重組完全跳過，record 只涵蓋 attributes/變換兩步",
            [transformed_variant("V1", "  最初考慮的立場：重組完全跳過，record 只涵蓋 attributes/變換兩步  ", make_provenance("EVIDENCE", "HUMAN_APPROVED"))],  # whitespace-padded echo of original_value
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    ]
    try:
        generate_attribute_listing_record("ATTRLIST-ECHO-001", "同一 subject", echoing_attributes, make_provenance("EVIDENCE", "HUMAN_APPROVED"))
    except InvariantViolation as error:
        if "ATTRIBUTELISTING_VARIANT_ECHOES_ORIGINAL" not in str(error):
            raise
        echo_proof["raised"] = True
        echo_proof["error_code"] = "ATTRIBUTELISTING_VARIANT_ECHOES_ORIGINAL"
    if not echo_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("ATTRIBUTELISTING_INVARIANT_NOT_ENFORCED: a variant echoing its own original_value was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "EchoingVariantRefused", {"echo_proof": echo_proof}, 1.7)
    milestones.append("ECHO_REFUSAL_PROVEN")

    # --- Step 4: proof invariant #3 (the core recombination one) is not toothless -- a combined_from entry
    # naming a (attribute_name, variant_id) pair that was never generated MUST be refused before any record
    # is constructed. ---
    ungrounded_recombination_proof: dict[str, Any] = {"attempted": True, "raised": False}
    ungrounded_recombination = recombination_entry(
        [
            {"attribute_name": "recombination_field_scope", "variant_id": "V1"},
            {"attribute_name": "recombination_field_scope", "variant_id": "V-NEVER-GENERATED"},  # never appears in attributes -- a free-floating reference
        ],
        "同一 proposal",
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
    )
    try:
        generate_attribute_listing_record(
            "ATTRLIST-UNGROUNDED-001", "同一 subject", attributes, make_provenance("EVIDENCE", "HUMAN_APPROVED"), recombination=ungrounded_recombination
        )
    except InvariantViolation as error:
        if "ATTRIBUTELISTING_COMBINED_FROM_NOT_FOUND" not in str(error):
            raise
        ungrounded_recombination_proof["raised"] = True
        ungrounded_recombination_proof["error_code"] = "ATTRIBUTELISTING_COMBINED_FROM_NOT_FOUND"
    if not ungrounded_recombination_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("ATTRIBUTELISTING_INVARIANT_NOT_ENFORCED: a recombination ungrounded in any generated variant was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "UngroundedRecombinationRefused", {"ungrounded_recombination_proof": ungrounded_recombination_proof}, 1.9)
    milestones.append("UNGROUNDED_RECOMBINATION_REFUSAL_PROVEN")

    # --- Step 5: hand-tampering proof -- the INDEPENDENT gate catches the same defect even when a caller
    # bypasses the builder entirely and hand-edits a valid record's own recombination.combined_from. ---
    tampered = copy.deepcopy(record)
    tampered["recombination"]["combined_from"][1]["variant_id"] = "V-NEVER-GENERATED"  # bypasses the builder's own check directly on a raw copy
    tampered_gate = evaluate_attribute_listing_gates(tampered, "run_attribute_listing_slice", clock.at(2.1))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("ATTRIBUTELISTING_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered ungrounded combined_from")
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
        "echo_proof": echo_proof,
        "ungrounded_recombination_proof": ungrounded_recombination_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_frame_storming_slice.py)",
    }
    write_json(runtime / "results" / "attribute_listing_slice_result.json", result)
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
        result = run_attribute_listing_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(
        f"PASS association.attribute_listing: AttributeListingRecord {result['record']['id']} built with "
        f"{len(result['record']['attributes'])} attributes, recombination combined_from="
        f"{len(result['record']['recombination']['combined_from'])} variants, "
        f"{len(result['gate_results'])} gates all PASS; "
        f"VARIANT_ECHOES_ORIGINAL invariant REFUSED a malformed attempt ({result['echo_proof']['error_code']}); "
        f"COMBINED_FROM_NOT_FOUND invariant REFUSED an ungrounded recombination ({result['ungrounded_recombination_proof']['error_code']}); "
        f"ungrounded-recombination tamper caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
