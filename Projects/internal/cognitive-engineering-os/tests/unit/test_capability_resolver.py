"""Capability resolution is fail-closed (ADR-023) -- and honest about the live spec root's actual catalog."""

import tempfile
import unittest
from pathlib import Path

from ai_lego import resolve_spec_root
from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_execution.capability_resolver import CAPABILITY_RESOLUTION_BLOCKED, CapabilityCatalog, capability_refs, plan_executability
from ai_lego.platform.ai_execution.contract_catalog import scan_contract_files
from ai_lego.platform.workflow.ir import compile_recipe_to_workflow_ir
from tests.support import active_contract_on_disk

RECIPE_CAPABILITY_REFS = ["transcribe", "literature_search", "run_statistics", "artifact.generate_research_paper"]
NEVER_CONTRACTED = "no_such_capability_for_test"


def _all_active(refs: list[str]) -> CapabilityCatalog:
    return CapabilityCatalog(label="synthetic:all-active", contracts={ref: {"path": f"synthetic/{ref}.capability.yaml", "status": "ACTIVE", "version": "9.9.9"} for ref in refs})


def _write_catalog(root: Path, files: dict[str, str | bytes]) -> Path:
    contracts_dir = root / "capabilities" / "contracts"
    contracts_dir.mkdir(parents=True, exist_ok=True)
    for name, body in files.items():
        if isinstance(body, bytes):
            (contracts_dir / name).write_bytes(body)
        else:
            (contracts_dir / name).write_text(body, encoding="utf-8")
    return contracts_dir


class CapabilityCatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.live = CapabilityCatalog.from_spec_root(cls.spec_root)

    def test_empty_catalog_blocks_the_request_and_the_invocation_never_reaches_the_implementation(self):
        empty = CapabilityCatalog.empty("snapshot:no-capability-contracts")
        result = empty.resolve(["run_statistics"])
        self.assertEqual(result["candidate_capabilities"], [])
        self.assertEqual(result["blocked"]["status"], CAPABILITY_RESOLUTION_BLOCKED)
        self.assertEqual(result["blocked"]["unresolved"], ["run_statistics"])
        self.assertEqual(result["blocked"]["resolvable"], [])
        with self.assertRaisesRegex(InvariantViolation, "CAPABILITY_RESOLUTION_BLOCKED.*run_statistics"):
            empty.require("run_statistics")
        reached = []
        with self.assertRaisesRegex(InvariantViolation, "CAPABILITY_RESOLUTION_BLOCKED"):
            empty.invoke("run_statistics", lambda: reached.append("ran"))
        self.assertEqual(reached, [], "a blocked invocation must not execute the implementation at all")
        self.assertEqual(empty.invocations, [], "a blocked invocation must not be logged as an invocation")

    def test_live_catalog_resolves_run_statistics_and_invoke_calls_through_with_the_contract_descriptor(self):
        resolved = self.live.resolve(["run_statistics"])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual(resolved["candidate_capabilities"][0]["ref"], "run_statistics")
        self.assertIn("capabilities/contracts/run_statistics.capability.yaml v1.0.0", resolved["candidate_capabilities"][0]["rationale"])
        descriptor, value = self.live.invoke("run_statistics", lambda a, b: a + b, 2, 3)
        self.assertEqual(value, 5)
        self.assertEqual(descriptor["ref"], "run_statistics")
        self.assertEqual(descriptor["path"], "capabilities/contracts/run_statistics.capability.yaml")
        self.assertEqual(descriptor["version"], "1.0.0")
        self.assertRegex(descriptor["content_sha256"], r"^[0-9a-f]{64}$")

    def test_invoke_logs_exactly_the_invocations_that_ran(self):
        catalog = CapabilityCatalog.from_spec_root(self.spec_root)
        catalog.invoke("run_statistics", lambda: "first")
        catalog.invoke("run_statistics", lambda: "second")
        with self.assertRaises(InvariantViolation):
            catalog.invoke(NEVER_CONTRACTED, lambda: "never")
        self.assertEqual([entry["ref"] for entry in catalog.invocations], ["run_statistics", "run_statistics"])
        self.assertEqual(catalog.invocations[0]["version"], "1.0.0")

    def test_live_catalog_reports_exactly_the_recipe_refs_without_an_active_contract_on_disk(self):
        # Oracle computed from the spec root (file exists AND status ACTIVE), so it moves with the contracts -- and does
        # not mistake a DRAFT contract for a resolvable one.
        contracts_dir = self.spec_root / "capabilities" / "contracts"
        expected_unresolved = [ref for ref in RECIPE_CAPABILITY_REFS if not active_contract_on_disk(contracts_dir, ref)]
        result = self.live.resolve(RECIPE_CAPABILITY_REFS)
        if expected_unresolved:
            self.assertEqual(result["blocked"]["status"], CAPABILITY_RESOLUTION_BLOCKED)
            self.assertEqual(result["blocked"]["unresolved"], expected_unresolved)
            self.assertEqual(result["blocked"]["resolvable"], [ref for ref in RECIPE_CAPABILITY_REFS if ref not in expected_unresolved])
            self.assertEqual(result["candidate_capabilities"], [])
        else:
            self.assertIsNone(result["blocked"])
            self.assertEqual([c["ref"] for c in result["candidate_capabilities"]], RECIPE_CAPABILITY_REFS)

    def test_live_catalog_label_is_a_content_fingerprint_not_a_host_path(self):
        self.assertRegex(self.live.label, r"^live:capabilities/contracts@[0-9a-f]{12}$")
        self.assertNotIn(str(self.spec_root), self.live.label)
        self.assertEqual(CapabilityCatalog.from_spec_root(self.spec_root).label, self.live.label, "same content, same label")

    def test_label_changes_when_a_contract_body_changes_without_a_version_bump(self):
        with tempfile.TemporaryDirectory(prefix="ai-lego-cap-fp-") as tmp:
            contracts_dir = _write_catalog(Path(tmp), {"thing.capability.yaml": "id: thing\nversion: '1.0.0'\nstatus: ACTIVE\nsecurity: {external_ai: forbidden}\n"})
            before = CapabilityCatalog.from_spec_root(Path(tmp))
            (contracts_dir / "thing.capability.yaml").write_text("id: thing\nversion: '1.0.0'\nstatus: ACTIVE\nsecurity: {external_ai: policy_controlled}\n", encoding="utf-8")
            after = CapabilityCatalog.from_spec_root(Path(tmp))
            self.assertEqual(before.contracts["thing"]["version"], after.contracts["thing"]["version"])
            self.assertNotEqual(before.contracts["thing"]["content_sha256"], after.contracts["thing"]["content_sha256"])
            self.assertNotEqual(before.label, after.label, "an in-place edit must change what the ledger records as the catalog")

    def test_a_contract_file_that_is_not_active_or_has_no_id_does_not_resolve(self):
        with tempfile.TemporaryDirectory(prefix="ai-lego-cap-catalog-") as tmp:
            _write_catalog(
                Path(tmp),
                {
                    "draft_thing.capability.yaml": "id: draft_thing\nversion: '0.1.0'\nstatus: DRAFT\n",
                    "no_id.capability.yaml": "version: '0.1.0'\nstatus: ACTIVE\n",
                    "live_thing.capability.yaml": "id: live_thing\nversion: '1.2.3'\nstatus: ACTIVE\n",
                    "wrong_suffix.contract.yaml": "id: wrong_suffix\nversion: '1.0.0'\nstatus: ACTIVE\n",
                    "MiXeD.CAPABILITY.YAML": "id: mixed\nversion: '1.0.0'\nstatus: ACTIVE\n",
                },
            )
            catalog = CapabilityCatalog.from_spec_root(Path(tmp))
            self.assertEqual(set(catalog.contracts), {"draft_thing", "live_thing"})
            self.assertTrue(catalog.is_resolvable("live_thing"))
            self.assertFalse(catalog.is_resolvable("draft_thing"), "status must be ACTIVE, not merely present")
            self.assertFalse(catalog.is_resolvable("no_id"))
            self.assertFalse(catalog.is_resolvable("wrong_suffix"))
            self.assertFalse(catalog.is_resolvable("mixed"), "a case-insensitive glob hit on Windows is not a contract file on any OS")
            blocked = catalog.resolve(["live_thing", "draft_thing"])
            self.assertEqual(blocked["blocked"]["unresolved"], ["draft_thing"])
            self.assertEqual(blocked["blocked"]["resolvable"], ["live_thing"])

    def test_duplicate_contract_ids_are_refused_instead_of_silently_last_wins(self):
        with tempfile.TemporaryDirectory(prefix="ai-lego-cap-dup-") as tmp:
            _write_catalog(
                Path(tmp),
                {
                    "thing.capability.yaml": "id: thing\nversion: '1.0.0'\nstatus: ACTIVE\n",
                    "thing.v2.capability.yaml": "id: thing\nversion: '2.0.0'\nstatus: DRAFT\n",
                },
            )
            with self.assertRaisesRegex(InvariantViolation, "CONTRACT_ID_DUPLICATE: thing .*thing.capability.yaml.*thing.v2.capability.yaml"):
                CapabilityCatalog.from_spec_root(Path(tmp))

    def test_an_unreadable_contract_file_raises_a_domain_error_not_a_parser_exception(self):
        with tempfile.TemporaryDirectory(prefix="ai-lego-cap-bad-") as tmp:
            _write_catalog(Path(tmp), {"broken.capability.yaml": "id: [unclosed\nstatus: ACTIVE\n"})
            with self.assertRaisesRegex(InvariantViolation, "CONTRACT_CATALOG_UNREADABLE: capabilities/contracts/broken.capability.yaml"):
                CapabilityCatalog.from_spec_root(Path(tmp))
        with tempfile.TemporaryDirectory(prefix="ai-lego-cap-enc-") as tmp:
            _write_catalog(Path(tmp), {"latin.capability.yaml": b"id: latin\nversion: '1.0.0'\nstatus: ACTIVE\ntitle: caf\xe9\n"})
            with self.assertRaisesRegex(InvariantViolation, "CONTRACT_CATALOG_UNREADABLE: capabilities/contracts/latin.capability.yaml"):
                CapabilityCatalog.from_spec_root(Path(tmp))

    def test_missing_contracts_directory_is_an_empty_catalog_not_a_crash(self):
        with tempfile.TemporaryDirectory(prefix="ai-lego-cap-nodir-") as tmp:
            self.assertEqual(scan_contract_files(Path(tmp), "capabilities/contracts", "*.capability.yaml"), {})
            self.assertEqual(CapabilityCatalog.from_spec_root(Path(tmp)).contracts, {})


class PlanExecutabilityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.ir = compile_recipe_to_workflow_ir(cls.spec_root, "research-qualitative-v1", "R4")
        cls.refs = capability_refs(cls.ir)

    def test_capability_refs_helper_keeps_node_order_dedupes_and_refuses_a_node_without_ref(self):
        self.assertEqual(self.refs, RECIPE_CAPABILITY_REFS)
        duplicated = {"nodes": [{"node_kind": "capability", "ref": "a"}, {"node_kind": "method", "method_id": "x.y"}, {"node_kind": "capability", "ref": "a"}, {"node_kind": "capability", "ref": "b"}]}
        self.assertEqual(capability_refs(duplicated), ["a", "b"])
        with self.assertRaisesRegex(InvariantViolation, "WORKFLOW_IR_CAPABILITY_NODE_WITHOUT_REF"):
            capability_refs({"nodes": [{"node_kind": "capability", "label": "no ref"}]})

    def test_all_active_catalog_makes_the_real_recipe_plan_fully_resolved_and_executable(self):
        verdict = plan_executability(self.ir, _all_active(self.refs).resolve(self.refs))
        self.assertEqual(verdict, {"fully_resolved": True, "executable": True, "blocking": [], "not_invocable": []})

    def test_empty_catalog_classifies_every_node_by_its_recipe_necessity(self):
        verdict = plan_executability(self.ir, CapabilityCatalog.empty("snapshot").resolve(self.refs))
        self.assertFalse(verdict["fully_resolved"])
        self.assertFalse(verdict["executable"])
        self.assertEqual([b["ref"] for b in verdict["blocking"]], ["run_statistics", "artifact.generate_research_paper"])
        self.assertTrue(all(b["necessity"] == "REQUIRED_BY_RISK" for b in verdict["blocking"]))
        self.assertEqual([n["ref"] for n in verdict["not_invocable"]], ["transcribe", "literature_search"])
        self.assertTrue(all(n["necessity"] == "RECOMMENDED" for n in verdict["not_invocable"]))

    def test_live_catalog_verdict_follows_the_active_contract_files_actually_on_disk(self):
        contracts_dir = self.spec_root / "capabilities" / "contracts"
        unresolved = [ref for ref in self.refs if not active_contract_on_disk(contracts_dir, ref)]
        required = [node["ref"] for node in self.ir["nodes"] if node["node_kind"] == "capability" and node["ref"] in unresolved and node.get("necessity", "RECOMMENDED").startswith("REQUIRED_")]
        verdict = plan_executability(self.ir, CapabilityCatalog.from_spec_root(self.spec_root).resolve(self.refs))
        self.assertEqual(verdict["fully_resolved"], not unresolved)
        self.assertEqual(verdict["executable"], not required)
        self.assertEqual([b["ref"] for b in verdict["blocking"]], required)

    def test_a_resolution_that_does_not_cover_every_ir_capability_node_is_refused(self):
        # An empty resolution must never read as "fully resolved" -- silence about a node is not resolution of it.
        with self.assertRaisesRegex(InvariantViolation, "CAPABILITY_PLAN_COVERAGE_MISMATCH.*artifact.generate_research_paper"):
            plan_executability(self.ir, CapabilityCatalog.empty("snapshot").resolve([]))
        with self.assertRaisesRegex(InvariantViolation, "CAPABILITY_PLAN_COVERAGE_MISMATCH"):
            plan_executability(self.ir, _all_active(self.refs).resolve(["transcribe"]))
        method_shaped = {"candidate_methods": [], "blocked": {"status": "METHOD_RESOLUTION_BLOCKED", "reason": "wrong resolver"}}
        with self.assertRaisesRegex(InvariantViolation, "CAPABILITY_PLAN_COVERAGE_MISMATCH"):
            plan_executability(self.ir, method_shaped)

    def test_a_capability_node_without_a_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WORKFLOW_IR_CAPABILITY_NODE_WITHOUT_REF"):
            plan_executability({"nodes": [{"node_kind": "capability", "label": "no ref"}]}, _all_active([]).resolve([]))

    def test_a_node_without_a_necessity_label_defaults_to_recommended_and_is_not_blocking(self):
        ir = {"nodes": [{"node_kind": "capability", "ref": "transcribe"}, {"node_kind": "method", "method_id": "x.y"}]}
        verdict = plan_executability(ir, CapabilityCatalog.empty("snapshot").resolve(["transcribe"]))
        self.assertEqual(verdict["blocking"], [])
        self.assertEqual(verdict["not_invocable"], [{"ref": "transcribe", "label": None, "necessity": "RECOMMENDED"}])
        self.assertTrue(verdict["executable"])
        self.assertFalse(verdict["fully_resolved"])


if __name__ == "__main__":
    unittest.main()
