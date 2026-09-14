"""Source shared-kernel record; raw bytes live only behind a portable artifact URI."""

from __future__ import annotations

import re
from typing import Any, Mapping

from ai_lego.core.domain._intake_validation import DATA_CLASSIFICATIONS, require_text, require_timestamp, require_uuid
from ai_lego.errors import InvariantViolation


_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_ARTIFACT_URI = re.compile(r"^artifact://(?:[a-z][a-z0-9_]*/[A-Za-z0-9_-]+)(?:/[a-z][a-z0-9_]*/[A-Za-z0-9_-]+)*$")
TEXT_MEDIA_TYPES = frozenset({"text/plain", "text/markdown", "text/csv", "application/json"})


def source_record(
    source_id: str,
    project_id: str,
    tenant_id: str,
    title: str,
    media_type: str,
    data_classification: str,
    content_sha256: str,
    size_bytes: int,
    artifact_uri: Mapping[str, Any],
    created_by_identity_id: str,
    created_at: str,
) -> dict[str, Any]:
    """Build metadata for one V1 UTF-8 Source without embedding its content."""
    if media_type not in TEXT_MEDIA_TYPES:
        raise InvariantViolation("SOURCE_MEDIA_TYPE_UNSUPPORTED")
    if data_classification not in DATA_CLASSIFICATIONS:
        raise InvariantViolation("SOURCE_DATA_CLASSIFICATION_INVALID")
    if not isinstance(content_sha256, str) or _SHA256.fullmatch(content_sha256) is None:
        raise InvariantViolation("SOURCE_CONTENT_SHA256_INVALID")
    if not isinstance(size_bytes, int) or isinstance(size_bytes, bool) or size_bytes <= 0:
        raise InvariantViolation("SOURCE_SIZE_BYTES_INVALID")
    if not isinstance(artifact_uri, Mapping) or not isinstance(artifact_uri.get("uri"), str) or _ARTIFACT_URI.fullmatch(artifact_uri["uri"]) is None:
        raise InvariantViolation("SOURCE_ARTIFACT_URI_INVALID")
    segments = artifact_uri.get("segments")
    expected_segments = [
        {"segment_type": kind, "segment_id": identifier}
        for kind, identifier in zip(artifact_uri["uri"].removeprefix("artifact://").split("/")[::2], artifact_uri["uri"].removeprefix("artifact://").split("/")[1::2])
    ]
    if not isinstance(segments, list) or segments != expected_segments:
        raise InvariantViolation("SOURCE_ARTIFACT_URI_SEGMENTS_INVALID")
    canonical_identity = [
        {"segment_type": "tenant", "segment_id": tenant_id},
        {"segment_type": "project", "segment_id": project_id},
        {"segment_type": "source", "segment_id": source_id},
    ]
    if segments != canonical_identity:
        raise InvariantViolation("SOURCE_ARTIFACT_URI_IDENTITY_MISMATCH")
    return {
        "source_id": require_uuid("SOURCE", "source_id", source_id),
        "project_id": require_uuid("SOURCE", "project_id", project_id),
        "tenant_id": require_uuid("SOURCE", "tenant_id", tenant_id),
        "title": require_text("SOURCE", "title", title, maximum=300),
        "media_type": media_type,
        "data_classification": data_classification,
        "content_sha256": content_sha256,
        "size_bytes": size_bytes,
        "artifact_uri": dict(artifact_uri),
        "content_role": "RETRIEVED_SOURCE_DATA",
        "verification_status": "UNVERIFIED",
        "status": "active",
        "version": 1,
        "created_by_identity_id": require_uuid("SOURCE", "created_by_identity_id", created_by_identity_id),
        "created_at": require_timestamp("SOURCE", created_at),
    }
