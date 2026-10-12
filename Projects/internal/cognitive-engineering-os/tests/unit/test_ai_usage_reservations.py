"""The AI budget is a database fact (ai_usage rows), never process memory: a paid call's worst case is reserved in the
same transaction that checks the budget, under the tenant's ai-usage lock, and it keeps counting until the call's real
cost replaces it -- through a restart, across processes, and when the settle itself fails (Codex 2026-09-28 rounds 7-8)."""

from __future__ import annotations

import threading
import unittest

from ai_lego.data.db import Databases
from ai_lego.platform.ai_gateway.provider import fits_budget
from ai_lego.platform.identity.store import IdentityStore
from ai_lego.errors import InvariantViolation
from tests.pg import PgTestCase, add_tenant, empty_tables
from tests.unit.thread_testkit import HANG_GUARD_S, join_all

SINCE = "2000-01-01T00:00:00Z"


class AiUsageReservationTests(PgTestCase):
    def setUp(self):
        empty_tables(self.databases)   # the totals below are the tenant's whole history: a fresh database per test
        add_tenant(self.databases, "T1")
        self.store = IdentityStore(self.databases)

    def _process(self) -> Databases:
        """Pools of their own on the same database: what another process, or the next one after a restart, has."""
        databases = Databases({self.REGION: self.url})
        self.addCleanup(databases.close)
        return databases

    def reserve(self, store: IdentityStore, tokens: int, budget: int, run_id: str | None = None) -> int | None:
        return store.reserve_ai_usage("T1", "I1", "interpret:x", "m", tokens, 0, since=SINCE, fits=lambda used: fits_budget(used, tokens, budget), run_id=run_id)[0]

    def reserve_for(self, store: IdentityStore, identity: str, tokens: int, person_budget: int, tenant_budget: int):
        return store.reserve_ai_usage_for("T1", identity, "interpret:x", "m", tokens, 0, since=SINCE, person_fits=lambda used: fits_budget(used, tokens, person_budget),
                                          tenant_fits=lambda used: fits_budget(used, tokens, tenant_budget))

    def test_a_person_is_held_to_their_share_inside_the_tenants_ceiling_and_the_refusal_names_whose(self):
        """2026-10-12: one budget per tenant let one class spend everyone's day. Both numbers are read and the row written in one transaction."""
        first = self.reserve_for(self.store, "I1", 900, person_budget=1000, tenant_budget=1500)
        self.assertEqual((first.refused_by, first.person_used, first.tenant_used), (None, 0, 0))
        over = self.reserve_for(self.store, "I1", 200, person_budget=1000, tenant_budget=1500)   # 900 + 200 > their 1000
        self.assertEqual((over.usage_id, over.refused_by, over.person_used, over.tenant_used), (None, "person", 900, 900))
        other = self.reserve_for(self.store, "I2", 200, person_budget=1000, tenant_budget=1500)   # another person: their own share is empty
        self.assertEqual((other.refused_by, other.person_used, other.tenant_used), (None, 0, 900))
        capped = self.reserve_for(self.store, "I2", 500, person_budget=1000, tenant_budget=1500)   # theirs would fit; the space's 900 + 200 + 500 does not
        self.assertEqual((capped.usage_id, capped.refused_by, capped.person_used, capped.tenant_used), (None, "tenant", 200, 1100))
        both = self.reserve_for(self.store, "I1", 900, person_budget=1000, tenant_budget=1500)   # over both: it is theirs first
        self.assertEqual(both.refused_by, "person")
        self.assertEqual(self.store.ai_usage_totals("T1", since=SINCE)["calls"], 2)   # a refusal writes nothing
        self.assertEqual(self.store.ai_usage_totals("T1", since=SINCE, identity_id="I1")["reserved"], 900)
        self.assertEqual(self.store.ai_usage_totals("T1", since=SINCE, identity_id="I2")["reserved"], 200)

    def test_one_person_racing_themselves_still_passes_the_share_check_once(self):
        stores = [IdentityStore(self._process()), IdentityStore(self._process())]
        start, ids = threading.Barrier(2), []

        def race(store: IdentityStore) -> None:
            start.wait(HANG_GUARD_S)
            ids.append(self.reserve_for(store, "I1", 600, person_budget=1000, tenant_budget=10**9).usage_id)

        threads = [threading.Thread(target=race, args=(store,)) for store in stores]
        for thread in threads:
            thread.start()
        join_all(self, *threads)
        self.assertEqual(sorted(ids, key=lambda value: value is None)[1:], [None])
        self.assertEqual(self.store.ai_usage_totals("T1", since=SINCE, identity_id="I1")["reserved"], 600)

    def test_the_apis_paid_calls_all_reserve_through_both_limits(self):
        """The tenant-only reservation is the store's old door; the API must never use it (a call through it would skip the person's share)."""
        import ast
        from pathlib import Path

        api = Path(__file__).resolve().parents[2] / "ai_lego" / "apps" / "api"
        calls = [f"{path.name}:{node.lineno}" for path in sorted(api.rglob("*.py")) for node in ast.walk(ast.parse(path.read_text(encoding="utf-8")))
                 if isinstance(node, ast.Call) and getattr(node.func, "attr", "") == "reserve_ai_usage"]
        self.assertEqual(calls, [])
        self.assertTrue(any(getattr(node.func, "attr", "") == "reserve_ai_usage_for" for node in ast.walk(ast.parse((api / "main.py").read_text(encoding="utf-8"))) if isinstance(node, ast.Call)))

    def test_a_reservation_keeps_counting_after_a_restart_until_it_is_settled(self):
        usage_id = self.reserve(self.store, 900, 1000)
        restarted = IdentityStore(self._process())   # the process that made it died; a new one opens the same database
        self.assertEqual(restarted.ai_usage_totals("T1", since=SINCE)["reserved"], 900)
        self.assertIsNone(self.reserve(restarted, 200, 1000))   # 900 in flight + 200 does not fit 1000
        restarted.settle_ai_usage("T1", usage_id, "m", 30, 20)
        self.assertEqual(restarted.ai_usage_totals("T1", since=SINCE), {"calls": 1, "input_tokens": 30, "output_tokens": 20, "reserved": 0})
        with self.assertRaisesRegex(InvariantViolation, "AI_USAGE_NOT_RESERVED"):
            restarted.settle_ai_usage("T1", usage_id, "m", 1, 1)   # a row is settled once

    def test_two_processes_cannot_both_pass_a_check_only_one_fits(self):
        stores = [IdentityStore(self._process()), IdentityStore(self._process())]   # two pools, as two workers would have
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

    def test_the_estimate_reads_whole_settled_runs_not_single_calls(self):
        for run, calls in (("R1", [(10, 5), (12, 6)]), ("R2", [(20, 8)])):   # R1 was asked twice (a retry)
            for input_tokens, output_tokens in calls:
                usage_id = self.reserve(self.store, 1, 10**9, run_id=run)
                self.store.settle_ai_usage("T1", usage_id, f"model-{run}", input_tokens, output_tokens)
        self.reserve(self.store, 999, 10**9, run_id="R3")   # still in flight: not an estimate yet
        self.assertEqual(self.store.ai_usage_recent("T1", "interpret:x"), [
            {"input_tokens": 20, "output_tokens": 8, "model": "model-R2"}, {"input_tokens": 22, "output_tokens": 11, "model": "model-R1"}])

    def test_the_budget_rule(self):
        self.assertTrue(fits_budget(0, 1000, 1000))
        self.assertFalse(fits_budget(0, 1001, 1000))    # the call's own worst case must fit
        self.assertFalse(fits_budget(1000, 0, 1000))    # a spent budget refuses even a free check


if __name__ == "__main__":
    unittest.main()
