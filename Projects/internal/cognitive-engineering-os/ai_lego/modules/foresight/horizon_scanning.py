"""``foresight.horizon_scanning`` -- F13 foresight family (Atlas L672, dedicated §12.22 L2811-2818).

§12.22's own engineering mandate (L2817, verbatim): "每個 signal 必須有
source、date、geography、status、impact、confidence" -- not advisory, a hard
per-signal field requirement, enforced at TWO independent layers: the
builder refuses to construct a signal missing any of the six fields (or an
empty one), and the gate independently re-derives the same check from raw
fields, never trusting the builder already ran. A second, additive
invariant (referential integrity, this file's own compiled structure, not
textually cited): every signal's `domain`/`source` must resolve to a
declared `domains[]`/`sources[]` entry -- Atlas's own literal pipeline is
"domains/sources→signals", not the reverse.

Dedup grep (case-insensitive, full spec root, before writing): no existing
schema defines this method's own output shape. See
`typed-objects/horizon-scan-record.schema.yaml`'s own `verification` for
the two incidental near-misses found (data-quality-assessment-record.schema.yaml's
six DATA QUALITY dimensions profile a dataset's own fields, not an external
emerging-change signal; evidence.triangulation.contract.yaml cross-
validates research themes/literature, a different family with no built
output schema).
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "foresight.horizon_scanning"
RECORD_ID_PREFIX = "HSCAN-"
_SIGNAL_MANDATORY_FIELDS = frozenset({"source", "date", "geography", "status", "impact", "confidence"})
_SIGNAL_KEYS = _SIGNAL_MANDATORY_FIELDS | {"id", "domain", "description"}


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_valid_declaration(value: Any, id_key: str) -> bool:
    """Shared shape check for one `domains[]`/`sources[]` entry -- {id_key, name}, both non-empty strings."""
    return isinstance(value, dict) and set(value.keys()) == {id_key, "name"} and _is_nonempty_str(value.get(id_key)) and _is_nonempty_str(value.get("name"))


def _signal_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped signal" -- both ``signal()`` (construction layer) and
    the gate's own re-derivation consult it, so the two layers cannot drift apart (same shape
    ``epistemic.evidence_matrix``'s ``_link_problem`` already establishes). Does NOT check that
    ``domain``/``source`` resolve to a declared entry -- that cross-record check happens once, in
    ``generate_horizon_scan_record``/the referential-integrity gate, after every signal has been rebuilt.
    Returns None when valid.
    """
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _SIGNAL_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    missing = _SIGNAL_KEYS - value.keys()
    if missing:
        return f"missing key(s) {sorted(missing, key=repr)}"
    for key in sorted(_SIGNAL_KEYS):
        if not _is_nonempty_str(value.get(key)):
            return f"{key!r} must be a non-empty string, got {value.get(key)!r} -- Atlas §12.22 L2817's own six-field mandate covers {sorted(_SIGNAL_MANDATORY_FIELDS)}"
    return None


def signal(signal_id: str, domain: str, source: str, description: str, date: str, geography: str, status: str, impact: str, confidence: str) -> dict[str, Any]:
    """One item of ``typed-objects/horizon-scan-record.schema.yaml#/properties/signals``."""
    record = {
        "id": signal_id,
        "domain": domain,
        "source": source,
        "description": description,
        "date": date,
        "geography": geography,
        "status": status,
        "impact": impact,
        "confidence": confidence,
    }
    problem = _signal_problem(record)
    if problem is not None:
        raise InvariantViolation(f"HSCAN_INVALID_SIGNAL: {problem}")
    return record


def generate_horizon_scan_record(
    record_id: str,
    domains: list[dict[str, Any]],
    sources: list[dict[str, Any]],
    signals: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/horizon-scan-record.schema.yaml``.

    Rebuilds every signal via ``signal()`` (never trusting the caller's raw dicts), then enforces the method
    contract's own real invariant fail-closed, in order: >=1 domain, >=1 source, >=1 signal declared, every
    signal's own six mandatory fields present and non-empty (via ``signal()``), and every signal's
    ``domain``/``source`` resolves to a declared ``domains[]``/``sources[]`` entry -- BEFORE returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"HSCAN_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"HSCAN_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("HSCAN_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    if not isinstance(domains, list) or not domains:
        raise InvariantViolation("HSCAN_NO_DOMAINS: at least 1 domain is required -- Atlas L672's own literal 'domains/sources→signals' pipeline start")
    rebuilt_domains: list[dict[str, Any]] = []
    for i, d in enumerate(domains):
        if not _is_valid_declaration(d, "domain_id"):
            raise InvariantViolation(f"HSCAN_INVALID_DOMAIN: domains[{i}] must be a {{domain_id, name}} object with non-empty strings, got {d!r}")
        rebuilt_domains.append(copy.deepcopy(d))

    if not isinstance(sources, list) or not sources:
        raise InvariantViolation("HSCAN_NO_SOURCES: at least 1 source is required -- Atlas L672's own literal 'domains/sources→signals' pipeline start")
    rebuilt_sources: list[dict[str, Any]] = []
    for i, s in enumerate(sources):
        if not _is_valid_declaration(s, "source_id"):
            raise InvariantViolation(f"HSCAN_INVALID_SOURCE: sources[{i}] must be a {{source_id, name}} object with non-empty strings, got {s!r}")
        rebuilt_sources.append(copy.deepcopy(s))

    if not isinstance(signals, list) or not signals:
        raise InvariantViolation("HSCAN_NO_SIGNALS: at least 1 signal is required")
    rebuilt_signals: list[dict[str, Any]] = []
    for i, sig in enumerate(signals):
        if not isinstance(sig, dict) or set(sig.keys()) - _SIGNAL_KEYS or _SIGNAL_KEYS - sig.keys():
            raise InvariantViolation(f"HSCAN_INVALID_SIGNAL: signals[{i}] must be a {{{', '.join(sorted(_SIGNAL_KEYS))}}} object, got {sig!r}")
        rebuilt_signals.append(signal(sig["id"], sig["domain"], sig["source"], sig["description"], sig["date"], sig["geography"], sig["status"], sig["impact"], sig["confidence"]))

    domain_ids = {d["domain_id"] for d in rebuilt_domains}
    source_ids = {s["source_id"] for s in rebuilt_sources}

    dangling_domain_refs = sorted({sig["domain"] for sig in rebuilt_signals} - domain_ids)
    if dangling_domain_refs:
        raise InvariantViolation(f"HSCAN_DANGLING_DOMAIN_REF: signals[] reference domain(s) {dangling_domain_refs} not present in domains[]")

    dangling_source_refs = sorted({sig["source"] for sig in rebuilt_signals} - source_ids)
    if dangling_source_refs:
        raise InvariantViolation(f"HSCAN_DANGLING_SOURCE_REF: signals[] reference source(s) {dangling_source_refs} not present in sources[]")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "domains": rebuilt_domains,
        "sources": rebuilt_sources,
        "signals": rebuilt_signals,
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


def evaluate_signal_fields_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas §12.22 L2817's own six-field mandate directly from raw fields via the SAME predicate
    ``signal()`` uses -- not just trusting that ``generate_horizon_scan_record``'s own construction-time check
    already ran. Fails closed on malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("signal_six_fields_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    signals = record.get("signals")
    if not isinstance(signals, list) or not signals:
        return _result("signal_six_fields_required", False, [{"reason": "signals must be a non-empty list"}], validator, timestamp)
    problems = [f"signals[{i}]: {problem}" for i, problem in ((i, _signal_problem(s)) for i, s in enumerate(signals)) if problem]
    passed = not problems
    return _result("signal_six_fields_required", passed, [{"signals_checked": len(signals), "problems": problems}], validator, timestamp)


def evaluate_referential_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives the domain/source referential-integrity half of the invariant directly from raw fields.
    Fails closed on malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("referential_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems: list[str] = []

    domains = record.get("domains")
    domain_ids: set[Any] = set()
    if isinstance(domains, list):
        domain_ids = {d.get("domain_id") if isinstance(d, dict) else None for d in domains}
    else:
        problems.append("domains must be a list")

    sources = record.get("sources")
    source_ids: set[Any] = set()
    if isinstance(sources, list):
        source_ids = {s.get("source_id") if isinstance(s, dict) else None for s in sources}
    else:
        problems.append("sources must be a list")

    signals = record.get("signals")
    if isinstance(signals, list):
        well_shaped = [s for s in signals if isinstance(s, dict) and _signal_problem(s) is None]
        dangling_domain_refs = sorted({s["domain"] for s in well_shaped if s["domain"] not in domain_ids}, key=repr)
        if dangling_domain_refs:
            problems.append(f"dangling domain ref(s): {dangling_domain_refs}")
        dangling_source_refs = sorted({s["source"] for s in well_shaped if s["source"] not in source_ids}, key=repr)
        if dangling_source_refs:
            problems.append(f"dangling source ref(s): {dangling_source_refs}")
    else:
        problems.append("signals must be a list")

    passed = not problems
    return _result("referential_integrity", passed, [{"problems": problems}], validator, timestamp)


def evaluate_horizon_scanning_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_signal_fields_gate(record, validator, timestamp),
        evaluate_referential_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
