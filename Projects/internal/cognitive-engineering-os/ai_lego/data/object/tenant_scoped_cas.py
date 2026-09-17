"""Tenant-scoped content-addressed storage (ADR-003 Sub-decision (b) Option A).

Path grammar is owned by ``specs/artifact/cas-path.schema.yaml``:
``/objects/<tenant_id>/sha256/<aa>/<bb>/<hash>``. Two tenants storing
byte-identical content get two different paths, and a tenant can only read,
list or unlink objects inside its own namespace -- enforced by path
containment, not by convention.
"""

from __future__ import annotations

from pathlib import Path
import re
import os
import tempfile
from typing import Any

from ai_lego.core.support import sha256_bytes
from ai_lego.errors import InvariantViolation


class TenantScopedCas:
    _TENANT_SEGMENT = re.compile(r"^[A-Za-z0-9_-]{1,128}$")

    def __init__(self, root: Path) -> None:
        self.root = root

    @classmethod
    def _validate_tenant_id(cls, tenant_id: str) -> None:
        if not isinstance(tenant_id, str) or cls._TENANT_SEGMENT.fullmatch(tenant_id) is None:
            raise InvariantViolation("CAS_TENANT_ID_INVALID")

    def _tenant_root(self, tenant_id: str) -> Path:
        self._validate_tenant_id(tenant_id)
        return (self.root / "objects" / tenant_id).resolve()

    def _resolve_owned(self, tenant_id: str, cas_path: dict[str, str]) -> Path:
        if cas_path.get("tenant_segment") != tenant_id:
            raise InvariantViolation("CAS_TENANT_ACCESS_DENIED")
        target = (self.root / Path(cas_path["path"].lstrip("/"))).resolve()
        if self._tenant_root(tenant_id) not in target.parents:
            raise InvariantViolation("CAS_TENANT_ACCESS_DENIED")
        return target

    @staticmethod
    def cas_path_for(tenant_id: str, content: bytes) -> dict[str, str]:
        """Compute the ``cas_path`` dict ``put`` would return, without writing anything.

        Content-addressed storage: the destination is a pure function of ``(tenant_id, content)``
        per ``specs/artifact/cas-path.schema.yaml``. Callers that must validate a record BEFORE
        persisting bytes (``create_source`` in ``apps/api/main.py``, so a rejected write never
        orphans a blob) call this first and only call ``put`` once validation passes. Mirrors
        ``put``'s own digest/shard arithmetic -- ``test_tenant_scoped_cas.py`` asserts they agree,
        so keep both in sync if this grammar ever changes.
        """
        TenantScopedCas._validate_tenant_id(tenant_id)
        digest = sha256_bytes(content)
        return {
            "path": f"/objects/{tenant_id}/sha256/{digest[:2]}/{digest[2:4]}/{digest}",
            "tenant_segment": tenant_id,
            "hash": digest,
            "shard_1": digest[:2],
            "shard_2": digest[2:4],
        }

    def put(self, tenant_id: str, content: bytes) -> dict[str, str]:
        self._validate_tenant_id(tenant_id)
        digest = sha256_bytes(content)
        relative = Path("objects") / tenant_id / "sha256" / digest[:2] / digest[2:4] / digest
        target = self.root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary_name = tempfile.mkstemp(prefix=f".{digest}.", dir=str(target.parent))
        try:
            with os.fdopen(fd, "wb") as temporary:
                temporary.write(content)
                temporary.flush()
                os.fsync(temporary.fileno())
            os.replace(temporary_name, target)
        finally:
            if os.path.exists(temporary_name):
                os.unlink(temporary_name)
        return {
            "path": "/" + relative.as_posix(),
            "tenant_segment": tenant_id,
            "hash": digest,
            "shard_1": digest[:2],
            "shard_2": digest[2:4],
        }

    @staticmethod
    def artifact_uri(tenant_label: str, project_id: str, source_id: str, cas_path: dict[str, str]) -> dict[str, Any]:
        """Instance of ``ai-lego://specs/artifact/portable-uri.schema.yaml#/definitions/artifact_uri``."""
        return {
            "uri": f"artifact://tenant/{tenant_label}/project/{project_id}/source/{source_id}",
            "segments": [
                {"segment_type": "tenant", "segment_id": tenant_label},
                {"segment_type": "project", "segment_id": project_id},
                {"segment_type": "source", "segment_id": source_id},
            ],
            "resolved_cas_path": cas_path,
        }

    def read(self, tenant_id: str, cas_path: dict[str, str]) -> bytes:
        """Read only an object whose tenant segment matches the requester."""
        target = self._resolve_owned(tenant_id, cas_path)
        if not target.is_file():
            raise InvariantViolation("CAS_TENANT_ACCESS_DENIED")
        return target.read_bytes()

    def list_objects(self, tenant_id: str) -> list[str]:
        tenant_root = self.root / "objects" / tenant_id
        if not tenant_root.exists():
            return []
        return sorted("/" + item.relative_to(self.root).as_posix() for item in tenant_root.rglob("*") if item.is_file())

    def unlink(self, tenant_id: str, cas_path: dict[str, str]) -> str:
        """Remove one tenant-owned object. Plain unlink: NOT physical media sanitization."""
        target = self._resolve_owned(tenant_id, cas_path)
        if not target.is_file():
            raise InvariantViolation("CAS_OBJECT_NOT_FOUND")
        target.unlink()
        if target.exists():
            raise InvariantViolation("CAS_OBJECT_UNLINK_FAILED")
        return str(target)
