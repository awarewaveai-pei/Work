import shutil
import tempfile
import unittest
from pathlib import Path

from ai_lego.core.domain.tenant import CASCADIA, NORDBROOK
from ai_lego.core.support import DEFAULT_CLOCK, parse_timestamp, read_json
from ai_lego.errors import InvariantViolation
from ai_lego.security.key_vault.local_key_vault import DECRYPT_BLOCKED_PENDING_REPLAY, REDACTED, LocalKeyVault


class KeyVaultTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="ai-lego-vault-"))
        self.vault = LocalKeyVault(self.tmp / "vault.json", DEFAULT_CLOCK, "RUN-TEST")
        self.vault.add_tenant_kek(NORDBROOK.tenant_id)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_unknown_subject_fails_and_duplicate_deletion_is_idempotent(self):
        self.vault.encrypt(NORDBROOK.tenant_id, "P-TEST", "synthetic value", "Restricted")
        with self.assertRaisesRegex(InvariantViolation, "UNKNOWN_DATA_SUBJECT"):
            self.vault.destroy_subject_dek(NORDBROOK.tenant_id, "MISSING", "AUTH", [], 40)
        first = self.vault.destroy_subject_dek(NORDBROOK.tenant_id, "P-TEST", "AUTH", [], 41)
        second = self.vault.destroy_subject_dek(NORDBROOK.tenant_id, "P-TEST", "AUTH", [], 42)
        self.assertIsNotNone(first)
        self.assertIsNone(second)
        self.assertEqual(len(self.vault.destruction_records), 1)

    def test_destruction_really_attempts_every_verification_envelope(self):
        name = self.vault.encrypt(NORDBROOK.tenant_id, "P-TEST", "Synthetic Name", "Restricted")
        city = self.vault.encrypt(NORDBROOK.tenant_id, "P-TEST", "Synthetic City", "Confidential")
        self.assertEqual(self.vault.decrypt_or_redact(NORDBROOK.tenant_id, "P-TEST", name), "Synthetic Name")
        record = self.vault.destroy_subject_dek(NORDBROOK.tenant_id, "P-TEST", "AUTH", [("ref-name", name), ("ref-city", city)], 41)
        self.assertEqual(record["verification"]["attempted_count"], 2)
        self.assertTrue(record["verification"]["all_decrypts_failed"])
        self.assertEqual(self.vault.decrypt_or_redact(NORDBROOK.tenant_id, "P-TEST", name), REDACTED)
        saved = read_json(self.tmp / "vault.json")
        self.assertNotIn(record["key_id"], saved["wrapped_deks"])
        stored = next(item for item in saved["key_records"] if item["key_id"] == record["key_id"])
        self.assertEqual(stored["status"], "DESTROYED")
        self.assertTrue(all(copy_location["destroyed"] for copy_location in stored["physical_copies"]))

    def test_tenant_boundary_and_subject_binding_on_decrypt(self):
        envelope = self.vault.encrypt(NORDBROOK.tenant_id, "P-TEST", "synthetic value", "Restricted")
        with self.assertRaisesRegex(InvariantViolation, "VAULT_TENANT_ACCESS_DENIED"):
            self.vault.decrypt_or_redact(CASCADIA.tenant_id, "P-TEST", envelope)
        with self.assertRaisesRegex(InvariantViolation, "DEK_SUBJECT_BINDING_MISMATCH"):
            self.vault.decrypt_or_redact(NORDBROOK.tenant_id, "P-OTHER", envelope)

    def test_only_confidential_or_restricted_data_enters_an_envelope(self):
        with self.assertRaisesRegex(InvariantViolation, "ENVELOPE_CLASSIFICATION_INVALID"):
            self.vault.encrypt(NORDBROOK.tenant_id, "P-TEST", "public", "Public")

    def test_restore_blocks_decrypt_until_independent_destruction_replay(self):
        envelope = self.vault.encrypt(NORDBROOK.tenant_id, "P-TEST", "synthetic value", "Restricted")
        snapshot_path = self.tmp / "snapshot.json"
        self.vault.create_backup_snapshot(snapshot_path, DEFAULT_CLOCK.at(10))
        destruction = self.vault.destroy_subject_dek(NORDBROOK.tenant_id, "P-TEST", "AUTH", [("ref", envelope)], 20)
        self.assertEqual(len(destruction["destruction_scope"]), 2, "live copy AND the snapshot copy must be in scope")
        live_entry = next(entry for entry in destruction["destruction_scope"] if entry["copy_location"].startswith("local-vault-live"))
        backup_entry = next(entry for entry in destruction["destruction_scope"] if entry["copy_location"].startswith("local-vault-dr-snapshot"))
        self.assertTrue(live_entry["destroyed"])
        self.assertFalse(backup_entry["destroyed"], "the vault cannot reach a WORM backup copy at destruction time; claiming it destroyed would be false")
        restored = LocalKeyVault.restore_from_backup(snapshot_path, self.tmp / "restored.json", DEFAULT_CLOCK, "RUN-TEST", DEFAULT_CLOCK.at(30))
        self.assertEqual(restored.decrypt_or_redact(NORDBROOK.tenant_id, "P-TEST", envelope), DECRYPT_BLOCKED_PENDING_REPLAY)
        replayed = restored.replay_post_snapshot_destruction_records([destruction])
        self.assertEqual(replayed, [destruction["independent_audit_log_ref"]])
        self.assertEqual(restored.restore_event["replay_gate"]["status"], "COMPLETE")
        self.assertTrue(restored.decrypt_serviceable)
        self.assertEqual(restored.decrypt_or_redact(NORDBROOK.tenant_id, "P-TEST", envelope), REDACTED)

    def test_replay_compares_real_instants_not_iso_strings_across_a_fractional_second_boundary(self):
        """A destruction 0.5s after an integer-second snapshot must still be replayed (regression: lexicographic '.' < 'Z')."""
        envelope = self.vault.encrypt(NORDBROOK.tenant_id, "P-TEST", "synthetic value", "Restricted")
        snapshot_path = self.tmp / "snapshot.json"
        self.vault.create_backup_snapshot(snapshot_path, DEFAULT_CLOCK.at(30))  # integer offset -> "...:30Z"
        destruction = self.vault.destroy_subject_dek(NORDBROOK.tenant_id, "P-TEST", "AUTH", [("ref", envelope)], 30.5)  # fractional -> "...:30.500000Z"
        self.assertGreater(parse_timestamp(destruction["destroyed_at"]), parse_timestamp(DEFAULT_CLOCK.at(30)))  # true as an instant
        self.assertLess(destruction["destroyed_at"], DEFAULT_CLOCK.at(30))  # false as a bare string compare -- the exact bug this test guards against
        restored = LocalKeyVault.restore_from_backup(snapshot_path, self.tmp / "restored.json", DEFAULT_CLOCK, "RUN-TEST", DEFAULT_CLOCK.at(31))
        restored.replay_post_snapshot_destruction_records([destruction])
        self.assertEqual(restored.restore_event["replay_gate"]["status"], "COMPLETE")
        self.assertEqual(restored.restore_event["replay_gate"]["records_replayed"], [destruction["independent_audit_log_ref"]])
        self.assertEqual(restored.decrypt_or_redact(NORDBROOK.tenant_id, "P-TEST", envelope), REDACTED)

    def test_envelope_encryption_is_real_not_decorative(self):
        """Only wrapped DEK bytes are ever persisted; decrypt requires the matching wrap, not just any active DEK."""
        envelope = self.vault.encrypt(NORDBROOK.tenant_id, "P-TEST", "synthetic value", "Restricted")
        saved = read_json(self.tmp / "vault.json")
        self.assertIn(envelope["dek_key_id"], saved["wrapped_deks"])
        self.assertNotEqual(saved["wrapped_deks"][envelope["dek_key_id"]], envelope["dek_wrapped"], "each wrap uses a fresh nonce")
        tampered = {**envelope, "kek_ref": "kek:wrong-tenant"}
        with self.assertRaises(Exception):
            self.vault.decrypt_or_redact(NORDBROOK.tenant_id, "P-TEST", tampered)

    def test_restore_with_no_post_snapshot_destructions_serves_plaintext_again(self):
        envelope = self.vault.encrypt(NORDBROOK.tenant_id, "P-TEST", "synthetic value", "Restricted")
        snapshot_path = self.tmp / "snapshot.json"
        self.vault.create_backup_snapshot(snapshot_path, DEFAULT_CLOCK.at(10))
        restored = LocalKeyVault.restore_from_backup(snapshot_path, self.tmp / "restored.json", DEFAULT_CLOCK, "RUN-TEST", DEFAULT_CLOCK.at(30))
        restored.replay_post_snapshot_destruction_records([])
        self.assertEqual(restored.decrypt_or_redact(NORDBROOK.tenant_id, "P-TEST", envelope), "synthetic value")


if __name__ == "__main__":
    unittest.main()
