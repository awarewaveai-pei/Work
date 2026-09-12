"""``representation.audio_conversational_view`` -- F24 representation/cognitive-preference/collaboration
family (Atlas L970).

Atlas's own table row (L970, verbatim): "Audio / Conversational View | 用語
音/對話操作 | speech->structured objects->readback/confirm | 降輸入門檻" (a
voice/conversational interaction method, pipeline: speech -> structured
objects -> readback/confirm; benefit: lower the input barrier).

Per the shared Atlas §9 Representation Contract (L1040-1053) every View in
this family obeys ONE structural law: a View stores ONLY layout/filters/
visible_fields/presentation_preferences plus a reference to its source
Knowledge Object -- it never duplicates the underlying Knowledge itself. This
method is a rendering/interaction layer over an existing Knowledge Object
(referenced by id via `knowledge_ref`); the `structured_objects[]` it holds
are the voice-derived edits/records THIS View produced, not a copy of the
Knowledge Object's own body.

Real invariant, enforced at TWO independent layers, mirroring the exact
"cannot finalize without a human confirmation record" convention this
corpus's own ``jurisdiction.conflict_of_law_review`` (F23) establishes for a
different domain:

1. **Readback/confirm required before CONFIRMED, THE real invariant this
   method exists to enforce** (``ACVIEW_MISSING_READBACK_CONFIRM``) -- Atlas's
   own pipeline is literally "speech->structured objects->readback/confirm":
   skipping straight to a CONFIRMED status with no readback step defeats
   "降輸入門檻" by turning a low-friction voice interface into a
   silently-unreliable one (misheard speech treated as ground truth with no
   verification). A ``structured_objects[]`` entry can never be
   ``status: CONFIRMED`` unless it carries a non-empty ``readback_transcript``
   AND ``confirmed_by_user: true``. The builder REFUSES to construct such a
   record; it does not silently downgrade or warn.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for "audio
view"/"conversational view"/"readback"/"ACVIEW-" before writing any of this
method's own files: zero pre-existing implementation or schema-title overlap.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "representation.audio_conversational_view"
RECORD_ID_PREFIX = "ACVIEW-"
_STATUS_VALUES = frozenset({"DRAFT", "CONFIRMED"})
_STRUCTURED_OBJECT_KEYS = frozenset({"object_id", "status", "transcript", "readback_transcript", "confirmed_by_user"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _structured_object_shape_problem(value: Any) -> str | None:
    """Shape-only validation of a ``structured_objects[]`` entry -- field presence/type, status enum,
    readback_transcript is either a non-empty string or None. Does NOT check the readback/confirm-
    before-CONFIRMED cross-field rule, which needs `status` alongside the other two fields and is
    checked once in ``generate_audio_conversational_view``/the gate, after every entry has been
    shape-validated (same division of labor ``jurisdiction.conflict_of_law_review``'s
    ``_conflict_shape_problem``/``_conflict_cross_field_problem`` split establishes)."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _STRUCTURED_OBJECT_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _STRUCTURED_OBJECT_KEYS <= value.keys():
        return f"missing key(s) {sorted(_STRUCTURED_OBJECT_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("object_id")):
        return f"object_id must be a non-empty string, got {value.get('object_id')!r}"
    if value.get("status") not in _STATUS_VALUES:
        return f"status must be one of {sorted(_STATUS_VALUES)}, got {value.get('status')!r}"
    if not _is_nonempty_str(value.get("transcript")):
        return f"transcript must be a non-empty string, got {value.get('transcript')!r}"
    readback = value.get("readback_transcript")
    if readback is not None and not _is_nonempty_str(readback):
        return f"readback_transcript must be a non-empty string or null, got {readback!r}"
    if not isinstance(value.get("confirmed_by_user"), bool):
        return f"confirmed_by_user must be a boolean, got {value.get('confirmed_by_user')!r}"
    return None


def _structured_object_cross_field_problem(value: dict[str, Any]) -> str | None:
    """THE core fail-closed rule: status=CONFIRMED requires non-empty readback_transcript AND
    confirmed_by_user=true. Checked once, after shape validation, on an already shape-valid entry."""
    if value["status"] != "CONFIRMED":
        return None
    if not _is_nonempty_str(value.get("readback_transcript")):
        return (
            f"structured_objects entry {value['object_id']!r} has status=CONFIRMED with no readback_transcript -- "
            "Atlas L970's own pipeline 'speech->structured objects->readback/confirm' forbids confirming a voice-derived "
            "object with no readback step"
        )
    if value.get("confirmed_by_user") is not True:
        return f"structured_objects entry {value['object_id']!r} has status=CONFIRMED with confirmed_by_user != true -- no human confirmation evidence"
    return None


def structured_object(
    object_id: str,
    status: str,
    transcript: str,
    readback_transcript: str | None,
    confirmed_by_user: bool,
) -> dict[str, Any]:
    """One item of ``typed-objects/audio-conversational-view-record.schema.yaml#/properties/structured_objects``."""
    record = {
        "object_id": object_id,
        "status": status,
        "transcript": transcript,
        "readback_transcript": readback_transcript,
        "confirmed_by_user": confirmed_by_user,
    }
    shape_problem = _structured_object_shape_problem(record)
    if shape_problem is not None:
        raise InvariantViolation(f"ACVIEW_INVALID_STRUCTURED_OBJECT: {shape_problem}")
    cross_field_problem = _structured_object_cross_field_problem(record)
    if cross_field_problem is not None:
        raise InvariantViolation(f"ACVIEW_MISSING_READBACK_CONFIRM: {cross_field_problem}")
    return record


def generate_audio_conversational_view(
    record_id: str,
    knowledge_ref: str,
    structured_objects: list[dict[str, Any]],
    state: dict[str, Any],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/audio-conversational-view-record.schema.yaml``.

    Rebuilds every ``structured_objects[]`` entry via ``structured_object()`` (never trusting the
    caller's raw dicts), then enforces the method contract's own real invariants fail-closed, in order:
    id/version/provenance shape, knowledge_ref non-empty, object_id uniqueness, and -- the invariant
    Atlas's own "readback/confirm" pipeline stage exists to enforce -- no CONFIRMED entry without a
    non-empty readback_transcript and confirmed_by_user=true -- BEFORE returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"ACVIEW_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"ACVIEW_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("ACVIEW_INVALID_PROVENANCE: provenance must be a valid provenance_record")
    if not _is_nonempty_str(knowledge_ref):
        raise InvariantViolation(f"ACVIEW_INVALID_KNOWLEDGE_REF: knowledge_ref must be a non-empty string, got {knowledge_ref!r}")

    if not isinstance(structured_objects, list):
        raise InvariantViolation(f"ACVIEW_INVALID_STRUCTURED_OBJECTS: structured_objects must be a list, got {type(structured_objects).__name__}")
    rebuilt: list[dict[str, Any]] = []
    for i, so in enumerate(structured_objects):
        if not isinstance(so, dict):
            raise InvariantViolation(f"ACVIEW_INVALID_STRUCTURED_OBJECTS: structured_objects[{i}] must be a dict, got {so!r}")
        try:
            rebuilt.append(
                structured_object(
                    so.get("object_id"),
                    so.get("status"),
                    so.get("transcript"),
                    so.get("readback_transcript"),
                    so.get("confirmed_by_user"),
                )
            )
        except InvariantViolation as error:
            raise InvariantViolation(f"structured_objects[{i}]: {error}") from error

    object_ids = [so["object_id"] for so in rebuilt]
    if len(object_ids) != len(set(object_ids)):
        duplicate = sorted({o for o in object_ids if object_ids.count(o) > 1})
        raise InvariantViolation(f"ACVIEW_DUPLICATE_OBJECT_ID: object_id(s) {duplicate} declared more than once")

    if not isinstance(state, dict):
        raise InvariantViolation(f"ACVIEW_INVALID_STATE: state must be a dict, got {type(state).__name__}")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "knowledge_ref": knowledge_ref,
        "structured_objects": rebuilt,
        "state": copy.deepcopy(state),
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


def evaluate_readback_confirm_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas L970's own core fail-closed rule directly from raw fields, WITHOUT trusting that
    the builder's own check already ran (catches hand-tampered records that bypass the builder): every
    structured_objects[] entry with status=CONFIRMED must carry a non-empty readback_transcript and
    confirmed_by_user=true. Fails closed on malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("readback_confirm_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    structured_objects = record.get("structured_objects")
    if not isinstance(structured_objects, list):
        return _result("readback_confirm_required", False, [{"reason": "structured_objects must be a list"}], validator, timestamp)

    problems: list[str] = []
    for i, so in enumerate(structured_objects):
        shape_problem = _structured_object_shape_problem(so)
        if shape_problem is not None:
            problems.append(f"structured_objects[{i}]: {shape_problem}")
            continue
        cross_field_problem = _structured_object_cross_field_problem(so)
        if cross_field_problem is not None:
            problems.append(f"structured_objects[{i}]: {cross_field_problem}")

    passed = not problems
    return _result("readback_confirm_required", passed, [{"problems": problems}], validator, timestamp)


def evaluate_audio_conversational_view_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_readback_confirm_required_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
