"""``strategy.lean_canvas`` -- strategy family, added 2026-09-18 per direct operator request after
comparing this system's method catalog against MindManager's template gallery (operator: "Lean
Canvas -- Business Model Canvas 的新創精簡版，欄位不同"). NOT an Atlas-cited method (grep-confirmed
zero "lean canvas"/"Lean Canvas" hits, case-insensitive, anywhere in
AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md and the whole
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS tree) -- external grounding instead: Ash Maurya's
Lean Canvas (Maurya, "Running Lean", 2012; https://leanstack.com/lean-canvas, Maurya's own current
tool), a one-page adaptation of Osterwalder's Business Model Canvas for early-stage/pre-validation
startups.

**Due-diligence comparison against** ``strategy.business_model_canvas`` **(read in full first, not
edited)**: identical shape class -- a closed SET of named blocks, each appearing exactly once, in
ANY order (unordered completeness, same as ``BLOCK_NAMES``/``porter_five_forces.py``'s
``FORCE_NAMES``/``vrio.py``'s question set), each block carrying non-empty ``content`` -- but a
DISTINCT block vocabulary, not an alias or a subset. Ash Maurya's own stated adaptation (leanstack.com)
replaces 4 of BMC's 9 blocks -- the "running an existing business" blocks (Key Partners, Key
Activities, Key Resources, Customer Relationships) -- with 4 different "starting a new business"
blocks (Problem, Solution, Key Metrics, Unfair Advantage), while renaming "Value Propositions" to
the sharper "Unique Value Proposition". The two canvases share ZERO block names in common except
Customer Segments, Channels, Revenue Streams, and Cost Structure -- this is why ``BLOCK_NAMES``
below is its own independent frozenset, not a modification of BMC's.

**Validation-status handling, same structural-elimination pattern BMC's own docstring establishes
for a different constant**: Lean Canvas is, if anything, a MORE explicit hypothesis-tracking tool
than BMC -- Maurya's own framing (Running Lean's Build-Measure-Learn premise) is that every block is
a best-guess assumption to be tested via customer development, not a settled fact. ``VALIDATION_STATUS``
("UNVALIDATED_HYPOTHESIS", the same legal value BMC uses for the same reason) is therefore NOT a
caller-settable parameter of ``generate_lean_canvas`` -- no code path lets a caller construct a
record whose stored value disagrees with what this method's own definition requires. The independent
gate re-derives this from the record's own raw fields, same two-layer discipline every sibling module
in this package already establishes.

**Record-identity parameter naming choice, disclosed here rather than silently copied from BMC**:
BMC's own ``canvas_id`` is a domain-specific identity parameter (the caller must supply it; the API
does not auto-inject it -- see ``ai_lego/apps/api/dispatch.py``'s ``invoke_builder`` docstring,
2026-09-13 fix). This module instead uses the literal ``record_id`` parameter name, the same
convention ``decision.eisenhower_matrix``/``divergent.reverse_brainstorming`` (both added earlier
2026-09-18) already use: the API's ``/methods/{id}/invoke`` auto-supplies a fresh, correctly-prefixed
``record_id`` whenever a builder declares that exact parameter, so the operator UX gap this exact
choice affects (WORKLOG 2026-09-18 "續14": domain-specific id fields have to be hand-typed by the
user, and blanket auto-fill for OTHER *_id-suffixed fields was reverted as unsafe) simply does not
apply to this new method's own identity field. Not a BMC bug fix (BMC's existing callers are out of
this task's scope) -- a forward-looking choice for a brand-new method with no existing callers to break.

Real invariants (grounded in Maurya's own 9-block definition, each enforced BOTH at construction,
raise BEFORE any record is built, AND independently re-derived by a gate that never trusts a stored
value -- same two-layer discipline every sibling module in this package already establishes):

1. ``blocks`` is EXACTLY the 9 ``BLOCK_NAMES`` values, each appearing EXACTLY ONCE, in ANY order.
   Missing, duplicated, or unrecognized block names are all refused -- a record missing even one of
   the 9 has not actually sketched a Lean Canvas, it has sketched something smaller.
2. Every block entry carries a non-empty ``content`` -- a block named but left empty has not
   described that part of the business model.
3. ``validation_status`` is ALWAYS exactly ``VALIDATION_STATUS`` on every record this module builds.

Grepped the whole ``ai_lego`` tree and ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` case-
insensitively for "lean_canvas"/"lean canvas"/"LeanCanvas" before writing any of this method's own
files: zero pre-existing implementation.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "strategy.lean_canvas"
RECORD_ID_PREFIX = "LEANCANVAS-"
BLOCK_NAMES: frozenset[str] = frozenset(
    {
        "PROBLEM",
        "CUSTOMER_SEGMENTS",
        "UNIQUE_VALUE_PROPOSITION",
        "SOLUTION",
        "CHANNELS",
        "REVENUE_STREAMS",
        "COST_STRUCTURE",
        "KEY_METRICS",
        "UNFAIR_ADVANTAGE",
    }
)
# Ash Maurya's own 9-block Lean Canvas (leanstack.com/lean-canvas), transcribed as SCREAMING_SNAKE_CASE.
# See module docstring's due-diligence comparison for exactly which 4 of BMC's blocks these replace.

VALIDATION_STATUS = "UNVALIDATED_HYPOTHESIS"
# See module docstring "Validation-status handling". NOT a caller-settable parameter of
# generate_lean_canvas -- every record this builder produces carries exactly this value.

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

    Deliberately does NOT short-circuit on ``len(blocks) != 9`` up front, same reasoning
    ``strategy.business_model_canvas``'s own ``_blocks_are_valid`` discloses: a wrong COUNT is a
    completeness defect (``INCOMPLETE_BLOCK_SET``), distinct from a malformed ENTRY
    (``SHAPE``/``UNKNOWN_BLOCK``/``EMPTY_CONTENT``)."""
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
    """One item of ``blocks``. Convenience constructor only -- emits ONLY known-good keys; does NOT
    itself enforce the completeness/distinctness invariant (``generate_lean_canvas`` validates
    whatever list of dicts it is handed regardless of how each entry was built, same convention
    ``strategy.business_model_canvas``'s own ``block_entry`` already establishes)."""
    if block not in BLOCK_NAMES:
        raise InvariantViolation(f"LEANCANVAS_UNKNOWN_BLOCK: {block!r} is not one of {sorted(BLOCK_NAMES)} (Ash Maurya's 9-block Lean Canvas vocabulary)")
    if not _is_nonempty_str(content):
        raise InvariantViolation(f"LEANCANVAS_EMPTY_CONTENT: block {block!r} must carry non-empty content, got {content!r}")
    record: dict[str, Any] = {"block": block, "content": content, "provenance": provenance}
    if supporting_evidence_refs:
        record["supporting_evidence_refs"] = list(supporting_evidence_refs)
    return record


def generate_lean_canvas(
    record_id: str,
    blocks: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Enforces real invariants 1+2 fail-closed, same family-wide "raise-before-construction"
    discipline every sibling module in this package establishes. Invariant 3 (``validation_status``)
    is enforced by NOT accepting it as a parameter at all -- see module docstring."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"LEANCANVAS_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"LEANCANVAS_INVALID_VERSION: version must be a string, got {version!r}")

    valid, reason = _blocks_are_valid(blocks)
    if not valid:
        if reason == "UNKNOWN_BLOCK":
            raise InvariantViolation(f"LEANCANVAS_UNKNOWN_BLOCK: blocks contains a name outside {sorted(BLOCK_NAMES)}, got {blocks!r}")
        if reason == "EMPTY_CONTENT":
            raise InvariantViolation(f"LEANCANVAS_EMPTY_CONTENT: every block entry must carry non-empty 'content', got {blocks!r}")
        if reason == "INCOMPLETE_BLOCK_SET":
            raise InvariantViolation(
                f"LEANCANVAS_INCOMPLETE_BLOCK_SET: blocks must name EXACTLY the nine {sorted(BLOCK_NAMES)}, each exactly once -- a record naming "
                f"only some of the 9 has not sketched a Lean Canvas, got {blocks!r}"
            )
        raise InvariantViolation(f"LEANCANVAS_INVALID_BLOCK_SET: blocks must be exactly {len(BLOCK_NAMES)} well-shaped entries, got {blocks!r}")

    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"LEANCANVAS_INVALID_PROVENANCE: provenance failed schema validation, got {provenance!r}")

    return {
        "id": record_id,
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
    ``strategy.business_model_canvas``/``strategy.porter_five_forces``/``strategy.vrio``'s identical
    gate uses: a block entry claiming the EVIDENCE label must actually cite ``supporting_evidence_refs``.
    Every Lean Canvas block starts life as a guess (module docstring's "Validation-status handling"),
    so a block that HAS graduated to citing real evidence must actually carry the citation, not just
    the label."""
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


def evaluate_lean_canvas_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives ALL THREE real invariants from the record's OWN raw fields -- does not trust any
    stored value and does NOT call ``generate_lean_canvas``, so a hand-tampered record that bypassed
    the builder entirely is caught here exactly as a builder-refused one would have been."""
    if not isinstance(record, dict):
        return _result("lean_canvas_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("lean_canvas_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("lean_canvas_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    valid, reason = _blocks_are_valid(record.get("blocks"))
    if not valid:
        return _result(
            "lean_canvas_integrity",
            False,
            [{"reason": f"blocks invalid ({reason}) -- must name exactly {sorted(BLOCK_NAMES)}, each exactly once, well-shaped"}],
            validator,
            timestamp,
        )

    if record.get("validation_status") != VALIDATION_STATUS:
        return _result(
            "lean_canvas_integrity",
            False,
            [{"reason": f"INVALID_VALIDATION_STATUS: expected exactly {VALIDATION_STATUS!r}, got {record.get('validation_status')!r}"}],
            validator,
            timestamp,
        )

    return _result("lean_canvas_integrity", True, [{"block_count": len(record["blocks"])}], validator, timestamp)


def evaluate_lean_canvas_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """All three of the contract's real gates, in catalog order: the two declared ``quality``
    properties, then the independent structural-integrity re-derivation."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_evidence_labeling_required_gate(record, validator, timestamp),
        evaluate_lean_canvas_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
