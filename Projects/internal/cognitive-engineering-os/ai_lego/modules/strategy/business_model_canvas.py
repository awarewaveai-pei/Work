"""``strategy.business_model_canvas`` -- F08 context/strategy family, 11th member (10/14 built before
this entry: ``strategy.swot``/``pestel``/``steepv``/``three_c``/``tows``/``porter_five_forces``/
``ansoff``/``value_chain``/``stp``/``vrio``; see ``porter_five_forces.py``, read in full as this
module's primary repo-convention template, not edited).

Atlas cites this method TWICE: the F08 tool table row (L527: "客群/價值/通路/關係/收益/資源/活動/
夥伴/成本｜完整描述商業運作｜Unit Economics") and a dedicated §12.15 section (L2715-2734) naming the
nine blocks explicitly by name (Osterwalder's Business Model Canvas: Customer Segments, Value
Propositions, Channels, Customer Relationships, Revenue Streams, Key Resources, Key Activities, Key
Partners, Cost Structure) plus the method's own stated benefit ("完整描述商業運作" -- fully describe
business operation) and a stated limitation ("它是 business model hypothesis，不是經驗證的
business" -- it's a business-model hypothesis, not a validated business).

**Design-shape**: same closed-SET-with-completeness-no-position shape ``porter_five_forces.py``'s own
``FORCE_NAMES`` and ``vrio.py``'s own question set already establish -- Atlas's own §12.15 lists the
nine blocks as a flat, unordered block of text (not an arrow-chain pipeline the way
``causal/logic_model.py``'s STAGE_ORDER is), so ``BLOCK_NAMES`` below scales that identical shape from
5 (Porter) / 4 (VRIO) to 9 -- the largest fixed-set F08 method yet.

**Limitation handling (task-mandated investigation, disclosed here)**: unlike
``porter_five_forces.py``'s own digital-platform/network-effects limitation (Atlas §12.11's own
caveat, left disclosure-only because no citation gives a structural test for "is this industry a
digital platform" -- an INSTANCE-DEPENDENT question), Atlas §12.15's limitation ("business model
hypothesis，不是經驗證的 business") is a CATEGORICAL, always-true statement about ANY
BusinessModelCanvas record regardless of content. That difference is exactly what makes it a good
candidate for STRUCTURAL enforcement rather than disclosure-only: ``VALIDATION_STATUS`` is a
single-legal-value constant ("UNVALIDATED_HYPOTHESIS") that ``generate_business_model_canvas`` does
NOT expose as a caller-settable parameter at all -- same "structural elimination" pattern
``strategy.vrio``'s own ``competitive_implication`` (no builder parameter, GENUINE_COMPUTE from the 4
answers) and ``strategy.tows``'s own ``pairing_type`` (no builder parameter, GENUINE_COMPUTE from the
referenced SWOT factors) already establish for a different reason (mechanical derivation vs. here, a
fixed constant) -- both classes share the same structural guarantee: no code path lets a caller
construct a record whose stored value disagrees with what this method's own definition requires.

Real invariants (grounded in Atlas L527/§12.15, each enforced BOTH at construction, raise BEFORE any
record is built, AND independently re-derived by a gate that never trusts a stored value -- same
two-layer discipline every sibling module in this package already establishes):

1. ``blocks`` is EXACTLY the 9 ``BLOCK_NAMES`` values, each appearing EXACTLY ONCE, in ANY order
   (unordered completeness -- see design-shape note above). Missing, duplicated, or unrecognized
   block names are all refused. A record missing even one of the 9 has not delivered "完整描述商業
   運作" (complete business-operation description), Atlas's own stated benefit for this method.
2. Every block entry carries a non-empty ``content`` (the actual disclosed description of what that
   block contains for the specific business being modeled) -- a block named but left empty has not
   described that part of the business.
3. ``validation_status`` is ALWAYS exactly ``VALIDATION_STATUS`` ("UNVALIDATED_HYPOTHESIS") on every
   record this module builds -- structurally guaranteed by parameter elimination (invariant 3 cannot
   be violated via the builder; the independent gate re-checks it anyway, so a hand-tampered raw dict
   that bypassed the builder entirely is still caught).

Grepped the whole ``ai_lego`` tree and ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` case-
insensitively for "business_model_canvas"/"BMC" before writing any of this method's own files: zero
pre-existing implementation (only doc references -- architecture-inventory.yaml, ADR-008,
MOTHER_DOC_SECTION_INDEX.md, method-inventory.yaml, and this package's own
``ai_lego/modules/strategy/__init__.py`` "Remaining 4" roadmap comment -- none is a real
contract/schema/module).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "strategy.business_model_canvas"
RECORD_ID_PREFIX = "BMC-"
BLOCK_NAMES: frozenset[str] = frozenset(
    {
        "CUSTOMER_SEGMENTS",
        "VALUE_PROPOSITIONS",
        "CHANNELS",
        "CUSTOMER_RELATIONSHIPS",
        "REVENUE_STREAMS",
        "KEY_RESOURCES",
        "KEY_ACTIVITIES",
        "KEY_PARTNERS",
        "COST_STRUCTURE",
    }
)
# Atlas §12.15 (L2721-2730) verbatim nine-line list, transcribed as SCREAMING_SNAKE_CASE. See module
# docstring's design-shape note for why this is a closed SET requiring completeness (same shape class
# as porter_five_forces.py's FORCE_NAMES / vrio.py's question set) but WITHOUT position.

VALIDATION_STATUS = "UNVALIDATED_HYPOTHESIS"
# Atlas §12.15's own stated limitation, made structural (see module docstring "Limitation handling").
# NOT a caller-settable parameter of generate_business_model_canvas -- every record this builder
# produces carries exactly this value, no code path allows any other.

_BLOCK_REQUIRED_KEYS = frozenset({"block", "content", "provenance"})
_BLOCK_ALLOWED_KEYS = _BLOCK_REQUIRED_KEYS | frozenset({"supporting_evidence_refs"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _refs_shape_ok(entry: dict[str, Any]) -> bool:
    refs = entry.get("supporting_evidence_refs")
    return refs is None or (isinstance(refs, list) and bool(refs) and all(isinstance(r, str) for r in refs))


def _block_entry_shaped(entry: Any) -> bool:
    if not isinstance(entry, dict):
        return False
    keys = set(entry.keys())
    return _BLOCK_REQUIRED_KEYS <= keys and keys <= _BLOCK_ALLOWED_KEYS


def _blocks_are_valid(blocks: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift
    from the other -- same discipline every sibling module in this package establishes. Real
    invariants 1+2 from the module docstring, re-derived from raw fields, never trusting a stored
    value.

    Deliberately does NOT short-circuit on ``len(blocks) != 9`` up front: a wrong COUNT (too few, too
    many, or the right count with a duplicate) is a completeness defect (``INCOMPLETE_BLOCK_SET``), a
    distinct failure reason from a malformed ENTRY (``SHAPE``/``UNKNOWN_BLOCK``/etc). Checking
    count-and-membership together, after the per-entry loop, is what lets a too-short list (e.g. 8
    entries, all individually well-formed) report the correct ``INCOMPLETE_BLOCK_SET`` reason instead
    of being misclassified as a generic shape defect."""
    if not isinstance(blocks, list):
        return False, "SHAPE"
    seen_names: list[str] = []
    for entry in blocks:
        if not _block_entry_shaped(entry):
            return False, "SHAPE"
        block = entry.get("block")
        if block not in BLOCK_NAMES:
            return False, "UNKNOWN_BLOCK"
        seen_names.append(block)
        if not _is_nonempty_str(entry.get("content")):
            return False, "EMPTY_CONTENT"
        if not _refs_shape_ok(entry):
            return False, "SHAPE"
    if len(seen_names) != len(BLOCK_NAMES) or set(seen_names) != BLOCK_NAMES:
        return False, "INCOMPLETE_BLOCK_SET"
    return True, None


def block_entry(
    block: str,
    content: str,
    provenance: dict[str, Any],
    *,
    supporting_evidence_refs: list[str] | None = None,
) -> dict[str, Any]:
    """One item of ``typed-objects/business-model-canvas.schema.yaml#/properties/blocks``. Convenience
    constructor only -- emits ONLY known-good keys; does NOT itself enforce the completeness/
    distinctness invariant (``generate_business_model_canvas`` validates whatever list of dicts it is
    handed regardless of how each entry was built, same convention ``porter_five_forces.py``'s own
    ``force_entry`` already establishes)."""
    if block not in BLOCK_NAMES:
        raise InvariantViolation(f"BMC_UNKNOWN_BLOCK: {block!r} is not one of {sorted(BLOCK_NAMES)} (Atlas §12.15 L2721-2730 nine-block vocabulary)")
    if not _is_nonempty_str(content):
        raise InvariantViolation(f"BMC_EMPTY_CONTENT: block {block!r} must carry non-empty content, got {content!r}")
    record: dict[str, Any] = {"block": block, "content": content, "provenance": provenance}
    if supporting_evidence_refs:
        record["supporting_evidence_refs"] = list(supporting_evidence_refs)
    return record


def generate_business_model_canvas(
    canvas_id: str,
    blocks: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/business-model-canvas.schema.yaml``.

    Enforces real invariants 1+2 fail-closed, same family-wide "raise-before-construction" discipline
    every sibling module in this package already establishes. Invariant 3 (``validation_status``) is
    enforced by NOT accepting it as a parameter at all -- see module docstring "Limitation handling".
    """
    if not _is_nonempty_str(canvas_id) or not canvas_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"BMC_INVALID_ID: canvas_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {canvas_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"BMC_INVALID_VERSION: version must be a string, got {version!r}")

    valid, reason = _blocks_are_valid(blocks)
    if not valid:
        if reason == "UNKNOWN_BLOCK":
            raise InvariantViolation(f"BMC_UNKNOWN_BLOCK: blocks contains a name outside {sorted(BLOCK_NAMES)}, got {blocks!r}")
        if reason == "EMPTY_CONTENT":
            raise InvariantViolation(f"BMC_EMPTY_CONTENT: every block entry must carry non-empty 'content', got {blocks!r}")
        if reason == "INCOMPLETE_BLOCK_SET":
            raise InvariantViolation(
                f"BMC_INCOMPLETE_BLOCK_SET: blocks must name EXACTLY the nine {sorted(BLOCK_NAMES)}, each exactly once -- Atlas §12.15's own "
                f"nine-way split IS the method's definition of '完整描述商業運作' (complete business-operation description), a record naming only "
                f"some of the 9 has not done a Business Model Canvas, got {blocks!r}"
            )
        raise InvariantViolation(f"BMC_INVALID_BLOCK_SET: blocks must be exactly {len(BLOCK_NAMES)} well-shaped entries, got {blocks!r}")

    return {
        "id": canvas_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "blocks": [dict(b) for b in blocks],
        "validation_status": VALIDATION_STATUS,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every block entry AND the overall record carry
    a schema-valid provenance_record. Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    blocks = record.get("blocks")
    blocks = blocks if isinstance(blocks, list) else []
    invalid = [b.get("block") for b in blocks if isinstance(b, dict) and not provenance_is_valid(b.get("provenance"))]
    record_provenance_ok = provenance_is_valid(record.get("provenance"))
    passed = bool(blocks) and not invalid and record_provenance_ok
    return _result(
        "provenance_required",
        passed,
        [{"blocks_checked": len(blocks), "invalid_provenance_blocks": invalid, "record_provenance_valid": record_provenance_ok}],
        validator,
        timestamp,
    )


def evaluate_evidence_labeling_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.evidence_labeling_required: true`` -- same real structural check
    ``strategy.porter_five_forces``/``strategy.vrio``'s identical gate uses: a block entry claiming the
    EVIDENCE label must actually cite ``supporting_evidence_refs``. Grounded by same-family analogy to
    those methods' identical flag (see this method's own contract ``open_questions`` -- Atlas §12.15
    gives no explicit misuse warning the way SWOT's own does)."""
    blocks = record.get("blocks") if isinstance(record, dict) else None
    blocks = blocks if isinstance(blocks, list) else []
    problems: list[dict[str, Any]] = []
    for b in blocks:
        if not isinstance(b, dict):
            continue
        epistemic_type = (b.get("provenance") or {}).get("epistemic_type")
        if epistemic_type is None:
            problems.append({"block": b.get("block"), "reason": "no epistemic_type label"})
            continue
        if epistemic_type == "EVIDENCE" and not b.get("supporting_evidence_refs"):
            problems.append({"block": b.get("block"), "reason": "labeled EVIDENCE but cites no supporting_evidence_refs"})
    passed = bool(blocks) and not problems
    return _result("evidence_labeling_required", passed, [{"blocks_checked": len(blocks), "problems": problems}], validator, timestamp)


def evaluate_business_model_canvas_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives ALL THREE real invariants from the record's OWN raw fields -- does not trust any
    stored value and does NOT call ``generate_business_model_canvas``, so a hand-tampered record that
    bypassed the builder entirely is caught here exactly as a builder-refused one would have been.
    Includes invariant 3 (``validation_status`` must equal ``VALIDATION_STATUS`` exactly) -- proves the
    builder's parameter-elimination guarantee is ALSO independently re-checked, not merely assumed
    because the builder never exposed the field. Fails closed on malformed input rather than
    crashing."""
    if not isinstance(record, dict):
        return _result("business_model_canvas_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("business_model_canvas_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("business_model_canvas_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    valid, reason = _blocks_are_valid(record.get("blocks"))
    if not valid:
        return _result(
            "business_model_canvas_integrity",
            False,
            [{"reason": f"blocks invalid ({reason}) -- must name exactly {sorted(BLOCK_NAMES)}, each exactly once, well-shaped"}],
            validator,
            timestamp,
        )

    if record.get("validation_status") != VALIDATION_STATUS:
        return _result(
            "business_model_canvas_integrity",
            False,
            [{"reason": f"INVALID_VALIDATION_STATUS: expected exactly {VALIDATION_STATUS!r}, got {record.get('validation_status')!r}"}],
            validator,
            timestamp,
        )

    return _result("business_model_canvas_integrity", True, [{"block_count": len(record["blocks"])}], validator, timestamp)


def evaluate_business_model_canvas_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """All three of the contract's real gates, in catalog order: the two declared ``quality``
    properties, then the independent structural-integrity re-derivation."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_evidence_labeling_required_gate(record, validator, timestamp),
        evaluate_business_model_canvas_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
