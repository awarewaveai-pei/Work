"""``insight.focus_group`` -- F06 人類／顧客洞察 (Human / Customer Insight) family, one of 9 members opened
in this same batch (e.g. ``insight.jtbd``, ``insight.persona``, ``insight.contextual_inquiry``,
``insight.service_blueprint``, neither read nor imported here). F06 was entirely unbuilt before this batch
(grep-confirmed: no `ai_lego/modules/insight/` package existed anywhere in this repo before it).

Atlas cites this method ONCE: the F06 tool table row (L469: "Focus Group｜探索群體觀點與互動｜6–10 人→
moderation→discussion→analysis｜看到社會互動｜不用來估人口比例"). Grep-confirmed the only real hit
case-insensitively across the whole Atlas file -- no dedicated section, same thinnest-citation class
``strategy.bcg_matrix``/``divergent.random_stimulus`` already establish.

Two real invariants, each enforced BOTH at construction (raise BEFORE any record is built) AND
independently by a gate that re-derives from raw fields, same "shared predicate, reused by both layers"
discipline every sibling module in this suite already establishes:

1. ``participant_count`` MUST be an integer (bool explicitly excluded) in the CLOSED RANGE [6, 10] --
   Atlas's own F06 L469 literal "6–10 人" IS the method's own defining identity, same class
   ``divergent.crazy_eights``'s exactly-8 / ``divergent.lotus_blossom``'s exactly-8 already establish, here
   expressed as a range rather than an exact count. **bool-masquerade bug class, checked and disclosed**:
   ``bool`` is a subclass of ``int`` in Python (``True == 1``, ``False == 0``); ``True``/``False`` both
   already fall outside [6,10] by construction, so THIS specific range check happens to be safe from the
   bug class even without an explicit guard -- ``_is_valid_participant_count`` below adds
   ``isinstance(value, int) and not isinstance(value, bool)`` anyway, for defense-in-depth and consistency
   with sibling modules that DO need the guard for their own closed-set fields (``divergent.lotus_blossom``'s
   own critic-fixed ``_is_valid_branch_number``, ``divergent.crazy_eights``'s own ``_is_valid_box_number``).
2. ``generalizability_scope`` must ALWAYS equal ``GENERALIZABILITY_SCOPE``
   ("QUALITATIVE_EXPLORATION_NOT_POPULATION_ESTIMATE") on every record this module builds -- structurally
   guaranteed by parameter elimination (``generate_focus_group_session`` has no ``generalizability_scope``
   parameter at all, same "structural elimination" pattern ``divergent.scamper``'s own ``VALIDATION_STATUS``
   and ``divergent.random_stimulus``'s own ``FEASIBILITY_STATUS`` already establish for an analogous "don't
   let the output overclaim its own scope" caution, here grounded in Atlas's own F06 caution "不用來估
   人口比例"). The independent gate re-checks this field against the record's own raw data anyway, so a
   hand-tampered record that bypassed the builder entirely (e.g. claiming a population-representative scope)
   is still caught.

**Provenance is RECORD-LEVEL ONLY** (fixed batch-wide decision for this entire F06 batch, deliberately
avoiding the per-item/record-level ambiguity that hit both the prior F02 and F03 batches -- see
``insight.focus_group.contract.yaml``'s own ``compilation_decisions``). There is also no list-of-items field
in this type to attach per-item provenance to: ``topic``/``participant_count``/``moderation_approach``/
``discussion_summary``/``analysis`` are all single scalar fields describing one session as a whole.

Grepped the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` trees case-insensitively for "focus_group"/"FocusGroup"
before writing any of this method's own files: zero pre-existing implementation.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "insight.focus_group"
RECORD_ID_PREFIX = "FOCUSGROUP-"

MIN_PARTICIPANTS = 6
MAX_PARTICIPANTS = 10
# Atlas F06 L469's own literal "6–10 人" method-defining count -- a CLOSED RANGE, not an example value. Same
# literal-number-is-the-method's-own-identity discipline divergent.crazy_eights's exactly-8 /
# divergent.lotus_blossom's exactly-8 already establish, generalized here from an exact count to a range.

GENERALIZABILITY_SCOPE = "QUALITATIVE_EXPLORATION_NOT_POPULATION_ESTIMATE"
# Atlas's own F06 caution ("不用來估人口比例"), made structural (see module docstring, invariant 2). NOT a
# caller-settable parameter of generate_focus_group_session -- every record this builder produces carries
# exactly this value, no code path allows any other.


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_valid_participant_count(value: Any) -> bool:
    """Invariant 1: an integer (bool explicitly excluded) in the closed range [MIN_PARTICIPANTS,
    MAX_PARTICIPANTS]. ``bool`` is a subclass of ``int`` in Python -- explicitly excluded so ``True``/
    ``False`` can never masquerade as ``1``/``0``, same guard sibling F03 modules
    ``divergent.crazy_eights``'s own ``_is_valid_box_number`` and ``divergent.lotus_blossom``'s own
    ``_is_valid_branch_number`` already apply to their own closed-integer-enum fields. Checked here even
    though True(1)/False(0) both already fall outside [6,10] by construction (this range happens to be safe
    from the bug class without the guard) -- included anyway per this batch's task-mandated discipline, not
    because a live gap was found. Shared by the builder and the gate so neither can drift from the other."""
    return isinstance(value, int) and not isinstance(value, bool) and MIN_PARTICIPANTS <= value <= MAX_PARTICIPANTS


def generate_focus_group_session(
    session_id: str,
    topic: str,
    participant_count: int,
    moderation_approach: str,
    discussion_summary: str,
    analysis: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/focus-group-session.schema.yaml``.

    Enforces real invariant 1 fail-closed, same family-wide "raise-before-construction" discipline every
    sibling module in this package already establishes. Invariant 2 (``generalizability_scope``) is enforced
    by NOT accepting it as a parameter at all -- see module docstring "invariant 2". There is no code path
    through which a caller could construct a record via this builder whose stored
    ``generalizability_scope`` disagrees with ``GENERALIZABILITY_SCOPE``.
    """
    if not _is_nonempty_str(session_id) or not session_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"FOCUSGROUP_INVALID_ID: session_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {session_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"FOCUSGROUP_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"FOCUSGROUP_INVALID_PROVENANCE: provenance must be a schema-valid provenance_record, got {provenance!r}")
    if not _is_nonempty_str(topic):
        raise InvariantViolation(f"FOCUSGROUP_EMPTY_TOPIC: topic must be a non-empty string, got {topic!r}")
    if not _is_valid_participant_count(participant_count):
        raise InvariantViolation(
            f"FOCUSGROUP_INVALID_PARTICIPANT_COUNT: participant_count must be an int (bool excluded) in the closed range "
            f"[{MIN_PARTICIPANTS}, {MAX_PARTICIPANTS}] (Atlas F06 L469's own '6–10 人' method-defining count), got {participant_count!r}"
        )
    if not _is_nonempty_str(moderation_approach):
        raise InvariantViolation(f"FOCUSGROUP_EMPTY_MODERATION_APPROACH: moderation_approach must be a non-empty string, got {moderation_approach!r}")
    if not _is_nonempty_str(discussion_summary):
        raise InvariantViolation(f"FOCUSGROUP_EMPTY_DISCUSSION_SUMMARY: discussion_summary must be a non-empty string, got {discussion_summary!r}")
    if not _is_nonempty_str(analysis):
        raise InvariantViolation(f"FOCUSGROUP_EMPTY_ANALYSIS: analysis must be a non-empty string, got {analysis!r}")

    return {
        "id": session_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "topic": topic,
        "participant_count": participant_count,
        "moderation_approach": moderation_approach,
        "discussion_summary": discussion_summary,
        "analysis": analysis,
        "generalizability_scope": GENERALIZABILITY_SCOPE,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance is schema-valid.
    Record-level only (see module docstring -- this method's fields are all scalar, there is no list of
    items to carry a per-item provenance field, same convention divergent.random_stimulus/
    divergent.lotus_blossom already establish for their own record-level-only provenance)."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_focus_group_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored value
    and does NOT call ``generate_focus_group_session``, so a hand-tampered record that bypassed the builder
    entirely is caught here exactly as a builder-refused one would have been. In particular, this is the
    ONLY place ``generalizability_scope`` is checked against ``GENERALIZABILITY_SCOPE`` -- proves the
    builder's parameter-elimination guarantee is ALSO independently re-checked, not merely assumed because
    the builder never exposed the field (catches, e.g., a hand-tampered record claiming a
    population-representative scope). Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("focus_group_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("focus_group_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("focus_group_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("topic")):
        return _result("focus_group_integrity", False, [{"reason": "topic missing, not a string, or empty"}], validator, timestamp)
    if not _is_valid_participant_count(record.get("participant_count")):
        return _result(
            "focus_group_integrity",
            False,
            [{"reason": f"participant_count invalid -- must be an int (bool excluded) in [{MIN_PARTICIPANTS}, {MAX_PARTICIPANTS}], got {record.get('participant_count')!r}"}],
            validator,
            timestamp,
        )
    if not _is_nonempty_str(record.get("moderation_approach")):
        return _result("focus_group_integrity", False, [{"reason": "moderation_approach missing, not a string, or empty"}], validator, timestamp)
    if not _is_nonempty_str(record.get("discussion_summary")):
        return _result("focus_group_integrity", False, [{"reason": "discussion_summary missing, not a string, or empty"}], validator, timestamp)
    if not _is_nonempty_str(record.get("analysis")):
        return _result("focus_group_integrity", False, [{"reason": "analysis missing, not a string, or empty"}], validator, timestamp)
    if record.get("generalizability_scope") != GENERALIZABILITY_SCOPE:
        return _result(
            "focus_group_integrity",
            False,
            [{"reason": f"INVALID_GENERALIZABILITY_SCOPE: expected exactly {GENERALIZABILITY_SCOPE!r}, got {record.get('generalizability_scope')!r}"}],
            validator,
            timestamp,
        )

    return _result("focus_group_integrity", True, [{"participant_count": record["participant_count"]}], validator, timestamp)


def evaluate_focus_group_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the declared ``quality.provenance_required``
    property, then the independent structural-integrity re-derivation (which also re-checks
    ``generalizability_scope``). No ``evidence_labeling_required`` gate -- the contract sets that quality
    flag false (see insight.focus_group.contract.yaml's own ``quality``/``compilation_decisions``), same
    "only emit gates for what is actually declared true" discipline ``strategy.bcg_matrix``'s own
    ``evaluate_bcg_matrix_gates`` already establishes."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_focus_group_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
