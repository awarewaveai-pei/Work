"""``art_therapy.metaphor_dialogue`` -- 隱喻對話: a dialogue between the client and a self-created symbolic figure.

GROUNDED ORIGINAL DESIGN (operator 54-item list; use "與自創象徵角色進行對話，調和衝突、支持轉化"). Invariants:
the figure has a name and an origin (which artwork/feeling it came from); >= 2 exchanges with unique ids,
``speaker`` in {SELF, FIGURE}, and BOTH speakers appear -- a monologue is not a dialogue; an integration
note closes the exchange.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, entries_problem, first_duplicate, integrity_gate, is_one_of, is_nonempty_str, provenance_required_gate, require, require_header

METHOD_ID = "art_therapy.metaphor_dialogue"
RECORD_ID_PREFIX = "METDLG-"
SPEAKERS = frozenset({"SELF", "FIGURE"})
MIN_EXCHANGES = 2
_FIG_KEYS = frozenset({"name", "origin"})
_X_REQUIRED = frozenset({"id", "speaker", "line"})
_X_CHECKS = {"id": is_nonempty_str, "speaker": lambda v: is_one_of(v, SPEAKERS), "line": is_nonempty_str}

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "SPEAKERS", "generate_metaphor_dialogue", "evaluate_metaphor_dialogue_gates", "all_gates_pass"]


def _core_problem(figure: Any, exchanges: Any, integration_note: Any) -> str | None:
    if not isinstance(figure, dict) or set(figure.keys()) != _FIG_KEYS or not all(is_nonempty_str(figure[k]) for k in _FIG_KEYS):
        return "figure must be {name, origin} with non-empty strings"
    problem = entries_problem(exchanges, _X_REQUIRED, _X_REQUIRED, _X_CHECKS, min_items=MIN_EXCHANGES)
    if problem is not None:
        return f"exchanges {problem}"
    if first_duplicate(x["id"] for x in exchanges) is not None:
        return "exchange ids must be unique"
    if {x["speaker"] for x in exchanges} != SPEAKERS:
        return "both SELF and FIGURE must speak at least once"
    if not is_nonempty_str(integration_note):
        return "integration_note missing or empty"
    return None


def generate_metaphor_dialogue(record_id: str, figure: dict[str, str], exchanges: list[dict[str, Any]], integration_note: str, provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("METDLG", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(figure, exchanges, integration_note)
    require(problem is None, "METDLG_INVALID_DIALOGUE", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, figure=figure, exchanges=exchanges, integration_note=integration_note)


def evaluate_metaphor_dialogue_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("metaphor_dialogue_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("figure"), r.get("exchanges"), r.get("integration_note")), lambda r: {"exchange_count": len(r["exchanges"]), "figure": r["figure"]["name"]}, validator, timestamp),
    ]
