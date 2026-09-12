"""``jurisdiction.regulatory_horizon_scan`` -- F23 global jurisdiction/compliance/localization family (Atlas
L931-956), 1 of 4 concurrent agents opening F23 in this same parallel batch, this agent covering
Obligation-to-Control Mapping + Compliance Gap Analysis + Regulatory Horizon Scan.

Atlas cites this method ONCE: the F23 tool table row (L939, verbatim: "Regulatory Horizon Scan | 追蹤
proposed/coming regulation | official source->status/effective date->impact->owner | 降法規突襲"). Grep-
confirmed the only real hit case-insensitively across the whole Atlas file for THIS method's own name -- no
dedicated section. A DIFFERENT, pre-existing method, ``foresight.horizon_scanning`` (F13, Atlas L672,
dedicated §12.22, record prefix HSCAN-), was found during the same grep and is disambiguated below --
deliberately NOT a copy.

**Real invariant, THE one this method exists to enforce** (``REGHORIZON_UNOFFICIAL_SOURCE``): every
``entries[].source_type`` must be one of a closed official-channel set (``OFFICIAL_GOVERNMENT``,
``OFFICIAL_REGULATOR``, ``OFFICIAL_LEGISLATIVE_RECORD``). Atlas L939's own pipeline literally opens with
"official source" as a named, load-bearing stage (not just "source") -- an entry sourced from an
unofficial/rumor channel does not achieve "降法規突襲" (reduce regulatory surprise) reliably, it just adds
noise indistinguishable from a real signal.

Second invariant (``REGHORIZON_INCOMPLETE_ENTRY``): every entry's ``status``/``effective_date_or_estimate``/
``impact``/``owner`` must be non-empty -- Atlas L939's own pipeline names all four as required stages after
"official source".

Disambiguation from ``foresight.horizon_scanning`` (F13, HSCAN-): that method scans GENERIC emerging-trend
signals across any domain, with 6 mandatory fields (source/date/geography/status/impact/confidence) and NO
official-channel requirement on its free-text ``source`` field -- appropriate for early, unconfirmed weak
signals. This method is REGULATION-SPECIFIC: ``source_type`` is closed to official channels only (a rumor is
worthless here, unlike in generic horizon scanning where a weak signal is the point), ``owner`` replaces
``confidence``/``geography`` (accountability for a coming legal obligation, not a scanner's confidence in a
trend), and ``effective_date_or_estimate`` replaces a bare ``date`` (a proposed regulation usually has only an
estimate). Record prefix RHS- vs HSCAN-.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and ``Projects/internal/cognitive-engineering-os``
case-insensitively for "regulatory horizon"/"regulatory-horizon"/"RHS-"/"jurisdiction\\." before writing any
of this method's own files: zero pre-existing implementation or schema title overlap for this method's own
name.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "jurisdiction.regulatory_horizon_scan"
RECORD_ID_PREFIX = "RHS-"
_SOURCE_TYPES = frozenset({"OFFICIAL_GOVERNMENT", "OFFICIAL_REGULATOR", "OFFICIAL_LEGISLATIVE_RECORD"})
_ENTRY_KEYS = frozenset({"entry_id", "regulation_title", "source", "source_type", "status", "effective_date_or_estimate", "impact", "owner"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _entry_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped entries[] entry", INCLUDING the official-source
    invariant -- both ``entry()`` (construction layer) and the gate (independent re-derivation layer) consult
    it, so the two layers cannot drift apart (same shape ``foresight.cross_impact_analysis``'s
    ``_event_problem`` already establishes)."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _ENTRY_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _ENTRY_KEYS <= value.keys():
        return f"missing key(s) {sorted(_ENTRY_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("entry_id")):
        return f"entry_id must be a non-empty string, got {value.get('entry_id')!r}"
    if not _is_nonempty_str(value.get("regulation_title")):
        return f"regulation_title must be a non-empty string, got {value.get('regulation_title')!r}"
    if not _is_nonempty_str(value.get("source")):
        return f"source must be a non-empty string, got {value.get('source')!r}"
    if value.get("source_type") not in _SOURCE_TYPES:
        return f"source_type must be one of {sorted(_SOURCE_TYPES)}, got {value.get('source_type')!r} -- Atlas L939's own pipeline opens with 'official source'; an unofficial-channel source adds noise, not signal"
    if not _is_nonempty_str(value.get("status")):
        return f"status must be a non-empty string, got {value.get('status')!r}"
    if not _is_nonempty_str(value.get("effective_date_or_estimate")):
        return f"effective_date_or_estimate must be a non-empty string, got {value.get('effective_date_or_estimate')!r}"
    if not _is_nonempty_str(value.get("impact")):
        return f"impact must be a non-empty string, got {value.get('impact')!r}"
    if not _is_nonempty_str(value.get("owner")):
        return f"owner must be a non-empty string, got {value.get('owner')!r}"
    return None


def entry(
    entry_id: str,
    regulation_title: str,
    source: str,
    source_type: str,
    status: str,
    effective_date_or_estimate: str,
    impact: str,
    owner: str,
) -> dict[str, Any]:
    """One item of ``typed-objects/regulatory-horizon-scan-record.schema.yaml#/properties/entries``."""
    record = {
        "entry_id": entry_id,
        "regulation_title": regulation_title,
        "source": source,
        "source_type": source_type,
        "status": status,
        "effective_date_or_estimate": effective_date_or_estimate,
        "impact": impact,
        "owner": owner,
    }
    problem = _entry_problem(record)
    if problem is not None:
        code = "REGHORIZON_UNOFFICIAL_SOURCE" if source_type not in _SOURCE_TYPES else "REGHORIZON_INCOMPLETE_ENTRY"
        raise InvariantViolation(f"{code}: {problem}")
    return record


def generate_regulatory_horizon_scan(
    record_id: str,
    entries: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/regulatory-horizon-scan-record.schema.yaml``.

    Rebuilds every ``entries[]`` entry via ``entry()`` (never trusting the caller's raw dicts -- the
    official-source and completeness invariants are enforced per entry there, before any cross-entry check
    runs), then enforces the method contract's own remaining real invariants fail-closed: id/version/
    provenance shape, entries non-empty, and entry_id unique across the whole array.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"REGHORIZON_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"REGHORIZON_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("REGHORIZON_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    if not isinstance(entries, list) or not entries:
        raise InvariantViolation(f"REGHORIZON_EMPTY_ENTRIES: entries must be a non-empty list -- a scan tracking zero regulations has not actually tracked anything, got {entries!r}")

    rebuilt_entries: list[dict[str, Any]] = []
    for i, e in enumerate(entries):
        if not isinstance(e, dict):
            raise InvariantViolation(f"REGHORIZON_INCOMPLETE_ENTRY: entries[{i}] must be a dict, got {e!r}")
        try:
            rebuilt_entries.append(
                entry(
                    e.get("entry_id"),
                    e.get("regulation_title"),
                    e.get("source"),
                    e.get("source_type"),
                    e.get("status"),
                    e.get("effective_date_or_estimate"),
                    e.get("impact"),
                    e.get("owner"),
                )
            )
        except InvariantViolation as error:
            raise InvariantViolation(f"entries[{i}]: {error}") from error

    entry_ids = [e["entry_id"] for e in rebuilt_entries]
    if len(entry_ids) != len(set(entry_ids)):
        duplicate = sorted({eid for eid in entry_ids if entry_ids.count(eid) > 1})
        raise InvariantViolation(f"REGHORIZON_DUPLICATE_ENTRY_ID: entry_id(s) {duplicate} declared more than once")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "entries": rebuilt_entries,
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


def evaluate_official_source_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas L939's own 'official source' requirement directly from raw fields -- every entry's
    source_type must be in the closed official-channel set. Fails closed on malformed entries rather than
    crashing, and does NOT trust that the builder's own check already ran (a hand-tampered entry bypasses the
    builder entirely)."""
    if not isinstance(record, dict):
        return _result("official_source", False, [{"reason": "record is not a dict"}], validator, timestamp)
    entries = record.get("entries")
    if not isinstance(entries, list) or not entries:
        return _result("official_source", False, [{"reason": "entries missing, not a list, or empty"}], validator, timestamp)
    problems: list[str] = []
    for i, e in enumerate(entries):
        if not isinstance(e, dict):
            problems.append(f"entries[{i}] is not a dict")
            continue
        if e.get("source_type") not in _SOURCE_TYPES:
            problems.append(f"entries[{i}] (entry_id={e.get('entry_id')!r}) source_type={e.get('source_type')!r} is not an official-channel source")
    return _result("official_source", not problems, [{"problems": problems}], validator, timestamp)


def evaluate_entry_completeness_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives full per-entry well-shapedness (via ``_entry_problem``) AND entry_id uniqueness directly
    from raw fields -- does NOT trust that the builder's own checks already ran. Fails closed on malformed
    entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("entry_completeness", False, [{"reason": "record is not a dict"}], validator, timestamp)
    entries = record.get("entries")
    if not isinstance(entries, list) or not entries:
        return _result("entry_completeness", False, [{"reason": "entries missing, not a list, or empty"}], validator, timestamp)
    problems = [f"entries[{i}]: {problem}" for i, problem in ((i, _entry_problem(e)) for i, e in enumerate(entries)) if problem]
    well_shaped = [e for e in entries if _entry_problem(e) is None]
    entry_ids = [e["entry_id"] for e in well_shaped]
    if len(entry_ids) != len(set(entry_ids)):
        duplicate = sorted({eid for eid in entry_ids if entry_ids.count(eid) > 1})
        problems.append(f"duplicate entry_id: {duplicate}")
    passed = not problems
    return _result("entry_completeness", passed, [{"problems": problems}], validator, timestamp)


def evaluate_regulatory_horizon_scan_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_official_source_gate(record, validator, timestamp),
        evaluate_entry_completeness_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
