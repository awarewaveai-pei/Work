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
``method_resolver.MethodCatalog``:

* ``CapabilityCatalog.resolve(refs)`` -- all-or-nothing, like methods: any ref
  without an ACTIVE contract blocks the whole request with
  ``CAPABILITY_RESOLUTION_BLOCKED``.
* ``CapabilityCatalog.require(ref)`` / ``invoke(ref, fn, ...)`` -- the
  per-invocation gate. ``invoke`` resolves first and only then calls the
  implementation, and it records every invocation it actually made in
  ``invocations`` so a caller reports what was observed, not what it believes.
  Scope of the guarantee, stated precisely: **no implementation handed to
  ``invoke`` runs on an unresolved ref**. Code that performs capability-like
  work without going through ``invoke`` (a caller's ingest port, a test
  harness's own artifact) is outside this module's reach; such callers must
  declare it -- the Phase 5 slice does, under
  ``performed_outside_capability_plane``.
* ``plan_executability(workflow_ir, resolution)`` -- classifies the compiled
  IR's capability nodes by the Recipe's own ``necessity`` label (Atlas §14.3:
  ``REQUIRED_*`` blocks are policy-mandated and cannot be removed;
  ``RECOMMENDED``/``OPTIONAL`` may be omitted). A plan with an unresolved
  ``REQUIRED_*`` capability node is not executable. The function refuses a
  resolution that does not cover every capability node of the IR
  (``CAPABILITY_PLAN_COVERAGE_MISMATCH``) -- an empty resolution must not read
  as "fully resolved".

Status-code naming: ``CAPABILITY_RESOLUTION_BLOCKED`` follows the
``<Domain>_RESOLUTION_BLOCKED`` family that ``specs/execution/status-codes.schema.yaml``
already uses for ``METHOD_`` and ``DOCUMENT_``. It is NOT yet registered in
that file (a spec-root change, outside this runtime's write scope); today the
runtime carries it in the ``signal`` field of the resolution ledger event, and
will carry it as a state transition's ``trigger_signal`` once the plan-level
BLOCKED transition is wired. There is likewise no
``capability-resolution.schema.yaml`` yet, so the result record below is a
runtime-defined shape (``NEW_DESIGN``) that mirrors
``method-resolution.schema.yaml#/method_resolution_result`` field-for-field
(``candidate_capabilities`` / ``blocked``), so the two can be unified by the
spec-root maintainer without a runtime change. Both follow-ups are recorded in
``docs/adr/ADR-023-capability-resolution-fail-closed.md``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, TypeVar

from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_execution.contract_catalog import catalog_label, is_active, scan_contract_files

CAPABILITY_RESOLUTION_BLOCKED = "CAPABILITY_RESOLUTION_BLOCKED"
CONTRACTS_DIR = "capabilities/contracts"
CONTRACT_GLOB = "*.capability.yaml"
DEFAULT_NECESSITY = "RECOMMENDED"  # recipe.schema.yaml#/steps/items/necessity default
BLOCKING_NECESSITY_PREFIX = "REQUIRED_"  # REQUIRED_BY_RISK / _BY_JURISDICTION / _BY_SECTOR (Atlas §14.3)

T = TypeVar("T")


@dataclass(frozen=True)
class CapabilityCatalog:
    label: str
    contracts: dict[str, dict[str, Any]]
    invocations: list[dict[str, Any]] = field(default_factory=list, compare=False, repr=False)

    @classmethod
    def from_spec_root(cls, spec_root: Path) -> "CapabilityCatalog":
        contracts = scan_contract_files(spec_root, CONTRACTS_DIR, CONTRACT_GLOB)
        return cls(label=catalog_label(CONTRACTS_DIR, contracts), contracts=contracts)

    @classmethod
    def empty(cls, label: str) -> "CapabilityCatalog":
        return cls(label=label, contracts={})

    def is_resolvable(self, ref: str) -> bool:
        return is_active(self.contracts.get(ref))

    def resolve(self, refs: list[str]) -> dict[str, Any]:
        """Runtime mirror of ``method_resolution_result`` for capability refs (see module docstring).

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

    def require(self, ref: str) -> dict[str, Any]:
        """Per-invocation gate (MP §7 'Capability Request'): the contract descriptor, or a raise. Never a fallback."""
        if not self.is_resolvable(ref):
            raise InvariantViolation(f"{CAPABILITY_RESOLUTION_BLOCKED}: no ACTIVE contract in catalog {self.label} for: {ref}")
        return {"ref": ref, **self.contracts[ref]}

    def invoke(self, ref: str, implementation: Callable[..., T], *args: Any, **kwargs: Any) -> tuple[dict[str, Any], T]:
        """Resolve ``ref``, only then call ``implementation``, and log the invocation; returns ``(descriptor, result)``.

        The callable is not reached on a blocked ref -- ``require`` raises first --
        and nothing is logged for it: ``invocations`` holds only invocations that
        actually ran.
        """
        descriptor = self.require(ref)
        result = implementation(*args, **kwargs)
        self.invocations.append(dict(descriptor))
        return descriptor, result


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
