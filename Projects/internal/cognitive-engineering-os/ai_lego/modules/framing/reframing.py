"""``framing.reframing`` -- 框架轉換: reinterpret a painful experience from another angle.

GROUNDED ORIGINAL DESIGN (operator 54-item list; general method, natural family). Invariants: the original
frame carries the client's statement and a label from the closed set; >= 1 reframe with unique ids, each naming
the perspective it takes and a statement that differs from the original (normalized) -- restating the pain in
the same words is not a reframe.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, entries_problem, first_duplicate, integrity_gate, is_one_of, is_nonempty_str, normalize, provenance_required_gate, require, require_header

METHOD_ID = "framing.reframing"
RECORD_ID_PREFIX = "REFRAME-"
LABELS = frozenset({"FAILURE", "SHAME", "REGRET", "LOSS", "REJECTION", "OTHER"})
_O_KEYS = frozenset({"statement", "label"})
_R_REQUIRED = frozenset({"id", "perspective", "statement"})
_R_CHECKS = {k: is_nonempty_str for k in _R_REQUIRED}

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "LABELS", "generate_reframing", "evaluate_reframing_gates", "all_gates_pass"]


def _core_problem(original_frame: Any, reframes: Any) -> str | None:
    if not isinstance(original_frame, dict) or set(original_frame.keys()) != _O_KEYS or not is_nonempty_str(original_frame["statement"]) or not is_one_of(original_frame["label"], LABELS):
        return f"original_frame must be {{statement, label in {sorted(LABELS)}}}"
    problem = entries_problem(reframes, _R_REQUIRED, _R_REQUIRED, _R_CHECKS)
    if problem is not None:
        return f"reframes {problem}"
    if first_duplicate(r["id"] for r in reframes) is not None:
        return "reframe ids must be unique"
    original = normalize(original_frame["statement"])
    for r in reframes:
        if normalize(r["statement"]) == original:
            return f"reframe {r['id']!r} repeats the original statement"
    return None


def generate_reframing(record_id: str, original_frame: dict[str, str], reframes: list[dict[str, Any]], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("REFRAME", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(original_frame, reframes)
    require(problem is None, "REFRAME_INVALID_REFRAMES", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, original_frame=original_frame, reframes=reframes)


def evaluate_reframing_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("reframing_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("original_frame"), r.get("reframes")), lambda r: {"reframe_count": len(r["reframes"]), "label": r["original_frame"]["label"]}, validator, timestamp),
    ]
