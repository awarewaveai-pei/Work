"""``systems.sipoc`` -- SIPOC: Suppliers, Inputs, Process, Outputs, Customers -- the scope of one process.

GROUNDED ORIGINAL DESIGN (operator 54-item list; general method, natural family). Invariants: all five columns
non-empty (a SIPOC with an empty column has not scoped the process); process steps are an ORDERED list with
unique ids; suppliers/inputs/outputs/customers are non-empty string lists.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, entries_problem, first_duplicate, integrity_gate, is_nonempty_str, is_nonempty_str_list, provenance_required_gate, require, require_header

METHOD_ID = "systems.sipoc"
RECORD_ID_PREFIX = "SIPOC-"
_STEP_REQUIRED = frozenset({"id", "step"})
_STEP_CHECKS = {"id": is_nonempty_str, "step": is_nonempty_str}

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "generate_sipoc", "evaluate_sipoc_gates", "all_gates_pass"]


def _core_problem(process_name: Any, suppliers: Any, inputs: Any, process_steps: Any, outputs: Any, customers: Any) -> str | None:
    if not is_nonempty_str(process_name):
        return "process_name missing or empty"
    for label, column in (("suppliers", suppliers), ("inputs", inputs), ("outputs", outputs), ("customers", customers)):
        if not is_nonempty_str_list(column):
            return f"{label} must be a non-empty list of non-empty strings"
    problem = entries_problem(process_steps, _STEP_REQUIRED, _STEP_REQUIRED, _STEP_CHECKS)
    if problem is not None:
        return f"process_steps {problem}"
    if first_duplicate(s["id"] for s in process_steps) is not None:
        return "process step ids must be unique"
    return None


def generate_sipoc(record_id: str, process_name: str, suppliers: list[str], inputs: list[str], process_steps: list[dict[str, Any]], outputs: list[str], customers: list[str], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("SIPOC", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(process_name, suppliers, inputs, process_steps, outputs, customers)
    require(problem is None, "SIPOC_INVALID_SCOPE", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, process_name=process_name, suppliers=suppliers, inputs=inputs, process_steps=process_steps, outputs=outputs, customers=customers)


def evaluate_sipoc_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("sipoc_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("process_name"), r.get("suppliers"), r.get("inputs"), r.get("process_steps"), r.get("outputs"), r.get("customers")), lambda r: {"step_count": len(r["process_steps"]), "columns": {k: len(r[k]) for k in ("suppliers", "inputs", "outputs", "customers")}}, validator, timestamp),
    ]
