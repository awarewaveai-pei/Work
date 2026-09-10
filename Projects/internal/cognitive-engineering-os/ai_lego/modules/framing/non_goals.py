"""``framing.non_goals`` -- F01 framing family (methods/contracts/framing.non_goals.contract.yaml), 1st
member of a brand-new family (F01 "Goal & Problem Framing", 3 siblings landing this same batch --
framing.goal_statement built concurrently by another agent this same batch, framing.smart possibly a third;
no shared code, no overlap expected or observed with either).

Atlas's ONLY citation is the F01 tool table's own row (L339: "Non-goals｜明確說不做什麼｜大型專案｜excluded
scope→理由→重審條件｜控制範圍與成本｜WBS、ADR") -- grep-confirmed the sole "Non-goals"/"non.?goal" hit in the
whole Atlas file, no dedicated section. The excluded_scope[] 3-stage pipeline (scope_item -> reason ->
re_review_trigger) is transcribed directly from that citation, not external methodology.

Due diligence (VERIFIED, not merely repeated from decision.moscow's own prior forward-reference): read
ai_lego/modules/decision/moscow.py and moscow-prioritization-record.schema.yaml in full. Confirmed true:
MoSCoW's WONT bucket requires only a non-empty ``reason`` (conditionally, only for bucket==WONT) and carries
NO re-review-trigger field anywhere in that schema/module. This method requires ALL of
scope_item/reason/re_review_trigger, unconditionally, on EVERY entry -- Atlas's own 3-stage citation, not a
2-stage relabeling of MoSCoW's WONT. This module's own contract resolves
methods/contracts/decision.moscow.contract.yaml's OQ-MOSCOW-1 by adding ``related_moscow_wont_ref``, an
OPTIONAL soft link -- see ``_related_moscow_wont_ref_is_valid`` below.

Also verified (grep-confirmed): Atlas §22.3's Method-specific Gate table (L4142-4155) does NOT cite this
method -- no "automatic authority" style guard (decision.mcda's own ``assert_no_automatic_authority_claim``)
is added here; inventing one anyway would be fabricated scope, not genuine two-layer discipline. The schema's
own closed key set (``additionalProperties: false``) already structurally forecloses a hand-crafted
authority-claiming key without needing a dedicated runtime guard.

Two real invariants, each enforced BOTH at construction (raise BEFORE any record is built) AND independently
by a gate that re-derives from raw fields, same "shared predicate, reused by both layers" discipline every
sibling module in this suite already establishes:

1. Every excluded_scope[] entry carries a non-empty scope_item, reason, AND re_review_trigger -- three
   distinct error codes (``NONGOALS_EMPTY_SCOPE_ITEM`` / ``NONGOALS_EMPTY_REASON`` /
   ``NONGOALS_EMPTY_REREVIEW_TRIGGER``), not one bundled code, so a caller/test can tell exactly which
   pipeline stage was left blank.
2. Every excluded_scope[] id is unique within the record (``NONGOALS_DUPLICATE_ITEM_ID``) -- same invariant
   class decision.moscow's own ``MOSCOW_DUPLICATE_ITEM_ID`` establishes for its own items[].

No compute/ package: a structural framing record with no arithmetic, same class as ``architecture.adr`` (read
in full as this method's own closest template -- a document-shaped record, no genuine_compute gate).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "framing.non_goals"
RECORD_ID_PREFIX = "NONGOALS-"

_ENTRY_REQUIRED_KEYS = frozenset({"id", "scope_item", "reason", "re_review_trigger", "provenance"})
_ENTRY_ALLOWED_KEYS = _ENTRY_REQUIRED_KEYS | frozenset({"related_moscow_wont_ref"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a recursive ``repr()`` over caller-supplied
    input of unknown size (same denial-of-service-in-an-error-path avoidance decision.moscow's own
    ``_shallow_describe`` already documents)."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _entry_shape_is_valid(entry: Any) -> bool:
    """Shape only: known keys, required keys present, every present field the right TYPE. Does NOT check
    non-emptiness of scope_item/reason/re_review_trigger/related_moscow_wont_ref (separate, distinctly-coded
    checks below, mirroring how decision.moscow's own shape check separates "reason must be a string when
    present" from "reason must be non-empty when WONT") and does NOT check ``provenance`` content validity
    (the provenance gate's own job, same split every sibling module in this family already uses)."""
    if not isinstance(entry, dict):
        return False
    keys = set(entry.keys())
    if not _ENTRY_REQUIRED_KEYS.issubset(keys) or not keys.issubset(_ENTRY_ALLOWED_KEYS):
        return False
    if not _is_nonempty_str(entry.get("id")):
        return False
    for key in ("scope_item", "reason", "re_review_trigger"):
        if not isinstance(entry.get(key), str):
            return False
    if "related_moscow_wont_ref" in entry and not isinstance(entry["related_moscow_wont_ref"], str):
        return False
    if not isinstance(entry.get("provenance"), dict):
        return False
    return True


def _related_moscow_wont_ref_is_valid(ref: Any) -> bool:
    """Format-only check -- resolves OQ-MOSCOW-1. A non-empty string, the SAME shape
    moscow-prioritization-record.schema.yaml's own items[].id requires (that field carries no fixed prefix
    either -- only the MOSCOW- record-level id does, per that schema's own compilation_decisions). Existence
    of the referenced decision.moscow record/item is deliberately NOT verified here -- same
    format-only-no-existence-check limitation devops_sre/game_day.py's own runbook_execution_ref already
    accepts for its own cross-family soft reference."""
    return _is_nonempty_str(ref)


def _entry_missing_pipeline_stage(entry: dict[str, Any]) -> str | None:
    """Invariant #1. Precondition: ``entry`` has already passed ``_entry_shape_is_valid`` (so scope_item/
    reason/re_review_trigger are confirmed present and string-typed, and ``[...]`` cannot raise). Returns the
    specific error code for the FIRST missing stage found, checked in Atlas's own citation order (scope_item
    -> reason -> re_review_trigger), or ``None`` if all three are genuinely filled in."""
    if not _is_nonempty_str(entry["scope_item"]):
        return "NONGOALS_EMPTY_SCOPE_ITEM"
    if not _is_nonempty_str(entry["reason"]):
        return "NONGOALS_EMPTY_REASON"
    if not _is_nonempty_str(entry["re_review_trigger"]):
        return "NONGOALS_EMPTY_REREVIEW_TRIGGER"
    return None


def excluded_scope_entry(
    entry_id: str,
    scope_item: str,
    reason: str,
    re_review_trigger: str,
    provenance: dict[str, Any],
    *,
    related_moscow_wont_ref: str | None = None,
) -> dict[str, Any]:
    """Convenience constructor for one ``excluded_scope[]`` entry -- emits ONLY known-good keys, so a caller
    building a legitimate entry through this helper can never accidentally smuggle in an unknown field. Not
    itself an invariant boundary -- the real check happens inside ``generate_non_goals_record``, which
    validates whatever dict it is handed regardless of how it was built (the mutation/hand-tampering tests
    build entries directly, bypassing this helper, to prove the constructor itself -- not merely this
    convenience wrapper -- is what enforces the invariants, same discipline decision.moscow's own
    ``moscow_item`` docstring already establishes)."""
    record: dict[str, Any] = {
        "id": entry_id,
        "scope_item": scope_item,
        "reason": reason,
        "re_review_trigger": re_review_trigger,
        "provenance": provenance,
    }
    if related_moscow_wont_ref is not None:
        record["related_moscow_wont_ref"] = related_moscow_wont_ref
    return record


def generate_non_goals_record(
    record_id: str,
    project_scope: str,
    excluded_scope: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/non-goals-record.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed, in this order: id/version/project_scope shape, excluded_scope list shape, then
    PER ENTRY -- generic shape, then the 3-stage completeness invariant, then the soft-link format (if
    present), then cross-entry id uniqueness. REBUILDS every nested list/dict it owns; ``provenance`` is
    stored by reference, same family-wide convention every prior module in this package already follows."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"NONGOALS_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"NONGOALS_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(project_scope):
        raise InvariantViolation(f"NONGOALS_EMPTY_PROJECT_SCOPE: project_scope must be a non-empty string, got {project_scope!r}")
    if not isinstance(excluded_scope, list) or not excluded_scope:
        raise InvariantViolation(f"NONGOALS_INVALID_EXCLUDED_SCOPE: excluded_scope must be a non-empty list, got {_shallow_describe(excluded_scope)}")

    seen_ids: set[str] = set()
    for entry in excluded_scope:
        if not _entry_shape_is_valid(entry):
            raise InvariantViolation(
                f"NONGOALS_INVALID_ENTRY: excluded_scope[] entry must be a well-shaped dict (id/scope_item/reason/re_review_trigger non-empty/typed, "
                f"provenance a dict, optional related_moscow_wont_ref a string, no unknown keys), got {_shallow_describe(entry)}"
            )
        missing_stage = _entry_missing_pipeline_stage(entry)
        if missing_stage is not None:
            raise InvariantViolation(
                f"{missing_stage}: entry {entry['id']!r} is missing a required pipeline stage (Atlas F01 L339 "
                f"'excluded scope→理由→重審條件' -- all three of scope_item/reason/re_review_trigger are mandatory, unlike "
                f"decision.moscow's own WONT-only-conditional reason)"
            )
        if "related_moscow_wont_ref" in entry and not _related_moscow_wont_ref_is_valid(entry["related_moscow_wont_ref"]):
            raise InvariantViolation(f"NONGOALS_INVALID_MOSCOW_REF: related_moscow_wont_ref must be a non-empty string when present, got {entry['related_moscow_wont_ref']!r}")
        if entry["id"] in seen_ids:
            raise InvariantViolation(f"NONGOALS_DUPLICATE_ITEM_ID: excluded_scope[] id {entry['id']!r} is used more than once")
        seen_ids.add(entry["id"])

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "project_scope": project_scope,
        "excluded_scope": [dict(entry) for entry in excluded_scope],
        "provenance": provenance,
    }


def entries_with_moscow_ref(record: dict[str, Any]) -> list[str]:
    """Real derived view (recomputed fresh every call, never a stored field) -- ids of every excluded_scope[]
    entry that carries a related_moscow_wont_ref, in original list order. SCOPE: operates on an ALREADY-VALID
    record (generate_non_goals_record/evaluate_non_goals_integrity_gate already proved shape); does not
    re-validate and will raise a bare KeyError on a malformed record, same ALREADY-VALID-record scope
    decision.moscow's own bucket_counts/items_in_bucket already document."""
    return [entry["id"] for entry in record["excluded_scope"] if "related_moscow_wont_ref" in entry]


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance AND every
    excluded_scope[] entry's own provenance are schema-valid. Fails closed on a non-dict record or a
    non-list excluded_scope."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    record_provenance_valid = provenance_is_valid(record.get("provenance"))
    entries = record.get("excluded_scope")
    entries = entries if isinstance(entries, list) else []
    invalid_entry_ids = [e.get("id") if isinstance(e, dict) else None for e in entries if not (isinstance(e, dict) and provenance_is_valid(e.get("provenance")))]
    passed = record_provenance_valid and bool(entries) and not invalid_entry_ids
    return _result(
        "provenance_required",
        passed,
        [{"record_provenance_valid": record_provenance_valid, "entries_checked": len(entries), "invalid_provenance_entry_ids": invalid_entry_ids}],
        validator,
        timestamp,
    )


def evaluate_non_goals_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- does not trust any stored
    consistency, does NOT call ``generate_non_goals_record``. Bundles every structural reason under one
    ``gate_id`` (same shape ``evaluate_moscow_integrity_gate`` already uses), each with its own
    distinguishable evidence ``reason`` so a failure always names the specific bug class. FAILS CLOSED on
    malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("non_goals_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("non_goals_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("non_goals_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("project_scope")):
        return _result("non_goals_integrity", False, [{"reason": "project_scope missing or empty"}], validator, timestamp)

    entries = record.get("excluded_scope")
    if not isinstance(entries, list) or not entries:
        return _result("non_goals_integrity", False, [{"reason": "excluded_scope missing, empty, or not a list"}], validator, timestamp)

    seen_ids: set[str] = set()
    for entry in entries:
        if not _entry_shape_is_valid(entry):
            return _result(
                "non_goals_integrity",
                False,
                [{"reason": "an excluded_scope[] entry is malformed (unknown/missing key or wrong type)", "entry": _shallow_describe(entry)}],
                validator,
                timestamp,
            )
        missing_stage = _entry_missing_pipeline_stage(entry)
        if missing_stage is not None:
            return _result("non_goals_integrity", False, [{"reason": missing_stage, "entry_id": entry["id"]}], validator, timestamp)
        if "related_moscow_wont_ref" in entry and not _related_moscow_wont_ref_is_valid(entry["related_moscow_wont_ref"]):
            return _result("non_goals_integrity", False, [{"reason": "related_moscow_wont_ref present but not a non-empty string", "entry_id": entry["id"]}], validator, timestamp)
        if entry["id"] in seen_ids:
            return _result("non_goals_integrity", False, [{"reason": "duplicate excluded_scope id", "entry_id": entry["id"]}], validator, timestamp)
        seen_ids.add(entry["id"])

    return _result(
        "non_goals_integrity",
        True,
        [{"excluded_scope_count": len(entries), "entries_with_moscow_ref": len(entries_with_moscow_ref(record))}],
        validator,
        timestamp,
    )


def evaluate_non_goals_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_non_goals_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
