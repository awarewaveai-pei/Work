"""Stateful transcription adapter built on the tenant-scoped derived cache."""

from __future__ import annotations

from typing import Any

from ai_lego.core.contracts.ports import Transcriber
from ai_lego.data.object.derived_artifact_cache import DerivedArtifactCache
from ai_lego.errors import InvariantViolation


class CachedTranscriber:
    """Cache a delegate's deterministic derivation without persisting local paths."""

    def __init__(self, delegate: Transcriber, cache: DerivedArtifactCache, tenant_id: str, adapter_version: str) -> None:
        self.delegate = delegate
        self.cache = cache
        self.tenant_id = tenant_id
        self.adapter_version = adapter_version
        self.mode = delegate.mode

    def transcribe(self, audio_metadata: dict[str, Any], declared_speech_text: str | None = None) -> dict[str, Any]:
        source_sha256 = audio_metadata.get("audio_sha256")
        if not isinstance(source_sha256, str):
            raise InvariantViolation("TRANSCRIPTION_CACHE_SOURCE_HASH_REQUIRED")
        cached = self.cache.get(self.tenant_id, source_sha256, "transcribe", self.adapter_version)
        if cached is not None:
            return {
                **audio_metadata,
                **cached["value"],
                "cache_status": "HIT",
                "cache_artifact_sha256": cached["artifact_sha256"],
            }

        result = dict(self.delegate.transcribe(audio_metadata, declared_speech_text))
        cache_value = {key: value for key, value in result.items() if key != "audio_path"}
        reference = self.cache.put(self.tenant_id, source_sha256, "transcribe", self.adapter_version, cache_value)
        return {
            **result,
            "cache_status": "MISS_STORED",
            "cache_artifact_sha256": reference["artifact_sha256"],
        }
