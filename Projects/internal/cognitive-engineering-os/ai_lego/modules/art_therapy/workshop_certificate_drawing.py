"""``art_therapy.workshop_certificate_drawing`` -- 工作坊證章畫: a drawn "journey completed" certificate.

GROUNDED ORIGINAL DESIGN (operator 54-item list; use "創作「療癒旅程完成證明」，象徵性封存與儀式性祝福").
Invariants: >= 1 milestone with unique ids (the journey being sealed must have content); ``blessing_statement``
non-empty; ``sealed_on`` is an ISO date (a ritual has a date); ``created_by`` is a label, never an identity record.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, entries_problem, first_duplicate, integrity_gate, is_iso_date, is_nonempty_str, provenance_required_gate, require, require_header

METHOD_ID = "art_therapy.workshop_certificate_drawing"
RECORD_ID_PREFIX = "WCERT-"
_M_REQUIRED = frozenset({"id", "label"})
_M_CHECKS = {"id": is_nonempty_str, "label": is_nonempty_str}

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "generate_workshop_certificate_drawing", "evaluate_workshop_certificate_drawing_gates", "all_gates_pass"]


def _core_problem(journey_title: Any, milestones: Any, blessing_statement: Any, sealed_on: Any, created_by: Any) -> str | None:
    if not is_nonempty_str(journey_title):
        return "journey_title missing or empty"
    problem = entries_problem(milestones, _M_REQUIRED, _M_REQUIRED, _M_CHECKS)
    if problem is not None:
        return f"milestones {problem}"
    if first_duplicate(m["id"] for m in milestones) is not None:
        return "milestone ids must be unique"
    if not is_nonempty_str(blessing_statement):
        return "blessing_statement missing or empty"
    if not is_iso_date(sealed_on):
        return "sealed_on must be an ISO date (YYYY-MM-DD)"
    if not is_nonempty_str(created_by):
        return "created_by missing or empty"
    return None


def generate_workshop_certificate_drawing(record_id: str, journey_title: str, milestones: list[dict[str, Any]], blessing_statement: str, sealed_on: str, created_by: str, provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("WCERT", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(journey_title, milestones, blessing_statement, sealed_on, created_by)
    require(problem is None, "WCERT_INVALID_CERTIFICATE", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, journey_title=journey_title, milestones=milestones, blessing_statement=blessing_statement, sealed_on=sealed_on, created_by=created_by)


def evaluate_workshop_certificate_drawing_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("workshop_certificate_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("journey_title"), r.get("milestones"), r.get("blessing_statement"), r.get("sealed_on"), r.get("created_by")), lambda r: {"milestone_count": len(r["milestones"]), "sealed_on": r["sealed_on"]}, validator, timestamp),
    ]
