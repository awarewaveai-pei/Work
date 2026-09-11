"""``divergent.synectics`` -- F03 divergent-ideation family (1 of 10 agents opening independent F03
members in this same parallel batch; see ``brainwriting.py`` for this batch's shared conventions --
``__init__.py``, ``contract-backlog.yaml``, ``method-inventory.yaml``, ``WORKLOG.md``, ``TASKS.md`` not
edited here).

Atlas cites this method ONCE: the F03 tool table row (L388: "Synectics｜用類比/隱喻重構問題｜direct/
personal/symbolic analogy｜深度創意突破｜workshop facilitation 要求較高"). Grep-confirmed the only real hit
case-insensitively across the whole Atlas file -- no dedicated section, no §22.3 gate row, no EC §32
security surface (same thin-citation class ``strategy.bcg_matrix`` already establishes for a different
family).

Unlike ``strategy.vrio``'s fixed 4-dimension closed SET (completeness required) or
``divergent.brainwriting``'s 2-distinct-contributor diversity invariant, this method's ``analogies`` is an
OPEN-ENDED non-empty list over the row's own literal 3-type vocabulary (DIRECT/PERSONAL/SYMBOLIC) -- no
completeness or coverage requirement across the 3 types is cited (see contract's own
``compilation_decisions``). A 4th "Fantasy Analogy" type from external Synectics literature is
DELIBERATELY excluded: this row's own citation names only 3, and importing a 4th would overstate a thin,
single-table-row citation the same way adding an uncited completeness rule would.

There is no GENUINE_COMPUTE derived field here (unlike ``strategy.vrio``'s ``competitive_implication`` or
``strategy.bcg_matrix``'s ``quadrant``) -- Atlas's own citation gives no classification formula over
``analogy_type`` combinations. Every field on every ``analogies[]`` entry is DISCLOSED reported content.

Real invariants (grounded in Atlas L388, each enforced BOTH at construction, raise BEFORE any record is
built, AND independently re-derived by a gate that never trusts a stored value -- same two-layer discipline
every sibling module in this package already establishes):

1. ``original_problem`` (top-level, required, non-empty) -- Atlas's own "重構問題" is meaningless without
   naming WHICH problem is being reframed; a record with analogies but no named subject cannot be audited
   against reality later.
2. ``analogies`` is a non-empty list (open-ended, no upper bound, no per-type completeness requirement).
3. Every ``analogies[]`` entry's ``analogy_type`` is one of the 3 closed ``ANALOGY_TYPES`` values -- a 4th
   value (e.g. ``"FANTASY"``) is refused, both at construction (``analogy_entry``/
   ``generate_synectics_session``) and by the independent gate re-deriving from the record's own raw field.
4. Every ``analogies[]`` entry carries non-empty ``analogy_content`` and non-empty ``reframed_insight`` --
   Atlas's own "重構問題" means the analogy must yield an actual derived insight, not merely a listed
   analogy with no payload (same "every entry must carry its own disclosed payload, not just a category
   label" discipline ``strategy.porter_five_forces``'s own per-force ``assessment`` field already
   establishes).

No per-entry ``provenance`` field exists (task-mandated shape, disclosed in the contract's own
``compilation_decisions``) -- only the session-level ``provenance`` is checked by
``evaluate_provenance_required_gate`` below, unlike ``strategy.vrio``/``strategy.bcg_matrix``'s per-item
provenance pattern.

Grepped the whole ``ai_lego`` tree and ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` case-insensitively
for "synectics" before writing any of this method's own files: zero pre-existing implementation (only
``association.analogy_mapping.contract.yaml``'s own disambiguation mention of this method's Atlas row,
not an implementation).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "divergent.synectics"
RECORD_ID_PREFIX = "SYNECTICS-"

ANALOGY_TYPES: frozenset[str] = frozenset({"DIRECT", "PERSONAL", "SYMBOLIC"})
# Atlas L388 verbatim 3-value vocabulary ("direct/personal/symbolic analogy"), transcribed as
# SCREAMING_SNAKE_CASE. CLOSED to exactly these 3 -- a 4th "Fantasy Analogy" value (common in external
# Synectics literature) is deliberately excluded, see module docstring and contract's own
# compilation_decisions.

_ANALOGY_ENTRY_KEYS = frozenset({"analogy_type", "analogy_content", "reframed_insight"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def analogy_entry(analogy_type: str, analogy_content: str, reframed_insight: str) -> dict[str, Any]:
    """One item of ``typed-objects/synectics-session.schema.yaml#/properties/analogies``. Convenience
    constructor only -- emits ONLY the 3 known-good keys (no per-entry provenance, see module docstring);
    does NOT itself enforce the overall ``analogies`` non-emptiness invariant (``generate_synectics_session``
    validates whatever list of dicts it is handed regardless of how each entry was built, same convention
    ``strategy.bcg_matrix.py``'s own ``portfolio_item`` already establishes)."""
    if analogy_type not in ANALOGY_TYPES:
        raise InvariantViolation(f"SYNECTICS_INVALID_ANALOGY_TYPE: {analogy_type!r} is not one of {sorted(ANALOGY_TYPES)} (Atlas L388's own 3-value vocabulary; a 4th value is a real, disclosed refusal boundary, not an oversight)")
    if not _is_nonempty_str(analogy_content):
        raise InvariantViolation(f"SYNECTICS_EMPTY_ANALOGY_CONTENT: analogy_content must be a non-empty string, got {analogy_content!r}")
    if not _is_nonempty_str(reframed_insight):
        raise InvariantViolation(
            f"SYNECTICS_EMPTY_REFRAMED_INSIGHT: reframed_insight must be a non-empty string -- Atlas L388's own '重構問題' means the analogy must yield an "
            f"actual derived insight, not merely a listed analogy with no payload, got {reframed_insight!r}"
        )
    return {"analogy_type": analogy_type, "analogy_content": analogy_content, "reframed_insight": reframed_insight}


def _analogy_entry_is_valid(entry: Any) -> bool:
    """Shared shape-and-content predicate for ONE ``analogies[]`` entry -- used by both the builder and the
    gate so neither can drift from the other. Real invariants 3+4 from the module docstring."""
    if not isinstance(entry, dict) or set(entry.keys()) != _ANALOGY_ENTRY_KEYS:
        return False
    if entry.get("analogy_type") not in ANALOGY_TYPES:
        return False
    if not _is_nonempty_str(entry.get("analogy_content")):
        return False
    return _is_nonempty_str(entry.get("reframed_insight"))


def _analogies_are_valid(analogies: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from
    the other. Real invariants 2+3+4 from the module docstring, re-derived from raw fields, never trusting a
    stored value. Deliberately does NOT require per-type completeness or distinctness -- open-ended list,
    repeats of the same analogy_type are legal (see module docstring)."""
    if not isinstance(analogies, list) or not analogies:
        return False, "EMPTY_ANALOGY_LIST"
    for entry in analogies:
        if not isinstance(entry, dict) or set(entry.keys()) != _ANALOGY_ENTRY_KEYS:
            return False, "SHAPE"
        if entry.get("analogy_type") not in ANALOGY_TYPES:
            return False, "INVALID_ANALOGY_TYPE"
        if not _is_nonempty_str(entry.get("analogy_content")):
            return False, "EMPTY_ANALOGY_CONTENT"
        if not _is_nonempty_str(entry.get("reframed_insight")):
            return False, "EMPTY_REFRAMED_INSIGHT"
    return True, None


def generate_synectics_session(
    session_id: str,
    original_problem: str,
    analogies: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/synectics-session.schema.yaml``.

    Enforces all 4 real invariants fail-closed, same family-wide "raise-before-construction" discipline
    every sibling module in this package already establishes -- never a record that itself proves it was
    built illegally. ``provenance`` itself is stored as given (its schema-validity is checked by
    ``evaluate_provenance_required_gate`` below, not here -- same two-layer split every sibling module in
    this package already establishes between domain-specific builder invariants and the shared
    provenance-shape gate)."""
    if not _is_nonempty_str(session_id) or not session_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"SYNECTICS_INVALID_ID: session_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {session_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"SYNECTICS_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(original_problem):
        raise InvariantViolation(
            f"SYNECTICS_EMPTY_ORIGINAL_PROBLEM: original_problem must be a non-empty string -- Atlas L388's own '重構問題' is meaningless without naming WHICH "
            f"problem is being reframed, got {original_problem!r}"
        )

    valid, reason = _analogies_are_valid(analogies)
    if not valid:
        if reason == "EMPTY_ANALOGY_LIST":
            raise InvariantViolation(
                f"SYNECTICS_EMPTY_ANALOGY_LIST: analogies must be a non-empty list -- Atlas L388's own '重構問題' benefit requires at least one analogy "
                f"actually attempted, got {analogies!r}"
            )
        if reason == "INVALID_ANALOGY_TYPE":
            raise InvariantViolation(f"SYNECTICS_INVALID_ANALOGY_TYPE: analogies contains an analogy_type outside {sorted(ANALOGY_TYPES)}, got {analogies!r}")
        if reason == "EMPTY_ANALOGY_CONTENT":
            raise InvariantViolation(f"SYNECTICS_EMPTY_ANALOGY_CONTENT: every analogies[] entry must carry a non-empty analogy_content, got {analogies!r}")
        if reason == "EMPTY_REFRAMED_INSIGHT":
            raise InvariantViolation(
                f"SYNECTICS_EMPTY_REFRAMED_INSIGHT: every analogies[] entry must carry a non-empty reframed_insight -- Atlas L388's own '重構問題' means the "
                f"analogy must yield an actual derived insight, not merely a listed analogy with no payload, got {analogies!r}"
            )
        raise InvariantViolation(f"SYNECTICS_INVALID_ANALOGY_LIST: analogies must be a non-empty list of well-shaped entries, got {analogies!r}")

    return {
        "id": session_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "original_problem": original_problem,
        "analogies": [dict(entry) for entry in analogies],
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the session-level ``provenance`` field is
    schema-valid. Fails closed on non-dict input. No per-entry provenance to check -- unlike
    ``strategy.vrio``/``strategy.bcg_matrix``, ``analogies[]`` entries carry no provenance field of their
    own (task-mandated shape, see module docstring)."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    analogies = record.get("analogies")
    analogies = analogies if isinstance(analogies, list) else []
    record_provenance_ok = provenance_is_valid(record.get("provenance"))
    passed = bool(analogies) and record_provenance_ok
    return _result(
        "provenance_required",
        passed,
        [{"analogies_checked": len(analogies), "record_provenance_valid": record_provenance_ok}],
        validator,
        timestamp,
    )


def evaluate_synectics_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives ALL FOUR real invariants from the record's OWN raw fields -- does not trust any stored
    value and does NOT call ``generate_synectics_session``, so a hand-tampered record that bypassed the
    builder entirely (e.g. a smuggled 4th ``analogy_type`` value on an already-built record) is caught here
    exactly as a builder-refused one would have been. Fails closed on malformed input rather than
    crashing."""
    if not isinstance(record, dict):
        return _result("synectics_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("synectics_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("synectics_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("original_problem")):
        return _result("synectics_integrity", False, [{"reason": "original_problem missing or empty"}], validator, timestamp)

    valid, reason = _analogies_are_valid(record.get("analogies"))
    if not valid:
        return _result(
            "synectics_integrity",
            False,
            [{"reason": f"analogies invalid ({reason}) -- must be a non-empty list of well-shaped entries, each analogy_type in {sorted(ANALOGY_TYPES)}"}],
            validator,
            timestamp,
        )

    return _result("synectics_integrity", True, [{"analogy_count": len(record["analogies"])}], validator, timestamp)


def evaluate_synectics_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the one declared ``quality`` property, then the
    independent structural integrity re-derivation. No ``evidence_labeling_required`` gate -- the contract
    sets that flag to ``false`` (see divergent.synectics.contract.yaml's own ``quality``/
    ``compilation_decisions``), same "only emit gates for what is actually declared true" discipline
    ``strategy.bcg_matrix``'s own ``evaluate_bcg_matrix_gates`` already establishes."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_synectics_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
