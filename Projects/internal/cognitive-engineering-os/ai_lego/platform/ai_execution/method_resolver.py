"""Method resolution against the Method Atlas contract catalog (EC §14) + state transitions (EC §10).

Red line (Master Plan L45): a method that is not registered MUST block
execution (``METHOD_RESOLUTION_BLOCKED``) -- an LLM may never improvise it
from narrative. The catalog is built by scanning the spec root's real
``methods/contracts/*.contract.yaml`` files, so "registered" means "a contract
file exists and is ACTIVE", not "a name appears in a list".

``PLANNING_BLOCKED_METHOD_ATLAS_REQUIRED`` is the Master Plan's wording for
the same signal; ``specs/execution/status-codes.schema.yaml`` makes it a
deprecated alias of the canonical ``METHOD_RESOLUTION_BLOCKED``.

Two enforcement points, mirroring the capability side (ADR-023 §Consequences 5,
closed 2026-09-04):

* ``MethodCatalog.resolve(method_ids)`` -- the plan-time, all-or-nothing verdict
  (an instance of ``method-resolution.schema.yaml#/method_resolution_result``).
* ``MethodCatalog.require(method_id)`` / ``invoke(method_id, fn, ...)`` -- the
  per-invocation gate inherited from ``ContractCatalog``: no method
  implementation handed to ``invoke`` runs on an unregistered method id.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, ClassVar

from ai_lego.platform.ai_execution.contract_catalog import ContractCatalog, catalog_label, is_active, scan_contract_files

METHOD_RESOLUTION_BLOCKED = "METHOD_RESOLUTION_BLOCKED"
DEPRECATED_ALIAS = "PLANNING_BLOCKED_METHOD_ATLAS_REQUIRED"
CONTRACTS_DIR = "methods/contracts"
CONTRACT_GLOB = "*.contract.yaml"


@dataclass(frozen=True)
class MethodCatalog(ContractCatalog):
    # Same "registered" definition as the capability catalog (contract_catalog.py) -- one scan, two resolvers.
    # The label fingerprints the catalog's content; it never carries the host's absolute path into the ledger.
    CONTRACTS_DIR: ClassVar[str] = CONTRACTS_DIR
    CONTRACT_GLOB: ClassVar[str] = CONTRACT_GLOB
    BLOCKED_SIGNAL: ClassVar[str] = METHOD_RESOLUTION_BLOCKED

    @classmethod
    def from_spec_root(cls, spec_root):
        """Load Method contracts without promoting Atlas Lenses into Methods.

        The shared directory contains the Tier-0 ``stakeholder.regulator`` lens
        contract.  Its ``type: perspective`` is a different LEGO dimension and
        has no builder/gate pair, so the Method catalog must not advertise it as
        invokable.
        """
        contracts = scan_contract_files(spec_root, cls.CONTRACTS_DIR, cls.CONTRACT_GLOB)
        contracts = {ref: entry for ref, entry in contracts.items() if entry.get("type") != "perspective"}
        return cls(label=catalog_label(cls.CONTRACTS_DIR, contracts), contracts=contracts)

    def resolve(self, method_ids: list[str]) -> dict[str, Any]:
        """Instance of ``specs/execution/method-resolution.schema.yaml#/method_resolution_result``."""
        missing = [method_id for method_id in method_ids if not is_active(self.contracts.get(method_id))]
        if missing:
            return {
                "candidate_methods": [],
                "blocked": {
                    "status": METHOD_RESOLUTION_BLOCKED,
                    "reason": f"no ACTIVE contract in catalog {self.label} for: {', '.join(missing)}",
                },
            }
        return {
            "candidate_methods": [
                {"method_id": method_id, "score": None, "rationale": f"ACTIVE contract {self.contracts[method_id]['path']} v{self.contracts[method_id]['version']}"}
                for method_id in method_ids
            ],
            "blocked": None,
        }


def state_transition(
    from_state: str | None,
    to_state: str,
    transitioned_at: str,
    execution_id: str,
    trigger_signal: str | None = None,
    gate_results: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Instance of ``specs/execution/execution-state-machine.schema.yaml#/state_transition_event``."""
    event: dict[str, Any] = {
        "from_state": from_state,
        "to_state": to_state,
        "transitioned_at": transitioned_at,
        "execution_id": execution_id,
        "trigger_signal": trigger_signal,
    }
    if gate_results:
        event["gate_results"] = gate_results
    return event
