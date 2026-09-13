"""The MVP_VERTICAL_SLICE_PLAN.md section 5 acceptance criteria and adversarial cases, shared by every adapter mode.

A concrete TestCase mixes this in and sets ``cls.result`` (the slice result)
and ``cls.runtime`` (its runtime directory) in ``setUpClass``. The same
assertions therefore run against the deterministic fixture adapters AND,
when the machine has them, against real Windows SAPI speech + offline
faster-whisper -- the criteria do not get weaker when the adapters get real.
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from unittest import mock

from ai_lego.core.contracts.runtime_dir import MARKER_NAME
from ai_lego.core.domain.tenant import CASCADIA, NORDBROOK
from ai_lego.core.support import DEFAULT_CLOCK, read_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.gates import GATE_ORDER
from ai_lego.modules.research.synthetic_fixtures import P2_SYNTHETIC_PII_VALUES
from ai_lego.platform.ai_execution.capability_resolver import CAPABILITY_RESOLUTION_BLOCKED
from ai_lego.platform.ai_execution.deletion import DELETION_STEPS
from ai_lego.platform.ai_execution.mandatory_gates import HIGH_RISK_GATE_IDS
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED
from ai_lego.platform.ai_execution.replay import project
from ai_lego.security.key_vault.local_key_vault import LocalKeyVault
from tests.support import active_contract_on_disk

REDACTED_PII = {"name": "REDACTED", "employer": "REDACTED", "city": "REDACTED"}
PRIMARY_PATH = ["RECEIVED", "DOCUMENTS_RESOLVED", "CURRENT_STATE_ESTABLISHED", "RISK_CLASSIFIED", "BLOCKED", "METHODS_RESOLVED", "PLAN_COMPILED", "ROLLBACK_VALIDATED", "APPROVED", "EXECUTING", "VERIFYING"]


class SliceCriteriaMixin:
    result: dict
    runtime: Path

    def _events(self):
        return [json.loads(line) for line in (self.runtime / "data" / "events" / "ledger.jsonl").read_text(encoding="utf-8").splitlines()]

    # --- section 5 #1 replay to any historical state; crypto-shred invariant ------------------------------------
    def test_criterion_1_replay_uses_current_key_lifecycle_at_every_historical_time(self):
        replays = self.result["replays"]
        for point in ("T0", "T1", "v12", "T2"):
            self.assertEqual(replays[point]["transcripts"]["P2"]["pii"], REDACTED_PII, point)
        self.assertEqual(replays["T0"]["themes"], replays["T1"]["themes"])
        self.assertLess(len(replays["T0"]["event_ids"]), len(replays["T1"]["event_ids"]))
        self.assertLess(len(replays["T1"]["event_ids"]), len(replays["v12"]["event_ids"]))
        self.assertLess(len(replays["v12"]["event_ids"]), len(replays["T2"]["event_ids"]))

    # --- section 5 #2 rollback -- a genuine state change, not a marker event nobody reads --------------------------
    def test_criterion_2_prompt_upgrade_is_real_and_rollback_matches_the_golden_hash(self):
        replays = self.result["replays"]
        self.assertEqual(replays["v12"]["prompt_version"], 12)
        self.assertNotEqual(replays["v12"]["themes"], replays["T0"]["themes"], "v12 must genuinely differ from the champion, not just be a marker event")
        self.assertEqual(replays["T2"]["prompt_version"], 11)
        rollback = next(event for event in self._events() if event["event_type"] == "PromptVersionRollback")
        self.assertEqual(rollback["payload"]["golden_hash"], self.result["golden_hash_v11"])
        self.assertEqual(replays["T2"]["themes"], replays["T0"]["themes"])
        self.assertEqual(self.result["manifest"]["ai"]["prompt_version"], "11")
        self.assertEqual(self.result["step_status"]["28"], "PASS")

    # --- section 5 #3 human-locked fact -- survives a real competing AI suggestion, kept separate -----------------
    def test_criterion_3_human_locked_fact_survives_model_change(self):
        locked = self.result["replays"]["T2"]["locked_codes"]["CODE-LOCKED-P1-001"]
        self.assertEqual(locked["provenance"], {"epistemic_type": "SOURCE_FACT", "authorship_state": "HUMAN_APPROVED", "locked": "LOCKED_FACT"})
        self.assertEqual(locked["human_action"], "ACCEPT_AND_LOCK")
        suggestions = self.result["ai_suggestions_for_locked"]
        self.assertIn("CODE-LOCKED-P1-001", suggestions)
        self.assertEqual(suggestions["CODE-LOCKED-P1-001"][0]["provenance"]["authorship_state"], "AI_SUGGESTED")

    def test_locked_fact_rewrite_is_refused_not_silently_ignored(self):
        with tempfile.TemporaryDirectory(prefix="ai-lego-locked-fact-") as tmp:
            tmp_path = Path(tmp)
            ledger = EventLedger(tmp_path / "ledger.jsonl", "RUN-LOCKFACT-TEST", DEFAULT_CLOCK)
            ledger.append("T", "T:proj", "HumanCodeLocked", {"code_id": "X", "provenance": {"epistemic_type": "SOURCE_FACT", "authorship_state": "HUMAN_APPROVED", "locked": "LOCKED_FACT"}}, 1)
            ledger.append("T", "T:proj", "HumanCodeLocked", {"code_id": "X", "provenance": {"epistemic_type": "SOURCE_FACT", "authorship_state": "HUMAN_APPROVED", "locked": "LOCKED_FACT"}}, 2)
            vault = LocalKeyVault(tmp_path / "vault.json", DEFAULT_CLOCK, "RUN-LOCKFACT-TEST")
            with self.assertRaisesRegex(InvariantViolation, "LOCKED_FACT_REWRITE_REFUSED"):
                project(ledger.through(2), vault)

    # --- section 5 #4 tenant-scoped CAS --------------------------------------------------------------------------
    def test_criterion_4_identical_bytes_are_isolated_by_tenant_scoped_cas(self):
        isolation = self.result["cas_isolation"]
        self.assertTrue(isolation["same_hash"])
        self.assertNotEqual(isolation["tenant_a_path"], isolation["tenant_b_path"])
        self.assertIn(NORDBROOK.tenant_id, isolation["tenant_a_path"])
        self.assertIn(CASCADIA.tenant_id, isolation["tenant_b_path"])

    def test_tenant_b_cannot_list_read_or_decrypt_tenant_a_material(self):
        cas = TenantScopedCas(self.runtime / "data")
        tenant_a_path = self.result["cas_paths"]["tenant_a"]
        self.assertNotIn(tenant_a_path["path"], cas.list_objects(CASCADIA.tenant_id))
        with self.assertRaisesRegex(InvariantViolation, "CAS_TENANT_ACCESS_DENIED"):
            cas.read(CASCADIA.tenant_id, tenant_a_path)

    # --- section 5 #5 evidence chain -- locator is derived from the real transcript, not a hard-coded literal ------
    def test_criterion_5_artifact_sentence_traces_back_through_the_graph_to_real_audio_seconds(self):
        trace = self.result["trace"]
        self.assertEqual((trace["claim_id"], trace["evidence_id"], trace["source_id"]), ("C-1", "E-1", "SRC-1"))
        self.assertEqual(trace["locator"]["locator_type"], "audio_timestamp")
        p1_duration = next(row["duration_seconds"] for row in self.result["transcriptions"] if row["subject_id"] == "P1")
        self.assertTrue(0 <= trace["locator"]["start_seconds"] < trace["locator"]["end_seconds"] <= p1_duration)
        self.assertIn(trace["locator_precision"], {"SEGMENT_MATCH", "TRANSCRIPT_SPAN_FALLBACK"})
        graph = read_json(self.runtime / "modules" / "knowledge" / "evidence_graph.json")
        self.assertTrue(any(edge["relation_type"] == "SUPPORTS" and edge["to"]["node_id"] == "C-1" for edge in graph["edges"]))

    # --- section 5 #6 BLOCKED gate --------------------------------------------------------------------------------
    def test_criterion_6_missing_method_blocks_before_the_registered_contract_resumes(self):
        resolution = self.result["method_resolution"]
        self.assertEqual(resolution["blocked"]["blocked"]["status"], METHOD_RESOLUTION_BLOCKED)
        self.assertEqual(resolution["blocked"]["candidate_methods"], [])
        self.assertIsNone(resolution["resolved"]["blocked"])
        self.assertEqual([item["method_id"] for item in resolution["resolved"]["candidate_methods"]], ["evidence.triangulation", "research.qualitative_coding"])
        kinds = [event["event_type"] for event in self._events()]
        self.assertLess(kinds.index("MethodResolutionBlocked"), kinds.index("MethodResolved"))

    # --- ADR-023: capability resolution -- fail-closed at plan time AND at invocation (both enforcement points) ------
    def test_capability_resolution_is_honest_at_plan_time_and_every_capability_call_went_through_the_gate(self):
        from ai_lego import resolve_spec_root

        record = self.result["capability_resolution"]
        self.assertEqual(record["refs"], ["transcribe", "literature_search", "run_statistics", "artifact.generate_research_paper"])
        # Independent oracle computed from the spec root (file exists AND status ACTIVE): it moves with the contracts.
        contracts_dir = resolve_spec_root() / "capabilities" / "contracts"
        expected_unresolved = [ref for ref in record["refs"] if not active_contract_on_disk(contracts_dir, ref)]
        resolution = record["resolution"]
        if expected_unresolved:
            self.assertEqual(resolution["blocked"]["status"], CAPABILITY_RESOLUTION_BLOCKED)
            self.assertEqual(resolution["blocked"]["unresolved"], expected_unresolved)
            self.assertEqual(resolution["blocked"]["resolvable"], [ref for ref in record["refs"] if ref not in expected_unresolved])
            self.assertEqual(resolution["candidate_capabilities"], [])
        else:
            self.assertIsNone(resolution["blocked"])
            self.assertEqual([candidate["ref"] for candidate in resolution["candidate_capabilities"]], record["refs"])
        executability = record["plan_executability"]
        self.assertEqual(executability["fully_resolved"], not expected_unresolved)
        required_unresolved = [
            node["ref"]
            for node in self.result["workflow_ir"]["nodes"]
            if node["node_kind"] == "capability" and node["ref"] in expected_unresolved and node.get("necessity", "RECOMMENDED").startswith("REQUIRED_")
        ]
        self.assertEqual([entry["ref"] for entry in executability["blocking"]], required_unresolved)
        # A run that produced a result had an executable plan -- the plan-level BLOCKED transition is wired (ADR-023 Decision 3).
        self.assertEqual(required_unresolved, [], "a REQUIRED_* ref without a contract must have aborted the run at METHODS_RESOLVED -> BLOCKED")
        self.assertTrue(executability["executable"])
        # What went through the gate is the catalog's own observation log, not a literal the slice wrote.
        invoked_refs = [entry["ref"] for entry in record["invoked"]]
        self.assertEqual(invoked_refs, ["transcribe"] * 4 + ["run_statistics", "literature_search", "artifact.generate_research_paper"])
        for entry in record["invoked"]:
            self.assertEqual(entry["path"], f"capabilities/contracts/{entry['ref']}.capability.yaml")
            self.assertEqual(entry["version"], "1.0.0")
            self.assertRegex(entry["content_sha256"], r"^[0-9a-f]{64}$")
        # Nothing bypasses the plane any more; the declaration mechanism is kept and must stay consistent with disk.
        outside = record["performed_outside_capability_plane"]
        self.assertEqual(outside, {})
        self.assertTrue(set(outside) <= set(expected_unresolved), "a declared bypass must not survive its ref gaining a contract")
        self.assertEqual(record["not_performed"], [ref for ref in record["refs"] if ref not in set(invoked_refs) and ref not in outside])
        self.assertEqual(record["not_performed"], [])
        # The verdict reaches the authoritative outputs (manifest results block, audit record), not only a nested field.
        manifest_results = self.result["manifest"]["results"]
        self.assertEqual(manifest_results["capability_plan_executable"], executability["executable"])
        self.assertEqual(manifest_results["capability_plan_fully_resolved"], executability["fully_resolved"])
        self.assertEqual(manifest_results["unresolved_capabilities"], expected_unresolved)
        self.assertEqual(self.result["audit"]["capability_version"], "1.0.0")
        capability_logs = [entry for entry in self.result["manifest"]["method_execution_log"] if "capability_ref" in entry]
        self.assertEqual([entry["capability_ref"] for entry in capability_logs], invoked_refs, "one manifest entry per observed invocation, in order")
        statistics_log = next(entry for entry in capability_logs if entry["block_id"] == "run_statistics")
        self.assertEqual((statistics_log["capability_version"], statistics_log["method_version"], statistics_log["contract_path"]), ("1.0.0", "1.0.0", "capabilities/contracts/run_statistics.capability.yaml"))
        self.assertNotEqual(statistics_log["execution_id"], self.result["manifest"]["execution"]["execution_id"], "an invocation id is not the execution id")
        self.assertRegex(statistics_log["contract_sha256"], r"^[0-9a-f]{64}$")
        self.assertEqual(len({entry["execution_id"] for entry in capability_logs}), len(capability_logs), "every invocation has its own id")
        # No host path in the append-only ledger: BOTH catalog labels are content fingerprints.
        self.assertRegex(record["catalog"], r"^live:capabilities/contracts@[0-9a-f]{12}$")
        events = self._events()
        method_resolved = next(event for event in events if event["event_type"] == "MethodResolved")
        self.assertRegex(method_resolved["payload"]["catalog"], r"^live:methods/contracts@[0-9a-f]{12}$")
        kinds = [event["event_type"] for event in events]
        resolution_event = "CapabilityResolutionBlocked" if expected_unresolved else "CapabilitiesResolved"
        self.assertLess(kinds.index("MethodResolved"), kinds.index(resolution_event))
        self.assertLess(kinds.index(resolution_event), kinds.index("StatisticsCalculated"))
        # Ingest transcription is contract-backed: every TranscriptGenerated event names the contract that ran.
        transcript_events = [event for event in events if event["event_type"] == "TranscriptGenerated"]
        self.assertEqual(len(transcript_events), 4)
        for event in transcript_events:
            self.assertEqual((event["payload"]["capability_ref"], event["payload"]["contract_path"]), ("transcribe", "capabilities/contracts/transcribe.capability.yaml"))
        published = next(event for event in events if event["event_type"] == "ArtifactPublished")
        self.assertIs(published["payload"]["contract_backed"], True)
        self.assertEqual(published["payload"]["contract_path"], "capabilities/contracts/artifact.generate_research_paper.capability.yaml")

    def test_method_executions_went_through_the_method_atlas_gate(self):
        """ADR-023 Consequences 5: research.qualitative_coding runs (v11 coding, v12 re-analysis) are gated like capabilities."""
        invoked = self.result["method_resolution"]["invoked"]
        self.assertEqual([entry["ref"] for entry in invoked], ["research.qualitative_coding", "evidence.triangulation", "research.qualitative_coding"])
        self.assertEqual(invoked[1]["path"], "methods/contracts/evidence.triangulation.contract.yaml")
        self.assertEqual(invoked[2]["path"], "methods/contracts/research.qualitative_coding.contract.yaml")
        coding_log = next(entry for entry in self.result["manifest"]["method_execution_log"] if entry["block_id"] == "coding")
        self.assertEqual(coding_log["method_version"], invoked[0]["version"])
        self.assertEqual(coding_log["contract_sha256"], invoked[0]["content_sha256"])

    def test_an_expired_bypass_declaration_refuses_to_start_before_any_side_effect(self):
        """Mutation: declare a bypass for a ref that HAS an ACTIVE contract -- the run must abort BEFORE the runtime dir or ingest exist."""
        import ai_lego.apps.cli.run_research_slice as slice_module
        from ai_lego.apps.cli.run_research_slice import SliceConfig, run_research_slice

        with tempfile.TemporaryDirectory(prefix="ai-lego-bypass-expired-") as tmp:
            runtime = Path(tmp) / "runtime"
            with mock.patch.dict(slice_module.OUTSIDE_CAPABILITY_PLANE, {"transcribe": "synthetic bypass declaration for this mutation test"}, clear=True):
                with self.assertRaisesRegex(InvariantViolation, "CAPABILITY_BYPASS_NO_LONGER_JUSTIFIED: transcribe"):
                    run_research_slice(SliceConfig(runtime_dir=runtime, transcription="fixture", review="fixture"))
            self.assertFalse(runtime.exists(), "the guard must fire before the runtime directory is even prepared")

    def _live_catalog_without(self, *dropped: str):
        from ai_lego import resolve_spec_root
        from ai_lego.platform.ai_execution.capability_resolver import CapabilityCatalog

        live = CapabilityCatalog.from_spec_root(resolve_spec_root())
        return CapabilityCatalog(label=f"mutation:live-minus-{'+'.join(dropped)}", contracts={ref: entry for ref, entry in live.contracts.items() if ref not in dropped})

    def _events_at(self, runtime: Path):
        ledger = runtime / "data" / "events" / "ledger.jsonl"
        if not ledger.is_file():
            return []
        return [json.loads(line) for line in ledger.read_text(encoding="utf-8").splitlines() if line.strip()]

    def test_uncontracted_capability_invocation_aborts_at_the_first_invocation_before_any_ledger_event(self):
        """Mutation: an empty capability catalog stops the run at the very first `invoke` (ingest transcription), never degrades."""
        from ai_lego.apps.cli.run_research_slice import SliceConfig, run_research_slice
        from ai_lego.platform.ai_execution.capability_resolver import CapabilityCatalog

        with tempfile.TemporaryDirectory(prefix="ai-lego-cap-block-") as tmp:
            runtime = Path(tmp) / "runtime"
            empty_catalog = classmethod(lambda cls, spec_root: cls.empty("mutation:empty-capability-catalog"))
            with mock.patch.object(CapabilityCatalog, "from_spec_root", empty_catalog):
                with self.assertRaisesRegex(InvariantViolation, "CAPABILITY_RESOLUTION_BLOCKED.*transcribe"):
                    run_research_slice(SliceConfig(runtime_dir=runtime, transcription="fixture", review="fixture"))
            self.assertTrue((runtime / MARKER_NAME).is_file(), "the runtime dir was prepared (so an empty ledger below is a real observation, not a wrong path)")
            self.assertEqual(self._events_at(runtime), [], "the first transcribe invocation is gated before its DocumentUploaded event")
            self.assertFalse((runtime / "results" / "slice_result.json").exists())
            self.assertFalse((runtime / "platform" / "execution" / "manifest.json").exists())

    def test_missing_required_capability_contract_blocks_the_plan_before_plan_compiled(self):
        """ADR-023 Decision 3 wired: no contract for a REQUIRED_BY_RISK ref -> METHODS_RESOLVED -> BLOCKED, abort, nothing downstream."""
        from ai_lego.apps.cli.run_research_slice import SliceConfig, run_research_slice
        from ai_lego.platform.ai_execution.capability_resolver import CapabilityCatalog

        catalog = self._live_catalog_without("artifact.generate_research_paper")
        with tempfile.TemporaryDirectory(prefix="ai-lego-plan-block-") as tmp:
            runtime = Path(tmp) / "runtime"
            with mock.patch.object(CapabilityCatalog, "from_spec_root", classmethod(lambda cls, spec_root: catalog)):
                with self.assertRaisesRegex(InvariantViolation, "CAPABILITY_PLAN_NOT_EXECUTABLE.*artifact.generate_research_paper"):
                    run_research_slice(SliceConfig(runtime_dir=runtime, transcription="fixture", review="fixture"))
            events = self._events_at(runtime)
            kinds = [event["event_type"] for event in events]
            self.assertIn("MethodResolved", kinds)
            blocked = next(event for event in events if event["event_type"] == "CapabilityResolutionBlocked")
            self.assertEqual(blocked["payload"]["signal"], CAPABILITY_RESOLUTION_BLOCKED)
            self.assertIs(blocked["payload"]["plan_executability"]["executable"], False)
            self.assertEqual([entry["ref"] for entry in blocked["payload"]["plan_executability"]["blocking"]], ["artifact.generate_research_paper"])
            transition = blocked["payload"]["transition"]
            self.assertEqual((transition["from_state"], transition["to_state"], transition["trigger_signal"]), ("METHODS_RESOLVED", "BLOCKED", CAPABILITY_RESOLUTION_BLOCKED))
            for downstream in ("HumanCodeLocked", "StatisticsCalculated", "ArtifactPublished"):
                self.assertNotIn(downstream, kinds)
            self.assertFalse((runtime / "results" / "slice_result.json").exists())
            self.assertFalse((runtime / "artifacts" / "research_memo.md").exists())
            self.assertFalse((runtime / "platform" / "execution" / "manifest.json").exists())

    def test_missing_recommended_capability_contract_is_recorded_and_the_run_continues(self):
        """Atlas 14.3: an unresolved RECOMMENDED node (literature_search) never blocks; it is recorded as not invocable."""
        from ai_lego.apps.cli.run_research_slice import SliceConfig, run_research_slice
        from ai_lego.platform.ai_execution.capability_resolver import CapabilityCatalog

        catalog = self._live_catalog_without("literature_search")
        with tempfile.TemporaryDirectory(prefix="ai-lego-recommended-") as tmp:
            runtime = Path(tmp) / "runtime"
            with mock.patch.object(CapabilityCatalog, "from_spec_root", classmethod(lambda cls, spec_root: catalog)):
                result = run_research_slice(SliceConfig(runtime_dir=runtime, transcription="fixture", review="fixture"))
            verdict = result["capability_resolution"]["plan_executability"]
            self.assertEqual((verdict["executable"], verdict["fully_resolved"]), (True, False))
            self.assertEqual([entry["ref"] for entry in verdict["not_invocable"]], ["literature_search"])
            self.assertEqual(verdict["blocking"], [])
            self.assertEqual([t["to_state"] for t in result["state_transitions"]], PRIMARY_PATH)
            self.assertEqual(result["manifest"]["results"]["unresolved_capabilities"], ["literature_search"])
            self.assertIn("CapabilityResolutionBlocked", [event["event_type"] for event in self._events_at(runtime)])

    def test_state_machine_path_is_the_legal_no_skip_sequence(self):
        path = [transition["to_state"] for transition in self.result["state_transitions"]]
        self.assertEqual(path, PRIMARY_PATH)
        blocked = next(t for t in self.result["state_transitions"] if t["to_state"] == "BLOCKED")
        self.assertEqual(blocked["trigger_signal"], METHOD_RESOLUTION_BLOCKED)
        approved = next(t for t in self.result["state_transitions"] if t["to_state"] == "APPROVED")
        self.assertEqual(approved["authority_level"], "A4")
        verifying = next(t for t in self.result["state_transitions"] if t["to_state"] == "VERIFYING")
        gate_ids = [g["gate_id"] for g in verifying["gate_results"]]
        self.assertEqual(gate_ids[:len(GATE_ORDER)], GATE_ORDER)
        self.assertEqual(set(gate_ids[len(GATE_ORDER):]), set(HIGH_RISK_GATE_IDS))

    def test_terminal_state_guard_actually_refuses_a_downstream_emit(self):
        branch = self.result["blocked_then_cancelled"]
        self.assertEqual([t["to_state"] for t in branch["transitions"]], ["BLOCKED", "CANCELLED"])
        self.assertEqual(branch["downstream_statistics"], [])
        self.assertEqual(branch["downstream_artifacts"], [])
        self.assertEqual(branch["downstream_audit"], [])
        self.assertTrue(branch["terminal_guard_verified"], "the orchestrator itself asserts the guard fired; a False here would mean the guard was bypassed")

    # --- Trusted Compute + gates, including R3/R4 mandatory injection --------------------------------------------
    def test_statistics_are_deterministic_compute_and_gates_are_real_validated_records(self):
        statistics = self.result["statistics"]
        self.assertAlmostEqual(statistics["kappa"], 0.75)
        self.assertEqual(statistics["engine"], "local_python_deterministic_compute")
        self.assertEqual(statistics["provenance"]["epistemic_type"], "CALCULATED_RESULT")
        self.assertLess(statistics["confidence_interval_95"][1] - statistics["confidence_interval_95"][0], 0.5)
        gates = self.result["gates"]
        for gate_id in GATE_ORDER:
            self.assertEqual(gates[gate_id], "PASS", gate_id)
        for gate_id in HIGH_RISK_GATE_IDS:
            self.assertEqual(gates[gate_id], "NOT_APPLICABLE", gate_id)
        for gate in self.result["gate_results"]:
            self.assertTrue(gate["evidence"] or gate["status"] == "NOT_APPLICABLE")
            if gate["status"] == "NOT_APPLICABLE":
                self.assertTrue(gate.get("rationale"))

    def test_gate_failure_aborts_before_any_downstream_artifact_is_written(self):
        """A monkeypatched FAIL must raise, and nothing (manifest/artifact) must exist for that run."""
        from ai_lego.apps.cli.run_research_slice import SliceConfig, run_research_slice
        import ai_lego.modules.research.gates as gates_module

        original = gates_module.evaluate_method_specific_gates

        def forced_fail(**kwargs):
            results = original(**kwargs)
            results[0]["status"] = "FAIL"
            return results

        with tempfile.TemporaryDirectory(prefix="ai-lego-gate-fail-") as tmp:
            runtime = Path(tmp) / "runtime"
            with mock.patch("ai_lego.apps.cli.run_research_slice.evaluate_method_specific_gates", forced_fail):
                with self.assertRaisesRegex(InvariantViolation, "METHOD_GATE_FAILED"):
                    run_research_slice(SliceConfig(runtime_dir=runtime, transcription="fixture", review="fixture"))
            self.assertFalse((runtime / "results" / "slice_result.json").exists())
            self.assertFalse((runtime / "artifacts" / "research_memo.md").exists())
            self.assertFalse((runtime / "platform" / "execution" / "manifest.json").exists())

    def test_workflow_ir_was_compiled_from_the_real_recipe(self):
        ir = self.result["workflow_ir"]
        self.assertEqual(ir["compiled_from"]["recipe_id"], "research-qualitative-v1")
        self.assertEqual(len(ir["nodes"]), 7)
        self.assertEqual(ir["risk_tier"], "R4")
        self.assertEqual(self.result["method_resolution"]["method_ids"], ["evidence.triangulation", "research.qualitative_coding"])

    # --- ledger + manifest hygiene ------------------------------------------------------------------------------
    def test_ledger_causation_and_sequence_never_cross_tenant_boundaries(self):
        events = self._events()
        by_id = {event["event_id"]: event for event in events}
        next_sequence: dict[str, int] = {}
        for event in events:
            expected = next_sequence.get(event["aggregate_id"], 0) + 1
            self.assertEqual(event["sequence"], expected)
            next_sequence[event["aggregate_id"]] = expected
            if event["causation_id"] is not None:
                self.assertEqual(by_id[event["causation_id"]]["tenant_id"], event["tenant_id"])
        self.assertEqual(sum(1 for event in events if event["event_type"] == "DocumentUploaded"), self.result["source_event_count"])

    def test_manifest_pins_four_documents_a_real_commit_prompt_version_and_method_log(self):
        manifest = self.result["manifest"]
        self.assertEqual({doc["document_id"] for doc in manifest["documents"]}, {"ai-lego.master-plan", "ai-lego.method-atlas", "ai-lego.execution-contract", "ai-lego.architecture-constitution"})
        self.assertTrue(all(len(doc["sha256"]) == 64 for doc in manifest["documents"]))
        commit = manifest["source"]["commit"]
        self.assertTrue(len(commit) == 40 or commit == "GIT_UNAVAILABLE", commit)
        self.assertEqual(manifest["ai"]["prompt_version"], "11")
        method_ids = {entry["method_id"] for entry in manifest["method_execution_log"]}
        self.assertIn("research.qualitative_coding", method_ids)
        for capability_ref in ("transcribe", "run_statistics", "literature_search", "artifact.generate_research_paper"):
            self.assertIn(capability_ref, method_ids)

    def test_timestamp_replays_before_first_and_after_last_are_sane(self):
        replays = self.result["timestamp_replays"]
        self.assertEqual(replays["before_first"]["event_ids"], [])
        self.assertEqual(len(replays["after_last"]["event_ids"]), len(self._events()))

    # --- audio / transcription evidence -------------------------------------------------------------------------
    def test_audio_was_decoded_and_every_transcript_names_its_adapter(self):
        transcriptions = self.result["transcriptions"]
        self.assertEqual(len(transcriptions), 4)
        for row in transcriptions:
            self.assertGreater(row["decoded_sample_rate"], 0)
            self.assertGreater(row["decoded_frames"], 0)
            self.assertTrue(10 <= row["duration_seconds"] <= 30)
            self.assertEqual(row["audio_mode"], self.result["adapters"]["audio_mode"])
            self.assertEqual(row["transcription_mode"], self.result["adapters"]["transcription_mode"])
            self.assertTrue(row["segments"])
            for segment in row["segments"]:
                self.assertRegex(segment["speaker"], r"^SPEAKER_\d\d$")
                self.assertEqual(segment["diarization"], "NAIVE_ALTERNATING_SPEAKERS_PLACEHOLDER")

    def test_noisy_p4_identity_sentence_is_redacted_precisely(self):
        payload = next(event["payload"] for event in self._events() if event["event_type"] == "TranscriptGenerated" and event["payload"]["subject_id"] == "P4")
        for marker in ("[NAME]", "[EMPLOYER]", "[CITY]"):
            self.assertIn(marker, payload["redacted_transcript"])
        self.assertNotIn("Nguyen", payload["redacted_transcript"])
        self.assertIn("[CITY]. Reading project updates", payload["redacted_transcript"])

    # --- interactive review / annotation / theme-reject coverage -------------------------------------------------
    def test_annotation_and_theme_grouping_reject_are_real_events(self):
        events = self._events()
        kinds = [event["event_type"] for event in events]
        self.assertIn("AnnotationAdded", kinds)
        annotation = next(event["payload"] for event in events if event["event_type"] == "AnnotationAdded")
        for value in P2_SYNTHETIC_PII_VALUES:
            self.assertNotIn(value, annotation["quote"])
        diff = self.result["theme_grouping_diff"]
        self.assertEqual(diff["human_decision"], "REJECTED")
        self.assertTrue(diff["diff"])

    def test_no_detected_pii_reaches_the_ledger_for_any_subject(self):
        """The ledger PII guard is real: every event's serialized payload is free of every detected PII value."""
        events_text = "\n".join(json.dumps(event) for event in self._events())
        self.assertNotIn("Mara Linden", events_text)
        self.assertNotIn("Noor Patel", events_text)
        self.assertNotIn("Lex Nguyen", events_text)
        for value in P2_SYNTHETIC_PII_VALUES:
            self.assertNotIn(value, events_text)

    # --- erasure ------------------------------------------------------------------------------------------------
    def test_p2_deletion_unlinks_both_fixture_and_raw_cas_audio(self):
        erasure = self.result["source_audio_erasure"]
        self.assertEqual(erasure["method"], "PLAIN_UNLINK_SYNTHETIC_SCOPE")
        self.assertFalse(erasure["physical_sanitization_claimed"])
        self.assertEqual(erasure["transcription_cache_records_scrubbed"], 1)
        removed = erasure["erased"][0]
        self.assertFalse(Path(removed["fixture_path"]).exists())
        self.assertFalse(Path(removed["cas_target"]).exists())
        with self.assertRaisesRegex(InvariantViolation, "CAS_TENANT_ACCESS_DENIED"):
            TenantScopedCas(self.runtime / "data").read(NORDBROOK.tenant_id, removed["cas_path"])
        p1_audio = next(row["audio_path"] for row in self.result["transcriptions"] if row["subject_id"] == "P1")
        self.assertTrue(Path(p1_audio).is_file())

    def test_p2_plaintext_is_absent_from_every_runtime_artefact_and_key_material_is_gone(self):
        runtime_text = "\n".join(path.read_text(encoding="utf-8") for path in self.runtime.rglob("*") if path.is_file() and path.suffix in {".json", ".jsonl", ".md"})
        for value in P2_SYNTHETIC_PII_VALUES:
            self.assertNotIn(value, runtime_text)
        vault = read_json(self.runtime / "platform" / "security" / "vault.json")
        p2 = next(record for record in vault["key_records"] if record.get("subject_id") == "P2")
        self.assertEqual(p2["status"], "DESTROYED")
        self.assertNotIn(p2["key_id"], vault["wrapped_deks"])

    def test_destruction_scope_honestly_reports_the_unreachable_backup_copy(self):
        vault = read_json(self.runtime / "platform" / "security" / "vault.json")
        p2 = next(record for record in vault["key_records"] if record.get("subject_id") == "P2")
        live = next(copy for copy in p2["physical_copies"] if copy["is_live"])
        backup = next(copy for copy in p2["physical_copies"] if not copy["is_live"])
        self.assertTrue(live["destroyed"])
        self.assertFalse(backup["destroyed"], "the vault cannot reach a WORM backup copy at destruction time; claiming it destroyed would be false")

    def test_restore_replay_gate_blocks_then_reapplies_independent_destruction(self):
        restore = self.result["backup_restore"]
        self.assertEqual(restore["decrypt_before_replay"], "DECRYPT_BLOCKED_PENDING_REPLAY")
        self.assertEqual(restore["decrypt_after_replay"], "REDACTED")
        self.assertTrue(restore["restore_event"]["decrypt_serviceable"])
        self.assertEqual(restore["restore_event"]["replay_gate"]["status"], "COMPLETE")

    def test_deletion_request_records_all_ten_steps_in_order_with_dual_deletion_evidence_and_real_timestamps(self):
        request = self.result["deletion_request"]
        self.assertEqual([step["step"] for step in request["steps"]], list(DELETION_STEPS))
        self.assertTrue(all(step["status"] == "passed" for step in request["steps"]))
        timestamps = [step["completed_at"] for step in request["steps"]]
        self.assertEqual(timestamps, sorted(timestamps))
        deletion_step = next(step for step in request["steps"] if step["step"] == "Deletion")
        approval_step = next(step for step in request["steps"] if step["step"] == "Approval")
        self.assertLessEqual(approval_step["completed_at"], deletion_step["completed_at"])
        evidence = request["steps"][-1]["evidence_ref"]
        event_ref, audit_ref = evidence.split(";")
        self.assertTrue(event_ref.startswith("EV-"))
        self.assertTrue(audit_ref.startswith("audit://"))
        redacted = next(event for event in self._events() if event["event_type"] == "PersonalDataRedacted")
        self.assertEqual(redacted["event_id"], event_ref)
