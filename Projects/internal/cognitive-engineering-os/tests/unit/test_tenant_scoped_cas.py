import shutil
import tempfile
import unittest
from pathlib import Path

from ai_lego.core.domain.tenant import CASCADIA, NORDBROOK
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.errors import InvariantViolation


class TenantScopedCasTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="ai-lego-cas-"))
        self.cas = TenantScopedCas(self.tmp)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_identical_bytes_share_a_hash_but_not_a_path(self):
        a = self.cas.put(NORDBROOK.tenant_id, b"same bytes")
        b = self.cas.put(CASCADIA.tenant_id, b"same bytes")
        self.assertEqual(a["hash"], b["hash"])
        self.assertNotEqual(a["path"], b["path"])
        self.assertTrue(a["path"].startswith(f"/objects/{NORDBROOK.tenant_id}/sha256/"))
        self.assertEqual(self.cas.read(NORDBROOK.tenant_id, a), b"same bytes")

    def test_cross_tenant_read_list_and_unlink_are_denied(self):
        a = self.cas.put(NORDBROOK.tenant_id, b"tenant a only")
        with self.assertRaisesRegex(InvariantViolation, "CAS_TENANT_ACCESS_DENIED"):
            self.cas.read(CASCADIA.tenant_id, a)
        with self.assertRaisesRegex(InvariantViolation, "CAS_TENANT_ACCESS_DENIED"):
            self.cas.unlink(CASCADIA.tenant_id, a)
        self.assertNotIn(a["path"], self.cas.list_objects(CASCADIA.tenant_id))
        self.assertIn(a["path"], self.cas.list_objects(NORDBROOK.tenant_id))

    def test_forged_tenant_segment_cannot_escape_the_namespace(self):
        a = self.cas.put(NORDBROOK.tenant_id, b"tenant a only")
        forged = {**a, "tenant_segment": CASCADIA.tenant_id}  # claims to be B's while pointing at A's path
        with self.assertRaisesRegex(InvariantViolation, "CAS_TENANT_ACCESS_DENIED"):
            self.cas.read(CASCADIA.tenant_id, forged)
        traversal = {**a, "path": f"/objects/{NORDBROOK.tenant_id}/../{CASCADIA.tenant_id}/x"}
        with self.assertRaisesRegex(InvariantViolation, "CAS_TENANT_ACCESS_DENIED"):
            self.cas.read(NORDBROOK.tenant_id, traversal)

    def test_cas_path_for_predicts_put_without_writing(self):
        content = b"validate before you commit"
        predicted = self.cas.cas_path_for(NORDBROOK.tenant_id, content)
        self.assertEqual(self.cas.list_objects(NORDBROOK.tenant_id), [])
        actual = self.cas.put(NORDBROOK.tenant_id, content)
        self.assertEqual(predicted, actual)

    def test_unlink_removes_the_object_and_is_not_repeatable(self):
        a = self.cas.put(NORDBROOK.tenant_id, b"to be removed")
        target = Path(self.cas.unlink(NORDBROOK.tenant_id, a))
        self.assertFalse(target.exists())
        with self.assertRaisesRegex(InvariantViolation, "CAS_TENANT_ACCESS_DENIED"):
            self.cas.read(NORDBROOK.tenant_id, a)
        with self.assertRaisesRegex(InvariantViolation, "CAS_OBJECT_NOT_FOUND"):
            self.cas.unlink(NORDBROOK.tenant_id, a)


if __name__ == "__main__":
    unittest.main()
