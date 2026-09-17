"""``art_therapy.storytelling`` -- 故事敘說: a complete narrative arc the client tells to make meaning.

GROUNDED ORIGINAL DESIGN (operator 54-item list; use "用敘事建構意義與共享經驗"). Invariants: every arc part
(setting, conflict, resolution, meaning) is non-empty -- a story without a resolution or a meaning is a
fragment, recorded elsewhere (story_completion); >= 1 character with unique ids.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, entries_problem, first_duplicate, integrity_gate, is_nonempty_str, provenance_required_gate, require, require_header

METHOD_ID = "art_therapy.storytelling"
RECORD_ID_PREFIX = "STORY-"
ARC_PARTS = ("setting", "conflict", "resolution", "meaning")
_C_REQUIRED = frozenset({"id", "name", "role"})
_C_CHECKS = {k: is_nonempty_str for k in _C_REQUIRED}

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "generate_storytelling", "evaluate_storytelling_gates", "all_gates_pass"]


def _core_problem(title: Any, arc: Any, characters: Any) -> str | None:
    if not is_nonempty_str(title):
        return "title missing or empty"
    if not isinstance(arc, dict) or set(arc.keys()) != set(ARC_PARTS):
        return f"arc must have exactly the keys {list(ARC_PARTS)}"
    for part in ARC_PARTS:
        if not is_nonempty_str(arc[part]):
            return f"arc.{part} missing or empty"
    problem = entries_problem(characters, _C_REQUIRED, _C_REQUIRED, _C_CHECKS)
    if problem is not None:
        return f"characters {problem}"
    if first_duplicate(c["id"] for c in characters) is not None:
        return "character ids must be unique"
    return None


def generate_storytelling(record_id: str, title: str, arc: dict[str, str], characters: list[dict[str, Any]], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("STORY", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(title, arc, characters)
    require(problem is None, "STORY_INVALID_NARRATIVE", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, title=title, arc=arc, characters=characters)


def evaluate_storytelling_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("storytelling_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("title"), r.get("arc"), r.get("characters")), lambda r: {"character_count": len(r["characters"]), "arc_parts": list(ARC_PARTS)}, validator, timestamp),
    ]
