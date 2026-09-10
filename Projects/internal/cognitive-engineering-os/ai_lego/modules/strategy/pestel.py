"""``strategy.pestel`` -- 2nd F08 context/strategy family tenant (after `strategy.swot`, 1/14 -> 2/14).

Atlas F08 table row (L515: "PESTEL｜掃描宏觀環境｜P/E/S/T/E/L→facts→trends→
implications→uncertainty｜建立外部基線｜Scenario、SWOT") PLUS a dedicated §11.9
section (L1365-1404) that names the 6 real dimensions (L1368: Political/
Economic/Social/Technological/Environmental/Legal, resolving the P/E/S/T/E/L
acronym's Economic-vs-Environmental ambiguity) and gives a "全球系統的必要欄位"
yaml block (L1386-1395) with 9 literal per-factor fields -- a richer citation
than most F-family rows, closer to SWOT's own §11.7 than to
``causal.synthetic_control``'s single-row citation.

**Structural difference from `strategy.swot`, disclosed (see
`methods/contracts/strategy.pestel.contract.yaml` compilation_decisions and
`specs/cognitive/typed-objects/pestel-analysis.schema.yaml` compilation_decisions
for the full reasoning): PESTEL factors are self-evidencing.** SWOT's factors
draw from one shared external `KnowledgeSet` (Atlas's own §14.1 chain);
PESTEL's Atlas citation gives no comparable upstream typed-object, and every
factor already carries its own required `source`/`source_type` -- so this
module's ``generate_pestel_analysis`` takes no knowledge-set argument at all,
unlike ``ai_lego.modules.strategy.swot.generate_swot_analysis``.

Real invariants (5, beyond per-field completeness), enforced at construction
(raise BEFORE any factor/analysis is built) AND independently re-derived by a
gate from raw fields (catching a hand-tampered record that bypassed the
builder entirely) -- same two-layer discipline every sibling module in this
package establishes:

1. **PESTEL_INVALID_DIMENSION**: ``dimension`` must be one of the 6 names
   Atlas L1368 gives verbatim (POLITICAL/ECONOMIC/SOCIAL/TECHNOLOGICAL/
   ENVIRONMENTAL/LEGAL). Not one of Atlas's own literal 9 per-factor fields
   (L1386-1395), but structurally necessary -- without it a factor cannot be
   placed in any of the mermaid diagram's 6 dimension boxes at all (L1370-1381).
2. **PESTEL_INVALID_SOURCE_TYPE**: ``source_type`` must be one of the 4 values
   Atlas L1390 gives verbatim (official/research/market/other) -- the ONLY
   enum Atlas's own citation names explicitly for this method (unlike
   `dimension`, which this module infers from the purpose line).
3. **PESTEL_INVALID_EFFECTIVE_FROM** / **PESTEL_INVALID_EFFECTIVE_TO**: both
   must be ISO-8601 date strings (``effective_to`` may additionally be
   ``None``, meaning open-ended / still in effect) -- Atlas gives no format
   for either field; tightening to ISO dates is what makes invariant #4 below
   genuinely checkable rather than a permanently-unstructured free-text pair
   (see contract's own compilation_decisions).
4. **PESTEL_EFFECTIVE_TO_BEFORE_FROM**: when ``effective_to`` is not ``None``,
   ``effective_from <= effective_to`` -- a validity window ending before it
   starts is internally contradictory. Grounded in Atlas's own benefit line
   (L1402: "有 geography/time/source 後才真正可全球重用") naming this
   from/to pair as the reason PESTEL becomes genuinely globally reusable at
   all -- a real, checkable property of that pair, not decorative.
5. **PESTEL_EMPTY_FACTOR_SET**: ``factors`` (the whole analysis) must be
   non-empty -- same class of top-level completeness check
   ``strategy.swot``'s own ``SWOT_EMPTY_FACTOR_SET`` already establishes.

Grepped the whole ``ai_lego`` tree case-insensitively for "pestel" before
writing any of this method's own files: zero pre-existing implementation.
"""

from __future__ import annotations

import re
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "strategy.pestel"
ANALYSIS_ID_PREFIX = "PESTEL-"
DIMENSIONS = frozenset({"POLITICAL", "ECONOMIC", "SOCIAL", "TECHNOLOGICAL", "ENVIRONMENTAL", "LEGAL"})
SOURCE_TYPES = frozenset({"official", "research", "market", "other"})
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_valid_date(value: Any) -> bool:
    return isinstance(value, str) and DATE_PATTERN.match(value) is not None


def _factor_fields_are_complete(
    dimension: Any,
    statement: Any,
    geography: Any,
    source: Any,
    source_type: Any,
    effective_from: Any,
    effective_to: Any,
    trend: Any,
    implication: Any,
    confidence: Any,
) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from the
    other -- same discipline ``ai_lego/modules/causal/synthetic_control.py``'s own ``_fields_are_complete``
    establishes."""
    if dimension not in DIMENSIONS:
        return False, "INVALID_DIMENSION"
    if not _is_nonempty_str(statement):
        return False, "EMPTY_STATEMENT"
    if not _is_nonempty_str(geography):
        return False, "EMPTY_GEOGRAPHY"
    if not _is_nonempty_str(source):
        return False, "EMPTY_SOURCE"
    if source_type not in SOURCE_TYPES:
        return False, "INVALID_SOURCE_TYPE"
    if not _is_valid_date(effective_from):
        return False, "INVALID_EFFECTIVE_FROM"
    if effective_to is not None and not _is_valid_date(effective_to):
        return False, "INVALID_EFFECTIVE_TO"
    if not _is_nonempty_str(trend):
        return False, "EMPTY_TREND"
    if not _is_nonempty_str(implication):
        return False, "EMPTY_IMPLICATION"
    if confidence is None:
        return False, "MISSING_CONFIDENCE"
    return True, None


def _effective_window_ordered(effective_from: str, effective_to: str | None) -> bool:
    """Invariant #4 (see module docstring). ISO-8601 ``YYYY-MM-DD`` strings compare correctly lexicographically,
    so no date parsing is needed once both are already known-valid (``_is_valid_date`` already checked)."""
    return effective_to is None or effective_to >= effective_from


def pestel_factor(
    factor_id: str,
    dimension: str,
    statement: str,
    geography: str,
    source: str,
    source_type: str,
    effective_from: str,
    effective_to: str | None,
    trend: str,
    implication: str,
    confidence: Any,
    provenance: dict[str, Any],
    *,
    supporting_evidence_refs: list[str] | None = None,
) -> dict[str, Any]:
    """One item of ``typed-objects/pestel-analysis.schema.yaml#/properties/factors``. Enforces invariants #1-#4
    (see module docstring) fail-closed at construction."""
    if not _is_nonempty_str(factor_id):
        raise InvariantViolation(f"PESTEL_INVALID_FACTOR_ID: factor_id must be a non-empty string, got {factor_id!r}")

    complete, reason = _factor_fields_are_complete(dimension, statement, geography, source, source_type, effective_from, effective_to, trend, implication, confidence)
    if not complete:
        raise InvariantViolation(
            f"PESTEL_{reason}: dimension must be one of {sorted(DIMENSIONS)} (Atlas L1368); statement/geography/"
            f"source/trend/implication must be non-empty strings; source_type must be one of {sorted(SOURCE_TYPES)} "
            f"(Atlas L1390); effective_from/effective_to must be ISO-8601 dates (effective_to may be null); "
            f"confidence must not be null ({reason} failed)"
        )

    if not _effective_window_ordered(effective_from, effective_to):
        raise InvariantViolation(
            f"PESTEL_EFFECTIVE_TO_BEFORE_FROM: effective_to={effective_to!r} precedes effective_from={effective_from!r} "
            "-- a validity window ending before it starts is internally contradictory (Atlas L1402's own "
            "geography/time/source reusability rationale)"
        )

    record: dict[str, Any] = {
        "id": factor_id,
        "dimension": dimension,
        "statement": statement,
        "geography": geography,
        "source": source,
        "source_type": source_type,
        "effective_from": effective_from,
        "effective_to": effective_to,
        "trend": trend,
        "implication": implication,
        "confidence": confidence,
        "provenance": provenance,
    }
    if supporting_evidence_refs:
        record["supporting_evidence_refs"] = list(supporting_evidence_refs)
    return record


def generate_pestel_analysis(
    analysis_id: str,
    factors: list[dict[str, Any]],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/pestel-analysis.schema.yaml``. Enforces invariant #5 (see module docstring)
    fail-closed. Unlike ``strategy.swot``'s ``generate_swot_analysis``, takes no ``knowledge_set``/
    ``knowledge_set_ref`` argument -- PESTEL factors are self-evidencing (see module docstring)."""
    if not _is_nonempty_str(analysis_id) or not analysis_id.startswith(ANALYSIS_ID_PREFIX):
        raise InvariantViolation(f"PESTEL_INVALID_ID: analysis_id must be a non-empty string beginning with {ANALYSIS_ID_PREFIX!r}, got {analysis_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"PESTEL_INVALID_VERSION: version must be a string, got {version!r}")
    if not factors:
        raise InvariantViolation("PESTEL_EMPTY_FACTOR_SET: pestel-analysis.schema.yaml requires factors minItems:1")

    return {
        "id": analysis_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "factors": list(factors),
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(pestel_analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every factor carries a schema-valid provenance_record."""
    factors = pestel_analysis.get("factors", []) if isinstance(pestel_analysis, dict) else []
    invalid = [f.get("id") for f in factors if not provenance_is_valid(f.get("provenance"))]
    passed = bool(factors) and not invalid
    return _result("provenance_required", passed, [{"factors_checked": len(factors), "invalid_provenance_ids": invalid}], validator, timestamp)


def evaluate_evidence_labeling_required_gate(pestel_analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.evidence_labeling_required: true`` -- grounded in Atlas's own '必要欄位' block requiring
    every factor to carry `source`/`source_type` (L1386-1395); an EVIDENCE-labeled factor with no
    `supporting_evidence_refs` is a mislabeled, unbacked claim, same structural check
    ``strategy.swot``'s identical gate already establishes."""
    factors = pestel_analysis.get("factors", []) if isinstance(pestel_analysis, dict) else []
    problems: list[dict[str, Any]] = []
    for f in factors:
        epistemic_type = (f.get("provenance") or {}).get("epistemic_type")
        if epistemic_type is None:
            problems.append({"id": f.get("id"), "reason": "no epistemic_type label"})
            continue
        if epistemic_type == "EVIDENCE" and not f.get("supporting_evidence_refs"):
            problems.append({"id": f.get("id"), "reason": "labeled EVIDENCE but cites no supporting_evidence_refs"})
    passed = bool(factors) and not problems
    return _result("evidence_labeling_required", passed, [{"factors_checked": len(factors), "problems": problems}], validator, timestamp)


def evaluate_pestel_integrity_gate(pestel_analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives invariants #1-#5 (see module docstring) from the record's OWN raw fields -- does not trust any
    stored value and does NOT call ``generate_pestel_analysis``/``pestel_factor``, so a hand-tampered analysis that
    bypassed the builder entirely is caught here exactly as a builder-refused one would have been. Same discipline
    ``ai_lego/modules/causal/synthetic_control.py``'s own ``evaluate_synthetic_control_integrity_gate``
    establishes. Fails closed on malformed input rather than crashing."""
    if not isinstance(pestel_analysis, dict):
        return _result("pestel_integrity", False, [{"reason": "analysis is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(pestel_analysis.get("id")) or not pestel_analysis.get("id", "").startswith(ANALYSIS_ID_PREFIX):
        return _result("pestel_integrity", False, [{"reason": f"id missing, empty, or not prefixed {ANALYSIS_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(pestel_analysis.get("version"), str):
        return _result("pestel_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    factors = pestel_analysis.get("factors")
    if not isinstance(factors, list) or not factors:
        return _result("pestel_integrity", False, [{"reason": "EMPTY_FACTOR_SET"}], validator, timestamp)

    problems: list[dict[str, Any]] = []
    for f in factors:
        if not isinstance(f, dict):
            problems.append({"id": None, "reason": "factor is not a dict"})
            continue
        complete, reason = _factor_fields_are_complete(
            f.get("dimension"), f.get("statement"), f.get("geography"), f.get("source"), f.get("source_type"),
            f.get("effective_from"), f.get("effective_to"), f.get("trend"), f.get("implication"), f.get("confidence"),
        )
        if not complete:
            problems.append({"id": f.get("id"), "reason": reason})
            continue
        if not _effective_window_ordered(f["effective_from"], f["effective_to"]):
            problems.append({"id": f.get("id"), "reason": "EFFECTIVE_TO_BEFORE_FROM"})

    passed = not problems
    return _result("pestel_integrity", passed, [{"factors_checked": len(factors), "problems": problems}], validator, timestamp)


def evaluate_pestel_gates(pestel_analysis: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """All 3 of this method's gates, in catalog order: the contract's 2 declared ``quality`` flags plus the
    structural integrity gate (same "gates beyond the declared quality flags" pattern
    ``causal.synthetic_control``'s own module already establishes)."""
    return [
        evaluate_provenance_required_gate(pestel_analysis, validator, timestamp),
        evaluate_evidence_labeling_required_gate(pestel_analysis, validator, timestamp),
        evaluate_pestel_integrity_gate(pestel_analysis, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
