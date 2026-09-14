"""Explicit Recipe-level workflow gate registry.

Recipe declarations name stable gate refs. The application composition root
must register the corresponding runner explicitly; missing refs fail closed.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from ai_lego.errors import InvariantViolation


WorkflowGateRunner = Callable[[dict[str, Any], dict[str, Any]], list[dict[str, Any]]]


@dataclass
class WorkflowGateRegistry:
    """Bind stable workflow gate refs to process-local runners."""

    _runners: dict[str, WorkflowGateRunner] = field(default_factory=dict)

    def register(self, ref: str, runner: WorkflowGateRunner) -> None:
        if not isinstance(ref, str) or not ref.strip() or not callable(runner):
            raise InvariantViolation(f"WORKFLOW_GATE_REGISTRATION_INVALID: {ref!r}")
        if ref in self._runners:
            raise InvariantViolation(f"WORKFLOW_GATE_DUPLICATE: {ref}")
        self._runners[ref] = runner

    def availability(self, refs: list[str]) -> dict[str, list[str]]:
        requested = set(refs)
        return {
            "registered": sorted(requested & set(self._runners)),
            "missing": sorted(requested - set(self._runners)),
        }

    def require_for(self, refs: list[str]) -> tuple[WorkflowGateRunner, ...]:
        if any(not isinstance(ref, str) or not ref.strip() for ref in refs):
            raise InvariantViolation("WORKFLOW_GATE_REF_INVALID")
        if len(set(refs)) != len(refs):
            raise InvariantViolation("WORKFLOW_GATE_REF_DUPLICATE")
        missing = [ref for ref in refs if ref not in self._runners]
        if missing:
            raise InvariantViolation(f"WORKFLOW_GATE_UNAVAILABLE: {', '.join(missing)}")
        return tuple(self._runners[ref] for ref in refs)

    def evaluate(self, refs: list[str], context: dict[str, Any], workflow: dict[str, Any]) -> list[dict[str, Any]]:
        gates: list[dict[str, Any]] = []
        for runner in self.require_for(refs):
            result = runner(context, workflow)
            if not isinstance(result, list) or any(not isinstance(gate, dict) for gate in result):
                raise InvariantViolation("WORKFLOW_GATE_RESULT_INVALID: registered runner must return list[dict]")
            gates.extend(result)
        return gates
