"""``foresight.historical_analogy`` -- F13 unknown-unknowns/foresight family (Atlas L668-685, this method's own
row L674): "Historical Analogy | 用歷史機制比較 | 相似/差異→抽機制→限制類比 | 借歷史又避免表面類比" (compare via
historical mechanisms; similarities/differences -> extract mechanism -> limit the analogy; borrow from history
while avoiding a surface-level analogy). No dedicated §11/§12 section exists for this row -- the table row
itself is the sole citation (verified by reading the Atlas file directly).

Real invariant, made structural: Atlas's own pipeline is similarities/differences -> extracted mechanism ->
LIMITED analogy, and its own benefit column is explicitly "avoid a surface-level analogy". An analogy record
asserting only similarities, with no differences and no stated limits, IS the surface-level analogy this method
exists to prevent -- refused at construction, not merely discouraged. Concretely, every ``analogies[]`` item
requires >=1 similarity AND >=1 difference AND a non-empty ``extracted_mechanism`` AND a non-empty
``analogy_limits``. Enforced at TWO independent layers (construction-time raise + independent gate
re-derivation), same belt-and-suspenders discipline every prior slice in this corpus establishes -- both
consult the single shared predicate ``_analogy_problem`` so the two layers cannot silently drift apart (the
``epistemic.evidence_matrix``/``_link_problem`` shape).

Distinct from ``association.analogy_mapping`` (F04, L416): that method is a general source-domain ->
abstracted-mechanism -> target-mapping transfer pipeline with no historical scoping and no
similarities/differences/limits structure. This method is specifically a HISTORICAL-CASE comparison with an
explicit similarities/differences pairing and a mandatory analogy-limiting step ``analogy_mapping`` does not
carry -- ``association.analogy_mapping.contract.yaml`` itself already names this exact distinction and carries
a forward soft-link (``informs_historical_analogy_ref``) anticipating this method being built later.

Grepped the full spec root (``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS``) case-insensitively for
"historical analogy"/"historical case"/"analogy_limits" before writing any of this method's own files: only
the F04 analogy_mapping forward-soft-link and the F13 table row itself reference this method; no existing
schema defines this shape.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "foresight.historical_analogy"
RECORD_ID_PREFIX = "HANALOGY-"
_ANALOGY_KEYS = frozenset({"id", "historical_case", "similarities", "differences", "extracted_mechanism", "analogy_limits"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_nonempty_str_list(value: Any) -> bool:
    return isinstance(value, list) and len(value) >= 1 and all(_is_nonempty_str(v) for v in value)


def _analogy_problem(value: Any) -> str | None:
    """The single definition of "is this analogy well-shaped" -- both ``analogy()`` (construction layer) and
    ``evaluate_no_surface_level_analogy_gate`` (independent re-derivation layer) consult it, so the two layers
    cannot drift apart (same shared-predicate shape ``epistemic.evidence_matrix``'s own ``_link_problem``
    establishes). Returns None when valid."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _ANALOGY_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _ANALOGY_KEYS <= value.keys():
        return f"missing key(s) {sorted(_ANALOGY_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("id")):
        return f"id must be a non-empty string, got {value.get('id')!r}"
    if not _is_nonempty_str(value.get("historical_case")):
        return f"historical_case must be a non-empty string, got {value.get('historical_case')!r}"
    if not _is_nonempty_str_list(value.get("similarities")):
        return "similarities must be a non-empty list of non-empty strings (Atlas L674's own 相似/差異 first half)"
    if not _is_nonempty_str_list(value.get("differences")):
        return (
            "differences must be a non-empty list of non-empty strings -- an analogy with similarities but no "
            "stated differences is exactly the surface-level analogy Atlas L674's own benefit column exists to prevent"
        )
    if not _is_nonempty_str(value.get("extracted_mechanism")):
        return "extracted_mechanism must be a non-empty string (Atlas L674's own 抽機制 middle step)"
    if not _is_nonempty_str(value.get("analogy_limits")):
        return "analogy_limits must be a non-empty string (Atlas L674's own 限制類比 final step)"
    return None


def analogy(analogy_id: str, historical_case: str, similarities: list[str], differences: list[str], extracted_mechanism: str, analogy_limits: str) -> dict[str, Any]:
    """One item of ``typed-objects/historical-analogy.schema.yaml#/properties/analogies``. Does not itself check
    cross-item uniqueness -- that is ``generate_historical_analogy_set``'s own job, same division of labor
    ``link()``/``finding()`` already establish in this corpus."""
    record = {
        "id": analogy_id,
        "historical_case": historical_case,
        "similarities": list(similarities) if isinstance(similarities, list) else similarities,
        "differences": list(differences) if isinstance(differences, list) else differences,
        "extracted_mechanism": extracted_mechanism,
        "analogy_limits": analogy_limits,
    }
    problem = _analogy_problem(record)
    if problem is not None:
        raise InvariantViolation(f"HANALOGY_INVALID_ANALOGY: {problem}")
    return record


def generate_historical_analogy_set(
    record_id: str,
    subject_ref: str,
    analogies: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/historical-analogy.schema.yaml``.

    Rebuilds every ``analogies[]`` item via ``analogy()`` (never trusting the caller's raw dicts, and never a
    shallow copy of the caller's own nested ``similarities``/``differences`` lists -- ``analogy()`` already
    rebuilds fresh lists from the caller's inputs), then enforces the record-level invariant fail-closed: at
    least one analogy declared, and no two analogies share the same ``id``.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"HANALOGY_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"HANALOGY_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not _is_nonempty_str(subject_ref):
        raise InvariantViolation(f"HANALOGY_INVALID_SUBJECT_REF: subject_ref must be a non-empty string, got {subject_ref!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("HANALOGY_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    if not isinstance(analogies, list) or not analogies:
        raise InvariantViolation("HANALOGY_NO_ANALOGIES: at least 1 analogy is required -- Atlas L674's own pipeline has nothing to compare otherwise")
    rebuilt: list[dict[str, Any]] = []
    for i, a in enumerate(analogies):
        if not isinstance(a, dict) or not _ANALOGY_KEYS <= a.keys():
            raise InvariantViolation(f"HANALOGY_INVALID_ANALOGY: analogies[{i}] must be a {{{sorted(_ANALOGY_KEYS)}}} object, got {a!r}")
        rebuilt.append(analogy(a["id"], a["historical_case"], a["similarities"], a["differences"], a["extracted_mechanism"], a["analogy_limits"]))

    ids = [a["id"] for a in rebuilt]
    duplicate_ids = sorted({i for i in ids if ids.count(i) > 1})
    if duplicate_ids:
        raise InvariantViolation(f"HANALOGY_DUPLICATE_ANALOGY_ID: analogies[] ids must be unique, duplicates found: {duplicate_ids}")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "subject_ref": subject_ref,
        "analogies": rebuilt,
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


def evaluate_no_surface_level_analogy_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives the per-analogy shape invariant directly from raw fields via the SAME ``_analogy_problem``
    predicate the builder uses -- not just trusting that ``generate_historical_analogy_set``'s own
    construction-time check already ran. Catches a hand-tampered record that bypassed the builder entirely.
    Fails closed on malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("no_surface_level_analogy", False, [{"reason": "record is not a dict"}], validator, timestamp)
    analogies = record.get("analogies")
    if not isinstance(analogies, list):
        return _result("no_surface_level_analogy", False, [{"reason": "analogies must be a list"}], validator, timestamp)
    problems = [f"analogies[{i}]: {problem}" for i, problem in ((i, _analogy_problem(a)) for i, a in enumerate(analogies)) if problem]
    # Re-derives HANALOGY_DUPLICATE_ANALOGY_ID independently -- a critic pass found this gate suite returned
    # all-PASS on a hand-tampered record with two analogies sharing an id, even though the builder refuses it.
    ids = [a.get("id") if isinstance(a, dict) else None for a in analogies]
    duplicate_ids = sorted({i for i in ids if i is not None and ids.count(i) > 1}, key=repr)
    if duplicate_ids:
        problems.append(f"duplicate analogy id(s): {duplicate_ids}")
    passed = not problems
    return _result("no_surface_level_analogy", passed, [{"analogies_checked": len(analogies), "problems": problems}], validator, timestamp)


def evaluate_min_analogies_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives the record-level 'at least one analogy examined' invariant directly from raw fields."""
    if not isinstance(record, dict):
        return _result("min_analogies_examined", False, [{"reason": "record is not a dict"}], validator, timestamp)
    analogies = record.get("analogies")
    passed = isinstance(analogies, list) and len(analogies) >= 1
    return _result("min_analogies_examined", passed, [{"analogies_count": len(analogies) if isinstance(analogies, list) else None}], validator, timestamp)


def evaluate_historical_analogy_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_no_surface_level_analogy_gate(record, validator, timestamp),
        evaluate_min_analogies_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
