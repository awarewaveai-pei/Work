"""``divergent.creative_constraints`` -- 創意限制: deliberate limits (one colour, left hand only) that force new expression.

GROUNDED ORIGINAL DESIGN (operator 54-item list; general method, natural family). Invariants: >= 1 constraint
with unique ids and a type from the closed set; >= 1 output, each referencing >= 1 declared constraint it was
made under -- an output not tied to a constraint is ordinary work, not the method's evidence.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, entries_problem, first_duplicate, integrity_gate, is_one_of, is_nonempty_str, is_nonempty_str_list, provenance_required_gate, require, require_header

METHOD_ID = "divergent.creative_constraints"
RECORD_ID_PREFIX = "CCONSTR-"
CONSTRAINT_TYPES = frozenset({"MATERIAL", "TOOL", "TIME", "COLOR", "BODY", "RULE"})
_C_REQUIRED = frozenset({"id", "constraint_type", "rule"})
_C_CHECKS = {"id": is_nonempty_str, "constraint_type": lambda v: is_one_of(v, CONSTRAINT_TYPES), "rule": is_nonempty_str}
_O_REQUIRED = frozenset({"id", "constraint_refs", "description"})
_O_CHECKS = {"id": is_nonempty_str, "constraint_refs": is_nonempty_str_list, "description": is_nonempty_str}

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "CONSTRAINT_TYPES", "generate_creative_constraints", "evaluate_creative_constraints_gates", "all_gates_pass"]


def _core_problem(objective: Any, constraints: Any, outputs: Any) -> str | None:
    if not is_nonempty_str(objective):
        return "objective missing or empty"
    problem = entries_problem(constraints, _C_REQUIRED, _C_REQUIRED, _C_CHECKS)
    if problem is not None:
        return f"constraints {problem}"
    if first_duplicate(c["id"] for c in constraints) is not None:
        return "constraint ids must be unique"
    problem = entries_problem(outputs, _O_REQUIRED, _O_REQUIRED, _O_CHECKS)
    if problem is not None:
        return f"outputs {problem}"
    if first_duplicate(o["id"] for o in outputs) is not None:
        return "output ids must be unique"
    declared = {c["id"] for c in constraints}
    dangling = sorted({ref for o in outputs for ref in o["constraint_refs"]} - declared)
    if dangling:
        return f"outputs reference undeclared constraint(s) {dangling}"
    return None


def generate_creative_constraints(record_id: str, objective: str, constraints: list[dict[str, Any]], outputs: list[dict[str, Any]], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("CCONSTR", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(objective, constraints, outputs)
    require(problem is None, "CCONSTR_INVALID_CONSTRAINTS", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, objective=objective, constraints=constraints, outputs=outputs)


def evaluate_creative_constraints_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("creative_constraints_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("objective"), r.get("constraints"), r.get("outputs")), lambda r: {"constraint_count": len(r["constraints"]), "output_count": len(r["outputs"])}, validator, timestamp),
    ]
