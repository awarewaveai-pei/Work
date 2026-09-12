"""Regression test for the authenticate() timing side-channel a critic pass found 2026-09-12
(nonexistent-email path returned near-instantly while wrong-password-for-a-real-identity took a
full PBKDF2 hash, ~182ms gap -- trivially distinguishable over a network, enabling email/tenant
enumeration). This test MEASURES wall-clock time (matching the critic's own verification method),
not just the return value shape -- a test asserting only ``is None`` for both paths would have
passed both before and after the fix and caught nothing.

PBKDF2_ITERATIONS is real (600,000) so each call is genuinely slow (~150-250ms depending on
hardware) -- keep sample counts modest to keep this test's own runtime reasonable while still
being statistically meaningful.
"""

from __future__ import annotations

import statistics
import tempfile
import time
import unittest
import uuid
from pathlib import Path

from ai_lego.platform.identity.store import IdentityStore

SAMPLES = 8
# Generous tolerance -- this is a regression guard against a ~730x/182ms gap, not a precise
# cryptographic timing-attack benchmark. Anything under 3x mean ratio or under 60ms absolute
# difference is nowhere near the magnitude the original vulnerability had.
MAX_ACCEPTABLE_RATIO = 3.0
MAX_ACCEPTABLE_ABSOLUTE_DELTA_SECONDS = 0.06


class AuthenticateTimingTests(unittest.TestCase):
    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory()
        self.store = IdentityStore(Path(self._tmpdir.name) / "identity.sqlite3")
        self.tenant_id = str(uuid.uuid4())
        self.store.create_tenant(
            tenant_id=self.tenant_id,
            legal_name="Timing Test Tenant",
            home_jurisdiction="jurisdiction-pack.tw.v1",
            data_residency_region="local-dev",
            encryption_root_key_ref="test-kek-ref",
        )
        self.store.create_identity(str(uuid.uuid4()), self.tenant_id, "real@example.com", "Real User", "correct-horse-battery")

    def tearDown(self):
        self._tmpdir.cleanup()

    def _time_calls(self, email: str, password: str) -> list[float]:
        durations = []
        for _ in range(SAMPLES):
            start = time.perf_counter()
            result = self.store.authenticate(self.tenant_id, email, password)
            durations.append(time.perf_counter() - start)
            self.assertIsNone(result)  # every call in this test is a deliberate failure case
        return durations

    def test_nonexistent_email_and_wrong_password_take_comparable_time(self):
        nonexistent_email_durations = self._time_calls("nobody@example.com", "irrelevant-password-1")
        wrong_password_durations = self._time_calls("real@example.com", "wrong-password-here-2")

        mean_nonexistent = statistics.mean(nonexistent_email_durations)
        mean_wrong_password = statistics.mean(wrong_password_durations)
        ratio = max(mean_nonexistent, mean_wrong_password) / min(mean_nonexistent, mean_wrong_password)
        absolute_delta = abs(mean_nonexistent - mean_wrong_password)

        self.assertLess(
            ratio,
            MAX_ACCEPTABLE_RATIO,
            f"nonexistent-email mean={mean_nonexistent:.4f}s vs wrong-password mean={mean_wrong_password:.4f}s "
            f"-- ratio {ratio:.1f}x exceeds {MAX_ACCEPTABLE_RATIO}x, timing side-channel may have regressed",
        )
        self.assertLess(
            absolute_delta,
            MAX_ACCEPTABLE_ABSOLUTE_DELTA_SECONDS,
            f"absolute delta {absolute_delta:.4f}s exceeds {MAX_ACCEPTABLE_ABSOLUTE_DELTA_SECONDS}s tolerance",
        )

    def test_suspended_identity_and_wrong_password_take_comparable_time(self):
        with self.store._connect() as conn:  # noqa: SLF001
            row = conn.execute("SELECT identity_id FROM identity WHERE email = ?", ("real@example.com",)).fetchone()
            second_id = str(uuid.uuid4())
            conn.execute(
                "INSERT INTO identity (identity_id, tenant_id, email, display_name, status, created_at) SELECT ?, tenant_id, 'suspended@example.com', display_name, 'suspended', created_at FROM identity WHERE identity_id = ?",
                (second_id, row["identity_id"]),
            )

        suspended_durations = self._time_calls("suspended@example.com", "irrelevant-password-3")
        wrong_password_durations = self._time_calls("real@example.com", "wrong-password-here-4")

        mean_suspended = statistics.mean(suspended_durations)
        mean_wrong_password = statistics.mean(wrong_password_durations)
        ratio = max(mean_suspended, mean_wrong_password) / min(mean_suspended, mean_wrong_password)

        self.assertLess(
            ratio,
            MAX_ACCEPTABLE_RATIO,
            f"suspended-identity mean={mean_suspended:.4f}s vs wrong-password mean={mean_wrong_password:.4f}s -- ratio {ratio:.1f}x too high",
        )


if __name__ == "__main__":
    unittest.main()
