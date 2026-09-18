"""Tenant-scoped immutable JSON artifact repository.

This is a storage seam, not a clinical/production data promise.  It writes
canonical JSON to the existing tenant-scoped CAS and verifies the tenant and
content hash on every read.  Retention, encryption-at-rest and erasure policy
remain owned by their respective infrastructure layers.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Mapping

from ai_lego.core.support import canonical_json, sha256_bytes
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.errors import InvariantViolation


class JsonArtifactStore:
    # Base pattern (PascalCase artifact type, e.g. "BusinessProposalArtifact") plus an optional
    # "/subtype" suffix for a real MIME type (e.g. "image/png") -- added 2026-09-18 when
    # artifact.generate_chart became this store's first binary-media producer and every call to
    # persist_artifact_output() for it raised JSON_ARTIFACT_TYPE_INVALID (the store's own content
    # encoding was already MIME-type-agnostic -- base64 image bytes are just a JSON string like
    # any other artifact field -- only this label regex predated any "/"-bearing type existing).
    _TYPE = re.compile(r"^[A-Za-z][A-Za-z0-9_.-]{0,127}(/[A-Za-z0-9][A-Za-z0-9_.+-]{0,127})?$")

    def __init__(self, cas: TenantScopedCas) -> None:
        self.cas = cas

    @classmethod
    def _validate_type(cls, artifact_type: str) -> None:
        if not isinstance(artifact_type, str) or cls._TYPE.fullmatch(artifact_type) is None:
            raise InvariantViolation("JSON_ARTIFACT_TYPE_INVALID")

    def put(self, tenant_id: str, artifact_type: str, value: Mapping[str, Any]) -> dict[str, Any]:
        self._validate_type(artifact_type)
        if not isinstance(value, Mapping):
            raise InvariantViolation("JSON_ARTIFACT_OBJECT_REQUIRED")
        try:
            content = canonical_json(dict(value)).encode("utf-8")
        except (TypeError, ValueError) as error:
            raise InvariantViolation(f"JSON_ARTIFACT_NOT_SERIALIZABLE: {error}") from error
        cas_path = self.cas.put(tenant_id, content)
        return {"artifact_type": artifact_type, "tenant_id": tenant_id, "content_sha256": sha256_bytes(content), "cas_path": cas_path}

    def read(self, tenant_id: str, reference: Mapping[str, Any]) -> dict[str, Any]:
        if not isinstance(reference, Mapping) or reference.get("tenant_id") != tenant_id:
            raise InvariantViolation("JSON_ARTIFACT_TENANT_ACCESS_DENIED")
        artifact_type = reference.get("artifact_type")
        self._validate_type(artifact_type)
        expected = reference.get("content_sha256")
        if not isinstance(expected, str):
            raise InvariantViolation("JSON_ARTIFACT_HASH_REQUIRED")
        cas_path = reference.get("cas_path")
        if not isinstance(cas_path, Mapping):
            raise InvariantViolation("JSON_ARTIFACT_CAS_PATH_REQUIRED")
        content = self.cas.read(tenant_id, dict(cas_path))
        if sha256_bytes(content) != expected:
            raise InvariantViolation("JSON_ARTIFACT_HASH_MISMATCH")
        try:
            value = json.loads(content.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise InvariantViolation("JSON_ARTIFACT_INVALID_JSON") from error
        if not isinstance(value, dict):
            raise InvariantViolation("JSON_ARTIFACT_OBJECT_REQUIRED")
        return value

    def delete(self, tenant_id: str, reference: Mapping[str, Any]) -> str:
        """Delete only after verifying the reference and content hash."""
        self.read(tenant_id, reference)
        cas_path = reference.get("cas_path") if isinstance(reference, Mapping) else None
        if not isinstance(cas_path, Mapping):
            raise InvariantViolation("JSON_ARTIFACT_CAS_PATH_REQUIRED")
        return self.cas.unlink(tenant_id, dict(cas_path))
