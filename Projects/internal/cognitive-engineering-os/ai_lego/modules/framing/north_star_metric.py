"""``framing.north_star_metric`` -- F01 "Goal & Problem Framing" family (Atlas F01 table row,
AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:337), 4th member of this family. Atlas's ONLY
citation is that one table row: "找核心價值指標｜產品策略｜核心價值→代理指標→反 gaming 驗證｜聚焦長期價值｜
KPI Tree" -- grep-confirmed no dedicated section beyond the table itself, and "KPI Tree" (Atlas's own
best-paired column) has no other hit anywhere in the document either.

**Shape:** the 3-field citation "核心價值→代理指標→反 gaming 驗證" is transcribed as a flat record of 3
plain non-empty strings, same shape class ``framing.goal_statement``'s own flat record already uses for
this family. No worked example or field-level structure is given for any of the 3 stages, so no compute
package and no sub-object shape is invented.

**core_value_proposition/proxy_metric vs. framing.goal_statement's goal/success_condition (real
determination, not assumed from name-adjacency):** read goal_statement.py in full before writing this
module. ``success_condition`` there is a STATIC description fixed ONCE at INITIAL, project-level goal
framing (Atlas's own benefit line for that row, "降低 scope 漂移", is about preventing drift from an
ambiguous start). This method's own usage column is "產品策略" (product strategy) -- an ONGOING metric
definition a product keeps re-consulting, with no project end-date, not a one-time framing artifact.
Genuinely different concept and different STAGE, not a naming accident.

**No overlap with decision.wsjf or any decision-family scoring method (real determination, not assumed):**
read wsjf.py in full. It computes a numeric SCORE (Cost of Delay / Job Size) for PRIORITIZING a set of
candidate jobs; it defines no standing product metric and has no core_value/proxy_metric-shaped field
anywhere. Different axis: metric DEFINITION (this method) vs prioritization SCORING (decision family).

Grepped the whole ``ai_lego`` tree and ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` for
"north_star"/"proxy_metric"/"anti_gaming" (case-insensitive) before writing any of this module's own files:
zero pre-existing hits anywhere.

One real invariant beyond per-field non-emptiness, enforced BOTH at construction (raise BEFORE any record
is built) AND independently by a gate that re-derives from raw fields, same "shared predicate, reused by
both layers" discipline every sibling module in this package already establishes:

1. Every one of the 3 required fields must be present and genuinely non-empty -- an unfilled field is
   exactly the vague-metric shape this method exists to eliminate (Atlas's own benefit line, "聚焦長期
   價值", presumes every field actually says something).
2. ``proxy_metric`` must genuinely differ from ``core_value_proposition`` (case/whitespace-insensitive
   compare) -- external North Star Metric convention: a proxy exists precisely BECAUSE the core value it
   stands in for typically cannot be measured directly/continuously; an identical pair means no actual
   measurable stand-in was chosen, defeating the whole premise of a "proxy" metric. Same "identical pair is
   an echo, not a comparison" invariant class ``framing.goal_statement``'s own
   ``success_condition != goal`` check already establishes for this family.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "framing.north_star_metric"
RECORD_ID_PREFIX = "NSM-"


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _normalize(value: str) -> str:
    """Case/whitespace-insensitive comparison key -- same helper role as framing.goal_statement's own
    ``_normalize``, reused for the identical purpose (see module docstring, Invariant #2)."""
    return " ".join(value.strip().casefold().split())


def _fields_are_complete(core_value_proposition: Any, proxy_metric: Any, anti_gaming_validation: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from
    the other -- same discipline framing.goal_statement's own ``_fields_are_complete`` establishes."""
    if not _is_nonempty_str(core_value_proposition):
        return False, "EMPTY_CORE_VALUE_PROPOSITION"
    if not _is_nonempty_str(proxy_metric):
        return False, "EMPTY_PROXY_METRIC"
    if not _is_nonempty_str(anti_gaming_validation):
        return False, "EMPTY_ANTI_GAMING_VALIDATION"
    return True, None


def generate_north_star_metric(
    record_id: str,
    core_value_proposition: str,
    proxy_metric: str,
    anti_gaming_validation: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/north-star-metric-record.schema.yaml``. Enforces both real invariants
    fail-closed -- never a record that itself proves it was built illegally, same family-wide
    "raise-before-construction" discipline every sibling module in this package already establishes."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"NORTHSTARMETRIC_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"NORTHSTARMETRIC_INVALID_VERSION: version must be a string, got {version!r}")

    complete, reason = _fields_are_complete(core_value_proposition, proxy_metric, anti_gaming_validation)
    if not complete:
        if reason == "EMPTY_CORE_VALUE_PROPOSITION":
            raise InvariantViolation(f"NORTHSTARMETRIC_EMPTY_CORE_VALUE_PROPOSITION: core_value_proposition must be a non-empty string, got {core_value_proposition!r}")
        if reason == "EMPTY_PROXY_METRIC":
            raise InvariantViolation(f"NORTHSTARMETRIC_EMPTY_PROXY_METRIC: proxy_metric must be a non-empty string, got {proxy_metric!r}")
        raise InvariantViolation(f"NORTHSTARMETRIC_EMPTY_ANTI_GAMING_VALIDATION: anti_gaming_validation must be a non-empty string, got {anti_gaming_validation!r}")

    if _normalize(proxy_metric) == _normalize(core_value_proposition):
        raise InvariantViolation(
            f"NORTHSTARMETRIC_PROXY_ECHOES_CORE_VALUE: proxy_metric must genuinely differ from core_value_proposition (case/whitespace-insensitive), "
            f"got core_value_proposition={core_value_proposition!r} proxy_metric={proxy_metric!r}"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "core_value_proposition": core_value_proposition,
        "proxy_metric": proxy_metric,
        "anti_gaming_validation": anti_gaming_validation,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance_record is schema-valid.
    Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"record_provenance_valid": passed}], validator, timestamp)


def evaluate_north_star_metric_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored value
    and does NOT call ``generate_north_star_metric``, so a hand-tampered record that bypassed the builder
    entirely is caught here exactly as a builder-refused one would have been. Fails closed on malformed
    input rather than crashing."""
    if not isinstance(record, dict):
        return _result("north_star_metric_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("north_star_metric_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("north_star_metric_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    complete, reason = _fields_are_complete(record.get("core_value_proposition"), record.get("proxy_metric"), record.get("anti_gaming_validation"))
    if not complete:
        return _result("north_star_metric_integrity", False, [{"reason": f"required field invalid ({reason})"}], validator, timestamp)

    proxy_metric = record["proxy_metric"]
    core_value_proposition = record["core_value_proposition"]
    if _normalize(proxy_metric) == _normalize(core_value_proposition):
        return _result("north_star_metric_integrity", False, [{"reason": "PROXY_ECHOES_CORE_VALUE"}], validator, timestamp)

    return _result("north_star_metric_integrity", True, [{"proxy_metric_len": len(proxy_metric), "anti_gaming_validation_len": len(record["anti_gaming_validation"])}], validator, timestamp)


def evaluate_north_star_metric_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_north_star_metric_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
