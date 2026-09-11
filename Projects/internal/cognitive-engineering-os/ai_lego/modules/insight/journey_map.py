"""``insight.journey_map`` -- F06 人類／顧客洞察 (Human/Customer Insight) family, one of 9 members opened
in this same batch (each an independent agent; F06 was entirely unbuilt before this batch -- this module
opens the family alongside a sibling ``persona.py``, neither imported here).

Atlas cites this method TWICE: the F06 tool table row (L464: "Journey Map｜端到端體驗｜stages→actions→
emotion→pain→opportunity｜找斷點與高價值改善點｜可加 evidence") AND a dedicated §11.13 "顧客旅程地圖／使用者
旅程地圖" (L1489-1512, a mermaid 7-stage illustrative purchase-journey flow plus a richer per-stage 7-field
list: Actions/Questions/Emotion/Pain/Evidence/Opportunity/Responsible system-team). This module follows the
table row's leaner 5-field per-stage shape (actions/emotion/pain/opportunity/evidence) -- Questions and
Responsible system/team (§11.13-only) are deliberately dropped, see the method contract's own
``compilation_decisions``.

**Real invariant (GENUINE_COMPUTE, structural not textual)**: ``stages`` is non-empty, and the set of
``stage_number`` values across ALL stages equals EXACTLY ``{1, 2, ..., len(stages)}`` -- no gaps, no
duplicates. This generalizes ``divergent.lotus_blossom``'s fixed-8 numeric-slot completeness pattern
(``BRANCH_NUMBERS``) to a caller-determined length N = len(stages), grounded in Atlas's own "端到端體驗"
(end-to-end experience) framing: a journey map with skipped or duplicated stage numbers has not actually
mapped a coherent end-to-end sequence. Enforced BOTH at construction, raised BEFORE any record is built,
AND independently re-derived by a gate that never trusts a stored value -- same two-layer discipline every
sibling module in this package already establishes.

**Bug-class awareness (critic finding, F03 batch, 2026-09-11)**: ``bool`` is a subclass of ``int`` in Python
(``True == 1``, ``False == 0``) -- ``lotus_blossom.py`` originally shipped without excluding ``bool`` from
its own closed-integer-enum check and a critic pass had to fix it. This module's own ``_is_valid_stage_number``
explicitly excludes ``bool`` from the start so ``True``/``False`` can never masquerade as a real
``stage_number``.

Provenance is RECORD-LEVEL ONLY (task-mandated F06 batch-wide design, to avoid the per-item/record-level
ambiguity that hit both the F02 and F03 batches) -- same single-whole-record granularity
``divergent.lotus_blossom``'s own top-level ``provenance`` already establishes.

``journey_subject``/``stage_name``/``actions``/``emotion``/``pain``/``opportunity``/``evidence`` are all
free-text REPORTED content, never GENUINE_COMPUTE -- no citation supports mechanically deriving any of them
from anything else. ONLY the ``stage_number`` sequence completeness itself is a real structural invariant.

Grepped the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` trees case-insensitively for
"journey_map"/"JourneyMap"/"customer journey" before writing any of this method's own files: zero
pre-existing implementation.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "insight.journey_map"
RECORD_ID_PREFIX = "JOURNEY-"

_STAGE_REQUIRED_KEYS = frozenset({"stage_number", "stage_name", "actions", "emotion", "pain", "opportunity"})
_STAGE_OPTIONAL_KEYS = frozenset({"evidence"})
_STAGE_ALL_KEYS = _STAGE_REQUIRED_KEYS | _STAGE_OPTIONAL_KEYS


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_valid_evidence(value: Any) -> bool:
    """OPTIONAL and NULLABLE (Atlas L464's own '可加 evidence'). ``None`` is always valid; a present string
    must be non-empty (a bare empty string would be schema-shape-valid but semantically hollow -- same
    non-empty-when-present discipline every other free-text field in this module applies)."""
    return value is None or _is_nonempty_str(value)


def _is_valid_stage_number(value: Any) -> bool:
    """Critic finding, F03 batch 2026-09-11 (``lotus_blossom.py``): ``bool`` is a subclass of ``int`` in
    Python (``True == 1``) -- explicitly excluded here from the start so ``True``/``False`` can never
    masquerade as a real ``stage_number``. Only bounded to a positive integer here; the real upper bound
    (``len(stages)``) is checked by ``_stages_are_valid`` below, which is the only place that knows N."""
    return isinstance(value, int) and not isinstance(value, bool) and value >= 1


def _stage_entry_shaped(entry: Any) -> bool:
    if not isinstance(entry, dict):
        return False
    keys = set(entry.keys())
    if not _STAGE_REQUIRED_KEYS.issubset(keys):
        return False
    return keys.issubset(_STAGE_ALL_KEYS)


def _stages_are_valid(stages: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from
    the other. Re-derives the real invariant from raw fields, never trusting a stored value.

    The completeness target is N = len(stages) itself (NOT a fixed constant like lotus_blossom's 8) --
    each stage contributes exactly one ``stage_number``, so a duplicate strictly reduces the number of
    DISTINCT values below N, and a gap means some value in {1..N} is missing. Checked as two separate,
    explicitly distinguished failure reasons (DUPLICATE vs GAP) for a clearer refusal message, even though
    either condition alone already implies ``set(seen) != expected``."""
    if not isinstance(stages, list):
        return False, "SHAPE"
    if len(stages) == 0:
        return False, "EMPTY_STAGES"

    seen_numbers: list[int] = []
    for entry in stages:
        if not _stage_entry_shaped(entry):
            return False, "SHAPE"
        stage_number = entry.get("stage_number")
        if not _is_valid_stage_number(stage_number):
            return False, "INVALID_STAGE_NUMBER"
        seen_numbers.append(stage_number)
        if not _is_nonempty_str(entry.get("stage_name")):
            return False, "EMPTY_STAGE_NAME"
        if not _is_nonempty_str(entry.get("actions")):
            return False, "EMPTY_ACTIONS"
        if not _is_nonempty_str(entry.get("emotion")):
            return False, "EMPTY_EMOTION"
        if not _is_nonempty_str(entry.get("pain")):
            return False, "EMPTY_PAIN"
        if not _is_nonempty_str(entry.get("opportunity")):
            return False, "EMPTY_OPPORTUNITY"
        if "evidence" in entry and not _is_valid_evidence(entry.get("evidence")):
            return False, "INVALID_EVIDENCE"

    expected = set(range(1, len(stages) + 1))
    distinct = set(seen_numbers)
    if len(distinct) != len(seen_numbers):
        return False, "DUPLICATE_STAGE_NUMBER"
    if distinct != expected:
        return False, "STAGE_NUMBER_GAP"
    return True, None


def stage_entry(
    stage_number: int,
    stage_name: str,
    actions: str,
    emotion: str,
    pain: str,
    opportunity: str,
    evidence: str | None = None,
) -> dict[str, Any]:
    """One item of ``typed-objects/journey-map.schema.yaml#/properties/stages``. Convenience constructor
    only -- emits ONLY known-good keys; does NOT itself enforce the cross-stage sequence-completeness
    invariant across the whole stages[] list (``generate_journey_map`` validates whatever list of dicts it
    is handed regardless of how each entry was built, same convention ``divergent.lotus_blossom``'s own
    ``branch_entry`` already establishes). DOES enforce this stage's OWN per-field validity since those
    checks are entirely local to this one entry. ``evidence`` defaults to ``None`` (OPTIONAL and NULLABLE,
    see module docstring) but the key is always emitted so a built record always shows its own evidence
    state explicitly rather than relying on silent absence."""
    if not _is_valid_stage_number(stage_number):
        raise InvariantViolation(f"JOURNEY_INVALID_STAGE_NUMBER: stage_number must be a positive integer (not bool), got {stage_number!r}")
    if not _is_nonempty_str(stage_name):
        raise InvariantViolation(f"JOURNEY_EMPTY_STAGE_NAME: stage_name must be a non-empty string, got {stage_name!r}")
    if not _is_nonempty_str(actions):
        raise InvariantViolation(f"JOURNEY_EMPTY_ACTIONS: actions must be a non-empty string, got {actions!r}")
    if not _is_nonempty_str(emotion):
        raise InvariantViolation(f"JOURNEY_EMPTY_EMOTION: emotion must be a non-empty string, got {emotion!r}")
    if not _is_nonempty_str(pain):
        raise InvariantViolation(f"JOURNEY_EMPTY_PAIN: pain must be a non-empty string, got {pain!r}")
    if not _is_nonempty_str(opportunity):
        raise InvariantViolation(f"JOURNEY_EMPTY_OPPORTUNITY: opportunity must be a non-empty string, got {opportunity!r}")
    if not _is_valid_evidence(evidence):
        raise InvariantViolation(f"JOURNEY_INVALID_EVIDENCE: evidence must be None or a non-empty string (Atlas L464's own '可加 evidence'), got {evidence!r}")
    return {
        "stage_number": stage_number,
        "stage_name": stage_name,
        "actions": actions,
        "emotion": emotion,
        "pain": pain,
        "opportunity": opportunity,
        "evidence": evidence,
    }


def generate_journey_map(
    map_id: str,
    journey_subject: str,
    stages: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/journey-map.schema.yaml``.

    Enforces the real invariant fail-closed, same family-wide "raise-before-construction" discipline every
    sibling module in this package already establishes -- never a record that itself proves it was built
    illegally. ``provenance`` is RECORD-LEVEL only (see module docstring) -- stored verbatim, its own shape
    validity is checked by ``evaluate_provenance_required_gate``, not here (same division of labor
    ``divergent.lotus_blossom``'s own ``generate_lotus_blossom_session`` already establishes).
    """
    if not _is_nonempty_str(map_id) or not map_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"JOURNEY_INVALID_ID: map_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {map_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"JOURNEY_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(journey_subject):
        raise InvariantViolation(f"JOURNEY_EMPTY_SUBJECT: journey_subject must be a non-empty string, got {journey_subject!r}")

    valid, reason = _stages_are_valid(stages)
    if not valid:
        if reason == "EMPTY_STAGES":
            raise InvariantViolation("JOURNEY_EMPTY_STAGES: stages must be non-empty -- a journey map with zero stages has not mapped an end-to-end experience (Atlas L464's own '端到端體驗')")
        if reason == "INVALID_STAGE_NUMBER":
            raise InvariantViolation(f"JOURNEY_INVALID_STAGE_NUMBER: every stage_number must be a positive integer (not bool), got {stages!r}")
        if reason == "EMPTY_STAGE_NAME":
            raise InvariantViolation(f"JOURNEY_EMPTY_STAGE_NAME: every stage must carry a non-empty 'stage_name', got {stages!r}")
        if reason == "EMPTY_ACTIONS":
            raise InvariantViolation(f"JOURNEY_EMPTY_ACTIONS: every stage must carry a non-empty 'actions', got {stages!r}")
        if reason == "EMPTY_EMOTION":
            raise InvariantViolation(f"JOURNEY_EMPTY_EMOTION: every stage must carry a non-empty 'emotion', got {stages!r}")
        if reason == "EMPTY_PAIN":
            raise InvariantViolation(f"JOURNEY_EMPTY_PAIN: every stage must carry a non-empty 'pain', got {stages!r}")
        if reason == "EMPTY_OPPORTUNITY":
            raise InvariantViolation(f"JOURNEY_EMPTY_OPPORTUNITY: every stage must carry a non-empty 'opportunity', got {stages!r}")
        if reason == "INVALID_EVIDENCE":
            raise InvariantViolation(f"JOURNEY_INVALID_EVIDENCE: every stage's 'evidence' must be None or a non-empty string, got {stages!r}")
        if reason == "DUPLICATE_STAGE_NUMBER":
            raise InvariantViolation(
                f"JOURNEY_DUPLICATE_STAGE_NUMBER: stage_number values must each appear exactly once across all {len(stages)} stages -- Atlas's own "
                f"'端到端' (end-to-end) framing IS a real ordered sequence, a duplicate has not mapped a coherent one, got {stages!r}"
            )
        if reason == "STAGE_NUMBER_GAP":
            raise InvariantViolation(
                f"JOURNEY_STAGE_NUMBER_GAP: stage_number values must cover EXACTLY {{1..{len(stages)}}} with no gaps -- Atlas's own '端到端' (end-to-end) "
                f"framing IS a real ordered sequence, a gap has not mapped a coherent one, got {stages!r}"
            )
        raise InvariantViolation(f"JOURNEY_INVALID_STAGES: stages must be a well-shaped, sequence-complete list, got {stages!r}")

    return {
        "id": map_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "journey_subject": journey_subject,
        "stages": [dict(s) for s in stages],
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the OVERALL record carries a schema-valid
    provenance_record. RECORD-LEVEL only (see module docstring) -- unlike ansoff/bcg, there is no per-stage
    provenance to check here at all (stages[] carries no provenance key by design)."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    record_provenance_ok = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", record_provenance_ok, [{"record_provenance_valid": record_provenance_ok}], validator, timestamp)


def evaluate_journey_map_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives the real invariant from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_journey_map``, so a hand-tampered record that bypassed the builder entirely is
    caught here exactly as a builder-refused one would have been. Fails closed on malformed input rather
    than crashing."""
    if not isinstance(record, dict):
        return _result("journey_map_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("journey_map_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("journey_map_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("journey_subject")):
        return _result("journey_map_integrity", False, [{"reason": "journey_subject missing, not a string, or empty"}], validator, timestamp)

    valid, reason = _stages_are_valid(record.get("stages"))
    if not valid:
        return _result(
            "journey_map_integrity",
            False,
            [{"reason": f"stages invalid ({reason}) -- must be non-empty with stage_number covering exactly {{1..len(stages)}}, each exactly once, every other field a non-empty string"}],
            validator,
            timestamp,
        )

    return _result("journey_map_integrity", True, [{"stage_count": len(record["stages"])}], validator, timestamp)


def evaluate_journey_map_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the one declared ``quality`` property, then the
    independent structural-integrity re-derivation. No ``evidence_labeling_required`` gate -- the contract
    sets that flag to ``false`` (see insight.journey_map.contract.yaml's own ``quality``/
    ``compilation_decisions``), same "only emit gates for what is actually declared true" discipline
    ``divergent.lotus_blossom``'s own ``evaluate_lotus_blossom_gates`` already establishes."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_journey_map_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
