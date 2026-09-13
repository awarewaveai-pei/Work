import json
import tempfile
import unittest
from pathlib import Path

from ai_lego.errors import InvariantViolation
from ai_lego.platform.workflow.executor import execute_workflow_ir
from ai_lego.platform.workflow.journal_protection import AesGcmJournalContextProtector


class JournalProtectionTests(unittest.TestCase):
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

