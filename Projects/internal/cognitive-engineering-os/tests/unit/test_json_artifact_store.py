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

    def test_delete_requires_verified_reference_and_removes_owned_object(self):
        reference = self.store.put("tenant-a", "Transcript", {"text": "erase me"})
        deleted_path = Path(self.store.delete("tenant-a", reference))
        self.assertFalse(deleted_path.exists())
        with self.assertRaisesRegex(InvariantViolation, "CAS_TENANT_ACCESS_DENIED"):
            self.store.delete("tenant-a", reference)

    def test_invalid_type_and_tenant_path_fail_closed(self):
        with self.assertRaisesRegex(InvariantViolation, "JSON_ARTIFACT_TYPE_INVALID"):
            self.store.put("tenant-a", "../transcript", {})
        with self.assertRaisesRegex(InvariantViolation, "CAS_TENANT_ID_INVALID"):
            self.store.cas.put("../tenant-a", b"secret")

    def test_mime_shaped_artifact_type_is_accepted(self):
        # regression: artifact.generate_chart's "image/png" raised JSON_ARTIFACT_TYPE_INVALID
        # against the pre-2026-09-18 regex, which never allowed a "/" -- the first binary-media
        # capability this store had to hold. The stored bytes are unaffected either way (a base64
        # image string is just JSON text like any other artifact field); only the type label
        # needed the "/subtype" grammar added.
        reference = self.store.put("tenant-a", "image/png", {"artifact_type": "image/png", "content": "aGVsbG8="})
        self.assertEqual(reference["artifact_type"], "image/png")
        self.assertEqual(self.store.read("tenant-a", reference), {"artifact_type": "image/png", "content": "aGVsbG8="})

    def test_type_with_more_than_one_slash_is_rejected(self):
        with self.assertRaisesRegex(InvariantViolation, "JSON_ARTIFACT_TYPE_INVALID"):
            self.store.put("tenant-a", "image/png/extra", {})

    def test_type_with_trailing_slash_and_no_subtype_is_rejected(self):
        with self.assertRaisesRegex(InvariantViolation, "JSON_ARTIFACT_TYPE_INVALID"):
            self.store.put("tenant-a", "image/", {})
