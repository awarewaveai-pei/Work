"""``art_therapy.visual_metaphor`` -- 視覺隱喻創作: an image that gives a vague feeling a concrete form.

GROUNDED ORIGINAL DESIGN (operator 54-item list; use "用圖像表達潛意識經驗，將模糊感受具象化，是非語言創作啟動工具").
Invariants: ``image`` names its medium and a description; ``metaphor_statement`` is non-empty; >= 1 element
with unique ids, each stating what it stands for -- an element without a referent is decoration, not metaphor.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, entries_problem, first_duplicate, integrity_gate, is_nonempty_str, provenance_required_gate, require, require_header

METHOD_ID = "art_therapy.visual_metaphor"
RECORD_ID_PREFIX = "VISMET-"
_IMG_KEYS = frozenset({"medium", "description"})
_E_REQUIRED = frozenset({"id", "element", "stands_for"})
_E_CHECKS = {k: is_nonempty_str for k in _E_REQUIRED}

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "generate_visual_metaphor", "evaluate_visual_metaphor_gates", "all_gates_pass"]


def _core_problem(felt_experience: Any, image: Any, metaphor_statement: Any, elements: Any) -> str | None:
    if not is_nonempty_str(felt_experience):
        return "felt_experience missing or empty"
    if not isinstance(image, dict) or set(image.keys()) != _IMG_KEYS or not all(is_nonempty_str(image[k]) for k in _IMG_KEYS):
        return "image must be {medium, description} with non-empty strings"
    if not is_nonempty_str(metaphor_statement):
        return "metaphor_statement missing or empty"
    problem = entries_problem(elements, _E_REQUIRED, _E_REQUIRED, _E_CHECKS)
    if problem is not None:
        return f"elements {problem}"
    if first_duplicate(e["id"] for e in elements) is not None:
        return "element ids must be unique"
    return None


def generate_visual_metaphor(record_id: str, felt_experience: str, image: dict[str, str], metaphor_statement: str, elements: list[dict[str, Any]], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("VISMET", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(felt_experience, image, metaphor_statement, elements)
    require(problem is None, "VISMET_INVALID_METAPHOR", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, felt_experience=felt_experience, image=image, metaphor_statement=metaphor_statement, elements=elements)


def evaluate_visual_metaphor_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("visual_metaphor_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("felt_experience"), r.get("image"), r.get("metaphor_statement"), r.get("elements")), lambda r: {"element_count": len(r["elements"]), "medium": r["image"]["medium"]}, validator, timestamp),
    ]
