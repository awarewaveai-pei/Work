import json
import tempfile
import unittest
from pathlib import Path

from ai_lego.errors import InvariantViolation
from ai_lego.platform.workflow.executor import execute_workflow_ir
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.platform.workflow.journal_protection import AesGcmJournalContextProtector, CasJournalContextProtector, LocalDevJournalKeyProvider


class JournalProtectionTests(unittest.TestCase):
    def test_local_dev_key_provider_requires_explicit_mode_and_valid_256_bit_key(self):
        settings = {"COGNITIVE_OS_JOURNAL_KEY_MODE": "local-dev", "COGNITIVE_OS_JOURNAL_KEY_B64": "a2" * 22}
        with self.assertRaisesRegex(InvariantViolation, "WORKFLOW_JOURNAL_KEY_INVALID"):
            LocalDevJournalKeyProvider(settings).key_for("tenant-a", "journal")
        settings["COGNITIVE_OS_JOURNAL_KEY_B64"] = "az" * 22
        with self.assertRaisesRegex(InvariantViolation, "WORKFLOW_JOURNAL_KEY_INVALID"):
            LocalDevJournalKeyProvider(settings).key_for("tenant-a", "journal")

    def test_key_provider_does_not_return_a_key_when_mode_is_not_local_dev(self):
        with self.assertRaisesRegex(InvariantViolation, "WORKFLOW_JOURNAL_KEY_MODE_UNSUPPORTED"):
            LocalDevJournalKeyProvider({"COGNITIVE_OS_JOURNAL_KEY_MODE": "disabled"}).key_for("tenant-a", "journal")

    def test_aes_gcm_protects_context_and_round_trips(self):
        protector = AesGcmJournalContextProtector(b"k" * 32)
        stored = protector.protect({"outputs": {"one": {"secret": "never plaintext"}}})
        self.assertTrue(stored["protected"])
        self.assertNotIn("never plaintext", json.dumps(stored))
        self.assertEqual(protector.restore(stored), {"outputs": {"one": {"secret": "never plaintext"}}})

    def test_tampering_or_wrong_key_fails_closed(self):
        protector = AesGcmJournalContextProtector(b"k" * 32)
        stored = dict(protector.protect({"outputs": {"one": 1}}))
        stored["ciphertext"] = stored["ciphertext"][:-2] + "AA"
        with self.assertRaisesRegex(InvariantViolation, "WORKFLOW_JOURNAL_CONTEXT_DECRYPT_FAILED"):
            protector.restore(stored)

    def test_executor_encrypted_journal_requires_same_protector_on_resume(self):
        ir = {"id": "encrypted-v1", "nodes": [{"node_kind": "method", "method_id": "one.step", "label": "one"}]}
        protector = AesGcmJournalContextProtector(b"k" * 32)
        with tempfile.TemporaryDirectory() as directory:
            journal = Path(directory) / "run.json"
            first = execute_workflow_ir(ir, {}, {"one.step": lambda *_: {"secret": "hidden"}}, journal_path=journal, journal_context_protector=protector)
            self.assertEqual(first.status, "SUCCEEDED")
            self.assertNotIn("hidden", journal.read_text(encoding="utf-8"))
            with self.assertRaisesRegex(InvariantViolation, "WORKFLOW_JOURNAL_PROTECTION_REQUIRED"):
                execute_workflow_ir(ir, {}, {"one.step": lambda *_: {}}, journal_path=journal, resume=True)
            resumed = execute_workflow_ir(ir, {}, {"one.step": lambda *_: {}}, journal_path=journal, resume=True, journal_context_protector=protector)
            self.assertEqual(resumed.status, "SUCCEEDED")

    def test_cas_protector_keeps_ciphertext_out_of_journal_and_enforces_tenant_scope(self):
        with tempfile.TemporaryDirectory() as directory:
            cas = TenantScopedCas(Path(directory) / "cas")
            protector = CasJournalContextProtector(cas, "tenant-a", "run-1", b"k" * 32)
            stored = protector.protect({"outputs": {"one": {"secret": "hidden"}}})
            serialized = json.dumps(stored)
            self.assertNotIn("hidden", serialized)
            self.assertIn("TENANT_SCOPED_CAS", serialized)
            self.assertEqual(protector.restore(stored), {"outputs": {"one": {"secret": "hidden"}}})
            foreign = CasJournalContextProtector(cas, "tenant-b", "run-1", b"k" * 32)
            with self.assertRaisesRegex(InvariantViolation, "CAS_TENANT_ACCESS_DENIED"):
                foreign.restore(stored)
            protector.delete(stored)
            with self.assertRaisesRegex(InvariantViolation, "CAS_TENANT_ACCESS_DENIED"):
                protector.restore(stored)

    def test_cas_delete_refuses_same_tenant_reference_tampering(self):
        with tempfile.TemporaryDirectory() as directory:
            cas = TenantScopedCas(Path(directory) / "cas")
            protector = CasJournalContextProtector(cas, "tenant-a", "run-1", b"k" * 32)
            first = protector.protect({"outputs": {"id": "first"}})
            second = protector.protect({"outputs": {"id": "second"}})
            tampered = dict(first)
            tampered["cas_path"] = second["cas_path"]
            with self.assertRaisesRegex(InvariantViolation, "WORKFLOW_JOURNAL_CONTEXT_DECRYPT_FAILED"):
                protector.delete(tampered)
            self.assertEqual(protector.restore(second), {"outputs": {"id": "second"}})
