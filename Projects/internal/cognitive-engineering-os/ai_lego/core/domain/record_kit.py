"""Shared invariant kit for Method Atlas record builders/gates (2026-09-17, art-therapy batch onward).

Every method module in ``ai_lego/modules/`` historically re-declared the same ~8 helpers (``_is_nonempty_str``,
``_result``, id-prefix/version/provenance header checks, closed-key entry shape checks, duplicate-id scan).
This module is the single owner of those predicates so a new method carries only its OWN invariant.

Rules that keep ``ai_lego.apps.api.dispatch`` working (it finds a module's builder/gate-runner by name):
- nothing here is named ``generate_*`` or ``evaluate_*_gates`` (dispatch counts only functions DEFINED in the
  method module, but keeping the namespace clean avoids confusion);
- helpers raise ``InvariantViolation`` with a ``<CODE>_...`` prefix supplied by the caller so error codes stay
  method-specific and greppable.
"""

from __future__ import annotations

import copy
import datetime
import re
from typing import Any, Callable, Iterable

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

Check = Callable[[Any], bool]


def is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def is_nonempty_str_list(value: Any) -> bool:
    return isinstance(value, list) and len(value) >= 1 and all(is_nonempty_str(v) for v in value)


def is_real_number(value: Any) -> bool:
    """int/float, finite, and NOT bool (``bool`` is an ``int`` subclass -- the documented corpus-wide trap)."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    return value == value and value not in (float("inf"), float("-inf"))


def is_number_in(value: Any, low: float, high: float) -> bool:
    return is_real_number(value) and low <= value <= high


def is_int_in(value: Any, low: int, high: int) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and low <= value <= high


_ISO_DATE = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")


def is_iso_date(value: Any) -> bool:
    """Exactly ``YYYY-MM-DD`` (the typed-object schemas' pattern) AND a real calendar date. No whitespace tolerance:
    the stored string must equal the validated string."""
    if not isinstance(value, str) or not _ISO_DATE.fullmatch(value):
        return False
    try:
        datetime.date.fromisoformat(value)
    except ValueError:
        return False
    return True


def parse_date(value: str) -> datetime.date:
    """Precondition: ``is_iso_date(value)`` already held."""
    return datetime.date.fromisoformat(value)


def is_one_of(value: Any, allowed: Iterable[str]) -> bool:
    """Closed-set membership that cannot raise: an unhashable JSON value (list/dict) is simply not a member."""
    return isinstance(value, str) and value in allowed


def normalize(value: str) -> str:
    """Case/whitespace-insensitive comparison key."""
    return " ".join(value.strip().casefold().split())


def shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a recursive repr over caller input."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def entry_problem(entry: Any, required: frozenset[str], allowed: frozenset[str], checks: dict[str, Check]) -> str | None:
    """Closed-key-set shape check shared by the builder and the gate. ``checks`` maps key -> predicate; a key in
    ``checks`` that is absent from ``entry`` is only a problem when it is in ``required``. Returns None when valid."""
    if not isinstance(entry, dict):
        return f"not a dict: {shallow_describe(entry)}"
    keys = set(entry.keys())
    missing = required - keys
    if missing:
        return f"missing key(s) {sorted(missing)}"
    unknown = keys - allowed
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    for key, check in checks.items():
        if key not in entry:
            continue
        try:
            ok = check(entry[key])
        except Exception:  # a predicate must never turn caller JSON (e.g. an unhashable list) into a 500
            ok = False
        if not ok:
            return f"{key} invalid: {shallow_describe(entry[key])}"
    return None


def entries_problem(entries: Any, required: frozenset[str], allowed: frozenset[str], checks: dict[str, Check], *, min_items: int = 1) -> str | None:
    if not isinstance(entries, list):
        return f"not a list: {shallow_describe(entries)}"
    if len(entries) < min_items:
        return f"expected at least {min_items} item(s), got {len(entries)}"
    for index, entry in enumerate(entries):
        problem = entry_problem(entry, required, allowed, checks)
        if problem is not None:
            return f"[{index}] {problem}"
    return None


def first_duplicate(values: Iterable[Any]) -> Any | None:
    seen: set[Any] = set()
    for value in values:
        key = value if isinstance(value, (str, int, float, bool, tuple)) else repr(value)
        if key in seen:
            return value
        seen.add(key)
    return None


def ids_of(entries: Iterable[Any], key: str = "id") -> list[Any]:
    return [entry.get(key) for entry in entries if isinstance(entry, dict)]


def require(condition: bool, code: str, message: str) -> None:
    if not condition:
        raise InvariantViolation(f"{code}: {message}")


def require_header(code: str, record_id: str, prefix: str, version: Any, provenance: Any) -> None:
    """Common builder preamble: id prefix, version string, valid provenance -- raised BEFORE any record is built."""
    require(is_nonempty_str(record_id) and record_id.startswith(prefix), f"{code}_INVALID_ID", f"record_id must start with {prefix!r}, got {record_id!r}")
    require(isinstance(version, str), f"{code}_INVALID_VERSION", f"version must be a string, got {type(version).__name__}")
    require(provenance_is_valid(provenance), f"{code}_INVALID_PROVENANCE", "provenance must be a valid provenance_record")


def header_problem(record: Any, prefix: str) -> str | None:
    """Gate-side mirror of ``require_header`` (fail-closed description, never raises)."""
    if not isinstance(record, dict):
        return "record is not a dict"
    if not is_nonempty_str(record.get("id")) or not record["id"].startswith(prefix):
        return f"id missing, empty, or not prefixed {prefix!r}"
    if not isinstance(record.get("version"), str):
        return "version missing or not a string"
    return None


def base_record(record_id: str, version: str, generated_by_method: str, provenance: dict[str, Any], **fields: Any) -> dict[str, Any]:
    """Assemble the record with deep-copied owned fields (no aliasing of caller containers)."""
    record: dict[str, Any] = {"id": record_id, "version": version, "generated_by_method": generated_by_method}
    for key, value in fields.items():
        record[key] = copy.deepcopy(value)
    record["provenance"] = copy.deepcopy(provenance)
    return record


def gate_result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def provenance_required_gate(record: Any, validator: str, timestamp: str, *, nested: tuple[str, ...] = ()) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true``: the record's provenance is valid, plus (optionally) every
    dict item inside each list named in ``nested`` carries its own valid provenance."""
    if not isinstance(record, dict):
        return gate_result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    record_ok = provenance_is_valid(record.get("provenance"))
    invalid: list[Any] = []
    checked = 0
    for field in nested:
        items = record.get(field)
        if not isinstance(items, list):
            invalid.append({field: "not a list"})
            continue
        for item in items:
            checked += 1
            if not isinstance(item, dict) or not provenance_is_valid(item.get("provenance")):
                invalid.append(item.get("id") if isinstance(item, dict) else shallow_describe(item))
    passed = record_ok and not invalid
    return gate_result("provenance_required", passed, [{"record_provenance_valid": record_ok, "nested_checked": checked, "invalid": invalid}], validator, timestamp)


def integrity_gate(gate_id: str, record: Any, prefix: str, problem_fn: Callable[[dict[str, Any]], str | None], evidence_fn: Callable[[dict[str, Any]], dict[str, Any]], validator: str, timestamp: str) -> dict[str, Any]:
    """Generic fail-closed integrity gate: header check, then the module's own ``problem_fn`` (re-derived from raw
    fields, never trusting a stored value). ``problem_fn`` must itself be exception-safe on garbage input."""
    problem = header_problem(record, prefix)
    if problem is None:
        try:
            problem = problem_fn(record)
        except Exception as error:  # a gate must fail closed on garbage, never crash the workflow
            problem = f"gate re-derivation raised {type(error).__name__}: {error}"
    if problem is not None:
        return gate_result(gate_id, False, [{"reason": problem}], validator, timestamp)
    return gate_result(gate_id, True, [evidence_fn(record)], validator, timestamp)


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
