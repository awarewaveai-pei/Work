"""``divergent.lotus_blossom`` -- F03 發散式創意 (Divergent Ideation) family, one of 10 members opened in
this same batch (each an independent agent; e.g. ``divergent.crazy_eights``, neither read nor imported
here).

Atlas cites this method ONCE: the F03 tool table row (L384: "Lotus Blossom｜多層結構發散｜中心→8 分支→各 8
idea｜大量但有結構｜後續需 clustering"). Grep-confirmed the ONLY real hit case-insensitively for "lotus"
across the whole Atlas file -- no dedicated section, no §4 composition formula, no §14.1 legal-chain
mention, no §22.3 gate-table row.

**Two nested, independent fixed-8 closed-set invariants (grounded in Atlas L384's own literal "中心→8 分支
→各 8 idea", a direct transcription -- no disambiguation needed, unlike ``strategy.ansoff``'s ambiguous
4-fragment-token citation)**, each enforced BOTH at construction, raise BEFORE any record is built, AND
independently re-derived by a gate that never trusts a stored value -- same two-layer discipline every
sibling module in this package already establishes:

1. ``branches`` is EXACTLY 8 entries, ``branch_number`` covering {1..8}, each appearing EXACTLY ONCE, in ANY
   order (unordered completeness -- same design-shape ``strategy.porter_five_forces``'s ``FORCE_NAMES``/
   ``strategy.ansoff``'s ``QUADRANT_NAMES`` already establish for an analogous fixed-vocabulary structural
   method, generalized here from a NAMED enum to a NUMERIC 1-8 slot enum since Atlas's own citation gives no
   branch names, only the count).
2. EVERY branch's own ``ideas`` list is EXACTLY 8 non-empty entries -- the method's own literal "各 8 idea",
   a SECOND, independent fixed-8 constraint nested one level down inside invariant 1, not the same count
   reused. A branch with 7 or 9 ideas is refused exactly like a top-level set with 7 or 9 branches.

Provenance is RECORD-LEVEL ONLY (task-mandated design), not per-branch/per-idea like
``strategy.ansoff``'s per-quadrant ``provenance`` -- same single-whole-record granularity
``framing.five_w_one_h``'s own top-level ``provenance`` already establishes: Atlas's own citation supports
no per-branch differentiated epistemic claim (contrast Ansoff's per-quadrant disclosed ``risk_level``).

``center_theme``/``branch_theme``/each idea string are all free-text REPORTED content, never GENUINE_COMPUTE
-- no citation supports mechanically deriving any of them from anything else (contrast
``strategy.bcg_matrix``'s computed ``quadrant``).

Grepped the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` trees case-insensitively for
"lotus_blossom"/"LotusBlossom"/"Lotus Blossom" before writing any of this method's own files: zero
pre-existing implementation.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "divergent.lotus_blossom"
RECORD_ID_PREFIX = "LOTUS-"
BRANCH_NUMBERS: frozenset[int] = frozenset({1, 2, 3, 4, 5, 6, 7, 8})
# Atlas L384's own literal "中心→8 分支" count -- a NUMERIC slot vocabulary (no branch names cited), same
# closed-SET-with-completeness shape strategy.porter_five_forces/strategy.ansoff already establish for a
# named vocabulary, generalized here to numbered slots.
IDEAS_PER_BRANCH = 8
# Atlas L384's own literal "各 8 idea" -- the SECOND, independent fixed-count invariant, nested one level
# down inside every branch. Distinct from BRANCH_NUMBERS: this counts non-empty strings, not a closed named
# or numbered vocabulary.

_BRANCH_REQUIRED_KEYS = frozenset({"branch_number", "branch_theme", "ideas"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _ideas_are_valid(ideas: Any) -> bool:
    """Invariant 2: EXACTLY ``IDEAS_PER_BRANCH`` (8) non-empty strings. Shared by the builder and the gate."""
    if not isinstance(ideas, list) or len(ideas) != IDEAS_PER_BRANCH:
        return False
    return all(_is_nonempty_str(idea) for idea in ideas)


def _branch_entry_shaped(entry: Any) -> bool:
    if not isinstance(entry, dict):
        return False
    return set(entry.keys()) == _BRANCH_REQUIRED_KEYS


def _is_valid_branch_number(value: Any) -> bool:
    """Critic finding, 2026-09-11: ``bool`` is a subclass of ``int`` in Python (``True == 1``) -- explicitly
    excluded so ``True``/``False`` can never masquerade as ``1``/``0`` and be accepted as a real
    ``branch_number``. Same guard sibling F03 modules ``crazy_eights.py``'s own ``_is_valid_box_number`` and
    ``six_three_five.py`` already apply to their own structurally identical closed-integer-enum fields --
    this module was the one gap in the same batch."""
    return isinstance(value, int) and not isinstance(value, bool) and value in BRANCH_NUMBERS


def _branches_are_valid(branches: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from
    the other. Re-derives BOTH real invariants from raw fields, never trusting a stored value.

    Deliberately does NOT short-circuit on ``len(branches) != 8`` up front: a wrong top-level COUNT (too
    few, too many, or the right count with a duplicate branch_number) is a completeness defect
    (``INCOMPLETE_BRANCH_SET``), a distinct failure reason from a malformed ENTRY (``SHAPE``/
    ``INVALID_BRANCH_NUMBER``/etc), same convention ``strategy.ansoff``'s own ``_quadrants_are_valid``
    already establishes."""
    if not isinstance(branches, list):
        return False, "SHAPE"
    seen_numbers: list[int] = []
    for entry in branches:
        if not _branch_entry_shaped(entry):
            return False, "SHAPE"
        branch_number = entry.get("branch_number")
        if not _is_valid_branch_number(branch_number):
            return False, "INVALID_BRANCH_NUMBER"
        seen_numbers.append(branch_number)
        if not _is_nonempty_str(entry.get("branch_theme")):
            return False, "EMPTY_BRANCH_THEME"
        if not _ideas_are_valid(entry.get("ideas")):
            return False, "INVALID_IDEAS_COUNT"
    if len(seen_numbers) != len(BRANCH_NUMBERS) or set(seen_numbers) != BRANCH_NUMBERS:
        return False, "INCOMPLETE_BRANCH_SET"
    return True, None


def branch_entry(branch_number: int, branch_theme: str, ideas: list[str]) -> dict[str, Any]:
    """One item of ``typed-objects/lotus-blossom-session.schema.yaml#/properties/branches``. Convenience
    constructor only -- emits ONLY known-good keys; does NOT itself enforce the top-level completeness/
    distinctness invariant across the whole 8-branch set (``generate_lotus_blossom_session`` validates
    whatever list of dicts it is handed regardless of how each entry was built, same convention
    ``strategy.ansoff``'s own ``quadrant_entry`` already establishes). DOES enforce this branch's OWN
    ``ideas`` invariant (invariant 2) since that check is entirely local to this one entry."""
    if not _is_valid_branch_number(branch_number):
        raise InvariantViolation(f"LOTUS_INVALID_BRANCH_NUMBER: {branch_number!r} is not one of {sorted(BRANCH_NUMBERS)} (Atlas L384's own fixed 8-branch slot count)")
    if not _is_nonempty_str(branch_theme):
        raise InvariantViolation(f"LOTUS_EMPTY_BRANCH_THEME: branch_theme must be a non-empty string, got {branch_theme!r}")
    if not _ideas_are_valid(ideas):
        raise InvariantViolation(
            f"LOTUS_INVALID_IDEAS_COUNT: ideas must be a list of EXACTLY {IDEAS_PER_BRANCH} non-empty strings (Atlas L384's own '各 8 idea'), got {ideas!r}"
        )
    return {"branch_number": branch_number, "branch_theme": branch_theme, "ideas": list(ideas)}


def generate_lotus_blossom_session(
    session_id: str,
    center_theme: str,
    branches: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/lotus-blossom-session.schema.yaml``.

    Enforces both real invariants fail-closed, same family-wide "raise-before-construction" discipline every
    sibling module in this package already establishes -- never a record that itself proves it was built
    illegally. ``provenance`` is RECORD-LEVEL only (see module docstring) -- stored verbatim, its own shape
    validity is checked by ``evaluate_provenance_required_gate``, not here (same division of labor
    ``framing.five_w_one_h``'s own ``generate_five_w1h_record`` already establishes).
    """
    if not _is_nonempty_str(session_id) or not session_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"LOTUS_INVALID_ID: session_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {session_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"LOTUS_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(center_theme):
        raise InvariantViolation(f"LOTUS_EMPTY_CENTER_THEME: center_theme must be a non-empty string, got {center_theme!r}")

    valid, reason = _branches_are_valid(branches)
    if not valid:
        if reason == "INVALID_BRANCH_NUMBER":
            raise InvariantViolation(f"LOTUS_INVALID_BRANCH_NUMBER: branches contains a branch_number outside {sorted(BRANCH_NUMBERS)}, got {branches!r}")
        if reason == "EMPTY_BRANCH_THEME":
            raise InvariantViolation(f"LOTUS_EMPTY_BRANCH_THEME: every branch entry must carry a non-empty 'branch_theme', got {branches!r}")
        if reason == "INVALID_IDEAS_COUNT":
            raise InvariantViolation(
                f"LOTUS_INVALID_IDEAS_COUNT: every branch's own 'ideas' must be a list of EXACTLY {IDEAS_PER_BRANCH} non-empty strings (Atlas L384's own "
                f"'各 8 idea'), got {branches!r}"
            )
        if reason == "INCOMPLETE_BRANCH_SET":
            raise InvariantViolation(
                f"LOTUS_INCOMPLETE_BRANCH_SET: branches must name EXACTLY branch_number {sorted(BRANCH_NUMBERS)}, each exactly once -- Atlas L384's own "
                f"'中心→8 分支' IS the method's first-level structure, a record naming only some of the 8 has not done a Lotus Blossom expansion, got {branches!r}"
            )
        raise InvariantViolation(f"LOTUS_INVALID_BRANCH_SET: branches must be exactly {len(BRANCH_NUMBERS)} well-shaped entries, got {branches!r}")

    return {
        "id": session_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "center_theme": center_theme,
        "branches": [dict(b) for b in branches],
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the OVERALL record carries a schema-valid
    provenance_record. RECORD-LEVEL only (see module docstring) -- unlike ansoff/bcg, there is no per-branch
    provenance to check here at all (branches[] carries no provenance key by design)."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    record_provenance_ok = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", record_provenance_ok, [{"record_provenance_valid": record_provenance_ok}], validator, timestamp)


def evaluate_lotus_blossom_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored value
    and does NOT call ``generate_lotus_blossom_session``, so a hand-tampered record that bypassed the builder
    entirely is caught here exactly as a builder-refused one would have been. Fails closed on malformed
    input rather than crashing."""
    if not isinstance(record, dict):
        return _result("lotus_blossom_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("lotus_blossom_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("lotus_blossom_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("center_theme")):
        return _result("lotus_blossom_integrity", False, [{"reason": "center_theme missing, not a string, or empty"}], validator, timestamp)

    valid, reason = _branches_are_valid(record.get("branches"))
    if not valid:
        return _result(
            "lotus_blossom_integrity",
            False,
            [{"reason": f"branches invalid ({reason}) -- must name exactly branch_number {sorted(BRANCH_NUMBERS)}, each exactly once, every branch with exactly {IDEAS_PER_BRANCH} non-empty ideas"}],
            validator,
            timestamp,
        )

    return _result("lotus_blossom_integrity", True, [{"branch_count": len(record["branches"])}], validator, timestamp)


def evaluate_lotus_blossom_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the one declared ``quality`` property, then the
    independent structural-integrity re-derivation. No ``evidence_labeling_required`` gate -- the contract
    sets that flag to ``false`` (see divergent.lotus_blossom.contract.yaml's own ``quality``/
    ``compilation_decisions``), same "only emit gates for what is actually declared true" discipline
    ``strategy.ansoff``'s own ``evaluate_ansoff_gates`` already establishes."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_lotus_blossom_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
