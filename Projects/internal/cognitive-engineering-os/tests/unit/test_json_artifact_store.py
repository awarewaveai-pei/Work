import tempfile
import unittest
from pathlib import Path

from ai_lego.data.object.json_artifact_store import JsonArtifactStore
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.errors import InvariantViolation


class JsonArtifactStoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = JsonArtifactStore(TenantScopedCas(Path(self.tmp.name)))

    def tearDown(self):
        self.tmp.cleanup()

    def test_put_read_is_canonical_and_tenant_scoped(self):
        reference = self.store.put("tenant-a", "Transcript", {"text": "hello", "segments": []})
        self.assertEqual(self.store.read("tenant-a", reference), {"segments": [], "text": "hello"})
        with self.assertRaisesRegex(InvariantViolation, "JSON_ARTIFACT_TENANT_ACCESS_DENIED"):
            self.store.read("tenant-b", reference)

    def test_tampering_is_detected(self):
        reference = self.store.put("tenant-a", "Transcript", {"text": "hello"})
        reference["content_sha256"] = "0" * 64
        with self.assertRaisesRegex(InvariantViolation, "JSON_ARTIFACT_HASH_MISMATCH"):
            self.store.read("tenant-a", reference)

    def test_invalid_type_and_tenant_path_fail_closed(self):
        with self.assertRaisesRegex(InvariantViolation, "JSON_ARTIFACT_TYPE_INVALID"):
            self.store.put("tenant-a", "../transcript", {})
        with self.assertRaisesRegex(InvariantViolation, "CAS_TENANT_ID_INVALID"):
            self.store.cas.put("../tenant-a", b"secret")
