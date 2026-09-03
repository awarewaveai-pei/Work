"""Source-media erasure that accompanies a subject's DEK destruction.

Crypto-shredding the derived envelope is not enough when the raw recording
still sits on disk: the recording IS the plaintext. This step removes every
raw copy (fixture file + tenant CAS object) after verifying they are the same
bytes, and scrubs the transcription cache.

Scope is honest: ``PLAIN_UNLINK_SYNTHETIC_SCOPE``. Plain unlink is not
physical media sanitization and this module never claims it is
(``physical_sanitization_claimed: False``). The sequence is also not an
atomic cross-store transaction; a failure after the DEK is gone surfaces as
``SOURCE_AUDIO_ERASURE_PARTIAL`` rather than being swallowed.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ai_lego.core.support import sha256_bytes
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.errors import InvariantViolation

ERASED_MARKER = "[REDACTED_AFTER_SUBJECT_ERASURE]"


def erase_subject_source_media(
    cas: TenantScopedCas,
    tenant_id: str,
    subject_id: str,
    source_records: list[dict[str, Any]],
    transcriptions: list[dict[str, Any]],
    fixture_root: Path,
) -> dict[str, Any]:
    subject_sources = [source for source in source_records if source["subject_id"] == subject_id]
    if not subject_sources:
        raise InvariantViolation("UNKNOWN_SOURCE_AUDIO_SUBJECT")
    fixture_root = fixture_root.resolve()
    planned: list[tuple[Path, dict[str, str], str, str]] = []
    for source in subject_sources:
        audio_path = Path(source["transcription"]["audio_path"]).resolve()
        if fixture_root not in audio_path.parents or not audio_path.is_file():
            raise InvariantViolation("SOURCE_AUDIO_FIXTURE_NOT_FOUND")
        raw_cas_bytes = cas.read(tenant_id, source["cas_path"])
        audio_bytes = audio_path.read_bytes()
        if sha256_bytes(raw_cas_bytes) != sha256_bytes(audio_bytes):
            raise InvariantViolation("SOURCE_AUDIO_CAS_HASH_MISMATCH")
        planned.append((audio_path, source["cas_path"], sha256_bytes(audio_bytes), source["source_id"]))

    erased: list[dict[str, Any]] = []
    try:
        for audio_path, cas_path, digest, source_id in planned:
            cas_target = cas.unlink(tenant_id, cas_path)
            audio_path.unlink()
            if audio_path.exists():
                raise InvariantViolation("SOURCE_AUDIO_FIXTURE_UNLINK_FAILED")
            erased.append(
                {
                    "source_id": source_id,
                    "fixture_path": str(audio_path),
                    "cas_path": cas_path,
                    "cas_target": cas_target,
                    "sha256_before_unlink": digest,
                    "fixture_exists_after": audio_path.exists(),
                    "cas_exists_after": Path(cas_target).exists(),
                }
            )
    except Exception as error:
        raise InvariantViolation(f"SOURCE_AUDIO_ERASURE_PARTIAL: {error}") from error

    transcription_rows = [row for row in transcriptions if row["subject_id"] == subject_id]
    if len(transcription_rows) != len(subject_sources):
        raise InvariantViolation("SOURCE_TRANSCRIPTION_CACHE_MISMATCH")
    for row in transcription_rows:
        row["text"] = ERASED_MARKER
        for segment in row["segments"]:
            segment["text"] = ERASED_MARKER
    return {
        "subject_id": subject_id,
        "method": "PLAIN_UNLINK_SYNTHETIC_SCOPE",
        "physical_sanitization_claimed": False,
        "erased": erased,
        "transcription_cache_records_scrubbed": len(transcription_rows),
    }
