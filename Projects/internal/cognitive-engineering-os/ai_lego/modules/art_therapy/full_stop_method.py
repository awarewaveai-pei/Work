"""``art_therapy.full_stop_method`` -- 句點分析法: split a statement sentence by sentence and tag distorted patterns.

GROUNDED ORIGINAL DESIGN (operator 54-item list; use "把思緒／情緒分段檢視，逐句拆解過度概括或情緒化句型").
Invariants: >= 1 segment with unique ids; ``pattern`` is one of the closed set below; a segment tagged with a
distortion (anything but NONE) MUST carry a ``revision`` that differs from the sentence -- tagging without
rewriting leaves the client with the label and no way out; a NONE segment carries no revision.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, entries_problem, first_duplicate, integrity_gate, is_one_of, is_nonempty_str, normalize, provenance_required_gate, require, require_header

METHOD_ID = "art_therapy.full_stop_method"
RECORD_ID_PREFIX = "FSTOP-"
PATTERNS = frozenset({"NONE", "OVERGENERALIZATION", "CATASTROPHIZING", "ALL_OR_NOTHING", "LABELING", "MIND_READING", "SHOULD_STATEMENT", "EMOTIONAL_REASONING"})
_S_REQUIRED = frozenset({"id", "sentence", "pattern"})
_S_ALLOWED = _S_REQUIRED | frozenset({"revision"})
_S_CHECKS = {"id": is_nonempty_str, "sentence": is_nonempty_str, "pattern": lambda v: is_one_of(v, PATTERNS), "revision": is_nonempty_str}

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "PATTERNS", "generate_full_stop_method", "evaluate_full_stop_method_gates", "flagged_segments", "all_gates_pass"]


def _core_problem(raw_statement: Any, segments: Any) -> str | None:
    if not is_nonempty_str(raw_statement):
        return "raw_statement missing or empty"
    problem = entries_problem(segments, _S_REQUIRED, _S_ALLOWED, _S_CHECKS)
    if problem is not None:
        return f"segments {problem}"
    if first_duplicate(s["id"] for s in segments) is not None:
        return "segment ids must be unique"
    for s in segments:
        if s["pattern"] == "NONE" and "revision" in s:
            return f"segment {s['id']!r} tagged NONE must not carry a revision"
        if s["pattern"] != "NONE":
            if "revision" not in s:
                return f"segment {s['id']!r} tagged {s['pattern']} requires a revision"
            if normalize(s["revision"]) == normalize(s["sentence"]):
                return f"segment {s['id']!r} revision merely repeats the sentence"
    return None


def generate_full_stop_method(record_id: str, raw_statement: str, segments: list[dict[str, Any]], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("FSTOP", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(raw_statement, segments)
    require(problem is None, "FSTOP_INVALID_SEGMENTS", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, raw_statement=raw_statement, segments=segments)


def flagged_segments(record: dict[str, Any]) -> list[dict[str, Any]]:
    """Derived view: only the segments tagged with a distortion, with their revisions."""
    return [{"id": s["id"], "pattern": s["pattern"], "revision": s["revision"]} for s in record["segments"] if s["pattern"] != "NONE"]


def evaluate_full_stop_method_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("full_stop_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("raw_statement"), r.get("segments")), lambda r: {"segment_count": len(r["segments"]), "flagged_count": len(flagged_segments(r))}, validator, timestamp),
    ]
