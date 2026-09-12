"""Tests for ``ai_lego.core.domain.workspace.workspace_record``."""

from __future__ import annotations

import unittest

from ai_lego.core.domain.workspace import workspace_record
from ai_lego.errors import InvariantViolation


def _valid(**overrides):
    base = dict(workspace_id="ws-1", tenant_id="ten-1", name="Default", status="active", created_at="2026-09-12T00:00:00Z")
    base.update(overrides)
    return base


class WorkspaceRecordTests(unittest.TestCase):
    def test_valid_record(self):
        record = workspace_record(**_valid())
        self.assertEqual(record["workspace_id"], "ws-1")
        self.assertEqual(record["status"], "active")

    def test_empty_workspace_id_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WORKSPACE_INVALID_ID"):
            workspace_record(**_valid(workspace_id=""))

    def test_empty_tenant_id_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WORKSPACE_INVALID_TENANT_ID"):
            workspace_record(**_valid(tenant_id=""))

    def test_empty_name_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WORKSPACE_INVALID_NAME"):
            workspace_record(**_valid(name="   "))

    def test_invalid_status_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WORKSPACE_INVALID_STATUS"):
            workspace_record(**_valid(status="archived"))

    def test_all_three_valid_statuses_accepted(self):
        for status in ("active", "suspended", "deleted"):
            with self.subTest(status=status):
                record = workspace_record(**_valid(status=status))
                self.assertEqual(record["status"], status)

    def test_builder_does_not_leak_extra_keys(self):
        record = workspace_record(**_valid())
        self.assertEqual(set(record.keys()), {"workspace_id", "tenant_id", "name", "status", "created_at"})


if __name__ == "__main__":
    unittest.main()
