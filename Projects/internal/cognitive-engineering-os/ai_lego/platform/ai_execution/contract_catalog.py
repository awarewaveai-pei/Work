"""Shared scan of a spec-root contract directory into an in-memory catalog, plus the per-invocation gate.

Both the Method Atlas catalog (``methods/contracts/*.contract.yaml``, EC §14)
and the Capability catalog (``capabilities/contracts/*.capability.yaml``,
MP §7/§8.3) mean the same thing by "registered": a contract file exists on
disk under the read-only spec root, declares an ``id``, and carries the
corpus-wide doc-meta ``status: ACTIVE``. This module is that one definition,
so the two resolvers cannot drift on what counts as a live contract.

Since 2026-09-04 (ADR-023 §Consequences 5) the two catalogs also share the
**per-invocation gate**: ``ContractCatalog.require(ref)`` / ``invoke(ref, fn,
...)`` live on the base class, parameterised only by each subclass's blocking
signal, so the guarantee "no implementation handed to ``invoke`` runs on an
unresolved ref" holds for methods and for capabilities through one code path
rather than two copies that could drift.

Fail-closed at the edges too:

* a **missing directory** is an empty catalog (every resolution then blocks)
  -- EC §14's own "the catalog cannot be loaded" condition;
* an **unreadable file** (bad YAML, wrong encoding) raises
  ``CONTRACT_CATALOG_UNREADABLE`` with the offending path instead of letting a
  parser exception escape as a message with no domain meaning;
* two files declaring the **same id** raise ``CONTRACT_ID_DUPLICATE`` instead of
  the sort order silently deciding which version ``require`` will report;
* only files whose name really ends with the pattern's suffix are registered
  -- ``Path.glob`` is case-insensitive on Windows and case-sensitive on POSIX,
  and a catalog must not depend on the host OS.

Every entry carries the file's ``content_sha256``, and the catalog label
fingerprints ids, paths, statuses, versions AND those content hashes, so the
ledger can tell two catalogs apart even when a contract body was edited in
place without a version bump.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, ClassVar, TypeVar

import yaml
from ai_lego.core.yaml_safe import safe_load as safe_load_yaml

from ai_lego.core.support import sha256_bytes, sha256_json
from ai_lego.errors import InvariantViolation

ACTIVE = "ACTIVE"

T = TypeVar("T")


def scan_contract_files(spec_root: Path, relative_dir: str, glob_pattern: str) -> dict[str, dict[str, Any]]:
    """Return ``{contract_id: {path, status, version, content_sha256[, type][, family]}}`` for every id-bearing YAML under ``spec_root/relative_dir``."""
    suffix = glob_pattern.lstrip("*")
    contracts: dict[str, dict[str, Any]] = {}
    for path in sorted((spec_root / relative_dir).glob(glob_pattern)):
        if not path.name.endswith(suffix):
            continue  # case-insensitive glob hit on Windows; not a contract file on any OS
        relative = str(path.relative_to(spec_root)).replace("\\", "/")
        try:
            raw = path.read_bytes()
            document = safe_load_yaml(raw.decode("utf-8"))
        except (OSError, UnicodeDecodeError, yaml.YAMLError) as error:
            raise InvariantViolation(f"CONTRACT_CATALOG_UNREADABLE: {relative}: {error}") from error
        if not isinstance(document, dict) or not document.get("id"):
            continue
        contract_id = str(document["id"])
        if contract_id in contracts:
            raise InvariantViolation(f"CONTRACT_ID_DUPLICATE: {contract_id} is declared by both {contracts[contract_id]['path']} and {relative}")
        contracts[contract_id] = {
            "path": relative,
            "status": document.get("status"),
            "version": str(document.get("version", "")),
            "content_sha256": sha256_bytes(raw),
        }
        if document.get("type") is not None:
            contracts[contract_id]["type"] = document["type"]
        if document.get("family") is not None:   # a method's family names its block (core/domain/blocks.py)
            contracts[contract_id]["family"] = document["family"]
    return contracts


def is_active(entry: dict[str, Any] | None) -> bool:
    return bool(entry) and entry.get("status") == ACTIVE


def catalog_label(relative_dir: str, contracts: dict[str, dict[str, Any]]) -> str:
    """A label that identifies the catalog's *content* without naming the host.

    The absolute spec-root path would otherwise be copied into every resolution
    event of the append-only ledger (and a user-home spec root would carry the
    user name with it). The fingerprint covers each entry's id, path, status,
    version and the file's own content hash, so an in-place edit that leaves
    ``version`` untouched still yields a different label.
    """
    fingerprint = sha256_json(
        sorted(
            [contract_id, entry["path"], entry["status"], entry["version"], entry.get("content_sha256")]
            for contract_id, entry in contracts.items()
        )
    )
    return f"live:{relative_dir}@{fingerprint[:12]}"


@dataclass(frozen=True)
class ContractCatalog:
    """A scanned contract directory plus the per-invocation gate every resolver shares.

    Subclasses set the three class attributes; ``resolve`` (the plan-time,
    all-or-nothing verdict) stays on the subclass because its record shape is
    schema-specific (``method_resolution_result`` vs
    ``capability_resolution_result``). ``require``/``invoke`` are identical on
    both sides by construction -- that is the point of hosting them here.
    """

    label: str
    contracts: dict[str, dict[str, Any]]
    invocations: list[dict[str, Any]] = field(default_factory=list, compare=False, repr=False)

    CONTRACTS_DIR: ClassVar[str] = ""
    CONTRACT_GLOB: ClassVar[str] = ""
    BLOCKED_SIGNAL: ClassVar[str] = ""

    @classmethod
    def from_spec_root(cls, spec_root: Path):
        if not (cls.CONTRACTS_DIR and cls.CONTRACT_GLOB and cls.BLOCKED_SIGNAL):
            raise InvariantViolation(f"CONTRACT_CATALOG_ABSTRACT: {cls.__name__} declares no contracts dir/glob/blocking signal; use MethodCatalog or CapabilityCatalog")
        contracts = scan_contract_files(spec_root, cls.CONTRACTS_DIR, cls.CONTRACT_GLOB)
        return cls(label=catalog_label(cls.CONTRACTS_DIR, contracts), contracts=contracts)

    @classmethod
    def empty(cls, label: str):
        return cls(label=label, contracts={})

    def is_resolvable(self, ref: str) -> bool:
        return is_active(self.contracts.get(ref))

    def require(self, ref: str) -> dict[str, Any]:
        """Per-invocation gate: the contract descriptor, or a raise carrying this catalog's blocking signal. Never a fallback."""
        if not self.is_resolvable(ref):
            raise InvariantViolation(f"{self.BLOCKED_SIGNAL}: no ACTIVE contract in catalog {self.label} for: {ref}")
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
