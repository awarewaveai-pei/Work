"""``art_therapy.motivation_matrix`` -- 動機矩陣: intrinsic/extrinsic sources that drive or block an action.

GROUNDED ORIGINAL DESIGN (operator 54-item list; use "分析推動或阻礙行動的動機來源"). Invariants: entries have
unique ids, ``source`` in {INTRINSIC, EXTRINSIC}, ``polarity`` in {DRIVES, BLOCKS}, integer ``weight`` 1..5
(bool rejected); at least one DRIVES and one BLOCKS entry -- a matrix with only one polarity is a list, not a
matrix. Quadrant totals are derived on read, never stored.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, entries_problem, first_duplicate, integrity_gate, is_int_in, is_one_of, is_nonempty_str, provenance_required_gate, require, require_header

METHOD_ID = "art_therapy.motivation_matrix"
RECORD_ID_PREFIX = "MOTMX-"
SOURCES = frozenset({"INTRINSIC", "EXTRINSIC"})
POLARITIES = frozenset({"DRIVES", "BLOCKS"})
_E_REQUIRED = frozenset({"id", "source", "polarity", "description", "weight"})
_E_CHECKS = {"id": is_nonempty_str, "source": lambda v: is_one_of(v, SOURCES), "polarity": lambda v: is_one_of(v, POLARITIES), "description": is_nonempty_str, "weight": lambda v: is_int_in(v, 1, 5)}

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "generate_motivation_matrix", "evaluate_motivation_matrix_gates", "quadrant_totals", "all_gates_pass"]


def _core_problem(action: Any, entries: Any) -> str | None:
    if not is_nonempty_str(action):
        return "action missing or empty"
    problem = entries_problem(entries, _E_REQUIRED, _E_REQUIRED, _E_CHECKS)
    if problem is not None:
        return f"entries {problem}"
    if first_duplicate(e["id"] for e in entries) is not None:
        return "entry ids must be unique"
    polarities = {e["polarity"] for e in entries}
    if polarities != POLARITIES:
        return f"both DRIVES and BLOCKS entries are required, got {sorted(polarities)}"
    return None


def generate_motivation_matrix(record_id: str, action: str, entries: list[dict[str, Any]], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("MOTMX", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(action, entries)
    require(problem is None, "MOTMX_INVALID_ENTRIES", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, action=action, entries=entries)


def quadrant_totals(record: dict[str, Any]) -> dict[str, int]:
    """Derived view: weight totals per (source, polarity) quadrant plus the net drive."""
    totals = {f"{s}_{p}": 0 for s in sorted(SOURCES) for p in sorted(POLARITIES)}
    for e in record["entries"]:
        totals[f"{e['source']}_{e['polarity']}"] += e["weight"]
    totals["net_drive"] = sum(e["weight"] if e["polarity"] == "DRIVES" else -e["weight"] for e in record["entries"])
    return totals


def evaluate_motivation_matrix_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("motivation_matrix_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("action"), r.get("entries")), quadrant_totals, validator, timestamp),
    ]
