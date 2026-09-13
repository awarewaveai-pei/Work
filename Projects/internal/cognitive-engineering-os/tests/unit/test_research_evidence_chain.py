import unittest

from ai_lego.modules.research.evidence_triangulation import offline_literature_search, triangulate_themes_and_literature


class ResearchEvidenceChainTests(unittest.TestCase):
    def test_offline_search_is_explicitly_stale_and_review_gated(self):
        result = offline_literature_search({"research.question": "remote work boundaries"}, {})["literature"]

        self.assertEqual(result["retrieval"]["mode"], "OFFLINE_LOCAL_CORPUS")
        self.assertEqual(result["retrieval"]["status_code"], "OFFLINE_SOURCE_STALE")
        self.assertEqual(result["retrieval"]["side_state"], "NEEDS_HUMAN_REVIEW")
        self.assertTrue(all(item["provenance"] for item in result["items"]))

    def test_triangulation_keeps_fixture_findings_review_gated(self):
        result = triangulate_themes_and_literature(
            {
                "outputs.coding": {"coding_outputs": {"theme_set": {"themes": [{"theme_id": "THEME-1", "label": "boundary_erosion"}]}}},
                "outputs.literature": {"literature": offline_literature_search({"research.question": "remote work boundaries"}, {})["literature"]},
            },
            {},
        )["triangulation"]

        self.assertEqual(result["status"], "NEEDS_HUMAN_REVIEW")
        self.assertEqual(result["offline_status_code"], "OFFLINE_SOURCE_STALE")
        self.assertEqual(len(result["findings"]), 1)
        self.assertTrue(result["provenance_complete"])


if __name__ == "__main__":
    unittest.main()
