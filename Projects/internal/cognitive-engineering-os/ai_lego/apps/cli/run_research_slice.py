"""Phase 5 Research Mode vertical slice -- the 28-step walkthrough of MVP_VERTICAL_SLICE_PLAN.md section 3.

Synthetic data only. Reads canonical schemas from the spec root, writes every
runtime artefact under an isolated, ownership-marked runtime directory
(never inside the spec root or an unrelated pre-existing directory), and
validates every record against its schema BEFORE it is persisted (ledger
events, key records) or used to decide anything (gates, state transitions).

Design decision this file makes explicit (see docs/PHASE5_RESEARCH_SLICE.md):
if any method-specific gate FAILs, the run raises immediately -- before the
artifact is published, before the manifest/audit/step-status are written.
There is no separate "PASS but a gate failed" state to accidentally report:
the on-disk result, the CLI exit code, and `results.status`/`step_status`
are only ever written for a run that reached the end with every gate PASS.

Run::

    python -m ai_lego.apps.cli.run_research_slice --transcription fixture
    python -m ai_lego.apps.cli.run_research_slice --transcription offline-stt --review interactive
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from ai_lego import PRODUCT_ROOT, REPO_ROOT, __version__, resolve_spec_root
from ai_lego.compute.statistics.reliability import interrater_reliability_result
from ai_lego.core.contracts.ledger_guards import PiiLedgerGuard
from ai_lego.core.contracts.runtime_dir import guard_runtime_dir, prepare_runtime_dir
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.claim import claim_record
from ai_lego.core.domain.evidence import build_sentence_provenance, evidence_record, format_audio_timestamp, source_node
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.core.domain.tenant import CASCADIA, NORDBROOK
from ai_lego.core.support import DEFAULT_CLOCK, read_json, sha256_json, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.errors import AdapterUnavailable, InvariantViolation
from ai_lego.modules.knowledge.erasure import erase_subject_source_media
from ai_lego.modules.knowledge.ingest.audio_fixtures import SyntheticToneAudioFactory, WindowsSapiSpeechAudioFactory
from ai_lego.modules.knowledge.ingest.pii import detect_synthetic_pii, redact_transcript
from ai_lego.modules.knowledge.ingest.transcription import FixtureTranscriber, OfflineFasterWhisperTranscriber
from ai_lego.modules.knowledge.provenance import build_evidence_graph, locator_from_transcript, reverse_trace
from ai_lego.modules.research.gates import all_gates_pass, evaluate_method_specific_gates
from ai_lego.modules.research.qualitative_coding import assemble_coding_outputs, build_v12_over_merged_theme_set
from ai_lego.modules.research.review import fixture_review, locked_code_from_review, review_code_interactively
from ai_lego.modules.research.synthetic_fixtures import PROJECT_ID, SUGGESTED_LABEL, SYNTHETIC_CONSENT, SYNTHETIC_TRANSCRIPTS, expanded_synthetic_coder_judgments
from ai_lego.platform.ai_execution.current_state import build_current_state
from ai_lego.platform.ai_execution.deletion import DeletionRequestBuilder
from ai_lego.platform.ai_execution.mandatory_gates import inject_mandatory_gates
from ai_lego.platform.ai_execution.manifest import build_manifest, describe_git_source, manifest_documents
from ai_lego.platform.ai_execution.method_resolver import DEPRECATED_ALIAS, METHOD_RESOLUTION_BLOCKED, MethodCatalog, state_transition
from ai_lego.platform.ai_execution.replay import project
from ai_lego.platform.ai_execution.rollback_plan import build_rollback_plan
from ai_lego.platform.workflow.ir import compile_recipe_to_workflow_ir
from ai_lego.security.key_vault.local_key_vault import DECRYPT_BLOCKED_PENDING_REPLAY, REDACTED, LocalKeyVault

RUN_ID = "RUN-PHASE5-SYNTHETIC-001"
EXECUTION_ID = "EX-PHASE5-SYNTHETIC-001"
TASK_ID = "TASK-PHASE5-SYNTHETIC-001"
RECIPE_ID = "research-qualitative-v1"
SLICE_RISK_TIER = "R4"  # subject DEK destruction is an irreversible R4 action (EC section 8)
DELETION_AUTHORIZATION = "AUTH-SYNTHETIC-P2-ERASURE-A4"
TRANSCRIPTION_MODES = ("fixture", "offline-stt")
REVIEW_MODES = ("fixture", "interactive")
GOAL_TEXT = "Code these interview transcripts for after-hours boundary themes and check inter-rater reliability between two coders."

S = {
    "tenant": "ai-lego://specs/domain/tenant.schema.yaml",
    "artifact_uri": "ai-lego://specs/artifact/portable-uri.schema.yaml#/definitions/artifact_uri",
    "cas_path": "ai-lego://specs/artifact/cas-path.schema.yaml#/definitions/cas_path",
    "envelope": "ai-lego://specs/security/personal-data-envelope.schema.yaml",
    "key_destruction": "ai-lego://specs/security/key-vault-lifecycle.schema.yaml#/definitions/key_destruction_record",
    "vault_restore": "ai-lego://specs/security/key-vault-lifecycle.schema.yaml#/definitions/vault_restore_event",
    "evidence_graph": "ai-lego://specs/evidence/evidence-graph.schema.yaml",
    "sentence_provenance": "ai-lego://specs/evidence/sentence-provenance.schema.yaml",
    "redacted_event": "ai-lego://specs/domain/personal-data-redacted-event.schema.yaml",
    "manifest": "ai-lego://specs/execution/manifest.schema.yaml",
    "workflow_ir": "ai-lego://specs/workflow/workflow-ir.schema.yaml",
    "transition": "ai-lego://specs/execution/execution-state-machine.schema.yaml#/state_transition_event",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
    "deletion_request": "ai-lego://specs/execution/data-deletion.schema.yaml#/deletion_request",
    "current_state": "ai-lego://specs/execution/current-state.schema.yaml",
    "rollback": "ai-lego://specs/execution/rollback.schema.yaml",
}


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    transcription: str = "fixture"
    review: str = "fixture"
    reset: bool = True
    input_fn: Callable[[str], str] = field(default=input)
    output_fn: Callable[[str], Any] = field(default=print)


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-research-slice"


def select_adapters(transcription_mode: str) -> tuple[Any, Any]:
    if transcription_mode == "fixture":
        return SyntheticToneAudioFactory(), FixtureTranscriber()
    if transcription_mode == "offline-stt":
        available, reason = WindowsSapiSpeechAudioFactory.availability()
        if not available:
            raise AdapterUnavailable(f"SAPI_UNAVAILABLE: {reason}")
        return WindowsSapiSpeechAudioFactory(), OfflineFasterWhisperTranscriber()
    raise InvariantViolation(f"TRANSCRIPTION_MODE_UNKNOWN: {transcription_mode!r} (expected one of {TRANSCRIPTION_MODES})")


def run_research_slice(config: SliceConfig) -> dict[str, Any]:
    if config.review not in REVIEW_MODES:
        raise InvariantViolation(f"REVIEW_MODE_UNKNOWN: {config.review!r}")
    spec_root = resolve_spec_root(config.spec_root)
    runtime = (config.runtime_dir or default_runtime_dir()).resolve()
    allowed_repo_location = PRODUCT_ROOT / ".runtime"
    guard_runtime_dir(runtime, spec_root, REPO_ROOT, allowed_repo_location)
    audio_factory, transcriber = select_adapters(config.transcription)
    prepare_runtime_dir(runtime, config.reset)

    clock = DEFAULT_CLOCK
    contracts = SchemaContracts(spec_root)
    pii_guard = PiiLedgerGuard()
    cas = TenantScopedCas(runtime / "data")
    ledger = EventLedger(runtime / "data" / "events" / "ledger.jsonl", RUN_ID, clock, validator=contracts.validate, payload_guard=pii_guard)
    vault = LocalKeyVault(runtime / "platform" / "security" / "vault.json", clock, RUN_ID, validator=contracts.validate)
    nord_aggregate = f"{NORDBROOK.tenant_id}:{PROJECT_ID}"
    cascadia_aggregate = f"{CASCADIA.tenant_id}:{PROJECT_ID}"
    transitions: list[dict[str, Any]] = []
    method_execution_log: list[dict[str, Any]] = []

    def transition(from_state: str | None, to_state: str, offset: float, trigger: str | None = None, gate_results: list[dict[str, Any]] | None = None, authority_level: str | None = None) -> dict[str, Any]:
        event = state_transition(from_state, to_state, clock.at(offset), EXECUTION_ID, trigger, gate_results)
        if authority_level is not None:
            event["authority_level"] = authority_level
        contracts.validate(S["transition"], event, f"state transition {from_state} -> {to_state}")
        transitions.append(event)
        return event

    def emit(tenant_id: str, aggregate_id: str, event_type: str, payload: dict[str, Any], offset: float) -> dict[str, Any]:
        return ledger.append(tenant_id, aggregate_id, event_type, payload, offset)

    # Boot (EC section 10): RECEIVED -> DOCUMENTS_RESOLVED -> CURRENT_STATE_ESTABLISHED -> RISK_CLASSIFIED
    transition(None, "RECEIVED", 0)
    documents = manifest_documents(spec_root)
    transition("RECEIVED", "DOCUMENTS_RESOLVED", 0.1)
    source_description = describe_git_source(PRODUCT_ROOT)
    current_state = build_current_state(TASK_ID, EXECUTION_ID, clock.at(0.15), source_description["commit"], documents)
    contracts.validate(S["current_state"], current_state, "current-state reconstruction")
    write_json(runtime / "platform" / "ai_execution" / "current_state.json", current_state)
    transition("DOCUMENTS_RESOLVED", "CURRENT_STATE_ESTABLISHED", 0.2)
    transition("CURRENT_STATE_ESTABLISHED", "RISK_CLASSIFIED", 0.3)

    for tenant in (NORDBROOK, CASCADIA):
        contracts.validate(S["tenant"], tenant.record(clock.at(1)), tenant.label)
        vault.add_tenant_kek(tenant.tenant_id, 1)

    # Steps 1-4: synthetic audio -> transcript -> tenant-scoped CAS -> DocumentUploaded
    fixture_root = runtime / "data" / "fixtures" / "audio"
    source_records: list[dict[str, Any]] = []
    transcriptions: list[dict[str, Any]] = []
    transcript_authorship = "SOURCE_QUOTATION" if config.transcription == "fixture" else "AI_GENERATED"
    for offset, entry in enumerate(SYNTHETIC_TRANSCRIPTS, start=2):
        audio = audio_factory.synthesize(entry["speech_text"], fixture_root / f"{entry['source_id']}.wav")
        transcription = transcriber.transcribe(audio, entry["speech_text"])
        detected_pii = detect_synthetic_pii(transcription["text"], entry["source_id"])
        pii_guard.register_many(entry["subject_id"], detected_pii)
        cas_path = cas.put(NORDBROOK.tenant_id, Path(audio["audio_path"]).read_bytes())
        uri = cas.artifact_uri(NORDBROOK.label, PROJECT_ID, entry["source_id"], cas_path)
        contracts.validate(S["artifact_uri"], uri, f"{entry['source_id']} artifact URI")
        contracts.validate(S["cas_path"], cas_path, f"{entry['source_id']} CAS path")
        source_records.append({**entry, "artifact_uri": uri, "cas_path": cas_path, "transcription": transcription, "detected_pii": detected_pii})
        transcriptions.append({"source_id": entry["source_id"], "subject_id": entry["subject_id"], **transcription, "provenance": make_provenance("EVIDENCE", transcript_authorship)})
        emit(NORDBROOK.tenant_id, nord_aggregate, "DocumentUploaded", {"source_id": entry["source_id"], "artifact_uri": uri, "audio_mode": audio["audio_mode"], "audio_sha256": audio["audio_sha256"]}, offset)

    nord_consent = cas.put(NORDBROOK.tenant_id, SYNTHETIC_CONSENT)
    cascadia_consent = cas.put(CASCADIA.tenant_id, SYNTHETIC_CONSENT)
    if nord_consent["hash"] != cascadia_consent["hash"] or nord_consent["path"] == cascadia_consent["path"]:
        raise InvariantViolation("CAS_TENANT_ISOLATION_FAILED: identical bytes must share a hash and differ in path")
    emit(NORDBROOK.tenant_id, nord_aggregate, "DocumentUploaded", {"source_id": "SRC-CONSENT-A", "cas_path": nord_consent}, 6)
    emit(CASCADIA.tenant_id, cascadia_aggregate, "DocumentUploaded", {"source_id": "SRC-CONSENT-C", "cas_path": cascadia_consent}, 7)
    write_json(runtime / "modules" / "knowledge" / "transcriptions.json", transcriptions)

    # Steps 5-9: PII fields -> per-subject AES-256-GCM envelopes -> TranscriptGenerated; evidence graph
    for offset, source in enumerate(source_records, start=10):
        encrypted_pii = {field_name: vault.encrypt(NORDBROOK.tenant_id, source["subject_id"], value, "Restricted" if field_name == "name" else "Confidential", offset) for field_name, value in source["detected_pii"].items()}
        for field_name, envelope in encrypted_pii.items():
            contracts.validate(S["envelope"], envelope, f"{source['subject_id']} {field_name} envelope")
        emit(
            NORDBROOK.tenant_id,
            nord_aggregate,
            "TranscriptGenerated",
            {
                "source_id": source["source_id"],
                "subject_id": source["subject_id"],
                "redacted_transcript": redact_transcript(source["transcription"]["text"], source["detected_pii"]),
                "encrypted_pii": encrypted_pii,
                "transcription_mode": source["transcription"]["transcription_mode"],
                "audio_mode": source["transcription"]["audio_mode"],
                "audio_sha256": source["transcription"]["audio_sha256"],
                "naive_diarization": source["transcription"]["segments"][0]["diarization"],
                "provenance": make_provenance("EVIDENCE", transcript_authorship),
            },
            offset,
        )

    p1_locator, p1_precision = locator_from_transcript(source_records[0]["transcription"], SYNTHETIC_TRANSCRIPTS[0]["quote"])
    sources = [source_node(entry["source_id"], f"synthetic audio timestamp {entry['timestamp']}", make_provenance("SOURCE_FACT", "SOURCE_QUOTATION")) for entry in SYNTHETIC_TRANSCRIPTS]
    evidence_1 = evidence_record("E-1", SYNTHETIC_TRANSCRIPTS[0]["quote"], "SRC-1", make_provenance("EVIDENCE", "SOURCE_QUOTATION"))
    evidence_2 = evidence_record("E-2", SYNTHETIC_TRANSCRIPTS[1]["quote"], "SRC-2", make_provenance("EVIDENCE", "SOURCE_QUOTATION"))
    claim_1 = claim_record("C-1", "Participants described after-hours message monitoring as a boundary concern.", [evidence_1, evidence_2], make_provenance("AI_INFERENCE", "AI_GENERATED"))
    evidence_graph = build_evidence_graph(sources, [evidence_1, evidence_2], [claim_1], graph_id=f"EG-{RUN_ID}")
    contracts.validate(S["evidence_graph"], evidence_graph, "evidence graph")
    write_json(runtime / "modules" / "knowledge" / "evidence_graph.json", evidence_graph)

    # Step 10: Coder 1 annotation (Master Plan section 11) -- a PII-free quote, never the raw transcript.
    annotation = {"annotation_id": "ANN-1", "source_id": "SRC-1", "quote": SYNTHETIC_TRANSCRIPTS[0]["quote"], "note": "Initial observation: after-hours checking behaviour tied to a specific incident.", "provenance": make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")}
    emit(NORDBROOK.tenant_id, nord_aggregate, "AnnotationAdded", annotation, 11)

    # Step 11: natural-language goal, resolved by compiling the real (already-built) Recipe to Workflow IR --
    # this slice's Plan Compiler is "resolve the goal's method/capability steps from the versioned Recipe",
    # not a separate NL-parsing component (see docs/PHASE5_RESEARCH_SLICE.md OQ-P5-2 for the honest scope note).
    workflow_ir = compile_recipe_to_workflow_ir(spec_root, RECIPE_ID, SLICE_RISK_TIER)
    contracts.validate(S["workflow_ir"], workflow_ir, "workflow IR")
    emit(NORDBROOK.tenant_id, nord_aggregate, "GoalCompiledToWorkflow", {"goal": GOAL_TEXT, "recipe_id": RECIPE_ID, "node_count": len(workflow_ir["nodes"])}, 11.5)

    # Steps 12-13: method resolution blocks against a historical catalog, resumes against the live one.
    method_ids = sorted({node["method_id"] for node in workflow_ir["nodes"] if node["node_kind"] == "method"})
    historical = MethodCatalog.empty("historical-snapshot:pre-2026-08-30 (research.qualitative_coding not yet contracted, P1-GAP-AI-9)")
    blocked_resolution = historical.resolve(method_ids)
    contracts.validate(S["method_resolution"], blocked_resolution, "blocked method resolution")
    if blocked_resolution["blocked"] is None or blocked_resolution["blocked"]["status"] != METHOD_RESOLUTION_BLOCKED:
        raise InvariantViolation("METHOD_BLOCK_NOT_TRIGGERED: an empty catalog must block resolution")
    blocked_transition = transition("RISK_CLASSIFIED", "BLOCKED", 20, trigger=METHOD_RESOLUTION_BLOCKED)
    emit(NORDBROOK.tenant_id, nord_aggregate, "MethodResolutionBlocked", {"signal": METHOD_RESOLUTION_BLOCKED, "deprecated_alias": DEPRECATED_ALIAS, "catalog": historical.label, "resolution": blocked_resolution, "transition": blocked_transition}, 20)
    live = MethodCatalog.from_spec_root(spec_root)
    resolved_resolution = live.resolve(method_ids)
    contracts.validate(S["method_resolution"], resolved_resolution, "live method resolution")
    if resolved_resolution["blocked"] is not None:
        raise InvariantViolation(f"METHOD_RESOLUTION_STILL_BLOCKED: {resolved_resolution['blocked']['reason']}")
    resumed_transition = transition("BLOCKED", "METHODS_RESOLVED", 21)
    emit(NORDBROOK.tenant_id, nord_aggregate, "MethodResolved", {"method_ids": method_ids, "catalog": live.label, "resolution": resolved_resolution, "transition": resumed_transition}, 21)

    # Steps 14-15: human review. `quote` is always the source's own PII-free `quote` field -- never the raw transcript.
    if config.review == "fixture":
        locked_code, ai_review = fixture_review()
    else:
        primary = review_code_interactively("AI-SUG-1", "SRC-1", SYNTHETIC_TRANSCRIPTS[0]["quote"], SUGGESTED_LABEL, config.input_fn, config.output_fn)
        if primary["action"] != "ACCEPT_AND_LOCK":
            raise InvariantViolation("INTERACTIVE_LOCK_REQUIRED: the slice needs one explicit ACCEPT_AND_LOCK for the human-locked fact")
        locked_code = locked_code_from_review(primary, "CODE-LOCKED-P1-001")
        ai_review = review_code_interactively("AI-SUG-2", "SRC-2", SYNTHETIC_TRANSCRIPTS[1]["quote"], SUGGESTED_LABEL, config.input_fn, config.output_fn)
    emit(NORDBROOK.tenant_id, nord_aggregate, "HumanCodeLocked", locked_code, 22)
    emit(NORDBROOK.tenant_id, nord_aggregate, "AISuggestionReviewed", {"suggestion_id": ai_review["suggestion_id"], "action": ai_review["action"], "result_label": ai_review["result_label"]}, 23)
    coding_outputs = assemble_coding_outputs(locked_code, ai_review, clock.at(23.5))

    # Steps 16 (plan/rollback/approval) + real recovery-plan and current-state records before each transition.
    transition("METHODS_RESOLVED", "PLAN_COMPILED", 24)
    rollback_plan = build_rollback_plan("RB-PHASE5-SYNTHETIC-001", TASK_ID, EXECUTION_ID, {})
    contracts.validate(S["rollback"], rollback_plan, "rollback plan")
    write_json(runtime / "platform" / "ai_execution" / "rollback_plan.json", rollback_plan)
    transition("PLAN_COMPILED", "ROLLBACK_VALIDATED", 24.1)
    transition("ROLLBACK_VALIDATED", "APPROVED", 24.2, authority_level="A4")
    transition("APPROVED", "EXECUTING", 24.3)

    # Steps 16-18 continued: Trusted Compute statistics (never LLM mental arithmetic); champion v11 theme set.
    coder_one, coder_two = expanded_synthetic_coder_judgments()
    statistics = interrater_reliability_result(coder_one, coder_two)
    emit(NORDBROOK.tenant_id, nord_aggregate, "StatisticsCalculated", statistics, 24.5)
    method_execution_log.append(
        {
            "execution_id": "EX-METHOD-QUALCODE-001",
            "method_id": "research.qualitative_coding",
            "method_version": live.contracts["research.qualitative_coding"]["version"],
            "workflow_id": workflow_ir["id"],
            "block_id": "coding",
            "prompt_version": "11",
        }
    )
    themes_v11 = coding_outputs["theme_set"]["themes"]
    golden_hash_v11 = sha256_json(themes_v11)
    emit(NORDBROOK.tenant_id, nord_aggregate, "ThemeSetProduced", {"prompt_version": 11, "themes": themes_v11}, 25)

    # Step 21: human reviews an AI grouping suggestion and rejects it; the system records a Diff, never an overwrite.
    theme_grouping_diff = {
        "theme_id": themes_v11[0]["theme_id"] if themes_v11 else None,
        "ai_proposed": "merge boundary_erosion and emotional_exhaustion into one theme",
        "human_decision": "REJECTED",
        "diff": "kept as two separate themes; category membership unchanged",
        "provenance": make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
    }
    emit(NORDBROOK.tenant_id, nord_aggregate, "ThemeGroupingRejected", theme_grouping_diff, 25.2)
    if themes_v11 != coding_outputs["theme_set"]["themes"]:
        raise InvariantViolation("THEME_GROUPING_OVERWRITTEN: a rejected diff must never mutate the recorded theme set")

    # Steps 19-22: sentence provenance (locator derived from the real transcript segments), the artifact, and the
    # five method-specific gates PLUS the two R3/R4 mandatory gates -- evaluated for real; a FAIL raises here,
    # before anything downstream (artifact publication, deletion) is even considered.
    sentence_provenance = build_sentence_provenance("SP-1", claim_1["statement"], claim_1, evidence_1, p1_locator, make_provenance("EVIDENCE", "AI_GENERATED"))
    contracts.validate(S["sentence_provenance"], sentence_provenance, "sentence provenance")
    trace = reverse_trace(sentence_provenance, evidence_graph)
    trace["audio_timestamp"] = format_audio_timestamp(p1_locator["start_seconds"])
    trace["locator_precision"] = p1_precision
    write_json(runtime / "modules" / "knowledge" / "sentence_provenance.json", sentence_provenance)
    gate_results = evaluate_method_specific_gates(
        coding_outputs=coding_outputs,
        statistics=statistics,
        sentence_provenances=[sentence_provenance],
        evidence_graph=evidence_graph,
        claims=[claim_1],
        transcriptions=transcriptions,
        validator="ai_lego.modules.research.gates",
        timestamp=clock.at(26),
    )
    gate_results += inject_mandatory_gates(workflow_ir.get("risk_tier", "R0"), "ai_lego.platform.ai_execution.mandatory_gates", clock.at(26))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"gate {gate['gate_id']}")
    gates = {gate["gate_id"]: gate["status"] for gate in gate_results}
    if not all_gates_pass(gate_results):
        failing = [gate_id for gate_id, status in gates.items() if status not in {"PASS", "NOT_APPLICABLE"}]
        transition("EXECUTING", "FAILED", 26.4, gate_results=gate_results)
        raise InvariantViolation(f"METHOD_GATE_FAILED: {', '.join(failing)}")

    memo = "\n".join(
        [
            "# Synthetic research memo",
            "",
            trace["sentence"],
            f"Evidence: {trace['source_id']} at {trace['audio_timestamp']} (synthetic fixture; locator {p1_precision}).",
            f"Cohen's Kappa: {statistics['kappa']} (95% bootstrap CI {statistics['confidence_interval_95']}; {statistics['interpretation_landis_koch_1977']}).",
            "Gates: " + ", ".join(f"{gate_id}={status}" for gate_id, status in gates.items()),
        ]
    )
    (runtime / "artifacts").mkdir(parents=True, exist_ok=True)
    (runtime / "artifacts" / "research_memo.md").write_text(memo + "\n", encoding="utf-8")
    emit(NORDBROOK.tenant_id, nord_aggregate, "ArtifactPublished", {"artifact": "research_memo.md", "trace": trace, "gates": gates}, 26.5)
    transition("EXECUTING", "VERIFYING", 26.6, gate_results=gate_results)

    # Steps 23-26: the EC section 31 deletion contract, built incrementally as each step actually happens --
    # timestamps can never contradict the ledger because they ARE the ledger's own timestamps.
    deletion = DeletionRequestBuilder("DEL-P2-SYNTHETIC-001", "P2", clock.at(27))
    p2_events = ledger.find("TranscriptGenerated", subject_id="P2")
    p2_envelopes = [(f"{event['event_id']}#{field_name}", envelope) for event in p2_events for field_name, envelope in event["payload"]["encrypted_pii"].items()]
    p2_detected_name = next(source["detected_pii"]["name"] for source in source_records if source["subject_id"] == "P2")
    if vault.decrypt_or_redact(NORDBROOK.tenant_id, "P2", p2_events[0]["payload"]["encrypted_pii"]["name"]) != p2_detected_name:
        raise InvariantViolation("PRE_DELETION_PLAINTEXT_CHECK_FAILED: P2 DEK was not live before deletion")
    pre_deletion_index = len(ledger.events)
    deletion.record("Authorization", clock.at(27.1), f"{DELETION_AUTHORIZATION} (A4 explicit_human_authority, synthetic operator)")
    deletion.record("Legal Hold Check", clock.at(27.2), "legal-hold:none registered for synthetic project PRJ-BURNOUT-01")
    deletion.record("Retention Check", clock.at(27.3), "retention:consent withdrawn by P2; no remaining retention basis (synthetic)")
    deletion.record("Dependency Check", clock.at(27.4), "events:" + ",".join(event["event_id"] for event in p2_events))
    deletion.record("Dry Run", clock.at(27.5), f"dry-run:{len(p2_envelopes)} envelopes would become undecryptable; 1 source audio; 1 CAS object; 1 transcription cache row")
    deletion.record("Count / Scope Preview", clock.at(27.6), f"scope:subject P2; fields name/employer/city; envelopes={len(p2_envelopes)}")
    snapshot_path = runtime / "platform" / "backup" / "pre-deletion-key-vault-snapshot.json"
    snapshot = vault.create_backup_snapshot(snapshot_path, clock.at(27.7))
    deletion.record("Approval", clock.at(27.8), f"approval:{DELETION_AUTHORIZATION};backup_snapshot:{snapshot['snapshot_id']}")
    destruction = vault.destroy_subject_dek(NORDBROOK.tenant_id, "P2", DELETION_AUTHORIZATION, p2_envelopes, 30)
    if destruction is None:
        raise InvariantViolation("DELETION_UNEXPECTEDLY_IDEMPOTENT: first P2 deletion returned None")
    contracts.validate(S["key_destruction"], destruction, "P2 key destruction record")
    deletion.record("Deletion", destruction["destroyed_at"], f"key_destruction:{destruction['key_id']}@{destruction['destroyed_at']}")
    source_audio_erasure = erase_subject_source_media(cas, NORDBROOK.tenant_id, "P2", source_records, transcriptions, fixture_root)
    write_json(runtime / "modules" / "knowledge" / "transcriptions.json", transcriptions)
    write_json(runtime / "platform" / "audit" / "p2_source_audio_erasure.json", source_audio_erasure)
    independent_log = runtime / "platform" / "audit" / "independent_key_destruction_records.json"
    write_json(independent_log, [destruction])
    deletion.record("Verification", destruction["destroyed_at"], f"decrypt attempts={destruction['verification']['attempted_count']} all REDACTED; source_audio_erasure={source_audio_erasure['method']}")
    redacted_payload = {
        "event_type": "PersonalDataRedacted",
        "subject_id": "P2",
        "redacted_fields": ["name", "employer", "city", "source_audio_fixture", "source_audio_cas", "transcription_cache"],
        "redacted_at": clock.at(31),
        "authorization_ref": DELETION_AUTHORIZATION,
        "provenance": make_provenance("DECISION", "HUMAN_APPROVED"),
    }
    contracts.validate(S["redacted_event"], redacted_payload, "P2 redaction event payload")
    redacted_event = emit(NORDBROOK.tenant_id, nord_aggregate, "PersonalDataRedacted", redacted_payload, 31)
    deletion.record("Deletion Evidence", redacted_event["occurred_at"], f"{redacted_event['event_id']};{destruction['independent_audit_log_ref']}")
    deletion_request = deletion.build()
    contracts.validate(S["deletion_request"], deletion_request, "P2 deletion request")
    write_json(runtime / "platform" / "audit" / "deletion_request.json", deletion_request)
    post_deletion_index = len(ledger.events)

    # ADR-002 / proposal 009: a restored pre-deletion backup cannot decrypt until independent destruction records replay.
    restored = LocalKeyVault.restore_from_backup(snapshot_path, runtime / "platform" / "security" / "restored-vault.json", clock, RUN_ID, clock.at(32), validator=contracts.validate)
    if restored.restore_event is None:
        raise InvariantViolation("RESTORE_EVENT_MISSING")
    contracts.validate(S["vault_restore"], restored.restore_event, "vault restore (pending replay)")
    before_replay = restored.decrypt_or_redact(NORDBROOK.tenant_id, "P2", p2_events[0]["payload"]["encrypted_pii"]["name"])
    if before_replay != DECRYPT_BLOCKED_PENDING_REPLAY:
        raise InvariantViolation("RESTORE_GATE_BYPASSED: restored vault served decrypt before replay")
    restored.replay_post_snapshot_destruction_records(read_json(independent_log))
    contracts.validate(S["vault_restore"], restored.restore_event, "vault restore (replay complete)")
    after_replay = restored.decrypt_or_redact(NORDBROOK.tenant_id, "P2", p2_events[0]["payload"]["encrypted_pii"]["name"])
    if after_replay != REDACTED:
        raise InvariantViolation("RESTORE_REPLAY_FAILED: P2 DEK not re-destroyed after independent audit replay")
    write_json(runtime / "platform" / "security" / "vault_restore_event.json", restored.restore_event)

    # Steps 27-28: a REAL v12 over-merged theme set is produced and rolled back -- prompt_version is a genuine
    # state change to reverse, not a marker event nobody reads.
    emit(NORDBROOK.tenant_id, nord_aggregate, "PromptVersionUpgradeAttempted", {"from": 11, "to": 12, "quality_result": "FAIL_OVER_MERGED_THEMES"}, 32.5)
    themes_v12 = build_v12_over_merged_theme_set(coding_outputs)
    emit(NORDBROOK.tenant_id, nord_aggregate, "ThemeSetProduced", {"prompt_version": 12, "themes": themes_v12}, 32.7)
    post_v12_index = len(ledger.events)
    emit(NORDBROOK.tenant_id, nord_aggregate, "PromptVersionRollback", {"from_prompt_version": 12, "restored_prompt_version": 11, "golden_hash": golden_hash_v11}, 33)
    post_rollback_index = len(ledger.events)

    replay_t0 = project(ledger.through(pre_deletion_index), vault)
    replay_t1 = project(ledger.through(post_deletion_index), vault)
    replay_v12 = project(ledger.through(post_v12_index), vault)
    replay_t2 = project(ledger.through(post_rollback_index), vault)
    p2_at = [set(replay["transcripts"]["P2"]["pii"].values()) for replay in (replay_t0, replay_t1, replay_v12, replay_t2)]
    if any(values != {REDACTED} for values in p2_at):
        raise InvariantViolation("CRYPTO_SHRED_REPLAY_INVARIANT_FAILED: P2 must be REDACTED at T0/T1/v12/T2")
    if not (replay_t0["themes"] == replay_t1["themes"] == themes_v11):
        raise InvariantViolation("REPLAY_INVARIANT_FAILED: deletion changed the champion theme structure before any prompt change")
    if replay_v12["prompt_version"] != 12 or replay_v12["themes"] == themes_v11:
        raise InvariantViolation("V12_INVARIANT_FAILED: the upgraded projection must genuinely differ from the champion")
    if replay_t2["prompt_version"] != 11 or sha256_json(replay_t2["themes"]) != golden_hash_v11:
        raise InvariantViolation("ROLLBACK_INVARIANT_FAILED: post-rollback projection does not match the v11 golden hash")
    if replay_t2["locked_codes"]["CODE-LOCKED-P1-001"] != locked_code:
        raise InvariantViolation("LOCKED_FACT_INVARIANT_FAILED: human-locked code changed across replays")

    # Criterion 3, adversarially: an AI re-analysis targeting the locked code must be kept SEPARATE, never applied.
    ai_relabel_attempt = {"target_code_id": "CODE-LOCKED-P1-001", "suggestion_id": "AI-SUG-RELABEL-1", "label": "after_hours_monitoring_v12_variant", "provenance": make_provenance("AI_SUGGESTION", "AI_SUGGESTED")}
    emit(NORDBROOK.tenant_id, nord_aggregate, "AISuggestionProposed", ai_relabel_attempt, 33.1)
    replay_after_relabel_attempt = project(ledger.through(len(ledger.events)), vault)
    if replay_after_relabel_attempt["locked_codes"]["CODE-LOCKED-P1-001"] != locked_code:
        raise InvariantViolation("LOCKED_FACT_INVARIANT_FAILED: a competing AI suggestion mutated the locked code")
    if "CODE-LOCKED-P1-001" not in replay_after_relabel_attempt["ai_suggestions_for_locked"]:
        raise InvariantViolation("LOCKED_FACT_SUGGESTION_NOT_SURFACED: the competing suggestion must be visible, not silently dropped")

    # A blocked-then-abandoned branch is terminal: the terminal-state guard actually refuses a downstream emit.
    demo_ledger = EventLedger(runtime / "results" / "blocked_branch_ledger.jsonl", "RUN-PHASE5-SYNTHETIC-BRANCH", clock)
    branch_transitions = [
        state_transition("RISK_CLASSIFIED", "BLOCKED", clock.at(20), "EX-PHASE5-SYNTHETIC-BRANCH", METHOD_RESOLUTION_BLOCKED),
        state_transition("BLOCKED", "CANCELLED", clock.at(20.5), "EX-PHASE5-SYNTHETIC-BRANCH"),
    ]
    for branch_transition in branch_transitions:
        contracts.validate(S["transition"], branch_transition, "cancelled branch transition")
    demo_ledger.close_aggregate("BRANCH:proj")
    emit_refused = False
    try:
        demo_ledger.append("BRANCH", "BRANCH:proj", "StatisticsCalculated", {"would": "leak past CANCELLED"}, 21)
    except InvariantViolation:
        emit_refused = True
    if not emit_refused:
        raise InvariantViolation("TERMINAL_STATE_GUARD_DID_NOT_FIRE: a closed aggregate accepted a downstream event")
    cancelled_branch = {"transitions": branch_transitions, "downstream_statistics": [], "downstream_artifacts": [], "downstream_audit": [], "terminal_guard_verified": True}
    write_json(runtime / "results" / "blocked_then_cancelled.json", cancelled_branch)

    audit = {
        "record_type": "capability_run",
        "execution_id": EXECUTION_ID,
        "run_id": RUN_ID,
        "block_id": "run_statistics",
        "capability_version": __version__,
        "model": "NOT_APPLICABLE_LOCAL_DETERMINISTIC_COMPUTE",
        "model_version": f"python-{sys.version_info.major}.{sys.version_info.minor}",
        "prompt_version": "11",
        "input_hash": sha256_json(coder_one + coder_two),
        "output_hash": sha256_json(statistics),
        "timestamp": clock.at(34),
        "user": "synthetic-local-slice",
        "latency": 0.0,
        "token_usage": 0,
        "cost": 0.0,
        "validation_score": 1.0,
        "status": "PASS",
        "policy_version": "synthetic-local-1",
        "knowledge_snapshot": sha256_json(evidence_graph),
    }
    contracts.validate("ai-lego://specs/execution/audit.schema.yaml", audit, "execution audit")
    method_execution_log.append(
        {
            "execution_id": EXECUTION_ID,
            "method_id": "run_statistics",
            "method_version": __version__,
            "workflow_id": workflow_ir["id"],
            "block_id": "run_statistics",
            "capability_version": __version__,
            "prompt_version": "11",
        }
    )

    manifest = build_manifest(
        execution_id=EXECUTION_ID,
        task_id=TASK_ID,
        run_id=RUN_ID,
        actor="synthetic-local-slice",
        started_at=clock.at(0),
        finished_at=clock.at(34),
        environment="local-isolated",
        app_version=__version__,
        source=source_description,
        documents=documents,
        results={"status": "PASS", "gates": list(gates)},
        prompt_version="11",
        method_execution_log=method_execution_log,
    )
    contracts.validate(S["manifest"], manifest, "execution manifest")
    write_json(runtime / "platform" / "execution" / "manifest.json", manifest)
    write_json(runtime / "platform" / "execution" / "workflow_ir.json", workflow_ir)
    write_json(runtime / "platform" / "execution" / "state_transitions.json", transitions)
    write_json(runtime / "platform" / "audit" / "execution_audit.json", audit)

    result = {
        "synthetic_only": True,
        "runtime_dir": str(runtime),
        "adapters": {"audio_mode": audio_factory.mode, "transcription_mode": transcriber.mode, "review_mode": config.review},
        "step_status": {str(step): "PASS" for step in range(1, 29)},
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice)",
        "source_event_count": len(source_records) + 2,
        "statistics": statistics,
        "gates": gates,
        "gate_results": gate_results,
        "cas_isolation": {"tenant_a_path": nord_consent["path"], "tenant_b_path": cascadia_consent["path"], "same_hash": nord_consent["hash"] == cascadia_consent["hash"]},
        "cas_paths": {"tenant_a": nord_consent, "tenant_b": cascadia_consent},
        "transcriptions": transcriptions,
        "coding_outputs": coding_outputs,
        "method_resolution": {"blocked": blocked_resolution, "resolved": resolved_resolution, "method_ids": method_ids},
        "state_transitions": transitions,
        "source_audio_erasure": source_audio_erasure,
        "deletion_request": deletion_request,
        "backup_restore": {"snapshot_id": snapshot["snapshot_id"], "snapshot_at": snapshot["snapshot_at"], "decrypt_before_replay": before_replay, "decrypt_after_replay": after_replay, "restore_event": restored.restore_event},
        "replays": {"T0": replay_t0, "T1": replay_t1, "v12": replay_v12, "T2": replay_t2},
        "timestamp_replays": {"before_first": project(ledger.through_timestamp(clock.at(-1)), vault), "after_last": project(ledger.through_timestamp(clock.at(99)), vault)},
        "trace": trace,
        "theme_grouping_diff": theme_grouping_diff,
        "ai_suggestions_for_locked": replay_after_relabel_attempt["ai_suggestions_for_locked"],
        "blocked_then_cancelled": cancelled_branch,
        "workflow_ir": workflow_ir,
        "manifest": manifest,
        "audit": audit,
        "golden_hash_v11": golden_hash_v11,
    }
    write_json(runtime / "results" / "slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None, help="read-only canonical spec root (default: the repo's AI_LEGO_Cognitive_Engineering_OS docs dir, or $AI_LEGO_SPEC_ROOT)")
    parser.add_argument("--runtime-dir", type=Path, default=None, help=f"isolated output directory (default: {default_runtime_dir()})")
    parser.add_argument("--transcription", choices=TRANSCRIPTION_MODES, default="fixture", help="fixture = deterministic tone WAV + declared transcript; offline-stt = Windows SAPI speech + cached faster-whisper")
    parser.add_argument("--review", choices=REVIEW_MODES, default="fixture", help="fixture = deterministic Accept-and-Lock / Edit; interactive = terminal prompts")
    parser.add_argument("--no-reset", action="store_true", help="reuse an existing (ownership-marked, empty) runtime directory instead of deleting it first")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, transcription=args.transcription, review=args.review, reset=not args.no_reset)
    try:
        result = run_research_slice(config)
    except AdapterUnavailable as error:
        print(f"UNAVAILABLE: {error}", file=sys.stderr)
        return 2
    except Exception as error:  # evidence first, then a non-zero exit; nothing partial was written for a gate FAIL
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print("PASS: synthetic Phase 5 Research Mode slice completed (28/28 steps, all gates PASS)")
    print(f"adapters={result['adapters']}")
    print(f"Kappa={result['statistics']['kappa']} CI95={result['statistics']['confidence_interval_95']} gates={result['gates']}")
    print(f"Replay P2 T0={result['replays']['T0']['transcripts']['P2']['pii']}")
    print(f"Results: {result['runtime_dir']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
