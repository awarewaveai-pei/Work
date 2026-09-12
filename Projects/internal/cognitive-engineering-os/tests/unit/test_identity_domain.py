"""Tests for ``ai_lego.core.domain.identity.identity_record``."""

from __future__ import annotations

import unittest

from ai_lego.core.domain.identity import identity_record
from ai_lego.errors import InvariantViolation


def _valid(**overrides):
    base = dict(identity_id="id-1", tenant_id="ten-1", email="Operator@Example.com", display_name="Operator", status="active", created_at="2026-09-12T00:00:00Z")
    base.update(overrides)
    return base


class IdentityRecordTests(unittest.TestCase):
    def test_valid_record(self):
        record = identity_record(**_valid())
        self.assertEqual(record["identity_id"], "id-1")

    def test_email_is_lowercased(self):
        record = identity_record(**_valid(email="Operator@Example.COM"))
        self.assertEqual(record["email"], "operator@example.com")

    def test_malformed_email_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IDENTITY_INVALID_EMAIL"):
            identity_record(**_valid(email="not-an-email"))

    def test_empty_display_name_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IDENTITY_INVALID_DISPLAY_NAME"):
            identity_record(**_valid(display_name=""))

    def test_invalid_status_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IDENTITY_INVALID_STATUS"):
            identity_record(**_valid(status="pending"))

    def test_builder_does_not_leak_extra_keys(self):
        record = identity_record(**_valid())
        self.assertEqual(set(record.keys()), {"identity_id", "tenant_id", "email", "display_name", "status", "created_at"})

    def test_no_password_field_ever(self):
        """The whole point of splitting credentials into the store layer -- confirm the record
        shape structurally cannot carry one."""
        record = identity_record(**_valid())
        self.assertNotIn("password", record)
        self.assertNotIn("password_hash", record)


if __name__ == "__main__":
    unittest.main()
