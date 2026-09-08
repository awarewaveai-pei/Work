"""``decision.moscow`` -- F16 decision family, 3rd member (after ahp/mcda). Atlas F16 L763: "MoSCoW |
Must/Should/Could/Won't | release scope | 建立明確不做清單" -- single table-row citation, grep-confirmed sole
Atlas hit (ADR-007 L105/117/186 already borrows the Must/Won't vocabulary in prose, not a competing
implementation).

Due diligence: F01 "Non-goals" (Atlas L339, "excluded scope→理由→重審條件") is the closest adjacent concept --
checked and confirmed UNBUILT (method-inventory.yaml:231-235, has_contract:false) -- nothing to reconcile
with today. Even once built it would be a different granularity: Non-goals is a project-level flat exclusion
list with its own re-review-trigger field; MoSCoW classifies MANY items across 4 fixed buckets for one
release scope, no review-trigger field. Structurally distinct from decision.mcda/decision.ahp (numeric
scoring) -- a fixed 4-bucket CATEGORICAL classifier, closest in shape to strategy.swot's own 4-fixed-category
split (read in full before writing this module, alongside root_cause.fault_tree's gate pattern and
root_cause.change_analysis's per-entry conditional-field style).

Invariants (construction + independent gate, fail-closed):
1. MOSCOW_DUPLICATE_ITEM_ID -- every items[] id is unique within one record. ``bucket`` is a single required
   enum field per item, so "two buckets for one item" is representable only as a duplicate id -- the real,
   catchable form of MoSCoW's own implicit "exactly one bucket per item" rule.
2. MOSCOW_MISSING_WONT_REASON -- every WONT-bucket item carries a non-empty ``reason``. Atlas's own benefit
   line ("建立明確不做清單", establish an EXPLICIT won't-do list) is this method's real distinguishing value --
   an unstated-reason WONT is silence, not an explicit decision. Enforced at BOTH layers:
   moscow-prioritization-record.schema.yaml's own ``if``/``then`` (bucket==WONT -> reason required) is a
   genuinely real second structural layer here (unlike a cross-field equality check -- conditional
   requiredness IS native JSON Schema Draft 2020-12 vocabulary), AND independently re-derived below.

Gate style: isinstance-first / safe ``.get()``, per ``root_cause.fault_tree``. No genuine_compute gate --
unlike decision.ahp/decision.mcda this method has no numeric scoring to re-derive; ``bucket_counts``/
``items_in_bucket``/``must_ratio`` below are real derived views (recomputed fresh every call), not a
CALCULATED_RESULT claim. ``must_ratio`` is informational-only -- Atlas cites no Must<=X% threshold, so none
is gated (OQ-MOSCOW-2, methods/contracts/decision.moscow.contract.yaml).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "decision.moscow"
RECORD_ID_PREFIX = "MOSCOW-"
VALID_BUCKETS = frozenset({"MUST", "SHOULD", "COULD", "WONT"})

_KNOWN_ITEM_KEYS_REQUIRED = frozenset({"id", "description", "bucket", "provenance"})
_KNOWN_ITEM_KEYS_ALL = _KNOWN_ITEM_KEYS_REQUIRED | frozenset({"reason"})
_KNOWN_RECORD_KEYS = frozenset({"id", "version", "generated_by_method", "release_scope", "items", "provenance"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a recursive ``repr()`` (fault_tree.py pattern:
    a bare recursive repr over caller-supplied input of unknown size is itself a small denial-of-service
    surface in an error path)."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _item_shape_is_valid(entry: Any) -> bool:
    """Shape only (keys, types, enum membership) -- does NOT check the WONT-requires-reason invariant (its
    own distinct predicate, ``_item_missing_wont_reason``, with its own error code) and does NOT check
    ``provenance`` content validity (``evaluate_provenance_required_gate``'s own job, same split every
    sibling module in this family already uses)."""
    if not isinstance(entry, dict):
        return False
    keys = set(entry.keys())
    if not _KNOWN_ITEM_KEYS_REQUIRED.issubset(keys) or not keys.issubset(_KNOWN_ITEM_KEYS_ALL):
        return False
    if not _is_nonempty_str(entry["id"]) or not _is_nonempty_str(entry["description"]):
        return False
    if entry["bucket"] not in VALID_BUCKETS:
        return False
    if not isinstance(entry.get("provenance"), dict):
        return False
    if "reason" in entry and not isinstance(entry["reason"], str):
        return False
    return True


def _item_missing_wont_reason(entry: dict[str, Any]) -> bool:
    """Invariant #2. Precondition: ``entry`` has already passed ``_item_shape_is_valid`` (so ``bucket`` is
    confirmed to be a legal enum value and ``.get("reason")`` cannot raise)."""
    return entry["bucket"] == "WONT" and not _is_nonempty_str(entry.get("reason"))


def moscow_item(
    item_id: str,
    description: str,
    bucket: str,
    provenance: dict[str, Any],
    *,
    reason: str | None = None,
) -> dict[str, Any]:
    """Convenience constructor for one ``items[]`` entry -- emits ONLY known-good keys, so a caller building
    a legitimate item through this helper can never accidentally smuggle in an unknown field. Not itself an
    invariant boundary -- the real check happens inside ``generate_moscow_prioritization_record``, which
    validates whatever dict it is handed regardless of how it was built (the mutation/hand-tampering tests
    build entries directly, bypassing this helper, to prove the constructor itself -- not merely this
    convenience wrapper -- is what enforces the invariants)."""
    record: dict[str, Any] = {"id": item_id, "description": description, "bucket": bucket, "provenance": provenance}
    if reason is not None:
        record["reason"] = reason
    return record


def generate_moscow_prioritization_record(
    record_id: str,
    release_scope: str,
    items: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/moscow-prioritization-record.schema.yaml``. Enforces the method contract's
    own preconditions fail-closed, in this order: id/version/release_scope shape, items list shape, then PER
    ITEM -- generic shape, then the WONT-reason invariant, then cross-item id uniqueness. REBUILDS every
    nested list/dict it owns; ``provenance`` is stored by reference, the same family-wide convention every
    prior module in this package already follows."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"MOSCOW_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"MOSCOW_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(release_scope):
        raise InvariantViolation(f"MOSCOW_EMPTY_RECORD_FIELD: release_scope must be a non-empty string, got {release_scope!r}")
    if not isinstance(items, list) or not items:
        raise InvariantViolation(f"MOSCOW_INVALID_ITEMS: items must be a non-empty list, got {_shallow_describe(items)}")

    seen_ids: set[str] = set()
    for entry in items:
        if not _item_shape_is_valid(entry):
            raise InvariantViolation(
                f"MOSCOW_INVALID_ITEM: items[] entry must be a well-shaped dict (id/description non-empty strings, "
                f"bucket in {sorted(VALID_BUCKETS)}, provenance a dict, optional reason a string), got {_shallow_describe(entry)}"
            )
        if _item_missing_wont_reason(entry):
            raise InvariantViolation(
                f"MOSCOW_MISSING_WONT_REASON: item {entry['id']!r} has bucket=WONT but no non-empty reason "
                f"(Atlas F16 L763 '建立明確不做清單' -- an unstated-reason exclusion is silence, not an explicit decision)"
            )
        if entry["id"] in seen_ids:
            raise InvariantViolation(f"MOSCOW_DUPLICATE_ITEM_ID: item id {entry['id']!r} is used more than once in items[]")
        seen_ids.add(entry["id"])

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "release_scope": release_scope,
        "items": [dict(entry) for entry in items],
        "provenance": provenance,
    }


def bucket_counts(record: dict[str, Any]) -> dict[str, int]:
    """Real derived view (recomputed fresh every call, never a stored field) -- how many items landed in each
    of the 4 buckets. Always returns all 4 keys, 0 for an unused bucket. SCOPE: operates on an ALREADY-VALID
    record (``generate_moscow_prioritization_record``/``evaluate_moscow_integrity_gate`` already proved
    shape); does not re-validate and will raise a bare ``KeyError`` on a malformed record."""
    counts = {bucket: 0 for bucket in sorted(VALID_BUCKETS)}
    for entry in record["items"]:
        counts[entry["bucket"]] += 1
    return counts


def items_in_bucket(record: dict[str, Any], bucket: str) -> list[str]:
    """Real derived view -- item ids currently in ``bucket``, in original ``items[]`` order. Raises on an
    unrecognized bucket name (defensive -- a caller's typo here should never silently return an empty list
    instead of a real error). Same ALREADY-VALID-record scope as ``bucket_counts``."""
    if bucket not in VALID_BUCKETS:
        raise InvariantViolation(f"MOSCOW_INVALID_BUCKET_ARGUMENT: bucket must be one of {sorted(VALID_BUCKETS)}, got {bucket!r}")
    return [entry["id"] for entry in record["items"] if entry["bucket"] == bucket]


def must_ratio(record: dict[str, Any]) -> float:
    """Real derived view -- MUST count / total item count. INFORMATIONAL ONLY, never gated: Atlas F16 L763
    cites no Must<=X% threshold (a common real-world MoSCoW convention, but not textually grounded here) --
    see OQ-MOSCOW-2, methods/contracts/decision.moscow.contract.yaml. A caller may apply their own advisory
    threshold to this value; this module enforces none. Same ALREADY-VALID-record scope as ``bucket_counts``."""
    counts = bucket_counts(record)
    total = sum(counts.values())
    return counts["MUST"] / total


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance AND every ``items[]``
    entry's own provenance are schema-valid. Fails closed on a non-dict record or a non-list ``items``."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    record_provenance_valid = provenance_is_valid(record.get("provenance"))
    items = record.get("items")
    entries = items if isinstance(items, list) else []
    invalid_entry_ids = [e.get("id") if isinstance(e, dict) else None for e in entries if not (isinstance(e, dict) and provenance_is_valid(e.get("provenance")))]
    passed = record_provenance_valid and bool(entries) and not invalid_entry_ids
    return _result(
        "provenance_required",
        passed,
        [{"record_provenance_valid": record_provenance_valid, "entries_checked": len(entries), "invalid_provenance_entry_ids": invalid_entry_ids}],
        validator,
        timestamp,
    )


def evaluate_moscow_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- does not trust any stored
    consistency. Bundles every structural reason under one ``gate_id`` (same shape
    ``evaluate_change_analysis_integrity_gate`` already uses for its own family), each with its own
    distinguishable evidence ``reason`` so a failure always names the specific bug class. FAILS CLOSED on
    malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("moscow_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("moscow_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("moscow_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("release_scope")):
        return _result("moscow_integrity", False, [{"reason": "release_scope missing or empty"}], validator, timestamp)

    items = record.get("items")
    if not isinstance(items, list) or not items:
        return _result("moscow_integrity", False, [{"reason": "items missing, empty, or not a list"}], validator, timestamp)

    seen_ids: set[str] = set()
    for entry in items:
        if not _item_shape_is_valid(entry):
            return _result(
                "moscow_integrity",
                False,
                [{"reason": "an items[] entry is malformed (unknown/missing key, wrong type, or illegal bucket value)", "entry": _shallow_describe(entry)}],
                validator,
                timestamp,
            )
        if _item_missing_wont_reason(entry):
            return _result("moscow_integrity", False, [{"reason": "a WONT-bucket item has no non-empty reason", "entry_id": entry["id"]}], validator, timestamp)
        if entry["id"] in seen_ids:
            return _result("moscow_integrity", False, [{"reason": "duplicate item id", "entry_id": entry["id"]}], validator, timestamp)
        seen_ids.add(entry["id"])

    return _result("moscow_integrity", True, [{"item_count": len(items), "bucket_counts": bucket_counts(record)}], validator, timestamp)


def evaluate_moscow_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_moscow_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
