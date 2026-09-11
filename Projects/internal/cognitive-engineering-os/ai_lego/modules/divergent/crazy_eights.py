"""``divergent.crazy_eights`` -- F03 divergent-ideation family, 1st member, opening the family (grep-
confirmed zero pre-existing `divergent.*`/`CrazyEights`/`crazy_eights`/`CRAZY8` anywhere before this file; 9
sibling F03 methods -- SCAMPER/Lotus Blossom/Starbursting/Random Stimulus/Forced Connections/Synectics/etc --
remain unbuilt). Read ``ai_lego/modules/strategy/ansoff.py`` in full as this module's primary structural
template (closest sibling: a closed, fixed-count vocabulary with completeness+uniqueness required, no
position) and ``ai_lego/modules/decomposition/wbs.py`` for the record-level-only provenance precedent --
neither edited.

Atlas cites this method TWICE: the F03 tool table row (L382: "Crazy 8s｜強迫突破第一答案｜8 格、8 分鐘、8 方案｜
降低 perfectionism｜適合概念/介面") and a dedicated §12.10 section (L2650-2655: "用途：八分鐘畫八個不同
concept／效益：打破第一答案、降低 perfectionism／適用：UI、服務流程、產品概念／限制：不適合作為最後方案評選").
Grep-confirmed exactly 7 case-insensitive "crazy" hits total across the whole Atlas file: these 2 definitional
citations plus 5 cross-reference mentions from OTHER methods' own rows/diagrams (L342 How Might We's own
best-paired column, L2580 §12.3's own JTBD->HMW chain, L3339/L3661 flowchart nodes, L4470 quick-pick table) --
none of the 5 add a new invariant beyond the 2 definitional citations' own "8 格、8 分鐘、8 方案" identity.

**Design-shape choice (task-mandated, disclosed here)**: unlike ``collaboration.635`` (headcount adjustable
per its own citation), Crazy 8s's own literal name/citation gives NO adjustability caveat -- "8 格、8 分鐘、
8 方案" IS the method's own fixed identity, same class ``decomposition.wbs``'s own "100% rule" and
``strategy.bcg_matrix``'s own 2x2 grid already establish for other methods' own literal-number-is-the-
method's-own-name precedents. ``BOX_NUMBERS`` below is therefore a closed SET requiring completeness (all 8,
each exactly once) WITHOUT position (Atlas's own citations list no cited sequence between the 8 boxes) --
the same third shape ``strategy.porter_five_forces``'s own ``FORCE_NAMES``/``strategy.ansoff``'s own
``QUADRANT_NAMES`` already establish, generalized from named categories to a fixed numeric range.

Real invariants (grounded in Atlas L382/§12.10, each enforced BOTH at construction, raise BEFORE any record
is built, AND independently re-derived by a gate that never trusts a stored value -- same two-layer
discipline every sibling module in this package already establishes):

1. ``concepts`` is EXACTLY 8 entries, whose ``box_number`` values are EXACTLY the 8 ``BOX_NUMBERS`` values,
   each appearing EXACTLY ONCE, in ANY order (unordered completeness -- see design-shape note above).
   Missing, duplicated, or out-of-range box numbers are all refused, and so is any count other than 8.
2. Every concept entry carries a non-empty ``sketch_description`` (task-mandated restraint: reported content,
   never computed), AND no two concepts[] entries may share a CHARACTER-IDENTICAL ``sketch_description`` --
   Atlas's own stated benefit ("強迫突破第一答案"/"打破第一答案") presumes 8 GENUINELY DIFFERENT concepts, not
   8 copies of the first idea. Exact character-match only (task's own literal wording), NOT a normalized
   NFKC/casefold comparison the way ``association.analogy_mapping``'s own distinctness check uses -- see
   this method's own contract ``compilation_decisions`` for the disclosed reasoning.

Unlike every F08 sibling schema in this corpus, there is NO per-concept ``provenance`` field -- this method's
own task-mandated shape is ``{id, version, provenance, concepts:[{box_number, sketch_description}]}``, a
SINGLE record-level ``provenance`` (128/128 corpus convention, same record-level-only precedent
``decomposition.wbs``'s own disclosed addition already establishes), never a per-item one.

Grepped the whole ``ai_lego`` tree case-insensitively for "crazy" before writing any of this method's own
files: zero pre-existing implementation (``ai_lego/modules/strategy/`` and other family ``__init__.py`` files
carry no "Crazy 8s" mention at all -- confirmed absent, not merely undocumented).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "divergent.crazy_eights"
RECORD_ID_PREFIX = "CRAZY8-"
BOX_NUMBERS: frozenset[int] = frozenset({1, 2, 3, 4, 5, 6, 7, 8})
# Atlas L382/§12.10's own literal "8 格" (8 boxes) identity -- a closed numeric range, NOT an adjustable
# headcount (contrast collaboration.635's own citation, which explicitly allows headcount adjustment). See
# module docstring's design-shape note.

_CONCEPT_REQUIRED_KEYS = frozenset({"box_number", "sketch_description"})
# Deliberately NO "provenance" key here -- provenance is record-level only (see module docstring), unlike
# every F08 sibling module's own per-item _*_REQUIRED_KEYS in this corpus.


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_valid_box_number(value: Any) -> bool:
    # bool is a subclass of int in Python -- explicitly excluded so True/False can never masquerade as 1/0.
    return isinstance(value, int) and not isinstance(value, bool) and value in BOX_NUMBERS


def _concept_entry_shaped(entry: Any) -> bool:
    if not isinstance(entry, dict):
        return False
    return set(entry.keys()) == _CONCEPT_REQUIRED_KEYS


def _concepts_are_valid(concepts: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from
    the other -- same discipline every sibling module in this package establishes. Real invariants 1+2 from
    the module docstring, re-derived from raw fields, never trusting a stored value.

    Deliberately does NOT short-circuit on ``len(concepts) != 8`` up front: a wrong COUNT (too few, too many,
    or the right count with a duplicate box_number) is a completeness defect (``INCOMPLETE_CONCEPT_SET``), a
    distinct failure reason from a malformed ENTRY (``SHAPE``/``UNKNOWN_BOX_NUMBER``/etc), same convention
    ``ansoff.py``'s own ``_quadrants_are_valid`` already establishes."""
    if not isinstance(concepts, list):
        return False, "SHAPE"
    seen_box_numbers: list[int] = []
    seen_descriptions: list[str] = []
    for entry in concepts:
        if not _concept_entry_shaped(entry):
            return False, "SHAPE"
        box_number = entry.get("box_number")
        if not _is_valid_box_number(box_number):
            return False, "UNKNOWN_BOX_NUMBER"
        seen_box_numbers.append(box_number)
        description = entry.get("sketch_description")
        if not _is_nonempty_str(description):
            return False, "EMPTY_SKETCH_DESCRIPTION"
        seen_descriptions.append(description)

    if len(seen_box_numbers) != len(BOX_NUMBERS) or set(seen_box_numbers) != BOX_NUMBERS:
        return False, "INCOMPLETE_CONCEPT_SET"
    if len(set(seen_descriptions)) != len(seen_descriptions):
        return False, "DUPLICATE_SKETCH_DESCRIPTION"
    return True, None


def concept_entry(box_number: int, sketch_description: str) -> dict[str, Any]:
    """One item of ``typed-objects/crazy-eights-session.schema.yaml#/properties/concepts``. Convenience
    constructor only -- emits ONLY known-good keys; does NOT itself enforce the completeness/distinctness
    invariants (``generate_crazy_eights_session`` validates whatever list of dicts it is handed regardless of
    how each entry was built, same convention ``ansoff.py``'s own ``quadrant_entry`` already establishes)."""
    if not _is_valid_box_number(box_number):
        raise InvariantViolation(f"CRAZY8_UNKNOWN_BOX_NUMBER: {box_number!r} is not one of {sorted(BOX_NUMBERS)} (Atlas L382/§12.10's own fixed 8-box identity)")
    if not _is_nonempty_str(sketch_description):
        raise InvariantViolation(f"CRAZY8_EMPTY_SKETCH_DESCRIPTION: sketch_description must be a non-empty string, got {sketch_description!r}")
    return {"box_number": box_number, "sketch_description": sketch_description}


def generate_crazy_eights_session(
    session_id: str,
    concepts: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/crazy-eights-session.schema.yaml``.

    Enforces both real invariants fail-closed, same family-wide "raise-before-construction" discipline every
    sibling module in this package already establishes -- never a record that itself proves it was built
    illegally. ``provenance`` is a REQUIRED record-level parameter (no per-concept provenance -- see module
    docstring).
    """
    if not _is_nonempty_str(session_id) or not session_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"CRAZY8_INVALID_ID: session_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {session_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"CRAZY8_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"CRAZY8_INVALID_PROVENANCE: provenance must be a schema-valid provenance_record, got {provenance!r}")

    valid, reason = _concepts_are_valid(concepts)
    if not valid:
        if reason == "UNKNOWN_BOX_NUMBER":
            raise InvariantViolation(f"CRAZY8_UNKNOWN_BOX_NUMBER: concepts contains a box_number outside {sorted(BOX_NUMBERS)}, got {concepts!r}")
        if reason == "EMPTY_SKETCH_DESCRIPTION":
            raise InvariantViolation(f"CRAZY8_EMPTY_SKETCH_DESCRIPTION: every concept entry must carry a non-empty 'sketch_description', got {concepts!r}")
        if reason == "INCOMPLETE_CONCEPT_SET":
            raise InvariantViolation(
                f"CRAZY8_INCOMPLETE_CONCEPT_SET: concepts must name EXACTLY the eight box numbers {sorted(BOX_NUMBERS)}, each exactly once -- Atlas L382/§12.10's own "
                f"'8 格、8 方案' IS the method's fixed identity, got {concepts!r}"
            )
        if reason == "DUPLICATE_SKETCH_DESCRIPTION":
            raise InvariantViolation(
                f"CRAZY8_DUPLICATE_SKETCH_DESCRIPTION: no two concepts[] entries may share a character-identical sketch_description -- Atlas's own '強迫突破第一答案' "
                f"benefit presumes 8 genuinely different concepts, got {concepts!r}"
            )
        raise InvariantViolation(f"CRAZY8_INVALID_CONCEPT_SET: concepts must be exactly {len(BOX_NUMBERS)} well-shaped entries, got {concepts!r}")

    return {
        "id": session_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "provenance": dict(provenance),
        "concepts": [dict(c) for c in concepts],
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own (record-level-only, see module
    docstring) provenance is schema-valid. Fails closed on non-dict input. Same shape
    ``decomposition/wbs.py``'s own identical record-level-only gate already establishes -- unlike
    ``ansoff.py``/``bcg_matrix.py``, this does NOT iterate over ``concepts[]`` because there is no per-item
    provenance field here to check."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_crazy_eights_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_crazy_eights_session``, so a hand-tampered record that bypassed the builder
    entirely is caught here exactly as a builder-refused one would have been. Fails closed on malformed input
    rather than crashing."""
    if not isinstance(record, dict):
        return _result("crazy_eights_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("crazy_eights_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("crazy_eights_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not provenance_is_valid(record.get("provenance")):
        return _result("crazy_eights_integrity", False, [{"reason": "record-level provenance missing or invalid"}], validator, timestamp)

    valid, reason = _concepts_are_valid(record.get("concepts"))
    if not valid:
        return _result(
            "crazy_eights_integrity",
            False,
            [{"reason": f"concepts invalid ({reason}) -- must name exactly the eight box numbers {sorted(BOX_NUMBERS)}, each exactly once, well-shaped, with pairwise-distinct sketch_description"}],
            validator,
            timestamp,
        )

    return _result("crazy_eights_integrity", True, [{"concept_count": len(record["concepts"])}], validator, timestamp)


def evaluate_crazy_eights_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the one declared ``quality`` property, then the
    independent structural-integrity re-derivation. No ``evidence_labeling_required`` gate -- the contract
    sets that flag to ``false`` (see divergent.crazy_eights.contract.yaml's own
    ``quality``/``compilation_decisions``), same "only emit gates for what is actually declared true"
    discipline ``ansoff.py``'s own ``evaluate_ansoff_gates`` already establishes."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_crazy_eights_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
