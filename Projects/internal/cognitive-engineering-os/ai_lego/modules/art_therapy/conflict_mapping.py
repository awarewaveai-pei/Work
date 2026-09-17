"""``art_therapy.conflict_mapping`` -- 衝突地圖: a past inner/outer conflict, the parties, and the transformation path.

GROUNDED ORIGINAL DESIGN (operator 54-item list; use "回顧曾經的內外衝突，標示轉化路徑，形成資源記憶").
Invariants: >= 2 parties (a conflict needs two sides; an inner conflict lists two inner voices) with unique
ids and unique normalized names; >= 1 transformation step, each naming the resource it left behind -- the
"resource memory" is the point of the method, so a step without one is refused.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, entries_problem, first_duplicate, integrity_gate, is_nonempty_str, normalize, provenance_required_gate, require, require_header

METHOD_ID = "art_therapy.conflict_mapping"
RECORD_ID_PREFIX = "CONFMAP-"
MIN_PARTIES = 2
_P_REQUIRED = frozenset({"id", "name", "need"})
_P_CHECKS = {"id": is_nonempty_str, "name": is_nonempty_str, "need": is_nonempty_str}
_S_REQUIRED = frozenset({"id", "step", "resource_gained"})
_S_CHECKS = {"id": is_nonempty_str, "step": is_nonempty_str, "resource_gained": is_nonempty_str}

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "generate_conflict_mapping", "evaluate_conflict_mapping_gates", "resources", "all_gates_pass"]


def _core_problem(conflict_label: Any, parties: Any, transformation_path: Any) -> str | None:
    if not is_nonempty_str(conflict_label):
        return "conflict_label missing or empty"
    problem = entries_problem(parties, _P_REQUIRED, _P_REQUIRED, _P_CHECKS, min_items=MIN_PARTIES)
    if problem is not None:
        return f"parties {problem}"
    if first_duplicate(p["id"] for p in parties) is not None or first_duplicate(normalize(p["name"]) for p in parties) is not None:
        return "parties must have unique ids and unique (normalized) names"
    problem = entries_problem(transformation_path, _S_REQUIRED, _S_REQUIRED, _S_CHECKS)
    if problem is not None:
        return f"transformation_path {problem}"
    if first_duplicate(s["id"] for s in transformation_path) is not None:
        return "transformation_path ids must be unique"
    return None


def generate_conflict_mapping(record_id: str, conflict_label: str, parties: list[dict[str, Any]], transformation_path: list[dict[str, Any]], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("CONFMAP", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(conflict_label, parties, transformation_path)
    require(problem is None, "CONFMAP_INVALID_MAP", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, conflict_label=conflict_label, parties=parties, transformation_path=transformation_path)


def resources(record: dict[str, Any]) -> list[str]:
    """Derived view: the resource memory, in path order."""
    return [s["resource_gained"] for s in record["transformation_path"]]


def evaluate_conflict_mapping_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("conflict_mapping_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("conflict_label"), r.get("parties"), r.get("transformation_path")), lambda r: {"party_count": len(r["parties"]), "resources": resources(r)}, validator, timestamp),
    ]
