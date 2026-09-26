"""RESEARCH_LINES_MASTER_PLAN WC-P2-07a: the `literature_search` project-backed adapter.

Covers `build_registered_capability_adapters`'s new `project_sources` kwarg and
`evidence_triangulation.project_literature_search` in isolation, plus one full
in-process run of `research-qualitative-v1` through to `evidence.triangulation`
with a real Project Source cited -- proving the seam works end to end even
though wiring a real caller through it is WC-P2-07b's job, not this one's.
"""

from __future__ import annotations

import unittest
from typing import Any

from ai_lego import resolve_spec_root
from ai_lego.apps.api.main import build_api_capability_adapters
from ai_lego.apps.recipe_runtime import (
    build_method_components,
    build_registered_capability_adapters,
    build_registered_workflow_gate_registry,
)
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.evidence_triangulation import (
    offline_literature_search,
    project_literature_search,
    triangulate_themes_and_literature,
)
from ai_lego.modules.research.review import fixture_review
from ai_lego.platform.ai_execution.capability_resolver import CapabilityCatalog, capability_refs
from ai_lego.platform.ai_execution.method_resolver import MethodCatalog
from ai_lego.platform.workflow.executor import execute_workflow_ir
from ai_lego.platform.workflow.ir import compile_recipe_to_workflow_ir


def _academic_source(source_id: str, **overrides: Any) -> dict[str, Any]:
    base = {
        "source_id": source_id,
        "project_id": "PROJ-1",
        "tenant_id": "tenant-1",
        "title": f"Study {source_id}",
        "status": "active",
        "source_class": "academic",
        "canonical_url": f"https://example.org/{source_id}",
        "source_uri": None,
        "fetched_at": "2026-09-20T00:00:00Z",
        "content_sha256": f"sha256-{source_id}",
    }
    base.update(overrides)
    return base


class ProjectLiteratureSearchAdapterTests(unittest.TestCase):
    """Direct tests of `project_literature_search`, no workflow runtime involved."""

    def test_only_returns_active_academic_sources(self):
        sources = [
            _academic_source("S-ACADEMIC"),
            _academic_source("S-WEB", source_class="web"),
            _academic_source("S-NO-CLASS", source_class=None),
        ]
        result = project_literature_search(sources)({"research.question": "q"}, {})["literature"]

        self.assertEqual([item["literature_id"] for item in result["items"]], ["S-ACADEMIC"])

    def test_excludes_superseded_sources(self):
        sources = [
            _academic_source("S-OLD", status="superseded"),
            _academic_source("S-NEW"),
        ]
        result = project_literature_search(sources)({"research.question": "q"}, {})["literature"]

        self.assertEqual([item["literature_id"] for item in result["items"]], ["S-NEW"])

    def test_zero_matching_sources_raises_instead_of_falling_back_to_the_fixture(self):
        sources = [_academic_source("S-WEB", source_class="web")]
        with self.assertRaisesRegex(InvariantViolation, "LITERATURE_NO_PROJECT_SOURCES"):
            project_literature_search(sources)({"research.question": "q"}, {})

    def test_none_project_sources_keeps_the_offline_fixture_unchanged(self):
        adapters = build_registered_capability_adapters(
            CapabilityCatalog.from_spec_root(resolve_spec_root()), ["literature_search"]
        )
        handler = adapters.require_for(["literature_search"])["literature_search"]

        self.assertIs(handler, offline_literature_search)

    def test_shape_matches_the_offline_result_at_the_literature_and_retrieval_level(self):
        offline = offline_literature_search({"research.question": "q"}, {})["literature"]
        project = project_literature_search([_academic_source("S-1")])({"research.question": "q"}, {})["literature"]

        self.assertEqual(set(offline.keys()), set(project.keys()))
        self.assertEqual(set(offline["retrieval"].keys()), set(project["retrieval"].keys()))
        required_item_keys = {"literature_id", "title", "citation", "source_kind", "provenance"}
        self.assertTrue(required_item_keys.issubset(offline["items"][0].keys()))
        self.assertTrue(required_item_keys.issubset(project["items"][0].keys()))

    def test_triangulation_can_cite_a_project_source_item(self):
        literature = project_literature_search([_academic_source("S-CITE")])({"research.question": "q"}, {})["literature"]
        result = triangulate_themes_and_literature(
            {
                "outputs.coding": {"coding_outputs": {"theme_set": {"themes": [{"theme_id": "THEME-1", "label": "boundary_erosion"}]}}},
                "outputs.literature": {"literature": literature},
            },
            {},
        )["triangulation"]

        self.assertEqual(result["findings"][0]["literature_refs"], ["S-CITE"])
        self.assertEqual(result["status"], "NEEDS_HUMAN_REVIEW")

    def test_citation_prefers_canonical_url_and_falls_back_to_source_uri(self):
        with_canonical = project_literature_search([_academic_source("S-1")])({"research.question": "q"}, {})["literature"]
        self.assertEqual(with_canonical["items"][0]["citation"], "https://example.org/S-1")

        without_canonical = project_literature_search(
            [_academic_source("S-2", canonical_url=None, source_uri="https://raw.example.org/s2")]
        )({"research.question": "q"}, {})["literature"]
        self.assertEqual(without_canonical["items"][0]["citation"], "https://raw.example.org/s2")

    def test_citation_falls_back_to_doi_when_both_urls_are_missing(self):
        # A-m2: a Project Source with neither URL (e.g. an uploaded PDF) must still be citable.
        result = project_literature_search(
            [_academic_source("S-3", canonical_url=None, source_uri=None, doi="10.1234/example")]
        )({"research.question": "q"}, {})["literature"]

        self.assertEqual(result["items"][0]["citation"], "doi:10.1234/example")

    def test_citation_falls_back_to_the_manifest_source_id_when_nothing_else_is_available(self):
        # A-m2: last resort is the P-K2 manifest id vocabulary (`source:<source_id>`), never None.
        result = project_literature_search(
            [_academic_source("S-4", canonical_url=None, source_uri=None)]
        )({"research.question": "q"}, {})["literature"]

        self.assertEqual(result["items"][0]["citation"], "source:S-4")
        self.assertIsNotNone(result["items"][0]["citation"])

    def test_freshness_claim_is_the_oldest_fetched_at(self):
        sources = [
            _academic_source("S-NEWER", fetched_at="2026-09-25T00:00:00Z"),
            _academic_source("S-OLDER", fetched_at="2026-09-01T00:00:00Z"),
        ]
        result = project_literature_search(sources)({"research.question": "q"}, {})["literature"]

        self.assertEqual(result["retrieval"]["freshness_claim"], "2026-09-01T00:00:00Z")

    def test_zero_academic_sources_does_not_raise_when_literature_search_is_not_requested(self):
        # F1: project_literature_search's fail-closed raise must not fire for a run that has a
        # Project with zero academic Sources but never invokes literature_search at all
        # (e.g. life-decision-v1) -- eagerly building the project adapter for every call broke
        # that recipe class before this fix.
        catalog = CapabilityCatalog.from_spec_root(resolve_spec_root())
        adapters = build_registered_capability_adapters(catalog, ["transcribe"], project_sources=[])

        handler = adapters.require_for(["transcribe"])["transcribe"]
        self.assertTrue(callable(handler))

    def test_zero_academic_sources_still_raises_when_literature_search_is_requested(self):
        catalog = CapabilityCatalog.from_spec_root(resolve_spec_root())
        with self.assertRaisesRegex(InvariantViolation, "LITERATURE_NO_PROJECT_SOURCES"):
            build_registered_capability_adapters(catalog, ["literature_search"], project_sources=[])

    def test_project_sources_triangulation_reason_is_accurate_not_synthetic(self):
        # F2: PROJECT_SOURCES literature is real collected data, not the synthetic fixture --
        # the triangulation reason text must not claim otherwise.
        literature = project_literature_search([_academic_source("S-REASON")])({"research.question": "q"}, {})["literature"]
        result = triangulate_themes_and_literature(
            {
                "outputs.coding": {"coding_outputs": {"theme_set": {"themes": [{"theme_id": "THEME-1", "label": "boundary_erosion"}]}}},
                "outputs.literature": {"literature": literature},
            },
            {},
        )["triangulation"]

        reason = result["findings"][0]["reason"]
        self.assertNotIn("synthetic", reason)
        self.assertIn("project Sources", reason)

    def test_both_existing_callers_pass_no_project_sources_and_are_unaffected(self):
        spec_root = resolve_spec_root()
        catalog = CapabilityCatalog.from_spec_root(spec_root)

        api_adapters = build_api_capability_adapters(catalog, ["literature_search"])
        cli_adapters = build_registered_capability_adapters(catalog, ["literature_search"])

        api_result = api_adapters.require_for(["literature_search"])["literature_search"]({"research.question": "q"}, {})
        cli_result = cli_adapters.require_for(["literature_search"])["literature_search"]({"research.question": "q"}, {})
        self.assertEqual(api_result, cli_result)
        self.assertEqual(api_result["literature"]["retrieval"]["status_code"], "OFFLINE_SOURCE_STALE")


class ResearchQualitativeRecipeWithProjectSourcesTests(unittest.TestCase):
    """Full in-process run of research-qualitative-v1, wiring `project_sources` directly into
    `build_registered_capability_adapters` the way WC-P2-07b's caller will (not built here)."""

    def _run(self, project_sources: list[dict[str, Any]]) -> Any:
        spec_root = resolve_spec_root()
        locked_code, ai_review = fixture_review()
        source = {
            "question": "How do remote workers describe after-hours boundaries?",
            "transcript": {
                "status": "normalized",
                "text": "A reviewed transcript input.",
                "provenance": {"epistemic_type": "SOURCE_FACT", "authorship_state": "SOURCE_QUOTATION", "locked": None},
            },
            "coder_one": {"locked_code": locked_code, "ai_review": ai_review, "at": "2026-09-14T00:00:00Z"},
            "coder_two": {"locked_code": locked_code, "ai_review": ai_review, "at": "2026-09-14T00:00:00Z"},
        }
        workflow_ir = compile_recipe_to_workflow_ir(spec_root, "research-qualitative-v1", "R1")
        nodes = workflow_ir["nodes"]
        method_catalog = MethodCatalog.from_spec_root(spec_root)
        capability_catalog = CapabilityCatalog.from_spec_root(spec_root)
        resolvable_capability_ids = [ref for ref in capability_refs(workflow_ir) if capability_catalog.is_resolvable(ref)]

        handlers, gate_runners = build_method_components(nodes, validator="test-literature-search-v2")
        adapters = build_registered_capability_adapters(capability_catalog, resolvable_capability_ids, project_sources=project_sources)
        handlers.update(adapters.handlers_for(resolvable_capability_ids))

        refs = list(workflow_ir.get("workflow_gate_refs", []))
        if "workflow_execution_integrity" not in refs:
            refs.insert(0, "workflow_execution_integrity")
        gate_registry = build_registered_workflow_gate_registry("test-literature-search-v2")

        return execute_workflow_ir(
            workflow_ir,
            {"source": source},
            handlers,
            catalogs={"method": method_catalog, "capability": capability_catalog},
            gate_runners=gate_runners,
            workflow_gate_runner=lambda context, workflow: gate_registry.evaluate(refs, context, workflow),
        )

    def test_runs_to_triangulation_pass_with_a_real_project_source_cited(self):
        result = self._run([_academic_source("S-PROJECT-1")])

        self.assertEqual(result.status, "SUCCEEDED")
        as_dict = result.as_dict()
        self.assertEqual(
            [step["ref"] for step in as_dict["steps"]],
            [
                "transcribe",
                "research.qualitative_coding",
                "research.qualitative_coding",
                "literature_search",
                "run_statistics",
                "evidence.triangulation",
                "artifact.generate_research_paper",
            ],
        )
        literature_step = as_dict["steps"][3]
        self.assertEqual(literature_step["output"]["literature"]["retrieval"]["mode"], "PROJECT_SOURCES")
        triangulation_step = as_dict["steps"][5]
        self.assertEqual(triangulation_step["output"]["triangulation"]["findings"][0]["literature_refs"], ["S-PROJECT-1"])

        # A-m3: executor status SUCCEEDED alone is not PASS -- main.py:758-763 derives PASS/GATE_FAILED
        # from every step gate and workflow gate separately; assert that derivation here too.
        for step in as_dict["steps"]:
            for gate in step.get("gates") or []:
                self.assertIn(gate["status"], {"PASS", "NOT_APPLICABLE"})
        for gate in as_dict.get("workflow_gates") or []:
            self.assertIn(gate["status"], {"PASS", "NOT_APPLICABLE"})


if __name__ == "__main__":
    unittest.main()
