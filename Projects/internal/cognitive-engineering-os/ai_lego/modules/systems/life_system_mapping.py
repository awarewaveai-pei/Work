"""``systems.life_system_mapping`` -- 生活系統圖: the client's roles across life subsystems and how they influence each other.

GROUNDED ORIGINAL DESIGN (operator 54-item list; general systems method, natural family). Invariants: >= 2
subsystems with unique ids and a domain from the closed set; every influence targets a DECLARED subsystem
other than its own (self-influence is a role note, not a system link) with a direction from the closed set.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, entries_problem, first_duplicate, integrity_gate, is_one_of, is_nonempty_str, provenance_required_gate, require, require_header

METHOD_ID = "systems.life_system_mapping"
RECORD_ID_PREFIX = "LSYSMAP-"
DOMAINS = frozenset({"FAMILY", "WORK", "RELATIONSHIPS", "HEALTH", "COMMUNITY", "LEARNING", "CREATIVE", "OTHER"})
DIRECTIONS = frozenset({"SUPPORTS", "STRAINS", "MIXED"})
MIN_SUBSYSTEMS = 2
_I_REQUIRED = frozenset({"target_ref", "direction", "note"})
_I_CHECKS = {"target_ref": is_nonempty_str, "direction": lambda v: is_one_of(v, DIRECTIONS), "note": is_nonempty_str}
_S_REQUIRED = frozenset({"id", "domain", "role", "influences"})
_S_CHECKS = {"id": is_nonempty_str, "domain": lambda v: is_one_of(v, DOMAINS), "role": is_nonempty_str, "influences": lambda v: isinstance(v, list)}

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "DOMAINS", "DIRECTIONS", "generate_life_system_mapping", "evaluate_life_system_mapping_gates", "all_gates_pass"]


def _core_problem(focal_person: Any, subsystems: Any) -> str | None:
    if not is_nonempty_str(focal_person):
        return "focal_person missing or empty"
    problem = entries_problem(subsystems, _S_REQUIRED, _S_REQUIRED, _S_CHECKS, min_items=MIN_SUBSYSTEMS)
    if problem is not None:
        return f"subsystems {problem}"
    if first_duplicate(s["id"] for s in subsystems) is not None:
        return "subsystem ids must be unique"
    declared = {s["id"] for s in subsystems}
    for s in subsystems:
        problem = entries_problem(s["influences"], _I_REQUIRED, _I_REQUIRED, _I_CHECKS, min_items=0)
        if problem is not None:
            return f"subsystem {s['id']!r} influences {problem}"
        for inf in s["influences"]:
            if inf["target_ref"] not in declared:
                return f"subsystem {s['id']!r} influences undeclared {inf['target_ref']!r}"
            if inf["target_ref"] == s["id"]:
                return f"subsystem {s['id']!r} influences itself"
    return None


def generate_life_system_mapping(record_id: str, focal_person: str, subsystems: list[dict[str, Any]], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("LSYSMAP", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(focal_person, subsystems)
    require(problem is None, "LSYSMAP_INVALID_SYSTEM", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, focal_person=focal_person, subsystems=subsystems)


def evaluate_life_system_mapping_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("life_system_mapping_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("focal_person"), r.get("subsystems")), lambda r: {"subsystem_count": len(r["subsystems"]), "influence_count": sum(len(s["influences"]) for s in r["subsystems"])}, validator, timestamp),
    ]
