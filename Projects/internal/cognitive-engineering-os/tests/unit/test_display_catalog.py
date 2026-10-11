"""The display catalog (ai_lego/platform/catalog/display_catalog.py): one loader for GET /catalog, the web app and the
mocks. Its tools are exactly the methods GET /methods serves -- an Atlas lens (type: perspective) has display labels
but is not a tool (the regulator lens once made the pages say 285 while 284 could run)."""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.platform.ai_execution.contract_catalog import is_active
from ai_lego.platform.ai_execution.method_resolver import MethodCatalog
from ai_lego.platform.catalog.display_catalog import catalog_payload, counts, internal_goals, load_catalog, user_popular


class DisplayCatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = load_catalog()

    def test_tools_are_exactly_the_served_methods(self):
        served = {mid for mid, entry in MethodCatalog.from_spec_root(resolve_spec_root()).contracts.items() if is_active(entry)}
        self.assertEqual(set(self.catalog.methods), served)
        self.assertEqual(counts(self.catalog)[0], len(served))

    def test_a_lens_is_not_a_tool_and_no_goal_lists_its_family(self):
        self.assertNotIn("stakeholder.regulator", self.catalog.methods)
        for goal in self.catalog.goals["goals"]:
            for family in goal["families"]:
                self.assertTrue(any(mid.split(".")[0] == family for mid in self.catalog.methods), f"{goal['id']} lists empty family {family}")

    def test_payload_carries_goal_and_next_for_every_tool(self):
        payload = catalog_payload(self.catalog)
        goal_ids = {g["id"] for g in payload["goals"]}
        for mid, method in payload["methods"].items():
            self.assertIn(method["goal"], goal_ids, mid)
            self.assertIsInstance(method["next"], list, mid)

    def test_engineering_tools_are_marked_internal_and_only_their_goal_is(self):
        # The web hides a goal marked internal and every tool whose block is INTERNAL (ENTRY_SLICE1_CHECKLIST.md item 5).
        payload = catalog_payload(self.catalog)
        internal = {g["id"] for g in payload["goals"] if g["internal"]}
        self.assertEqual(internal, {"engineering"})
        for mid, method in payload["methods"].items():
            self.assertEqual(method["block"] == "INTERNAL", method["goal"] in internal, mid)

    def test_a_goal_mixing_engineering_and_user_families_is_a_gap(self):
        goals = {"goals": [{"id": "mixed", "families": ["architecture", "decision"]}]}
        with self.assertRaises(ValueError):
            internal_goals(goals)

    def test_an_engineering_tool_in_the_popular_list_is_a_gap(self):
        with self.assertRaises(ValueError):
            user_popular({"popular": [{"id": "security.stride", "shape": "grid", "line_zh": "x"}]})


if __name__ == "__main__":
    unittest.main()
