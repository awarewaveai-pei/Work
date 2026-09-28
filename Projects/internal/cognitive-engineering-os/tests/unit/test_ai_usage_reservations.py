"""The AI budget is a database fact (ai_usage rows), never process memory: a paid call's worst case is reserved in the
same IMMEDIATE transaction that checks the budget, and it keeps counting until the call's real cost replaces it --
through a restart, across processes, and when the settle itself fails (Codex 2026-09-28 rounds 7-8)."""

from __future__ import annotations

import sqlite3
from contextlib import closing
import tempfile
import threading
import unittest
from pathlib import Path

from ai_lego.platform.ai_gateway.provider import fits_budget
from ai_lego.platform.identity.store import IdentityStore
from ai_lego.errors import InvariantViolation
from tests.unit.thread_testkit import HANG_GUARD_S, join_all

SINCE = "2000-01-01T00:00:00Z"


class AiUsageReservationTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.path = Path(self._tmp.name) / "identity.sqlite3"
        self.store = IdentityStore(self.path)

    def tearDown(self):
        self._tmp.cleanup()

    def reserve(self, store: IdentityStore, tokens: int, budget: int, run_id: str | None = None) -> int | None:
        return store.reserve_ai_usage("T1", "I1", "interpret:x", "m", tokens, 0, since=SINCE, fits=lambda used: fits_budget(used, tokens, budget), run_id=run_id)[0]

    def test_a_reservation_keeps_counting_after_a_restart_until_it_is_settled(self):
        usage_id = self.reserve(self.store, 900, 1000)
        restarted = IdentityStore(self.path)   # the process that made it died; a new one opens the same file
        self.assertEqual(restarted.ai_usage_totals("T1", since=SINCE)["reserved"], 900)
        self.assertIsNone(self.reserve(restarted, 200, 1000))   # 900 in flight + 200 does not fit 1000
        restarted.settle_ai_usage(usage_id, "m", 30, 20)
        self.assertEqual(restarted.ai_usage_totals("T1", since=SINCE), {"calls": 1, "input_tokens": 30, "output_tokens": 20, "reserved": 0})
        with self.assertRaisesRegex(InvariantViolation, "AI_USAGE_NOT_RESERVED"):
            restarted.settle_ai_usage(usage_id, "m", 1, 1)   # a row is settled once

    def test_two_processes_cannot_both_pass_a_check_only_one_fits(self):
        stores = [IdentityStore(self.path), IdentityStore(self.path)]   # two connections, as two workers would have
        start, ids = threading.Barrier(2), []
        def race(store: IdentityStore) -> None:
            start.wait(HANG_GUARD_S)
            ids.append(self.reserve(store, 600, 1000))
        threads = [threading.Thread(target=race, args=(store,)) for store in stores]
        for thread in threads:
            thread.start()
        join_all(self, *threads)
        self.assertEqual(sorted(ids, key=lambda value: value is None)[1:], [None])   # exactly one reserved
        self.assertEqual(self.store.ai_usage_totals("T1", since=SINCE)["reserved"], 600)

    def test_an_older_file_gains_the_columns_and_its_rows_count_as_settled(self):
        old = Path(self._tmp.name) / "old.sqlite3"
        with closing(sqlite3.connect(old)) as conn, conn:   # closed too: Windows keeps an open file locked
            conn.execute("CREATE TABLE ai_usage (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, identity_id TEXT NOT NULL, purpose TEXT NOT NULL, model TEXT NOT NULL, input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL, used_at TEXT NOT NULL)")
            conn.execute("INSERT INTO ai_usage (tenant_id, identity_id, purpose, model, input_tokens, output_tokens, used_at) VALUES ('T1','I1','draft:x','m',7,3,'2026-09-01T00:00:00Z')")
        opened = IdentityStore(old)
        self.assertEqual(opened.ai_usage_totals("T1"), {"calls": 1, "input_tokens": 7, "output_tokens": 3, "reserved": 0})
        self.assertEqual(opened.ai_usage_recent("T1", "draft:x"), [{"input_tokens": 7, "output_tokens": 3, "model": "m"}])

    def test_the_estimate_reads_whole_settled_runs_not_single_calls(self):
        for run, calls in (("R1", [(10, 5), (12, 6)]), ("R2", [(20, 8)])):   # R1 was asked twice (a retry)
            for input_tokens, output_tokens in calls:
                usage_id = self.reserve(self.store, 1, 10**9, run_id=run)
                self.store.settle_ai_usage(usage_id, f"model-{run}", input_tokens, output_tokens)
        self.reserve(self.store, 999, 10**9, run_id="R3")   # still in flight: not an estimate yet
        self.assertEqual(self.store.ai_usage_recent("T1", "interpret:x"), [
            {"input_tokens": 20, "output_tokens": 8, "model": "model-R2"}, {"input_tokens": 22, "output_tokens": 11, "model": "model-R1"}])

    def test_the_budget_rule(self):
        self.assertTrue(fits_budget(0, 1000, 1000))
        self.assertFalse(fits_budget(0, 1001, 1000))    # the call's own worst case must fit
        self.assertFalse(fits_budget(1000, 0, 1000))    # a spent budget refuses even a free check


if __name__ == "__main__":
    unittest.main()
