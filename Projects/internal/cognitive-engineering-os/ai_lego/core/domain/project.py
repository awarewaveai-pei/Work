"""Project shared-kernel record (Master Plan §3; repository table ``platform_projects``)."""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain._intake_validation import DATA_CLASSIFICATIONS, require_text, require_timestamp, require_uuid
from ai_lego.errors import InvariantViolation


def project_record(
    project_id: str,
    tenant_id: str,
    workspace_id: str,
    name: str,
    purpose: str,
    data_classification: str,
    created_by_identity_id: str,
    created_at: str,
) -> dict[str, Any]:
    """Build one immutable-at-creation Project record."""
    if data_classification not in DATA_CLASSIFICATIONS:
        raise InvariantViolation("PROJECT_DATA_CLASSIFICATION_INVALID")
    return {
        "project_id": require_uuid("PROJECT", "project_id", project_id),
        "tenant_id": require_uuid("PROJECT", "tenant_id", tenant_id),
        "workspace_id": require_uuid("PROJECT", "workspace_id", workspace_id),
        "name": require_text("PROJECT", "name", name, maximum=200),
        "purpose": require_text("PROJECT", "purpose", purpose, maximum=4000),
        "data_classification": data_classification,
        "status": "active",
        "version": 1,
        "created_by_identity_id": require_uuid("PROJECT", "created_by_identity_id", created_by_identity_id),
        "created_at": require_timestamp("PROJECT", created_at),
    }
