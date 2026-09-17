"""``art_therapy.synonym_substitution`` -- 同義詞替換: replace a habitual negative phrase with a workable one.

GROUNDED ORIGINAL DESIGN (operator 54-item list; use "調整負面語言習慣，例如將「我很糟」換成「我正在學習中」").
Invariants: >= 1 substitution with unique ids; ``replacement_phrase`` differs from ``original_phrase``
(normalized) -- a substitution that changes nothing is not a substitution; each carries the client's rationale.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, entries_problem, first_duplicate, integrity_gate, is_nonempty_str, normalize, provenance_required_gate, require, require_header

METHOD_ID = "art_therapy.synonym_substitution"
RECORD_ID_PREFIX = "SYNSUB-"
_S_REQUIRED = frozenset({"id", "original_phrase", "replacement_phrase", "rationale"})
_S_CHECKS = {k: is_nonempty_str for k in _S_REQUIRED}

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "generate_synonym_substitution", "evaluate_synonym_substitution_gates", "all_gates_pass"]


def _core_problem(context: Any, substitutions: Any) -> str | None:
    if not is_nonempty_str(context):
        return "context missing or empty"
    problem = entries_problem(substitutions, _S_REQUIRED, _S_REQUIRED, _S_CHECKS)
    if problem is not None:
        return f"substitutions {problem}"
    if first_duplicate(s["id"] for s in substitutions) is not None:
        return "substitution ids must be unique"
    for s in substitutions:
        if normalize(s["original_phrase"]) == normalize(s["replacement_phrase"]):
            return f"substitution {s['id']!r} replaces a phrase with itself"
    return None


def generate_synonym_substitution(record_id: str, context: str, substitutions: list[dict[str, Any]], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("SYNSUB", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(context, substitutions)
    require(problem is None, "SYNSUB_INVALID_SUBSTITUTIONS", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, context=context, substitutions=substitutions)


def evaluate_synonym_substitution_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("synonym_substitution_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("context"), r.get("substitutions")), lambda r: {"substitution_count": len(r["substitutions"])}, validator, timestamp),
    ]
