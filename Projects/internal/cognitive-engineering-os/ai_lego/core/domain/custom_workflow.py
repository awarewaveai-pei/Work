"""Custom Workflow record -- a tenant's own self-assembled chain of existing methods.

Distinct from a curated Recipe (``recipes/validated/*.recipe.yaml``, git-reviewed, compiled to a
full workflow IR with declared_source_paths/gates): a Custom Workflow is just an ordered list of
method_ids the tenant picked in the dashboard ("組成工作流" / "自己組裝工作流", operator
2026-09-18). It carries no IR of its own -- each step is run by calling the SAME
``/methods/{id}/invoke`` the single-method workspace already uses, one at a time, from the
dashboard. This file only validates the shape of what gets stored; it does not resolve or
validate that each method_id is a real ACTIVE method (that needs ``MethodCatalog``, a dependency
this ``core/domain`` layer deliberately does not have -- see ``project_record``/``source_record``
for the same separation). Repository table: ``custom_workflows`` (own SQLite file, see
``ai_lego/data/repositories/custom_workflow_repository.py``).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain._intake_validation import require_text, require_timestamp, require_uuid
from ai_lego.errors import InvariantViolation

MAX_METHOD_IDS = 50


def require_method_ids(value: Any) -> list[str]:
    if not isinstance(value, list) or not value:
        raise InvariantViolation("CUSTOM_WORKFLOW_METHOD_IDS_INVALID: must be a non-empty list")
    if len(value) > MAX_METHOD_IDS:
        raise InvariantViolation(f"CUSTOM_WORKFLOW_METHOD_IDS_INVALID: at most {MAX_METHOD_IDS} steps")
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise InvariantViolation("CUSTOM_WORKFLOW_METHOD_IDS_INVALID: every entry must be a non-empty string")
    return list(value)


def custom_workflow_record(
    workflow_id: str,
    tenant_id: str,
    title: str,
    method_ids: list[str],
    created_by_identity_id: str,
    created_at: str,
    updated_at: str,
) -> dict[str, Any]:
    """Build one Custom Workflow record. ``method_ids`` order is the run order the tenant chose."""
    return {
        "workflow_id": require_uuid("CUSTOM_WORKFLOW", "workflow_id", workflow_id),
        "tenant_id": require_uuid("CUSTOM_WORKFLOW", "tenant_id", tenant_id),
        "title": require_text("CUSTOM_WORKFLOW", "title", title, maximum=200),
        "method_ids": require_method_ids(method_ids),
        "created_by_identity_id": require_uuid("CUSTOM_WORKFLOW", "created_by_identity_id", created_by_identity_id),
        "created_at": require_timestamp("CUSTOM_WORKFLOW", created_at, field="created_at"),
        "updated_at": require_timestamp("CUSTOM_WORKFLOW", updated_at, field="updated_at"),
    }
