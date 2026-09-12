"""``epistemic.assumption_registry`` -- 2nd of 2 F10 epistemic-family members built this batch (Atlas F10 table
row L571: "Assumption Registry｜正式保存假設｜ID/statement/type/evidence/confidence/validation/status/owner｜假
設不再藏在文字中").

CRITICAL DUE-DILIGENCE (before writing this module): ``specs/evidence/assumption.schema.yaml`` (read in full)
already implements Atlas F10's entire "Assumption Registry" field list verbatim (id ``^ASM-[0-9]+$``,
statement, type, evidence_strength, evidence[], impact_if_wrong, confidence, validation, owner, status,
is_critical_assumption, provenance). This module COMPOSES that file -- every ``entries[]`` item is a real
Assumption record, no parallel per-assumption shape is minted here.

THE real invariant this method exists to enforce: ``is_critical_assumption`` is GENUINE_COMPUTE, mechanically
derived from ``impact_if_wrong == "Critical"`` (MP §24 L1490's own literal example value, exact case-sensitive
match -- no mother document gives any other example) -- ``assumption.schema.yaml`` L290-302 explicitly leaves
this computation "left to the consuming engine, this field only records the outcome"; this method IS that
engine. Neither ``generate_assumption_registry`` nor the ``assumption_entry`` convenience constructor accepts
``is_critical_assumption`` as a caller-supplied key (a hand-crafted dict carrying it is refused by the builder's
own allowed-key-set check on each ``entries[]`` item), and the gate independently re-derives it from each
entry's own raw ``impact_if_wrong``, never trusting a stored value.

A second, independent invariant: an entry whose ``status`` case-insensitively asserts it has been validated
(``{"validated", "verified"}`` -- see ``compilation_decisions`` for why this small set, not a full mother-
document-cited enum, since none exists anywhere -- ``assumption.schema.yaml``'s own ``open_questions.MRSP-
assumption-1`` confirms only MP's single ``'Unverified'`` example exists) must carry a non-empty ``validation``
field -- grounded in EC §116 L3132's own prose rule ("Critical assumption 未驗證時，final status 不能假裝
certainty"): a registry row claiming validation with no recorded validation method is exactly the "假設藏在文字
中" failure this method exists to prevent.

RECORD_ID_PREFIX collision check (2026-09-04 F09 critic-pass lesson, applied proactively): grepped
``ai_lego/modules/`` for every existing ``RECORD_ID_PREFIX`` value before choosing ``AREG-`` -- no collision.
Deliberately distinct from each entry's own ``^ASM-[0-9]+$`` id pattern (AREG- names the collection, ASM- names
an individual assumption).

Nested-list-aliasing lesson (same F09 critic pass): applies HERE (unlike ``epistemic.assumption_mapping``,
built same batch) -- an ``entries[]`` item's own ``evidence`` field is itself a list. ``_rebuild_entry`` copies
that nested list explicitly (``list(dict(item) for item in ...)``), not just the outer entry dict, so the
returned record never shares a mutable nested list object with the caller's own input.
"""

from __future__ import annotations

import copy
import re
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "epistemic.assumption_registry"
RECORD_ID_PREFIX = "AREG-"
ASSUMPTION_ID_PATTERN = re.compile(r"^ASM-[0-9]+$")

# MP §24 (L1490) verbatim: "impact_if_wrong: Critical" -- the only example value any mother document gives for
# this field. Exact, case-sensitive match -- no broader vocabulary (e.g. "High"/"Severe") is textually grounded.
CRITICAL_IMPACT_VALUE = "Critical"

# No mother document supplies an affirmative "validated" status wording (assumption.schema.yaml's own
# open_questions.MRSP-assumption-1: only MP's single 'Unverified' example exists anywhere). This set is this
# module's own disclosed, minimal invention: the direct English antonym of "Unverified" ("verified") and the
# direct verb form of this schema's own `validation` field name ("validated") -- see method contract
# compilation_decisions. Matched case-insensitively (casefold) so "Validated"/"VALIDATED"/"validated" all match,
# while "Invalidated"/"Unverified" do NOT (exact-token match, not substring -- avoids the "Invalidated" contains
# "validated" as a substring false-positive).
VALIDATED_STATUS_TOKENS = frozenset({"validated", "verified"})

# Every field specs/evidence/assumption.schema.yaml defines, EXCEPT is_critical_assumption -- that field is
# GENUINE_COMPUTE and must never appear in a caller-supplied entries[] item (see module docstring).
ALLOWED_ENTRY_INPUT_KEYS = frozenset({"id", "statement", "type", "evidence_strength", "evidence", "impact_if_wrong", "confidence", "validation", "owner", "status", "provenance"})
REQUIRED_ENTRY_INPUT_KEYS = frozenset({"id", "statement", "status", "provenance"})
ALLOWED_ENTRY_STORED_KEYS = ALLOWED_ENTRY_INPUT_KEYS | frozenset({"is_critical_assumption"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline every prior module in this corpus already establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def derive_is_critical_assumption(impact_if_wrong: Any) -> bool:
    """GENUINE_COMPUTE: the sole authority for turning an entry's own ``impact_if_wrong`` into
    ``is_critical_assumption``. Called by BOTH the builder (at construction) and the gate (re-derived from raw
    fields) -- neither can drift from the other. Total over any input (missing/None/non-"Critical" values all
    produce ``False``, a concrete boolean outcome -- never left null, since leaving it unset would defeat this
    method's whole purpose of making the critical flag machine-visible)."""
    return impact_if_wrong == CRITICAL_IMPACT_VALUE


def is_status_asserting_validated(status: Any) -> bool:
    """GENUINE_COMPUTE: the sole authority for whether a ``status`` string asserts the assumption has been
    validated. See module docstring for why this exact token set and why case-insensitive-exact (not
    substring) matching."""
    if not isinstance(status, str):
        return False
    return status.strip().casefold() in VALIDATED_STATUS_TOKENS


def _entry_provenance_is_valid(provenance: Any) -> bool:
    """assumption.schema.yaml pins every entry's own provenance to ``epistemic_type: const ASSUMPTION`` --
    ``provenance_is_valid`` alone only checks the broader EPISTEMIC_TYPES enum, not this per-schema narrowing,
    so this method adds the const check explicitly."""
    return provenance_is_valid(provenance) and isinstance(provenance, dict) and provenance.get("epistemic_type") == "ASSUMPTION"


def _entry_validated_status_requires_validation(entry: dict[str, Any]) -> bool:
    """(c) An entry whose status asserts validation must carry a non-empty validation field -- EC §116 L3132's
    own rule against a status that "pretends certainty" with no recorded validation method."""
    if not is_status_asserting_validated(entry.get("status")):
        return True
    return _is_nonempty_str(entry.get("validation"))


def _entry_input_shape_is_valid(entry: Any) -> bool:
    """CALLER-SUPPLIED entries[] item -- keys a subset of ALLOWED_ENTRY_INPUT_KEYS (NO
    ``is_critical_assumption``, that field is always computed, never accepted), every required field present
    and well-shaped, and the validated-status/validation-field cross-check."""
    if not isinstance(entry, dict):
        return False
    keys = set(entry.keys())
    if not keys <= ALLOWED_ENTRY_INPUT_KEYS or not REQUIRED_ENTRY_INPUT_KEYS <= keys:
        return False
    if not isinstance(entry.get("id"), str) or not ASSUMPTION_ID_PATTERN.match(entry["id"]):
        return False
    if not _is_nonempty_str(entry.get("statement")) or not _is_nonempty_str(entry.get("status")):
        return False
    if not _entry_provenance_is_valid(entry.get("provenance")):
        return False
    return _entry_validated_status_requires_validation(entry)


def _entry_stored_entry_is_valid(entry: Any) -> bool:
    """STORED (already-computed) entries[] item -- keys a subset of ALLOWED_ENTRY_STORED_KEYS, core fields
    valid, AND ``is_critical_assumption`` must equal the real re-derivation from this entry's own
    ``impact_if_wrong``. Called only by the gate (re-derives, never trusts the stored value)."""
    if not isinstance(entry, dict):
        return False
    keys = set(entry.keys())
    if not keys <= ALLOWED_ENTRY_STORED_KEYS or not REQUIRED_ENTRY_INPUT_KEYS <= keys or "is_critical_assumption" not in keys:
        return False
    if not isinstance(entry.get("id"), str) or not ASSUMPTION_ID_PATTERN.match(entry["id"]):
        return False
    if not _is_nonempty_str(entry.get("statement")) or not _is_nonempty_str(entry.get("status")):
        return False
    if not _entry_provenance_is_valid(entry.get("provenance")):
        return False
    if not _entry_validated_status_requires_validation(entry):
        return False
    if not isinstance(entry.get("is_critical_assumption"), bool):
        return False
    return entry["is_critical_assumption"] == derive_is_critical_assumption(entry.get("impact_if_wrong"))


def assumption_entry(
    entry_id: str,
    statement: str,
    status: str,
    provenance: dict[str, Any],
    *,
    assumption_type: str | None = None,
    evidence_strength: str | None = None,
    evidence: list[dict[str, Any]] | None = None,
    impact_if_wrong: str | None = None,
    confidence: float | None = None,
    validation: str | None = None,
    owner: str | None = None,
) -> dict[str, Any]:
    """One INPUT entry for ``generate_assumption_registry``'s own ``entries`` parameter. Deliberately NO
    ``is_critical_assumption`` parameter -- that field is always computed, never accepted (see module
    docstring). Optional fields are omitted from the returned dict when not supplied (not stored as ``None``),
    matching assumption.schema.yaml's own optional-field typing (e.g. ``type: string`` alone, no ``null``
    variant)."""
    if not isinstance(entry_id, str) or not ASSUMPTION_ID_PATTERN.match(entry_id):
        raise InvariantViolation(f"ASSUMPTIONREGISTRY_INVALID_ENTRY_ID: id must match ^ASM-[0-9]+$, got {entry_id!r}")
    if not _is_nonempty_str(statement):
        raise InvariantViolation(f"ASSUMPTIONREGISTRY_INVALID_ENTRY_FIELD: statement must be a non-empty string, got {statement!r}")
    if not _is_nonempty_str(status):
        raise InvariantViolation(f"ASSUMPTIONREGISTRY_INVALID_ENTRY_FIELD: status must be a non-empty string, got {status!r}")
    if not _entry_provenance_is_valid(provenance):
        raise InvariantViolation(f"ASSUMPTIONREGISTRY_INVALID_ENTRY_PROVENANCE: provenance must be schema-valid with epistemic_type=ASSUMPTION, got {_shallow_describe(provenance)}")
    if is_status_asserting_validated(status) and not _is_nonempty_str(validation):
        raise InvariantViolation(
            f"ASSUMPTIONREGISTRY_VALIDATED_STATUS_REQUIRES_VALIDATION: status {status!r} asserts validation but validation is missing/empty "
            "(EC §116 L3132: an unverified status must not pretend certainty)"
        )
    entry: dict[str, Any] = {"id": entry_id, "statement": statement, "status": status, "provenance": provenance}
    if assumption_type is not None:
        entry["type"] = assumption_type
    if evidence_strength is not None:
        entry["evidence_strength"] = evidence_strength
    if evidence is not None:
        entry["evidence"] = copy.deepcopy(list(evidence))
    if impact_if_wrong is not None:
        entry["impact_if_wrong"] = impact_if_wrong
    if confidence is not None:
        entry["confidence"] = confidence
    if validation is not None:
        entry["validation"] = validation
    if owner is not None:
        entry["owner"] = owner
    return entry


def _rebuild_entry(entry: dict[str, Any]) -> dict[str, Any]:
    """Fresh, fully independent dict for every stored entry, so the returned record can never be invalidated
    by a caller mutating its own input afterwards.

    Must be a genuine deep copy, not a per-level ``dict(item)`` rebuild: an entry's ``evidence`` items are
    ``evidence.schema.yaml`` records whose own ``quality_assessment`` is an object, so copying only the entry
    and its evidence items still leaves that third level shared. A 2026-09-12 critic pass reproduced exactly
    that -- mutating ``quality_assessment["method_quality"]`` after construction silently rewrote the stored
    record while every gate still reported PASS.
    """
    rebuilt = copy.deepcopy(entry)
    rebuilt["is_critical_assumption"] = derive_is_critical_assumption(entry.get("impact_if_wrong"))
    return rebuilt


def generate_assumption_registry(
    record_id: str,
    entries: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/assumption-registry.schema.yaml``.

    Enforces every real invariant fail-closed, in order: id/version/provenance shape, then entries (non-empty,
    well-shaped per specs/evidence/assumption.schema.yaml's own required fields, unique ids, validated-status/
    validation cross-check). ``is_critical_assumption`` is ALWAYS computed here via
    ``derive_is_critical_assumption``, never a caller-supplied key, so there is no code path through which a
    caller could construct a record whose stored flag disagrees with its own impact_if_wrong.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"ASSUMPTIONREGISTRY_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"ASSUMPTIONREGISTRY_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"ASSUMPTIONREGISTRY_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    if not isinstance(entries, list) or not entries:
        raise InvariantViolation(
            f"ASSUMPTIONREGISTRY_EMPTY_ENTRIES: entries must be a non-empty list (a registry naming zero assumptions has not actually run Atlas F10 "
            f"L571's own method), got {_shallow_describe(entries)}"
        )
    if not all(_entry_input_shape_is_valid(entry) for entry in entries):
        raise InvariantViolation(
            f"ASSUMPTIONREGISTRY_INVALID_ENTRY: every entries[] item must have keys within {sorted(ALLOWED_ENTRY_INPUT_KEYS)} (is_critical_assumption is "
            f"computed, not accepted), a real ^ASM-[0-9]+$ id, non-empty statement/status, ASSUMPTION-pinned provenance, and a non-empty validation field "
            f"whenever status asserts validation, got {_shallow_describe(entries)}"
        )
    ids = [entry["id"] for entry in entries]
    duplicate_ids = sorted({eid for eid in ids if ids.count(eid) > 1})
    if duplicate_ids:
        raise InvariantViolation(f"ASSUMPTIONREGISTRY_DUPLICATE_ENTRY_ID: entries id(s) {duplicate_ids} appear more than once")

    rebuilt_entries = [_rebuild_entry(entry) for entry in entries]

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "entries": rebuilt_entries,
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_assumption_registry -- a hand-tampered record that bypassed the builder entirely must be caught
# exactly as a builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance AND every
    entry's own ASSUMPTION-pinned provenance are schema-valid. FAILS CLOSED on malformed input rather than
    crashing."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    entries = record.get("entries", [])
    if not isinstance(entries, list):
        # Without this the gate iterated whatever was there and crashed (TypeError) on None/int/bool --
        # the sibling registry_integrity gate already guarded this; this one had been left behind.
        return _result("provenance_required", False, [{"reason": f"entries must be a list, got {type(entries).__name__}"}], validator, timestamp)
    invalid_ids = [entry.get("id", "?") if isinstance(entry, dict) else "<non-dict>" for entry in entries if not _entry_provenance_is_valid(entry.get("provenance") if isinstance(entry, dict) else None)]
    overall_valid = provenance_is_valid(record.get("provenance"))
    passed = not invalid_ids and overall_valid
    return _result("provenance_required", passed, [{"entries_checked": len(entries), "invalid_provenance_ids": invalid_ids, "overall_provenance_valid": overall_valid}], validator, timestamp)


def evaluate_registry_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_assumption_registry``, so a hand-tampered record that bypassed the builder
    entirely (e.g. a spliced-in ``is_critical_assumption`` disagreeing with its own impact_if_wrong, or a
    validated status with no validation) is caught here exactly as a builder-refused one would have been. Fails
    closed on malformed input rather than crashing. Bundles several DEPENDENT structural reasons under one
    gate_id, same shape ``evaluate_quadrant_integrity_gate``/``evaluate_leverage_point_integrity_gate`` already
    establish for this corpus."""
    if not isinstance(record, dict):
        return _result("registry_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("registry_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("registry_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    entries = record.get("entries")
    if not isinstance(entries, list) or not entries:
        return _result("registry_integrity", False, [{"reason": "entries missing, empty, or not a list"}], validator, timestamp)

    problems: list[str] = []
    for entry in entries:
        if not _entry_stored_entry_is_valid(entry):
            entry_id = entry.get("id") if isinstance(entry, dict) else "<non-dict>"
            problems.append(f"entry {entry_id!r}: malformed, missing a required field, is_critical_assumption disagreeing with its own re-derivation, or a validated status with no validation")

    ids = [entry["id"] for entry in entries if isinstance(entry, dict) and "id" in entry]
    if len(ids) != len(set(ids)):
        problems.append("duplicate entry id across entries[]")

    if problems:
        return _result("registry_integrity", False, [{"reason": "registry integrity violation(s)", "details": problems}], validator, timestamp)

    critical_count = sum(1 for entry in entries if entry.get("is_critical_assumption") is True)
    return _result("registry_integrity", True, [{"entry_count": len(entries), "critical_count": critical_count}], validator, timestamp)


def evaluate_assumption_registry_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_registry_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
