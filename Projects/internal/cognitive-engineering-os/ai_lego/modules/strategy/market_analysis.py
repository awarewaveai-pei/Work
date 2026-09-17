"""``strategy.market_analysis`` -- 市場分析: market definition, TAM/SAM/SOM sizing and evidence-backed segments.

GROUNDED ORIGINAL DESIGN: Master Plan §43 names "Market Analysis" as a Business Planning Recipe node with no
Atlas method behind it (ADR-008 Context table); built on operator directive 2026-09-17 so the flagship chain
can run end to end. Invariants: ``sizing`` is a nested funnel -- TAM >= SAM >= SOM >= 0, all real numbers,
one unit; >= 1 segment with unique ids and a non-empty ``evidence_ref`` (a segment without evidence is a
guess, refused); growth_rate is a real fraction in [-1, 10].
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, entries_problem, first_duplicate, integrity_gate, is_nonempty_str, is_number_in, is_real_number, provenance_required_gate, require, require_header

METHOD_ID = "strategy.market_analysis"
RECORD_ID_PREFIX = "MKT-"
_SIZING_KEYS = frozenset({"tam", "sam", "som", "unit"})
_S_REQUIRED = frozenset({"id", "name", "size_estimate", "growth_rate", "evidence_ref"})
_S_CHECKS = {"id": is_nonempty_str, "name": is_nonempty_str, "size_estimate": lambda v: is_real_number(v) and v >= 0, "growth_rate": lambda v: is_number_in(v, -1, 10), "evidence_ref": is_nonempty_str}

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "generate_market_analysis", "evaluate_market_analysis_gates", "all_gates_pass"]


def _core_problem(market_definition: Any, sizing: Any, segments: Any) -> str | None:
    if not is_nonempty_str(market_definition):
        return "market_definition missing or empty"
    if not isinstance(sizing, dict) or set(sizing.keys()) != _SIZING_KEYS:
        return "sizing must be {tam, sam, som, unit}"
    if not is_nonempty_str(sizing["unit"]):
        return "sizing.unit missing or empty"
    tam, sam, som = sizing["tam"], sizing["sam"], sizing["som"]
    if not all(is_real_number(v) and v >= 0 for v in (tam, sam, som)):
        return "sizing tam/sam/som must be real non-negative numbers"
    if not tam >= sam >= som:
        return f"sizing funnel violated: need tam >= sam >= som, got {tam} / {sam} / {som}"
    problem = entries_problem(segments, _S_REQUIRED, _S_REQUIRED, _S_CHECKS)
    if problem is not None:
        return f"segments {problem}"
    if first_duplicate(s["id"] for s in segments) is not None:
        return "segment ids must be unique"
    return None


def generate_market_analysis(record_id: str, market_definition: str, sizing: dict[str, Any], segments: list[dict[str, Any]], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("MKT", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(market_definition, sizing, segments)
    require(problem is None, "MKT_INVALID_ANALYSIS", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, market_definition=market_definition, sizing=sizing, segments=segments)


def evaluate_market_analysis_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("market_analysis_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("market_definition"), r.get("sizing"), r.get("segments")), lambda r: {"segment_count": len(r["segments"]), "som_share_of_tam": (r["sizing"]["som"] / r["sizing"]["tam"]) if r["sizing"]["tam"] else None}, validator, timestamp),
    ]
