"""Workspace -- Domain Model object #24 (Phase 1 Cognitive OS deployment slice).

The record shape is owned by ``specs/domain/workspace.schema.yaml``; this module only builds
instances. Every Workspace belongs to exactly one Tenant (ADR-003 "Tenant 1:N Workspace").
"""

from __future__ import annotations

from typing import Any

from ai_lego.errors import InvariantViolation

_VALID_STATUSES = frozenset({"active", "suspended", "deleted"})


def workspace_record(
    workspace_id: str,
    tenant_id: str,
    name: str,
    status: str,
    created_at: str,
) -> dict[str, Any]:
    """Instance of ``ai-lego://specs/domain/workspace.schema.yaml``. Fails closed on any
    malformed field -- mirrors every Method Atlas builder's own ``_problem()``-refusal
    discipline, even though this is domain/platform code rather than a Method Atlas method."""
    if not isinstance(workspace_id, str) or not workspace_id.strip():
        raise InvariantViolation(f"WORKSPACE_INVALID_ID: workspace_id must be a non-empty string, got {workspace_id!r}")
    if not isinstance(tenant_id, str) or not tenant_id.strip():
        raise InvariantViolation(f"WORKSPACE_INVALID_TENANT_ID: tenant_id must be a non-empty string, got {tenant_id!r}")
    if not isinstance(name, str) or not name.strip():
        raise InvariantViolation(f"WORKSPACE_INVALID_NAME: name must be a non-empty string, got {name!r}")
    if status not in _VALID_STATUSES:
        raise InvariantViolation(f"WORKSPACE_INVALID_STATUS: status must be one of {sorted(_VALID_STATUSES)}, got {status!r}")
    if not isinstance(created_at, str) or not created_at.strip():
        raise InvariantViolation(f"WORKSPACE_INVALID_CREATED_AT: created_at must be a non-empty string, got {created_at!r}")
    return {
        "workspace_id": workspace_id,
        "tenant_id": tenant_id,
        "name": name,
        "status": status,
        "created_at": created_at,
    }
