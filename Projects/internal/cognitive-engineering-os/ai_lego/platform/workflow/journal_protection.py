"""Pluggable protection for durable Workflow journal context.

The executor owns checkpoint ordering; this module owns optional at-rest
protection.  A real deployment should provide the key through its KMS/HSM
adapter.  The AES-GCM implementation is intentionally dependency-compatible
with the existing local key-vault slice and does not decide key custody.
"""

from __future__ import annotations

import json
import secrets
from typing import Any, Callable, Mapping, Protocol

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from ai_lego.core.support import b64, canonical_json, sha256_bytes, unb64
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.errors import InvariantViolation


class JournalContextProtector(Protocol):
    def protect(self, context: Mapping[str, Any]) -> Mapping[str, Any]: ...

    def restore(self, stored: Mapping[str, Any]) -> dict[str, Any]: ...


class AesGcmJournalContextProtector:
    """Encrypt projected JSON context with an injected 256-bit key.

    This class deliberately accepts key bytes from outside. It is not a KMS,
    does not persist key material, and cannot be used as evidence that key
    custody/rotation/erasure has been solved.
    """

    def __init__(self, key: bytes, projector: Callable[[dict[str, Any]], Mapping[str, Any]] | None = None, aad: bytes = b"ai-lego-workflow-journal-v1"):
        if len(key) != 32:
            raise InvariantViolation("WORKFLOW_JOURNAL_KEY_INVALID: AES-256 requires exactly 32 bytes")
        self._key = bytes(key)
        self._projector = projector
        self._aad = bytes(aad)

    def protect(self, context: Mapping[str, Any]) -> Mapping[str, Any]:
        projected = dict(self._projector(dict(context)) if self._projector is not None else context)
        try:
            plaintext = json.dumps(projected, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        except (TypeError, ValueError) as error:
            raise InvariantViolation("WORKFLOW_JOURNAL_CONTEXT_NOT_JSON") from error
        nonce = secrets.token_bytes(12)
        return {
            "protected": True,
            "cipher_alg": "AES-256-GCM",
            "nonce": b64(nonce),
            "ciphertext": b64(AESGCM(self._key).encrypt(nonce, plaintext, self._aad)),
        }

    def restore(self, stored: Mapping[str, Any]) -> dict[str, Any]:
        if stored.get("protected") is not True or stored.get("cipher_alg") != "AES-256-GCM":
            raise InvariantViolation("WORKFLOW_JOURNAL_PROTECTION_REQUIRED")
        try:
            plaintext = AESGCM(self._key).decrypt(unb64(stored["nonce"]), unb64(stored["ciphertext"]), self._aad)
            value = json.loads(plaintext.decode("utf-8"))
        except Exception as error:
            raise InvariantViolation("WORKFLOW_JOURNAL_CONTEXT_DECRYPT_FAILED") from error
        if not isinstance(value, dict):
            raise InvariantViolation("WORKFLOW_JOURNAL_CONTEXT_INVALID")
        return value


class CasJournalContextProtector:
    """Store AES-GCM ciphertext in tenant-scoped CAS and keep only a reference in the journal."""

    def __init__(self, cas: TenantScopedCas, tenant_id: str, journal_subject: str, key: bytes, aad: bytes = b"ai-lego-workflow-journal-v1"):
        if len(key) != 32:
            raise InvariantViolation("WORKFLOW_JOURNAL_KEY_INVALID: AES-256 requires exactly 32 bytes")
        if not tenant_id or not journal_subject:
            raise InvariantViolation("WORKFLOW_JOURNAL_SCOPE_INVALID")
        self._cas = cas
        self._tenant_id = tenant_id
        self._journal_subject = journal_subject
        self._key = bytes(key)
        self._aad = bytes(aad) + b"|" + tenant_id.encode("utf-8") + b"|" + journal_subject.encode("utf-8")

    def protect(self, context: Mapping[str, Any]) -> Mapping[str, Any]:
        try:
            plaintext = canonical_json(dict(context)).encode("utf-8")
        except (TypeError, ValueError) as error:
            raise InvariantViolation("WORKFLOW_JOURNAL_CONTEXT_NOT_JSON") from error
        nonce = secrets.token_bytes(12)
        ciphertext = AESGCM(self._key).encrypt(nonce, plaintext, self._aad)
        cas_path = self._cas.put(self._tenant_id, ciphertext)
        return {
            "protected": True,
            "storage": "TENANT_SCOPED_CAS",
            "cipher_alg": "AES-256-GCM",
            "nonce": b64(nonce),
            "cas_path": cas_path,
        }

    def restore(self, stored: Mapping[str, Any]) -> dict[str, Any]:
        if stored.get("protected") is not True or stored.get("storage") != "TENANT_SCOPED_CAS" or stored.get("cipher_alg") != "AES-256-GCM":
            raise InvariantViolation("WORKFLOW_JOURNAL_PROTECTION_REQUIRED")
        try:
            cas_path = stored["cas_path"]
            ciphertext = self._cas.read(self._tenant_id, cas_path)
            if sha256_bytes(ciphertext) != cas_path.get("hash"):
                raise InvariantViolation("WORKFLOW_JOURNAL_CAS_HASH_MISMATCH")
            plaintext = AESGCM(self._key).decrypt(unb64(stored["nonce"]), ciphertext, self._aad)
            value = json.loads(plaintext.decode("utf-8"))
        except InvariantViolation:
            raise
        except Exception as error:
            raise InvariantViolation("WORKFLOW_JOURNAL_CONTEXT_DECRYPT_FAILED") from error
        if not isinstance(value, dict):
            raise InvariantViolation("WORKFLOW_JOURNAL_CONTEXT_INVALID")
        return value
