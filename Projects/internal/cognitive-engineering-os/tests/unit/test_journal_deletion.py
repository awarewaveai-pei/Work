import tempfile
import unittest
from pathlib import Path

from ai_lego.errors import InvariantViolation
from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.platform.workflow.journal_deletion import delete_journal_object
from ai_lego.platform.workflow.journal_protection import CasJournalContextProtector


def _checks(**overrides):
    values = {"authorization": True, "legal_hold": True, "retention": True, "dependency": True, "dry_run": True, "scope_preview": True, "approval": True}
    values.update(overrides)
    return {key: (lambda value=value: value) for key, value in values.items()}


class JournalDeletionTests(unittest.TestCase):
    def test_all_policy_gates_delete_and_verify_cas_object(self):
        with tempfile.TemporaryDirectory() as directory:
            protector = CasJournalContextProtector(TenantScopedCas(Path(directory) / "cas"), "tenant-a", "run-1", b"k" * 32)
            stored = protector.protect({"outputs": {"one": {"secret": "hidden"}}})
            record = delete_journal_object(
                protector, stored, "DEL-RUN-1", "run-1", "2026-09-14T00:00:00Z", _checks(), now=lambda: "2026-09-14T00:00:01Z"
            )
            self.assertEqual(len(record["steps"]), 10)
            self.assertEqual(record["steps"][1]["step"], "Legal Hold Check")
            self.assertEqual(record["steps"][-1]["step"], "Deletion Evidence")
            SchemaContracts(resolve_spec_root()).validate("ai-lego://specs/execution/data-deletion.schema.yaml#/deletion_request", record, "journal deletion request")

    def test_active_legal_hold_blocks_before_delete(self):
        class Protector:
            def __init__(self):
                self.deleted = False

            def delete(self, _reference):
                self.deleted = True

        protector = Protector()
        with self.assertRaisesRegex(InvariantViolation, "JOURNAL_DELETION_POLICY_BLOCKED: Legal Hold Check"):
            delete_journal_object(protector, {}, "DEL-RUN-2", "run-2", "2026-09-14T00:00:00Z", _checks(legal_hold=False), now=lambda: "2026-09-14T00:00:01Z")
        self.assertFalse(protector.deleted)

    def test_missing_policy_check_is_not_treated_as_approval(self):
        checks = _checks()
        del checks["retention"]
        with self.assertRaisesRegex(InvariantViolation, "JOURNAL_DELETION_CHECKS_MISSING: Retention Check"):
            delete_journal_object(object(), {}, "DEL-RUN-3", "run-3", "2026-09-14T00:00:00Z", checks)
