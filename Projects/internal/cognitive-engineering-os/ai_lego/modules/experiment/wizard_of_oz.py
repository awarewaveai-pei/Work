"""``experiment.wizard_of_oz`` -- F15 experiment & validation family (Atlas L743).

Atlas's own table row (L743, verbatim): "Wizard of Oz | 前台自動、後台人工 |
mock automation->human backend | 驗證互動而不先建完整系統" (an automated-looking
front end, a human-operated backend; mock automation->human backend; validate
the interaction without first building the complete system).

F15's shared core principle (Atlas L750-752, verbatim): 找到「最便宜且足以證偽
Critical Assumption 的測試」，而不是讓 AI 主觀打 8.7/10 (find the cheapest test
sufficient to falsify the Critical Assumption, not a subjective AI score).
Operationalized here for the Critical Assumption a Wizard of Oz test
falsifies -- "users will actually engage with THIS INTERACTION, independent
of whether real automation exists behind it" -- via two structural halves
that ARE the row's own contrast, plus the discipline the row's own name
implies (a wizard behind a curtain, not a hidden con):

1. **Front/back contrast, THE defining half distinguishing this method
   from `experiment.concierge_test`** (``WOZ_FRONT_NOT_AUTOMATED_LOOKING`` /
   ``WOZ_BACK_NOT_HUMAN``) -- ``front_end.presented_as_automated`` and
   ``back_end.actually_human_operated`` must both be literally ``True``.
   Concierge Test has no automated-looking front end at all (the service is
   openly manual); Wizard of Oz specifically tests an interaction that
   LOOKS automated while a human runs it -- without both flags literally
   true, a record is not testing that contrast.
2. **Self-disclosure, the invariant this method's own name implies**
   (``WOZ_NO_DISCLOSURE``) -- ``disclosure.faked_components`` must name at
   least one faked component. A "Wizard of Oz test" that never records
   which parts are faked, even to itself, is structurally indistinguishable
   from simply shipping a fake feature with no test attached to it.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for
"wizard of oz"/"wizard_of_oz"/"mock automation" before writing any of this
method's own files: zero pre-existing implementation or schema title
overlap.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "experiment.wizard_of_oz"
RECORD_ID_PREFIX = "WOZ-"

_FRONT_END_KEYS = frozenset({"presented_as_automated", "description"})
_BACK_END_KEYS = frozenset({"actually_human_operated", "operator_role", "description"})
_DISCLOSURE_KEYS = frozenset({"faked_components", "real_components", "disclosed_to"})
_DISCLOSED_TO_VALUES = frozenset({"INTERNAL_TEAM_ONLY", "WILL_DISCLOSE_TO_USER_AT_STUDY_END", "NEVER_DISCLOSED_TO_USER"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _front_end_shape_is_valid(value: Any) -> bool:
    if not isinstance(value, dict) or set(value.keys()) != _FRONT_END_KEYS:
        return False
    if not isinstance(value.get("presented_as_automated"), bool):
        return False
    return _is_nonempty_str(value.get("description"))


def _front_end_is_automated_looking(value: dict[str, Any]) -> bool:
    """Invariant #1, first half. Precondition: ``_front_end_shape_is_valid`` already True."""
    return value["presented_as_automated"] is True


def _back_end_shape_is_valid(value: Any) -> bool:
    if not isinstance(value, dict) or set(value.keys()) != _BACK_END_KEYS:
        return False
    if not isinstance(value.get("actually_human_operated"), bool):
        return False
    if not _is_nonempty_str(value.get("operator_role")):
        return False
    return _is_nonempty_str(value.get("description"))


def _back_end_is_human_operated(value: dict[str, Any]) -> bool:
    """Invariant #1, second half. Precondition: ``_back_end_shape_is_valid`` already True."""
    return value["actually_human_operated"] is True


def _disclosure_shape_is_valid(value: Any) -> bool:
    if not isinstance(value, dict) or set(value.keys()) != _DISCLOSURE_KEYS:
        return False
    faked = value.get("faked_components")
    real = value.get("real_components")
    if not isinstance(faked, list) or not all(_is_nonempty_str(c) for c in faked):
        return False
    if not isinstance(real, list) or not all(isinstance(c, str) for c in real):
        return False
    return value.get("disclosed_to") in _DISCLOSED_TO_VALUES


def _disclosure_names_a_fake(value: dict[str, Any]) -> bool:
    """Invariant #2. Precondition: ``_disclosure_shape_is_valid`` already True."""
    return len(value["faked_components"]) >= 1


def generate_wizard_of_oz_record(
    record_id: str,
    interaction_description: str,
    front_end: dict[str, Any],
    back_end: dict[str, Any],
    disclosure: dict[str, Any],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/wizard-of-oz-record.schema.yaml``.

    Enforces the method contract's own real invariants fail-closed, in order: id/version/provenance shape,
    non-empty interaction_description, front_end shape + automated-looking, back_end shape + human-operated,
    and -- the invariant this method's own name implies -- disclosure shape + at least 1 named faked
    component -- BEFORE returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"WOZ_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"WOZ_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("WOZ_INVALID_PROVENANCE: provenance must be a valid provenance_record")
    if not _is_nonempty_str(interaction_description):
        raise InvariantViolation(f"WOZ_EMPTY_INTERACTION_DESCRIPTION: interaction_description must be a non-empty string, got {interaction_description!r}")

    if not _front_end_shape_is_valid(front_end):
        raise InvariantViolation(
            f"WOZ_INVALID_FRONT_END: front_end must be a dict with exactly {sorted(_FRONT_END_KEYS)}, "
            f"presented_as_automated a bool, description a non-empty string, got {front_end!r}"
        )
    if not _front_end_is_automated_looking(front_end):
        raise InvariantViolation(
            "WOZ_FRONT_NOT_AUTOMATED_LOOKING: front_end.presented_as_automated must be True -- Atlas L743's own "
            "'前台自動' (automated-looking front end) is the defining half of this method; without it this is not a Wizard of Oz test"
        )

    if not _back_end_shape_is_valid(back_end):
        raise InvariantViolation(
            f"WOZ_INVALID_BACK_END: back_end must be a dict with exactly {sorted(_BACK_END_KEYS)}, "
            f"actually_human_operated a bool, operator_role/description non-empty strings, got {back_end!r}"
        )
    if not _back_end_is_human_operated(back_end):
        raise InvariantViolation(
            "WOZ_BACK_NOT_HUMAN: back_end.actually_human_operated must be True -- Atlas L743's own '後台人工' "
            "(human-operated backend) is the other defining half; a False here just claims to have shipped a real automated feature"
        )

    if not _disclosure_shape_is_valid(disclosure):
        raise InvariantViolation(
            f"WOZ_INVALID_DISCLOSURE: disclosure must be a dict with exactly {sorted(_DISCLOSURE_KEYS)}, "
            f"faked_components/real_components lists of strings, disclosed_to one of {sorted(_DISCLOSED_TO_VALUES)}, got {disclosure!r}"
        )
    if not _disclosure_names_a_fake(disclosure):
        raise InvariantViolation(
            "WOZ_NO_DISCLOSURE: disclosure.faked_components must name at least 1 faked component -- a WoZ test "
            "that does not disclose which parts are faked is indistinguishable from shipping a fake feature"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "interaction_description": interaction_description,
        "front_end": dict(front_end),
        "back_end": dict(back_end),
        "disclosure": {
            "faked_components": list(disclosure["faked_components"]),
            "real_components": list(disclosure["real_components"]),
            "disclosed_to": disclosure["disclosed_to"],
        },
        "provenance": copy.deepcopy(provenance),
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record carries a schema-valid provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_woz_contrast_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives invariant #1 (BOTH halves of the front/back contrast) directly from raw fields using the
    SAME shape/contrast predicates the builder uses. Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("woz_contrast_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems: list[str] = []
    front_end = record.get("front_end")
    if not _front_end_shape_is_valid(front_end):
        problems.append("front_end missing or malformed")
    elif not _front_end_is_automated_looking(front_end):
        problems.append("front_end.presented_as_automated is not True")
    back_end = record.get("back_end")
    if not _back_end_shape_is_valid(back_end):
        problems.append("back_end missing or malformed")
    elif not _back_end_is_human_operated(back_end):
        problems.append("back_end.actually_human_operated is not True")
    return _result("woz_contrast_integrity", not problems, [{"problems": problems}], validator, timestamp)


def evaluate_disclosure_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives invariant #2 directly from raw fields using the SAME ``_disclosure_shape_is_valid``/
    ``_disclosure_names_a_fake`` predicates the builder uses. Fails closed on malformed input rather than
    crashing."""
    if not isinstance(record, dict):
        return _result("disclosure_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    disclosure = record.get("disclosure")
    if not _disclosure_shape_is_valid(disclosure):
        return _result("disclosure_integrity", False, [{"reason": "disclosure missing or malformed"}], validator, timestamp)
    names_a_fake = _disclosure_names_a_fake(disclosure)
    return _result("disclosure_integrity", names_a_fake, [{"faked_component_count": len(disclosure["faked_components"])}], validator, timestamp)


def evaluate_wizard_of_oz_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_woz_contrast_integrity_gate(record, validator, timestamp),
        evaluate_disclosure_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
