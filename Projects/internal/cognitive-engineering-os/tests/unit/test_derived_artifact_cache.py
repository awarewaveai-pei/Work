import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from ai_lego.data.object.derived_artifact_cache import DerivedArtifactCache
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.errors import InvariantViolation
from tests.pg import PgTestCase, add_tenant, empty_tables


class DerivedArtifactCacheTests(PgTestCase):
    def setUp(self):
        empty_tables(self.databases)   # fixed keys: a fresh index per test, as the temp file was
        for tenant in ("tenant-a", "tenant-b"):
            add_tenant(self.databases, tenant)
    def test_put_and_get_round_trip_is_tenant_scoped_and_canonical(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = DerivedArtifactCache(TenantScopedCas(Path(directory) / "cas"), self.databases)
            source_hash = "a" * 64
            cache.put("tenant-a", source_hash, "transcribe", "fixture-v1", {"b": 2, "a": 1})
            hit = cache.get("tenant-a", source_hash, "transcribe", "fixture-v1")
            self.assertEqual(hit["value"], {"a": 1, "b": 2})
            self.assertIsNone(cache.get("tenant-b", source_hash, "transcribe", "fixture-v1"))

    def test_same_key_replaces_index_without_requiring_duplicate_content(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = DerivedArtifactCache(TenantScopedCas(Path(directory) / "cas"), self.databases)
            key = ("tenant-a", "b" * 64, "transcribe", "fixture-v1")
            cache.put(*key, {"value": 1})
            cache.put(*key, {"value": 2})
            self.assertEqual(cache.get(*key)["value"], {"value": 2})

    def test_expired_entry_is_a_miss_without_deleting_the_cas_object(self):
        now = [datetime(2026, 9, 14, tzinfo=timezone.utc)]
        with tempfile.TemporaryDirectory() as directory:
            cas = TenantScopedCas(Path(directory) / "cas")
            cache = DerivedArtifactCache(cas, self.databases, clock=lambda: now[0])
            source_hash = "c" * 64
            ref = cache.put("tenant-a", source_hash, "transcribe", "fixture-v1", {"text": "cached"}, expires_at="2026-09-15T00:00:00+00:00")
            now[0] = now[0] + timedelta(days=2)
            self.assertIsNone(cache.get("tenant-a", source_hash, "transcribe", "fixture-v1"))
            self.assertTrue(cas.read("tenant-a", ref["cas_path"]))

    def test_tampered_cas_bytes_are_refused_on_read(self):
        with tempfile.TemporaryDirectory() as directory:
            cas = TenantScopedCas(Path(directory) / "cas")
            cache = DerivedArtifactCache(cas, self.databases)
            source_hash = "d" * 64
            ref = cache.put("tenant-a", source_hash, "transcribe", "fixture-v1", {"safe": True})
            target = (Path(directory) / "cas" / Path(ref["cas_path"]["path"].lstrip("/"))).resolve()
            target.write_bytes(b'{"safe":false}')
            with self.assertRaisesRegex(InvariantViolation, "DERIVED_CACHE_ARTIFACT_HASH_MISMATCH"):
                cache.get("tenant-a", source_hash, "transcribe", "fixture-v1")

    def test_invalid_cache_key_is_rejected_before_storage(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = DerivedArtifactCache(TenantScopedCas(Path(directory) / "cas"), self.databases)
            with self.assertRaisesRegex(InvariantViolation, "DERIVED_CACHE_SOURCE_HASH_INVALID"):
                cache.put("tenant-a", "not-a-hash", "transcribe", "fixture-v1", {})


if __name__ == "__main__":
    unittest.main()
