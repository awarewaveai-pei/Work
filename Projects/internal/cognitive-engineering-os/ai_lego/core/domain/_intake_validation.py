"""Shared validation vocabulary for Project/Source intake records."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from ai_lego.errors import InvariantViolation


DATA_CLASSIFICATIONS = frozenset({"Public", "Internal", "Confidential", "Restricted"})


def require_uuid(prefix: str, field: str, value: str) -> str:
    try:
        UUID(value)
    except (AttributeError, TypeError, ValueError) as error:
        raise InvariantViolation(f"{prefix}_{field.upper()}_INVALID") from error
    return value


def require_text(prefix: str, field: str, value: str, *, maximum: int) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise InvariantViolation(f"{prefix}_{field.upper()}_INVALID")
    return value.strip()


def require_timestamp(prefix: str, value: str) -> str:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (AttributeError, TypeError, ValueError) as error:
        raise InvariantViolation(f"{prefix}_CREATED_AT_INVALID") from error
    if parsed.tzinfo is None:
        raise InvariantViolation(f"{prefix}_CREATED_AT_INVALID")
    return value
