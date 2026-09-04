"""Capability resolution against the ``capabilities/contracts/`` catalog -- fail-closed (ADR-023).

Governing text, both from the Master Plan:

* §7 AI Gateway: "所有 AI 呼叫統一經過 AI Gateway" --
  ``Capability Request -> Capability Resolver -> Policy Engine -> AI Gateway``.
  Resolution is a stage every capability *request* passes through, not a
  one-off boot step.
* §8.4 Typed LEGO: "每個能力與 Method 都必須具有 Input / Output type ...
  不合法組合在執行前拒絕". A capability with no contract has no declared
  Input/Output type, no ``security``/``rollback``/``entitlement`` block, and
  therefore nothing the Policy Engine could validate -- it is rejected
  *before* execution, exactly as EC §14 rejects an unregistered method.

This module is the runtime seam for both rules, mirroring
``method_resolver.MethodCatalog`` (both are ``ContractCatalog`` subclasses):

* ``CapabilityCatalog.resolve(refs)`` -- all-or-nothing, like methods: any ref
  without an ACTIVE contract blocks the whole request with
  ``CAPABILITY_RESOLUTION_BLOCKED``. The record is an instance of
  ``specs/execution/capability-resolution.schema.yaml#/capability_resolution_result``.
* ``CapabilityCatalog.require(ref)`` / ``invoke(ref, fn, ...)`` -- the
  per-invocation gate (inherited). ``invoke`` resolves first and only then
  calls the implementation, and it records every invocation it actually made
  in ``invocations`` so a caller reports what was observed, not what it
  believes. Scope of the guarantee, stated precisely: **no implementation
  handed to ``invoke`` runs on an unresolved ref**. Code that performs
  capability-like work without going through ``invoke`` is outside this
  module's reach; such callers must declare it -- the Phase 5 slice's
  ``OUTSIDE_CAPABILITY_PLANE`` mechanism (empty since 2026-09-04, when the
  last two declared bypasses were re-homed behind ``invoke``).
* ``plan_executability(workflow_ir, resolution)`` -- classifies the compiled
  IR's capability nodes by the Recipe's own ``necessity`` label (Atlas §14.3:
  ``REQUIRED_*`` blocks are policy-mandated and cannot be removed;
  ``RECOMMENDED``/``OPTIONAL`` may be omitted). A plan with an unresolved
  ``REQUIRED_*`` capability node is not executable and (ADR-023 §Decision 3,
  wired 2026-09-04) transitions ``METHODS_RESOLVED -> BLOCKED`` instead of
  reaching ``PLAN_COMPILED``. The function refuses a resolution that does not
  cover every capability node of the IR (``CAPABILITY_PLAN_COVERAGE_MISMATCH``)
  -- an empty resolution must not read as "fully resolved". The record is an
  instance of ``capability-resolution.schema.yaml#/plan_executability``.

Status code: ``CAPABILITY_RESOLUTION_BLOCKED`` is registered in
``specs/execution/status-codes.schema.yaml`` (2026-09-04, ADR-023 §Consequences
2) in the ``<Domain>_RESOLUTION_BLOCKED`` family with side-state mapping
BLOCKED, and is a member of ``emittable_reason_codes``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, ClassVar

from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_execution.contract_catalog import ContractCatalog

CAPABILITY_RESOLUTION_BLOCKED = "CAPABILITY_RESOLUTION_BLOCKED"
CONTRACTS_DIR = "capabilities/contracts"
CONTRACT_GLOB = "*.capability.yaml"
DEFAULT_NECESSITY = "RECOMMENDED"  # recipe.schema.yaml#/steps/items/necessity default
BLOCKING_NECESSITY_PREFIX = "REQUIRED_"  # REQUIRED_BY_RISK / _BY_JURISDICTION / _BY_SECTOR (Atlas §14.3)


@dataclass(frozen=True)
class CapabilityCatalog(ContractCatalog):
    CONTRACTS_DIR: ClassVar[str] = CONTRACTS_DIR
    CONTRACT_GLOB: ClassVar[str] = CONTRACT_GLOB
    BLOCKED_SIGNAL: ClassVar[str] = CAPABILITY_RESOLUTION_BLOCKED

    def resolve(self, refs: list[str]) -> dict[str, Any]:
        """Instance of ``capability-resolution.schema.yaml#/capability_resolution_result``.

        All-or-nothing: one unresolved ref blocks the request. ``blocked`` carries
        the machine-readable split (``unresolved`` / ``resolvable``) so a caller
        can report honestly which refs are the problem without re-deriving it.
        """
        unresolved = [ref for ref in refs if not self.is_resolvable(ref)]
        if unresolved:
            return {
                "candidate_capabilities": [],
                "blocked": {
                    "status": CAPABILITY_RESOLUTION_BLOCKED,
                    "reason": f"no ACTIVE contract in catalog {self.label} for: {', '.join(unresolved)}",
                    "unresolved": unresolved,
                    "resolvable": [ref for ref in refs if self.is_resolvable(ref)],
                },
            }
        return {
            "candidate_capabilities": [
                {"ref": ref, "rationale": f"ACTIVE contract {self.contracts[ref]['path']} v{self.contracts[ref]['version']}"}
                for ref in refs
            ],
            "blocked": None,
        }


def covered_refs(resolution: dict[str, Any]) -> set[str]:
    """Every ref a ``resolve`` result says anything about (resolved or not)."""
    blocked = resolution.get("blocked") or {}
    return (
        {candidate["ref"] for candidate in resolution.get("candidate_capabilities", [])}
        | set(blocked.get("unresolved", []))
        | set(blocked.get("resolvable", []))
    )


def capability_refs(workflow_ir: dict[str, Any]) -> list[str]:
    """The IR's capability refs in node order, de-duplicated. A capability node without a ref is a domain error.

    Every caller that walks the IR for capability refs goes through here, so
    the malformed-node case has exactly one error and cannot surface as a bare
    ``KeyError`` from some caller's own comprehension.
    """
    refs: list[str] = []
    for node in workflow_ir.get("nodes", []):
        if node.get("node_kind") != "capability":
            continue
        if not node.get("ref"):
            raise InvariantViolation(f"WORKFLOW_IR_CAPABILITY_NODE_WITHOUT_REF: {node}")
        if node["ref"] not in refs:
            refs.append(node["ref"])
    return refs


def plan_executability(workflow_ir: dict[str, Any], resolution: dict[str, Any]) -> dict[str, Any]:
    """Classify the IR's capability nodes against a ``resolve`` result by their Recipe ``necessity``.

    ``executable`` is False as soon as one ``REQUIRED_*`` capability node of the
    IR is unresolved; ``fully_resolved`` is False as soon as *any* capability
    node of the IR is. The two are reported separately because they answer
    different questions ("may this plan run at all?" vs. "does every node have
    a contract?"). A resolution that does not cover every capability node of
    the IR is refused -- silence about a node is not resolution of it.
    """
    ir_refs = set(capability_refs(workflow_ir))
    nodes = [node for node in workflow_ir.get("nodes", []) if node.get("node_kind") == "capability"]
    uncovered = sorted(ir_refs - covered_refs(resolution))
    if uncovered:
        raise InvariantViolation(f"CAPABILITY_PLAN_COVERAGE_MISMATCH: resolution says nothing about IR capability refs: {', '.join(uncovered)}")
    blocked = resolution.get("blocked") or {}
    unresolved = set(blocked.get("unresolved", [])) & ir_refs
    blocking: list[dict[str, Any]] = []
    not_invocable: list[dict[str, Any]] = []
    for node in nodes:
        if node["ref"] not in unresolved:
            continue
        entry = {"ref": node["ref"], "label": node.get("label"), "necessity": node.get("necessity", DEFAULT_NECESSITY)}
        (blocking if entry["necessity"].startswith(BLOCKING_NECESSITY_PREFIX) else not_invocable).append(entry)
    return {
        "fully_resolved": not unresolved,
        "executable": not blocking,
        "blocking": blocking,
        "not_invocable": not_invocable,
    }
