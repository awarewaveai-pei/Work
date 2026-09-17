"""``ai_lego.core.domain.record_kit`` -- the shared invariant kit's own edge cases (2026-09-17 critic findings)."""

from __future__ import annotations

import unittest

from ai_lego.core.domain import record_kit as rk
from ai_lego.core.domain.provenance import make_provenance
from tests.unit.test_api_main import ApiTestCase


class IsoDateTests(unittest.TestCase):
    def test_only_the_schema_pattern_is_accepted(self):
        self.assertTrue(rk.is_iso_date("2026-09-17"))
        for bad in ("20260917", "2026-W38-3", " 2026-09-17", "2026-09-17 ", "2026-9-17", "2026-13-01", "2026-02-30", None, 20260917):
            with self.subTest(bad=bad):
                self.assertFalse(rk.is_iso_date(bad))


class MembershipTests(unittest.TestCase):
    def test_unhashable_values_are_simply_not_members(self):
        allowed = frozenset({"A", "B"})
        self.assertTrue(rk.is_one_of("A", allowed))
        for bad in (["A"], {"A": 1}, None, 1, True):
            with self.subTest(bad=bad):
                self.assertFalse(rk.is_one_of(bad, allowed))

    def test_entry_problem_turns_a_raising_predicate_into_a_problem_string(self):
        problem = rk.entry_problem({"k": ["x"]}, frozenset({"k"}), frozenset({"k"}), {"k": lambda v: v in {"x"}})
        self.assertIsNotNone(problem)
        self.assertIn("k invalid", problem)


class KitViaApiTests(ApiTestCase):
    def test_unhashable_enum_value_is_a_4xx_invariant_not_a_500(self):
        self._login()
        body = {
            "title": "t",
            "nodes": [{"id": "S", "kind": ["START"], "label": "s"}, {"id": "E", "kind": "END", "label": "e"}],
            "edges": [{"from_ref": "S", "to_ref": "E"}],
            "provenance": make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
        }
        response = self.client.post("/methods/systems.flowchart/invoke", json=body)
        self.assertNotEqual(response.status_code, 500, response.text)
        self.assertIn("FLOW_INVALID_GRAPH", response.text)


if __name__ == "__main__":
    unittest.main()
