"""The display catalog (ai_lego/platform/catalog/display_catalog.py): one loader for GET /catalog, the web app and the
mocks. Its tools are exactly the methods GET /methods serves -- an Atlas lens (type: perspective) has display labels
but is not a tool (the regulator lens once made the pages say 285 while 284 could run)."""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.platform.ai_execution.contract_catalog import is_active
from ai_lego.platform.ai_execution.method_resolver import MethodCatalog
from ai_lego.platform.catalog.display_catalog import catalog_payload, counts, load_catalog


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


if __name__ == "__main__":
    unittest.main()
