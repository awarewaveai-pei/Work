"""``challenge.counterexample_search`` -- F12 challenge/red-team/risk family, sixth built member (red_team,
blue_team, independent_judge already exist in this same package).

Atlas cites this method ONLY in the F12 tool table row (L648, verbatim): 用途="找規則的反例"，使用方式="claim→
boundary cases→true counterexamples"，效益="測適用邊界" -- no dedicated §11.2x section exists for this method,
unlike red_team §11.23 / blue_team §11.24 / independent_judge's own subsections (grep-confirmed before writing
this file). Disclosed honestly in the contract, same class of under-specification every other table-row-only
Tier 1 contract in this corpus already discloses.

THE real invariant, mechanizing the table row's own 3-stage pipeline: every ``true_counterexamples[]`` entry's
``boundary_case_id`` MUST resolve to a real ``boundary_cases[].id`` -- referential integrity, re-derived
independently at BOTH construction time (this module's builder) and gate time (the independent content-
integrity gate, never trusting a stored value), same two-layer discipline
``ai_lego/modules/stakeholders/game_theory.py``'s own payoff-completeness invariant already establishes for
this corpus. A case cannot be confirmed a counterexample if it was never examined as a boundary case in the
first place. ``true_counterexamples`` MAY legitimately be empty -- a claim surviving the search is a real,
useful result, not a failure (unlike ``game_theory``'s payoff table, which must be COMPLETE; this method's own
completion condition is merely "at least one boundary case was examined", not "every boundary case became a
counterexample").

Record-level-only provenance (NOT per-item) -- same placement ``stakeholders.game_theory``'s own
compilation_decisions establishes for a self-contained analytical record whose fields describe one coherent
search, not a list of independently-sourced items.

Grepped the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` trees case-insensitively for "counterexample_search"/"CES-"/
"CounterexampleSearch" before writing any of this method's own files: zero pre-existing implementation, zero
contract-backlog entry.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "challenge.counterexample_search"
RECORD_ID_PREFIX = "CES-"

_BOUNDARY_CASE_KEYS = frozenset({"id", "description"})
_COUNTEREXAMPLE_KEYS = frozenset({"boundary_case_id", "contradiction_explanation"})
_STORED_CONTENT_KEYS = frozenset({"id", "version", "generated_by_method", "claim", "boundary_cases", "true_counterexamples", "provenance"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline every prior module in this corpus (``game_theory``/``jtbd``/
    ``bcg_matrix``/``functional_decomposition``) already establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _validate_claim(claim: Any) -> None:
    if not _is_nonempty_str(claim):
        raise InvariantViolation(f"CES_EMPTY_CLAIM: claim must be a non-empty string, got {claim!r}")


def _validate_boundary_cases(boundary_cases: Any) -> list[str]:
    """Returns the list of valid boundary_case ids, or raises on any structural defect. Never returns a partial/
    best-effort result -- fail-closed."""
    if not isinstance(boundary_cases, list) or not boundary_cases:
        raise InvariantViolation(
            f"CES_INVALID_BOUNDARY_CASES: boundary_cases must be a non-empty list (Atlas L648's own 'boundary "
            f"cases' stage -- a search that examined zero boundary cases did not search), got {_shallow_describe(boundary_cases)}"
        )
    ids: list[str] = []
    for index, case in enumerate(boundary_cases):
        if not isinstance(case, dict) or set(case.keys()) - _BOUNDARY_CASE_KEYS or not _BOUNDARY_CASE_KEYS <= case.keys():
            raise InvariantViolation(f"CES_INVALID_BOUNDARY_CASE: boundary_cases[{index}] must be a dict with exactly keys {sorted(_BOUNDARY_CASE_KEYS)}, got {_shallow_describe(case)}")
        if not _is_nonempty_str(case.get("id")) or not _is_nonempty_str(case.get("description")):
            raise InvariantViolation(f"CES_INVALID_BOUNDARY_CASE: boundary_cases[{index}] id and description must each be a non-empty string, got {_shallow_describe(case)}")
        ids.append(case["id"])
    duplicates = {cid for cid in ids if ids.count(cid) > 1}
    if duplicates:
        raise InvariantViolation(f"CES_DUPLICATE_BOUNDARY_CASE_ID: boundary_case id(s) {sorted(duplicates)} appear more than once")
    return ids


def _validate_true_counterexamples(true_counterexamples: Any, boundary_case_ids: list[str]) -> None:
    """THE real invariant this method exists to enforce: every ``true_counterexamples`` entry's
    ``boundary_case_id`` resolves to a real ``boundary_cases`` entry -- referential integrity, checked before the
    record is returned. MAY legitimately be an empty list (a claim can survive the search); the only requirement
    is that the field be a list at all."""
    if not isinstance(true_counterexamples, list):
        raise InvariantViolation(f"CES_INVALID_TRUE_COUNTEREXAMPLES: true_counterexamples must be a list (may be empty -- a claim can survive the search), got {_shallow_describe(true_counterexamples)}")
    boundary_case_id_set = set(boundary_case_ids)
    seen: list[str] = []
    for index, item in enumerate(true_counterexamples):
        if not isinstance(item, dict) or set(item.keys()) - _COUNTEREXAMPLE_KEYS or not _COUNTEREXAMPLE_KEYS <= item.keys():
            raise InvariantViolation(f"CES_INVALID_COUNTEREXAMPLE: true_counterexamples[{index}] must be a dict with exactly keys {sorted(_COUNTEREXAMPLE_KEYS)}, got {_shallow_describe(item)}")
        boundary_case_id, explanation = item.get("boundary_case_id"), item.get("contradiction_explanation")
        if not _is_nonempty_str(boundary_case_id) or not _is_nonempty_str(explanation):
            raise InvariantViolation(f"CES_INVALID_COUNTEREXAMPLE: true_counterexamples[{index}] boundary_case_id and contradiction_explanation must each be a non-empty string, got {_shallow_describe(item)}")
        if boundary_case_id not in boundary_case_id_set:
            raise InvariantViolation(
                f"CES_COUNTEREXAMPLE_UNKNOWN_BOUNDARY_CASE: true_counterexamples[{index}] boundary_case_id {boundary_case_id!r} "
                f"does not reference any entry in boundary_cases -- a case cannot be confirmed a counterexample if "
                f"it was never examined as a boundary case"
            )
        seen.append(boundary_case_id)
    duplicates = {bid for bid in seen if seen.count(bid) > 1}
    if duplicates:
        raise InvariantViolation(f"CES_DUPLICATE_COUNTEREXAMPLE: boundary_case_id(s) {sorted(duplicates)} appear more than once in true_counterexamples")


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_counterexample_search(
    record_id: str,
    claim: str,
    boundary_cases: list[dict[str, Any]],
    true_counterexamples: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/counterexample-search.schema.yaml``.

    Enforces all real invariants fail-closed, in order: id/version/provenance shape, then ``claim`` (non-empty),
    then ``boundary_cases`` (>=1, well-formed, unique ids), then ``true_counterexamples`` (every
    ``boundary_case_id`` resolves to a real ``boundary_cases`` entry -- referential integrity, THE invariant this
    method exists to enforce; may legitimately be empty).
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"CES_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"CES_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"CES_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    _validate_claim(claim)
    boundary_case_ids = _validate_boundary_cases(boundary_cases)
    _validate_true_counterexamples(true_counterexamples, boundary_case_ids)

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "claim": claim,
        # dict(...) per element, not just list(...) on the outer list -- a shallow list() copy still shares the
        # caller's own nested dicts, letting e.g. `boundary_cases[0]["description"] = "..."` silently rewrite a
        # gate-passed record after construction. Same aliasing discipline
        # stakeholders.game_theory.generate_game_theory_model's own critic-found fix already establishes.
        "boundary_cases": [dict(case) for case in boundary_cases],
        "true_counterexamples": [dict(item) for item in true_counterexamples],
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_counterexample_search -- a hand-tampered record that bypassed the builder entirely must be caught
# exactly as a builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance is schema-valid.
    Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_counterexample_search_content_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_counterexample_search``, so a hand-tampered record that bypassed the builder
    entirely (e.g. a dangling boundary_case_id spliced into ``true_counterexamples`` after construction) is
    caught here exactly as a builder-refused one would have been. Fails closed on malformed input rather than
    crashing."""
    if not isinstance(record, dict):
        return _result("counterexample_search_content_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("counterexample_search_content_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("counterexample_search_content_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    # Record-level key-set check -- an added/removed top-level key must be caught by THIS gate too, not only by
    # JSON Schema, same discipline stakeholders.game_theory's own content-integrity gate establishes (critic-
    # found gap there, applied here proactively).
    unknown_keys = set(record.keys()) - _STORED_CONTENT_KEYS
    missing_keys = (_STORED_CONTENT_KEYS - {"generated_by_method"}) - set(record.keys())
    if unknown_keys or missing_keys:
        return _result(
            "counterexample_search_content_integrity",
            False,
            [{"reason": f"record key set mismatch -- unknown={sorted(unknown_keys)}, missing={sorted(missing_keys)}"}],
            validator,
            timestamp,
        )

    problems: list[str] = []
    try:
        _validate_claim(record.get("claim"))
    except InvariantViolation as error:
        problems.append(str(error))

    boundary_case_ids: list[str] = []
    try:
        boundary_case_ids = _validate_boundary_cases(record.get("boundary_cases"))
    except InvariantViolation as error:
        problems.append(str(error))

    try:
        if boundary_case_ids:
            _validate_true_counterexamples(record.get("true_counterexamples"), boundary_case_ids)
        else:
            problems.append("true_counterexamples could not be checked: boundary_cases failed validation")
    except InvariantViolation as error:
        problems.append(str(error))

    return _result("counterexample_search_content_integrity", not problems, [{"problems": problems}], validator, timestamp)


def evaluate_counterexample_search_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_counterexample_search_content_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
