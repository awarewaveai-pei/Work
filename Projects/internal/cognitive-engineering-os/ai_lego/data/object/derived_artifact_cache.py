"""Tenant-scoped cache for deterministic derived artifacts.

The cache is an optimization and provenance boundary, not a source of truth:
bytes live in :class:`TenantScopedCas`, while SQLite stores only the lookup
index.  A hit is returned only after the CAS tenant check and content hash
verification succeed.  Expiry is reported as a miss; this module never
silently deletes data, because deletion belongs to the policy-gated erasure
flow.
"""

from __future__ import annotations

import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from ai_lego.core.support import sha256_bytes
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.errors import InvariantViolation


_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_IDENTIFIER = re.compile(r"^[A-Za-z0-9._:-]{1,160}$")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _canonical_json(value: dict[str, Any]) -> bytes:
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
    except (TypeError, ValueError) as error:
        raise InvariantViolation(f"DERIVED_CACHE_VALUE_NOT_JSON: {error}") from error


class DerivedArtifactCache:
    """Cache JSON derivations by immutable source and adapter identity."""

    def __init__(self, cas: TenantScopedCas, index_path: Path, clock: Callable[[], datetime] | None = None) -> None:
        self.cas = cas
        self.index_path = index_path
        self.clock = clock or _utc_now
        self.index_path.parent.mkdir(parents=True, exist_ok=True)
        connection = self._connect()
        try:
            with connection:
                connection.execute(
                    """
                    CREATE TABLE IF NOT EXISTS derived_artifact_cache (
                        tenant_id TEXT NOT NULL,
                        source_sha256 TEXT NOT NULL,
                        capability_ref TEXT NOT NULL,
                        adapter_version TEXT NOT NULL,
                        cas_path_json TEXT NOT NULL,
                        artifact_sha256 TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        expires_at TEXT,
                        PRIMARY KEY (tenant_id, source_sha256, capability_ref, adapter_version)
                    )
                    """
                )
        finally:
            connection.close()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.index_path)
        connection.row_factory = sqlite3.Row
        return connection

    @staticmethod
    def _validate_key(tenant_id: str, source_sha256: str, capability_ref: str, adapter_version: str) -> None:
        if not isinstance(tenant_id, str) or not _IDENTIFIER.fullmatch(tenant_id):
            raise InvariantViolation("DERIVED_CACHE_TENANT_INVALID")
        if not isinstance(source_sha256, str) or not _SHA256.fullmatch(source_sha256):
            raise InvariantViolation("DERIVED_CACHE_SOURCE_HASH_INVALID")
        for name, value in (("CAPABILITY", capability_ref), ("ADAPTER_VERSION", adapter_version)):
            if not isinstance(value, str) or not _IDENTIFIER.fullmatch(value):
                raise InvariantViolation(f"DERIVED_CACHE_{name}_INVALID")

    @staticmethod
    def _validate_expiry(expires_at: str | None) -> None:
        if expires_at is None:
            return
        if not isinstance(expires_at, str):
            raise InvariantViolation("DERIVED_CACHE_EXPIRY_INVALID")
        try:
            datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        except ValueError as error:
            raise InvariantViolation("DERIVED_CACHE_EXPIRY_INVALID") from error

    def put(
        self,
        tenant_id: str,
        source_sha256: str,
        capability_ref: str,
        adapter_version: str,
        value: dict[str, Any],
        *,
        expires_at: str | None = None,
    ) -> dict[str, Any]:
        """Store one derivation and atomically publish its lookup index."""
        self._validate_key(tenant_id, source_sha256, capability_ref, adapter_version)
        self._validate_expiry(expires_at)
        content = _canonical_json(value)
        artifact_sha256 = sha256_bytes(content)
        cas_path = self.cas.put(tenant_id, content)
        now = self.clock().astimezone(timezone.utc).isoformat()
        connection = self._connect()
        try:
            with connection:
                connection.execute(
                    """
                    INSERT INTO derived_artifact_cache
                      (tenant_id, source_sha256, capability_ref, adapter_version,
                       cas_path_json, artifact_sha256, created_at, expires_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(tenant_id, source_sha256, capability_ref, adapter_version)
                    DO UPDATE SET cas_path_json=excluded.cas_path_json,
                                  artifact_sha256=excluded.artifact_sha256,
                                  created_at=excluded.created_at,
                                  expires_at=excluded.expires_at
                    """,
                    (tenant_id, source_sha256, capability_ref, adapter_version, json.dumps(cas_path, sort_keys=True), artifact_sha256, now, expires_at),
                )
        finally:
            connection.close()
        return {
            "tenant_id": tenant_id,
            "source_sha256": source_sha256,
            "capability_ref": capability_ref,
            "adapter_version": adapter_version,
            "cas_path": cas_path,
            "artifact_sha256": artifact_sha256,
            "created_at": now,
            "expires_at": expires_at,
        }

    def get(self, tenant_id: str, source_sha256: str, capability_ref: str, adapter_version: str) -> dict[str, Any] | None:
        """Return a verified cached value, or ``None`` for a miss/expiry."""
        self._validate_key(tenant_id, source_sha256, capability_ref, adapter_version)
        connection = self._connect()
        try:
            row = connection.execute(
                """
                SELECT cas_path_json, artifact_sha256, created_at, expires_at
                FROM derived_artifact_cache
                WHERE tenant_id=? AND source_sha256=? AND capability_ref=? AND adapter_version=?
                """,
                (tenant_id, source_sha256, capability_ref, adapter_version),
            ).fetchone()
        finally:
            connection.close()
        if row is None:
            return None
        expires_at = row["expires_at"]
        if expires_at is not None:
            expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if expiry <= self.clock().astimezone(timezone.utc):
                return None
        try:
            cas_path = json.loads(row["cas_path_json"])
            content = self.cas.read(tenant_id, cas_path)
        except Exception as error:
            raise InvariantViolation("DERIVED_CACHE_CAS_READ_FAILED") from error
        if sha256_bytes(content) != row["artifact_sha256"]:
            raise InvariantViolation("DERIVED_CACHE_ARTIFACT_HASH_MISMATCH")
        try:
            value = json.loads(content.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise InvariantViolation("DERIVED_CACHE_ARTIFACT_INVALID_JSON") from error
        if not isinstance(value, dict):
            raise InvariantViolation("DERIVED_CACHE_ARTIFACT_OBJECT_REQUIRED")
        return {
            "value": value,
            "cas_path": cas_path,
            "artifact_sha256": row["artifact_sha256"],
            "created_at": row["created_at"],
            "expires_at": expires_at,
        }
