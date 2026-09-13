import tempfile
import unittest
from pathlib import Path

from ai_lego.data.object.derived_artifact_cache import DerivedArtifactCache
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.errors import InvariantViolation
from ai_lego.modules.knowledge.ingest.cached_transcription import CachedTranscriber


class _Delegate:
    mode = "TEST_TRANSCRIBER"

    def __init__(self):
        self.calls = 0

    def transcribe(self, audio_metadata, declared_speech_text):
        self.calls += 1
        return {**audio_metadata, "transcription_mode": self.mode, "text": declared_speech_text, "segments": []}


class CachedTranscriptionTests(unittest.TestCase):
    def test_second_request_hits_cache_and_does_not_call_delegate(self):
        with tempfile.TemporaryDirectory() as directory:
            delegate = _Delegate()
            cache = DerivedArtifactCache(TenantScopedCas(Path(directory) / "cas"), Path(directory) / "index.sqlite3")
            adapter = CachedTranscriber(delegate, cache, "tenant-a", "fixture-v1")
            metadata = {"audio_path": "C:/private/source.wav", "audio_sha256": "a" * 64, "duration_seconds": 1.0}
            first = adapter.transcribe(metadata, "hello")
            second = adapter.transcribe({**metadata, "audio_path": "D:/another/local/path.wav"}, "different text")
            self.assertEqual(delegate.calls, 1)
            self.assertEqual(first["cache_status"], "MISS_STORED")
            self.assertEqual(second["cache_status"], "HIT")
            self.assertEqual(second["text"], "hello")
            self.assertEqual(second["audio_path"], "D:/another/local/path.wav")

    def test_cached_payload_does_not_persist_local_audio_path(self):
        with tempfile.TemporaryDirectory() as directory:
            delegate = _Delegate()
            cache = DerivedArtifactCache(TenantScopedCas(Path(directory) / "cas"), Path(directory) / "index.sqlite3")
            adapter = CachedTranscriber(delegate, cache, "tenant-a", "fixture-v1")
            metadata = {"audio_path": "C:/private/source.wav", "audio_sha256": "b" * 64}
            adapter.transcribe(metadata, "hello")
            hit = cache.get("tenant-a", "b" * 64, "transcribe", "fixture-v1")
            self.assertNotIn("audio_path", hit["value"])

    def test_missing_audio_hash_fails_closed_before_delegate(self):
        with tempfile.TemporaryDirectory() as directory:
            delegate = _Delegate()
            adapter = CachedTranscriber(delegate, DerivedArtifactCache(TenantScopedCas(Path(directory) / "cas"), Path(directory) / "index.sqlite3"), "tenant-a", "fixture-v1")
            with self.assertRaisesRegex(InvariantViolation, "TRANSCRIPTION_CACHE_SOURCE_HASH_REQUIRED"):
                adapter.transcribe({"audio_path": "source.wav"}, "hello")
            self.assertEqual(delegate.calls, 0)


if __name__ == "__main__":
    unittest.main()
