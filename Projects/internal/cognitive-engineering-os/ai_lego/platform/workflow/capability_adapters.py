"""Explicit capability adapter registry for the generic Workflow runtime.

An ACTIVE capability contract is necessary but not sufficient for execution: a
runtime implementation must also be deliberately registered.  The registry is
small by design so missing adapters fail before the executor creates a journal
or calls implementation code.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Mapping

from ai_lego.errors import InvariantViolation


CapabilityHandler = Callable[[dict[str, Any], dict[str, Any]], Mapping[str, Any]]


@dataclass
class CapabilityAdapterRegistry:
    """Bind resolved capability refs to explicit, process-local adapters."""

    catalog: Any
    _adapters: dict[str, CapabilityHandler] = field(default_factory=dict)

    def register(self, ref: str, handler: CapabilityHandler) -> None:
        if not isinstance(ref, str) or not ref.strip() or not callable(handler):
            raise InvariantViolation(f"CAPABILITY_ADAPTER_REGISTRATION_INVALID: {ref!r}")
        if not self.catalog.is_resolvable(ref):
            raise InvariantViolation(f"CAPABILITY_ADAPTER_CONTRACT_REQUIRED: {ref}")
        if ref in self._adapters:
            raise InvariantViolation(f"CAPABILITY_ADAPTER_DUPLICATE: {ref}")
        self._adapters[ref] = handler

    def require_for(self, refs: list[str]) -> dict[str, CapabilityHandler]:
        resolution = self.catalog.resolve(refs)
        if resolution.get("blocked") is not None:
            raise InvariantViolation(f"CAPABILITY_RESOLUTION_BLOCKED: {resolution['blocked']}")
        missing = [ref for ref in refs if ref not in self._adapters]
        if missing:
            raise InvariantViolation(f"CAPABILITY_ADAPTER_UNAVAILABLE: {', '.join(missing)}")
        return {ref: self._adapters[ref] for ref in refs}

    def availability(self, refs: list[str]) -> dict[str, list[str]]:
        """Report adapter readiness without confusing it with contract resolution."""
        requested = set(refs)
        return {
            "registered": sorted(requested & set(self._adapters)),
            "missing": sorted(requested - set(self._adapters)),
        }

    def handlers_for(self, refs: list[str]) -> dict[str, CapabilityHandler]:
        """Return executor handlers with explicit bindings exposed as adapter args."""
        handlers = self.require_for(refs)

        def wrap(handler: CapabilityHandler) -> CapabilityHandler:
            def invoke(payload: dict[str, Any], node: dict[str, Any]) -> Mapping[str, Any]:
                bindings = payload.get("__bindings__")
                if bindings is not None and not isinstance(bindings, dict):
                    raise InvariantViolation("WORKFLOW_BINDINGS_INVALID: executor did not expose a mapping")
                adapter_payload = dict(payload)
                if isinstance(bindings, dict):
                    adapter_payload.update(bindings)
                return handler(adapter_payload, node)

            return invoke

        return {ref: wrap(handlers[ref]) for ref in refs}
