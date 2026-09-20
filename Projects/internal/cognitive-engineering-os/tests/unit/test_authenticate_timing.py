"""Regression test for the authenticate() timing side-channel a critic pass found 2026-09-12
(nonexistent-email path returned near-instantly while wrong-password-for-a-real-identity took a
full PBKDF2 hash, ~182ms gap -- trivially distinguishable over a network, enabling email/tenant
enumeration). This test MEASURES wall-clock time (matching the critic's own verification method
and the attacker's own instrument), not just the return value shape -- a test asserting only
``is None`` for both paths would have passed both before and after the fix and caught nothing.

Sampling method matters as much as the thresholds (2026-09-20). The first version timed all
samples of one path and then all samples of the other; on a laptop with heterogeneous cores that
puts every bit of frequency/scheduling drift between the two batches straight into the result,
and it failed at 3.9x while the code was provably correct (counting PBKDF2 calls, not timing
them, showed all three paths doing exactly one hash at the same iteration count). So:

* the two paths are sampled **interleaved and order-balanced** (A,B then B,A), so drift and any
  second-call cache advantage hit both paths equally instead of one of them;
* the statistic is the **median**, which a single GC pause or preemption cannot move;
* one warm-up call per path is discarded (first call also pays sqlite open + page cache).

The thresholds below are deliberately unchanged from the version that caught the original bug --
widening them to make a red test go green would silence the detector, which is the failure mode
this file exists to prevent.

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

PAIRS = 12
# Generous tolerance -- this is a regression guard against a ~730x/182ms gap, not a precise
# cryptographic timing-attack benchmark. Anything under 3x median ratio or under 60ms absolute
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

    def _time_one(self, email: str, password: str) -> float:
        start = time.perf_counter()
        result = self.store.authenticate(self.tenant_id, email, password)
        elapsed = time.perf_counter() - start
        self.assertIsNone(result)  # every call in this test is a deliberate failure case
        return elapsed

    def _interleaved(self, left: tuple[str, str], right: tuple[str, str]) -> tuple[list[float], list[float]]:
        """Alternating samples of the two failure paths, swapping which goes first each pair."""
        self._time_one(*left)
        self._time_one(*right)
        left_durations: list[float] = []
        right_durations: list[float] = []
        for index in range(PAIRS):
            if index % 2 == 0:
                left_durations.append(self._time_one(*left))
                right_durations.append(self._time_one(*right))
            else:
                right_durations.append(self._time_one(*right))
                left_durations.append(self._time_one(*left))
        return left_durations, right_durations

    def _assert_comparable(self, label: str, first: list[float], second: list[float], check_absolute: bool) -> None:
        median_first = statistics.median(first)
        median_second = statistics.median(second)
        ratio = max(median_first, median_second) / min(median_first, median_second)
        detail = f"{label} median={median_first:.4f}s vs wrong-password median={median_second:.4f}s"
        self.assertLess(
            ratio,
            MAX_ACCEPTABLE_RATIO,
            f"{detail} -- ratio {ratio:.1f}x exceeds {MAX_ACCEPTABLE_RATIO}x, timing side-channel may have regressed",
        )
        if check_absolute:
            absolute_delta = abs(median_first - median_second)
            self.assertLess(
                absolute_delta,
                MAX_ACCEPTABLE_ABSOLUTE_DELTA_SECONDS,
                f"{detail} -- absolute delta {absolute_delta:.4f}s exceeds {MAX_ACCEPTABLE_ABSOLUTE_DELTA_SECONDS}s tolerance",
            )

    def test_nonexistent_email_and_wrong_password_take_comparable_time(self):
        nonexistent, wrong_password = self._interleaved(
            ("nobody@example.com", "irrelevant-password-1"),
            ("real@example.com", "wrong-password-here-2"),
        )
        self._assert_comparable("nonexistent-email", nonexistent, wrong_password, check_absolute=True)

    def test_suspended_identity_and_wrong_password_take_comparable_time(self):
        with self.store._connect() as conn:  # noqa: SLF001
            row = conn.execute("SELECT identity_id FROM identity WHERE email = ?", ("real@example.com",)).fetchone()
            second_id = str(uuid.uuid4())
            conn.execute(
                "INSERT INTO identity (identity_id, tenant_id, email, display_name, status, created_at) SELECT ?, tenant_id, 'suspended@example.com', display_name, 'suspended', created_at FROM identity WHERE identity_id = ?",
                (second_id, row["identity_id"]),
            )

        suspended, wrong_password = self._interleaved(
            ("suspended@example.com", "irrelevant-password-3"),
            ("real@example.com", "wrong-password-here-4"),
        )
        self._assert_comparable("suspended-identity", suspended, wrong_password, check_absolute=False)


if __name__ == "__main__":
    unittest.main()
