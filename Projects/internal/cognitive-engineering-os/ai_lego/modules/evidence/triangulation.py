"""Dispatch façade for the ``evidence.triangulation`` Method.

The first implementation lives in the Research slice because its offline
corpus is Research-specific.  This module owns the method-id-aligned dispatch
surface so generic Workflow execution does not depend on that placement.
"""

from __future__ import annotations

from typing import Any

from ai_lego.modules.research.evidence_triangulation import triangulate_themes_and_literature


def generate_evidence_triangulation(themes: dict[str, Any], literature: dict[str, Any]) -> dict[str, Any]:
    return triangulate_themes_and_literature(
        {"outputs.coding": {"coding_outputs": {"theme_set": themes}}, "outputs.literature": {"literature": literature}},
        {},
    )


def evaluate_evidence_triangulation_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    triangulation = record.get("triangulation") if isinstance(record, dict) else None
    passed = isinstance(triangulation, dict) and isinstance(triangulation.get("findings"), list) and bool(triangulation.get("provenance_complete"))
    return [{"gate_id": "evidence_triangulation_structure", "status": "PASS" if passed else "FAIL", "evidence": ["findings and provenance completeness present"], "validator": validator, "timestamp": timestamp}]
