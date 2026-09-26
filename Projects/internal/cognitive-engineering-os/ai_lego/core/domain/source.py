"""Source shared-kernel record; raw bytes live only behind a portable artifact URI."""

from __future__ import annotations

import json
import re
from typing import Any, Mapping

from ai_lego.core.domain._intake_validation import DATA_CLASSIFICATIONS, require_text, require_timestamp, require_uuid
from ai_lego.errors import InvariantViolation


_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_ARTIFACT_URI = re.compile(r"^artifact://(?:[a-z][a-z0-9_]*/[A-Za-z0-9_-]+)(?:/[a-z][a-z0-9_]*/[A-Za-z0-9_-]+)*$")
_SOURCE_CLASS = re.compile(r"^[a-z][a-z_]{0,39}$")
TEXT_MEDIA_TYPES = frozenset({"text/plain", "text/markdown", "text/csv", "application/json"})
# Everything fetched from the web proves only that someone SAID it (RESEARCH_LINES_MASTER_PLAN I2).
COLLECTED_PROVENANCE = {"epistemic_type": "EVIDENCE", "authorship_state": "SOURCE_QUOTATION", "locked": None}
MAX_RELEVANCE_BYTES = 4096


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
    *,
    doi: str | None = None,
    authors: list[str] | None = None,
    venue: str | None = None,
    published_at: str | None = None,
    canonical_url: str | None = None,
    source_uri: str | None = None,
    fetched_at: str | None = None,
    provenance: Mapping[str, Any] | None = None,
    source_class: str | None = None,
    relevance: Mapping[str, Any] | None = None,
    supersedes_source_id: str | None = None,
) -> dict[str, Any]:
    """Build metadata for one V1 UTF-8 Source without embedding its content.

    ``doi``/``authors``/``venue``/``published_at`` are optional citation metadata for
    imported academic literature Sources; ``None`` (the default) for every other Source,
    kept out of ``required`` in source.schema.yaml. ``canonical_url`` .. ``supersedes_source_id``
    are the collection provenance a collected Source carries (plan §3.4 C1); ``None`` for a
    hand-entered Source.
    """
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
    if doi is not None:
        doi = require_text("SOURCE", "doi", doi, maximum=200)
    if venue is not None:
        venue = require_text("SOURCE", "venue", venue, maximum=300)
    if published_at is not None:
        published_at = require_text("SOURCE", "published_at", published_at, maximum=40)
    if authors is not None:
        if not isinstance(authors, list) or not all(isinstance(author, str) and author.strip() for author in authors):
            raise InvariantViolation("SOURCE_AUTHORS_INVALID")
        authors = [author.strip() for author in authors]
    if canonical_url is not None:
        canonical_url = require_text("SOURCE", "canonical_url", canonical_url, maximum=2048)
    if source_uri is not None:
        source_uri = require_text("SOURCE", "source_uri", source_uri, maximum=2048)
    if fetched_at is not None:
        fetched_at = require_timestamp("SOURCE", fetched_at, "fetched_at")
    if provenance is not None:
        if dict(provenance) != COLLECTED_PROVENANCE:
            raise InvariantViolation("SOURCE_PROVENANCE_INVALID")
        provenance = dict(COLLECTED_PROVENANCE)
    if source_class is not None and (not isinstance(source_class, str) or _SOURCE_CLASS.fullmatch(source_class) is None):
        raise InvariantViolation("SOURCE_CLASS_INVALID")
    if relevance is not None:
        if not isinstance(relevance, Mapping):
            raise InvariantViolation("SOURCE_RELEVANCE_INVALID")
        try:
            encoded = json.dumps(dict(relevance), ensure_ascii=False, sort_keys=True)
        except (TypeError, ValueError) as error:
            raise InvariantViolation("SOURCE_RELEVANCE_INVALID") from error
        if len(encoded.encode("utf-8")) > MAX_RELEVANCE_BYTES:
            raise InvariantViolation("SOURCE_RELEVANCE_INVALID")
        relevance = json.loads(encoded)
    if supersedes_source_id is not None:
        supersedes_source_id = require_uuid("SOURCE", "supersedes_source_id", supersedes_source_id)
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
        "doi": doi,
        "authors": authors,
        "venue": venue,
        "published_at": published_at,
        "canonical_url": canonical_url,
        "source_uri": source_uri,
        "fetched_at": fetched_at,
        "provenance": provenance,
        "source_class": source_class,
        "relevance": relevance,
        "supersedes_source_id": supersedes_source_id,
    }
