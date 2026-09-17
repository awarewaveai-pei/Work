"""``art_therapy.story_completion`` -- 故事延續: the client continues an unfinished story stem.

GROUNDED ORIGINAL DESIGN (operator 54-item list). Invariants: ``continuation`` is non-empty and is not the stem
repeated back (normalized inequality -- an echo is not a continuation); >= 1 character with unique ids, each
naming the inner role it carries for the client.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, entries_problem, first_duplicate, integrity_gate, is_nonempty_str, is_nonempty_str_list, normalize, provenance_required_gate, require, require_header

METHOD_ID = "art_therapy.story_completion"
RECORD_ID_PREFIX = "STORYC-"
_C_REQUIRED = frozenset({"id", "name", "inner_role"})
_C_CHECKS = {"id": is_nonempty_str, "name": is_nonempty_str, "inner_role": is_nonempty_str}

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "generate_story_completion", "evaluate_story_completion_gates", "all_gates_pass"]


def _core_problem(story_stem: Any, continuation: Any, characters: Any, felt_dynamics: Any) -> str | None:
    if not is_nonempty_str(story_stem):
        return "story_stem missing or empty"
    if not is_nonempty_str(continuation):
        return "continuation missing or empty"
    if normalize(continuation) == normalize(story_stem):
        return "continuation merely repeats the story_stem"
    problem = entries_problem(characters, _C_REQUIRED, _C_REQUIRED, _C_CHECKS)
    if problem is not None:
        return f"characters {problem}"
    dup = first_duplicate(c["id"] for c in characters)
    if dup is not None:
        return f"duplicate character id {dup!r}"
    if felt_dynamics is not None and not is_nonempty_str_list(felt_dynamics):
        return "felt_dynamics must be a non-empty list of non-empty strings when present"
    return None


def generate_story_completion(record_id: str, story_stem: str, continuation: str, characters: list[dict[str, Any]], provenance: dict[str, Any], *, felt_dynamics: list[str] | None = None, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("STORYC", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(story_stem, continuation, characters, felt_dynamics)
    require(problem is None, "STORYC_INVALID_STORY", problem or "")
    fields: dict[str, Any] = {"story_stem": story_stem, "continuation": continuation, "characters": characters}
    if felt_dynamics:
        fields["felt_dynamics"] = felt_dynamics
    return base_record(record_id, version, generated_by_method, provenance, **fields)


def evaluate_story_completion_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("story_completion_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("story_stem"), r.get("continuation"), r.get("characters"), r.get("felt_dynamics")), lambda r: {"character_count": len(r["characters"]), "continuation_chars": len(r["continuation"])}, validator, timestamp),
    ]
