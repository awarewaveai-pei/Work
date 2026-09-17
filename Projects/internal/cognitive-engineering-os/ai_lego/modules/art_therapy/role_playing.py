"""``art_therapy.role_playing`` -- 角色扮演: enact roles to predict and reflect on behaviour.

GROUNDED ORIGINAL DESIGN (operator 54-item list; use "模擬角色行為以預測與反思"). Invariants: >= 1 role with
unique ids, ``played_by`` in the closed set (EMPTY_CHAIR covers an absent party); >= 1 reflection whose
``role_ref`` resolves to a declared role -- a reflection about a role nobody played is fabricated evidence.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, entries_problem, first_duplicate, integrity_gate, is_one_of, is_nonempty_str, provenance_required_gate, require, require_header

METHOD_ID = "art_therapy.role_playing"
RECORD_ID_PREFIX = "ROLEPLAY-"
PLAYED_BY = frozenset({"CLIENT", "FACILITATOR", "PEER", "EMPTY_CHAIR"})
_R_REQUIRED = frozenset({"id", "name", "played_by", "stance"})
_R_CHECKS = {"id": is_nonempty_str, "name": is_nonempty_str, "played_by": lambda v: is_one_of(v, PLAYED_BY), "stance": is_nonempty_str}
_F_REQUIRED = frozenset({"id", "role_ref", "observation", "prediction"})
_F_CHECKS = {k: is_nonempty_str for k in _F_REQUIRED}

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "PLAYED_BY", "generate_role_playing", "evaluate_role_playing_gates", "all_gates_pass"]


def _core_problem(scenario: Any, roles: Any, reflections: Any) -> str | None:
    if not is_nonempty_str(scenario):
        return "scenario missing or empty"
    problem = entries_problem(roles, _R_REQUIRED, _R_REQUIRED, _R_CHECKS)
    if problem is not None:
        return f"roles {problem}"
    if first_duplicate(r["id"] for r in roles) is not None:
        return "role ids must be unique"
    problem = entries_problem(reflections, _F_REQUIRED, _F_REQUIRED, _F_CHECKS)
    if problem is not None:
        return f"reflections {problem}"
    if first_duplicate(f["id"] for f in reflections) is not None:
        return "reflection ids must be unique"
    role_ids = {r["id"] for r in roles}
    dangling = sorted({f["role_ref"] for f in reflections} - role_ids)
    if dangling:
        return f"reflections reference undeclared role(s) {dangling}"
    return None


def generate_role_playing(record_id: str, scenario: str, roles: list[dict[str, Any]], reflections: list[dict[str, Any]], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("ROLEPLAY", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(scenario, roles, reflections)
    require(problem is None, "ROLEPLAY_INVALID_ENACTMENT", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, scenario=scenario, roles=roles, reflections=reflections)


def evaluate_role_playing_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("role_playing_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("scenario"), r.get("roles"), r.get("reflections")), lambda r: {"role_count": len(r["roles"]), "reflection_count": len(r["reflections"])}, validator, timestamp),
    ]
