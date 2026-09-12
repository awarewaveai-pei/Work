"""Identity -- Domain Model object #25 (Phase 1 Cognitive OS deployment slice).

The record shape is owned by ``specs/domain/identity.schema.yaml``; this module only builds
the FACT record. Credential material (password hash, session tokens) is a store-layer concern
(``ai_lego/platform/identity/store.py``), never a field here -- see that schema's own
``compilation_decisions``.
"""

from __future__ import annotations

import re
from typing import Any

from ai_lego.errors import InvariantViolation

_VALID_STATUSES = frozenset({"active", "suspended", "deleted"})
_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def identity_record(
    identity_id: str,
    tenant_id: str,
    email: str,
    display_name: str,
    status: str,
    created_at: str,
) -> dict[str, Any]:
    """Instance of ``ai-lego://specs/domain/identity.schema.yaml``. Fails closed on any
    malformed field, same discipline ``workspace_record`` establishes."""
    if not isinstance(identity_id, str) or not identity_id.strip():
        raise InvariantViolation(f"IDENTITY_INVALID_ID: identity_id must be a non-empty string, got {identity_id!r}")
    if not isinstance(tenant_id, str) or not tenant_id.strip():
        raise InvariantViolation(f"IDENTITY_INVALID_TENANT_ID: tenant_id must be a non-empty string, got {tenant_id!r}")
    if not isinstance(email, str) or not _EMAIL_PATTERN.match(email):
        raise InvariantViolation(f"IDENTITY_INVALID_EMAIL: email must be a well-formed address, got {email!r}")
    if not isinstance(display_name, str) or not display_name.strip():
        raise InvariantViolation(f"IDENTITY_INVALID_DISPLAY_NAME: display_name must be a non-empty string, got {display_name!r}")
    if status not in _VALID_STATUSES:
        raise InvariantViolation(f"IDENTITY_INVALID_STATUS: status must be one of {sorted(_VALID_STATUSES)}, got {status!r}")
    if not isinstance(created_at, str) or not created_at.strip():
        raise InvariantViolation(f"IDENTITY_INVALID_CREATED_AT: created_at must be a non-empty string, got {created_at!r}")
    return {
        "identity_id": identity_id,
        "tenant_id": tenant_id,
        "email": email.lower(),
        "display_name": display_name,
        "status": status,
        "created_at": created_at,
    }
