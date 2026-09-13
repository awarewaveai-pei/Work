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

Capability resolution (ADR-023) is fail-closed at BOTH enforcement points
since 2026-09-04 (the three spec-root contracts ADR-023 section Consequences 1
named now exist): every capability implementation this slice calls --
``transcribe`` (x4, ingest), ``run_statistics`` and
``artifact.generate_research_paper`` -- goes through ``CapabilityCatalog.invoke``
and an unresolved ref raises before the implementation runs; and at plan time
every capability ref of the compiled plan is resolved against the live catalog,
the verdict (validated against ``capability-resolution.schema.yaml``) lands in
the ledger, the result, the manifest's ``results`` block and the CLI output,
and a plan whose ``plan_executability.executable`` is false transitions
METHODS_RESOLVED -> BLOCKED with ``trigger_signal: CAPABILITY_RESOLUTION_BLOCKED``
and aborts (``CAPABILITY_PLAN_NOT_EXECUTABLE``) instead of reaching
PLAN_COMPILED. Method executions (``research.qualitative_coding``, twice) go
through ``MethodCatalog.invoke`` the same way (ADR-023 section Consequences 5).
``OUTSIDE_CAPABILITY_PLANE`` -- the declared, self-expiring bypass mechanism
(the run refuses to start, ``CAPABILITY_BYPASS_NO_LONGER_JUSTIFIED``, if a
declared ref gains an ACTIVE contract) -- is kept but empty: nothing this slice
does bypasses the plane any more.  The first offline literature adapter is
executed through the same catalog gate and records its stale/review status.

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
from ai_lego.modules.knowledge.ingest.transcription import FixtureTranscriber, MeetingServiceTranscriber, OfflineFasterWhisperTranscriber, meeting_service_availability
from ai_lego.modules.knowledge.provenance import build_evidence_graph, locator_from_transcript, reverse_trace
from ai_lego.modules.research.ai_coding import DEFAULT_LOCAL_MODEL_PROFILE, apply_codebook, default_local_registry, suggest_categories, suggest_open_codes, suggest_themes
from ai_lego.modules.research.gates import all_gates_pass, evaluate_method_specific_gates
from ai_lego.modules.research.evidence_triangulation import offline_literature_search, triangulate_themes_and_literature
from ai_lego.modules.research.qualitative_coding import assemble_coding_outputs, build_v12_over_merged_theme_set
from ai_lego.modules.research.review import fixture_primary_review, fixture_review, locked_code_from_review, locked_definition_from_review, review_code_interactively, reviewed_codebook_definitions
from ai_lego.modules.research.synthetic_fixtures import PROJECT_ID, SUGGESTED_LABEL, SYNTHETIC_CONSENT, SYNTHETIC_TRANSCRIPTS, expanded_synthetic_coder_judgments
from ai_lego.platform.ai_execution.capability_resolver import CAPABILITY_RESOLUTION_BLOCKED, CapabilityCatalog, capability_refs, plan_executability
from ai_lego.platform.ai_execution.current_state import build_current_state
from ai_lego.platform.ai_execution.deletion import DeletionRequestBuilder
from ai_lego.platform.ai_execution.gateway import AIGateway, ollama_available
from ai_lego.platform.ai_execution.mandatory_gates import inject_mandatory_gates
from ai_lego.platform.ai_execution.manifest import build_manifest, describe_git_source, manifest_documents
from ai_lego.platform.ai_execution.method_resolver import DEPRECATED_ALIAS, METHOD_RESOLUTION_BLOCKED, MethodCatalog, state_transition
from ai_lego.platform.ai_execution.replay import project
from ai_lego.platform.ai_execution.rollback_plan import build_rollback_plan
from ai_lego.platform.workflow.executor import execute_workflow_ir
from ai_lego.platform.workflow.ir import compile_recipe_to_workflow_ir, project_workflow_ir
from ai_lego.security.key_vault.local_key_vault import DECRYPT_BLOCKED_PENDING_REPLAY, REDACTED, LocalKeyVault

RUN_ID = "RUN-PHASE5-SYNTHETIC-001"
EXECUTION_ID = "EX-PHASE5-SYNTHETIC-001"
TASK_ID = "TASK-PHASE5-SYNTHETIC-001"
RECIPE_ID = "research-qualitative-v1"
SLICE_RISK_TIER = "R4"  # subject DEK destruction is an irreversible R4 action (EC section 8)
DELETION_AUTHORIZATION = "AUTH-SYNTHETIC-P2-ERASURE-A4"
# meeting-service = real spoken audio (Windows SAPI) -> GPU faster-whisper + real pyannote diarization, reusing the
# operator's meeting-service libs; the only mode whose speaker labels are not placeholders.
TRANSCRIPTION_MODES = ("fixture", "offline-stt", "meeting-service")
REVIEW_MODES = ("fixture", "interactive")
# fixture = coder-1's pending AI labels come from synthetic_fixtures (deterministic, CI path);
# local-llm = a real model behind AIGateway (Ollama on 127.0.0.1) proposes them from the REDACTED transcripts.
CODING_MODES = ("fixture", "local-llm")
GOAL_TEXT = "Code these interview transcripts for after-hours boundary themes and check inter-rater reliability between two coders."

# Capability-like work this slice performs WITHOUT going through CapabilityCatalog.invoke -- declared, not hidden
# (ADR-023 section Decision 4). Every entry must be an UNRESOLVED ref on the live catalog: the moment a contract exists
# the run refuses to start until that path is re-homed behind `invoke` (CAPABILITY_BYPASS_NO_LONGER_JUSTIFIED below).
# Empty since 2026-09-04: `transcribe` (ingest) and `artifact.generate_research_paper` (the memo) gained ACTIVE
# contracts and were re-homed behind `invoke` the same day, exactly as the guard demands. The mechanism stays so any
# future bypass has to be declared here and cannot outlive its reason.
OUTSIDE_CAPABILITY_PLANE: dict[str, str] = {}

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
    "capability_resolution": "ai-lego://specs/execution/capability-resolution.schema.yaml#/capability_resolution_result",
    "plan_executability": "ai-lego://specs/execution/capability-resolution.schema.yaml#/plan_executability",
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
    coding: str = "fixture"
    local_model: str = "gemma3:4b"
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
    if transcription_mode == "meeting-service":
        available, reason = WindowsSapiSpeechAudioFactory.availability()
        if not available:
            raise AdapterUnavailable(f"SAPI_UNAVAILABLE: {reason}")
        available, reason = meeting_service_availability()
        if not available:
            raise AdapterUnavailable(f"MEETING_SERVICE_UNAVAILABLE: {reason}")
        return WindowsSapiSpeechAudioFactory(), MeetingServiceTranscriber(log=lambda message: print(f"[meeting-service] {message}", file=sys.stderr))
    raise InvariantViolation(f"TRANSCRIPTION_MODE_UNKNOWN: {transcription_mode!r} (expected one of {TRANSCRIPTION_MODES})")


def write_research_memo(path: Path, memo: str) -> Path:
    """This slice's implementation of `artifact.generate_research_paper`: a minimal synthetic memo file (MVP section 3 step 20)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(memo + "\n", encoding="utf-8")
    return path


def run_research_slice(config: SliceConfig) -> dict[str, Any]:
    if config.review not in REVIEW_MODES:
        raise InvariantViolation(f"REVIEW_MODE_UNKNOWN: {config.review!r}")
    if config.coding not in CODING_MODES:
        raise InvariantViolation(f"CODING_MODE_UNKNOWN: {config.coding!r} (expected one of {CODING_MODES})")
    gateway: AIGateway | None = None
    if config.coding == "local-llm":
        # Probed before any side effect, same as the SAPI adapter: an absent runtime is a visible UNAVAILABLE, never a
        # silent fall-back to the fixture labels.
        available, reason = ollama_available()
        if not available:
            raise AdapterUnavailable(f"OLLAMA_UNAVAILABLE: {reason}")
        gateway = AIGateway(default_local_registry(config.local_model))
    spec_root = resolve_spec_root(config.spec_root)
    # ADR-023: the capability catalog is loaded FIRST, before any side effect (runtime dir, adapters, ingest), so that
    # a catalog problem (CONTRACT_ID_DUPLICATE / CONTRACT_CATALOG_UNREADABLE) or an expired bypass declaration stops
    # the run before a single event reaches the append-only ledger.
    capabilities = CapabilityCatalog.from_spec_root(spec_root)
    bypass_no_longer_justified = sorted(ref for ref in OUTSIDE_CAPABILITY_PLANE if capabilities.is_resolvable(ref))
    if bypass_no_longer_justified:
        raise InvariantViolation(f"CAPABILITY_BYPASS_NO_LONGER_JUSTIFIED: {', '.join(bypass_no_longer_justified)} now has an ACTIVE contract; route that path through CapabilityCatalog.invoke before running this slice")
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
        # MP section 8.4 `transcribe: AudioVideo -> Transcript` -- a capability invocation, gated like every other one.
        transcribe_contract, transcription = capabilities.invoke("transcribe", transcriber.transcribe, audio, entry["speech_text"])
        detected_pii = detect_synthetic_pii(transcription["text"], entry["source_id"])
        pii_guard.register_many(entry["subject_id"], detected_pii)
        cas_path = cas.put(NORDBROOK.tenant_id, Path(audio["audio_path"]).read_bytes())
        uri = cas.artifact_uri(NORDBROOK.label, PROJECT_ID, entry["source_id"], cas_path)
        contracts.validate(S["artifact_uri"], uri, f"{entry['source_id']} artifact URI")
        contracts.validate(S["cas_path"], cas_path, f"{entry['source_id']} CAS path")
        source_records.append({**entry, "artifact_uri": uri, "cas_path": cas_path, "transcription": transcription, "detected_pii": detected_pii, "transcribe_contract": transcribe_contract})
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
                "diarization": source["transcription"]["segments"][0]["diarization"],  # placeholder label in fixture/offline-stt, real pyannote label in meeting-service
                "capability_ref": source["transcribe_contract"]["ref"],
                "capability_version": source["transcribe_contract"]["version"],
                "contract_path": source["transcribe_contract"]["path"],
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

    # Step 13.5: capability resolution (MP section 7 pipeline; MP section 8.4 "reject illegal combinations before
    # execution"), ADR-023. Both records are validated against capability-resolution.schema.yaml before anything reads
    # them. A plan with an unresolved REQUIRED_* capability node is not executable and must not reach PLAN_COMPILED
    # (ADR-023 section Decision 3, wired 2026-09-04): METHODS_RESOLVED -> BLOCKED, then abort. An unresolved
    # RECOMMENDED/OPTIONAL node is recorded (that node can never be invoked) and the run continues without it.
    plan_capability_refs = capability_refs(workflow_ir)
    capability_resolution = capabilities.resolve(plan_capability_refs)
    contracts.validate(S["capability_resolution"], capability_resolution, "capability resolution")
    executability = plan_executability(workflow_ir, capability_resolution)
    contracts.validate(S["plan_executability"], executability, "plan executability")
    capability_record: dict[str, Any] = {
        "catalog": capabilities.label,
        "refs": plan_capability_refs,
        "resolution": capability_resolution,
        "plan_executability": executability,
        # Declared unconditionally: a bypass happens on every run, whatever the compiled plan happens to contain.
        "performed_outside_capability_plane": dict(OUTSIDE_CAPABILITY_PLANE),
    }
    if capability_resolution["blocked"] is not None:
        blocked_event: dict[str, Any] = {**capability_record, "signal": CAPABILITY_RESOLUTION_BLOCKED}
        if not executability["executable"]:
            blocked_event["transition"] = transition("METHODS_RESOLVED", "BLOCKED", 21.5, trigger=CAPABILITY_RESOLUTION_BLOCKED)
            emit(NORDBROOK.tenant_id, nord_aggregate, "CapabilityResolutionBlocked", blocked_event, 21.5)
            blocking = ", ".join(entry["ref"] for entry in executability["blocking"])
            raise InvariantViolation(f"CAPABILITY_PLAN_NOT_EXECUTABLE: {CAPABILITY_RESOLUTION_BLOCKED} -- REQUIRED_* capability nodes without an ACTIVE contract: {blocking}")
        emit(NORDBROOK.tenant_id, nord_aggregate, "CapabilityResolutionBlocked", blocked_event, 21.5)
    else:
        emit(NORDBROOK.tenant_id, nord_aggregate, "CapabilitiesResolved", capability_record, 21.5)

    # Step 13.8 (local-llm only): a real model proposes open codes for EVERY unit from the REDACTED transcripts, before
    # any human sees a suggestion. The prompt passes the same PiiLedgerGuard as the ledger before it leaves the process;
    # evidence must be verbatim or the label is rejected. In fixture mode the suggestions are the fixture constants.
    open_coding: dict[str, Any] | None = None
    suggested_labels: dict[str, str] = {}
    if gateway is not None:
        units = [{"source_id": source["source_id"], "text": redact_transcript(source["transcription"]["text"], source["detected_pii"])} for source in source_records]
        open_coding = suggest_open_codes(gateway, DEFAULT_LOCAL_MODEL_PROFILE, units, pii_guard=pii_guard, classification_tag="Confidential", trace_id=f"{RUN_ID}:open-coding")
        if not open_coding["labels"]:
            raise InvariantViolation(f"OPEN_CODING_NO_ACCEPTED_LABELS: model returned nothing usable -- rejected={open_coding['rejected']} missing={open_coding['missing']}")
        suggested_labels = open_coding["labels"]
        emit(NORDBROOK.tenant_id, nord_aggregate, "AISuggestionGenerated", {"labels": suggested_labels, "rejected": open_coding["rejected"], "missing": open_coding["missing"], "suggestion_source": open_coding["suggestion_source"]}, 21.8)
        write_json(runtime / "modules" / "research" / "open_coding_model_response.json", open_coding)

    # Steps 14-15: human review. `quote` is always the source's own PII-free `quote` field -- never the raw transcript.
    if config.review == "fixture":
        locked_code, ai_review = fixture_review(suggested_labels or None)
        primary = fixture_primary_review(suggested_labels or None)
    else:
        primary = review_code_interactively("AI-SUG-1", "SRC-1", SYNTHETIC_TRANSCRIPTS[0]["quote"], suggested_labels.get("SRC-1", SUGGESTED_LABEL), config.input_fn, config.output_fn)
        if primary["action"] != "ACCEPT_AND_LOCK":
            raise InvariantViolation("INTERACTIVE_LOCK_REQUIRED: the slice needs one explicit ACCEPT_AND_LOCK for the human-locked fact")
        locked_code = locked_code_from_review(primary, "CODE-LOCKED-P1-001")
        ai_review = review_code_interactively("AI-SUG-2", "SRC-2", SYNTHETIC_TRANSCRIPTS[1]["quote"], suggested_labels.get("SRC-2", SUGGESTED_LABEL), config.input_fn, config.output_fn)
    emit(NORDBROOK.tenant_id, nord_aggregate, "HumanCodeLocked", locked_code, 22)
    # Round 14 (OQ-P5-9 follow-up): a reviewer's typed definition is the reviewer's own DECISION about what a
    # label covers, not a claim about the source -- it locks as LOCKED_DECISION independently of whether the
    # code itself got locked, edited, or accepted (fires for either review, whenever a definition was given).
    primary_definition = locked_definition_from_review(primary, "DEF-P1-001")
    if primary_definition is not None:
        emit(NORDBROOK.tenant_id, nord_aggregate, "CodebookDefinitionLocked", primary_definition, 22.1)
    emit(NORDBROOK.tenant_id, nord_aggregate, "AISuggestionReviewed", {"suggestion_id": ai_review["suggestion_id"], "action": ai_review["action"], "result_label": ai_review["result_label"]}, 23)
    ai_review_definition = locked_definition_from_review(ai_review, "DEF-P2-001")
    if ai_review_definition is not None:
        emit(NORDBROOK.tenant_id, nord_aggregate, "CodebookDefinitionLocked", ai_review_definition, 23.05)
    # EC section 14 / MP section 8.5: the method implementation runs only through the Method Atlas gate (ADR-023
    # section Consequences 5) -- same `invoke` seam as capabilities, same guarantee.
    # Step 15.5 (local-llm only): coder 1's pending codes are the model's suggestions for the units no human handled
    # (SRC-1 locked, SRC-2 reviewed); coder 2 is a SECOND, independent model pass that applies coder 1's reviewed
    # codebook to every unit (different prompt, fixed seed, temperature 0). Agreement between two coders is only
    # meaningful against a shared codebook -- a second pass inventing its own labels would measure vocabulary, not
    # coding. In fixture mode coder 2 stays the synthetic human stand-in.
    pending_ai_labels: dict[str, str] | None = None
    codebook_pass: dict[str, Any] | None = None
    if gateway is not None:
        human_handled = {locked_code["source_id"], ai_review["source_id"]}
        pending_ai_labels = {sid: label for sid, label in suggested_labels.items() if sid not in human_handled}
        if not pending_ai_labels:
            raise InvariantViolation("OPEN_CODING_NO_PENDING_LABELS: the model produced no usable label for any un-reviewed unit")
        coder_one_final = {locked_code["source_id"]: locked_code["label"], **({ai_review["source_id"]: ai_review["result_label"]} if ai_review["result_label"] else {}), **pending_ai_labels}
        # Round 12 (OQ-P5-9): the codebook entry is label + the REVIEWER's definition (ai_coding round 11 / eval
        # GC-CB-001: bare labels make the second coder guess between neighbours). Only labels the human reviewed and
        # defined carry one; the model's un-reviewed pending labels are listed bare -- recorded as such, never invented.
        codebook_definitions = reviewed_codebook_definitions([primary, ai_review])
        codebook_pass = apply_codebook(gateway, DEFAULT_LOCAL_MODEL_PROFILE, units, sorted(set(coder_one_final.values())), pii_guard=pii_guard, classification_tag="Confidential", trace_id=f"{RUN_ID}:second-coder", definitions=codebook_definitions)
        if not codebook_pass["labels"]:
            raise InvariantViolation(f"SECOND_CODER_NO_ACCEPTED_LABELS: rejected={codebook_pass['rejected']} missing={codebook_pass['missing']}")
        emit(NORDBROOK.tenant_id, nord_aggregate, "SecondCoderApplied", {"codebook": codebook_pass["codebook"], "definitions": codebook_definitions, "definitions_origin": "HUMAN_REVIEW" if codebook_definitions else "NONE", "labels": codebook_pass["labels"], "rejected": codebook_pass["rejected"], "missing": codebook_pass["missing"], "suggestion_source": codebook_pass["suggestion_source"]}, 23.3)
        write_json(runtime / "modules" / "research" / "second_coder_model_response.json", codebook_pass)
    # Step 15.7 (local-llm only): axial then selective coding by the model over BOTH coders' labels. Membership is
    # validated (a code/category the model names must exist); what the model leaves out stays visibly pending /
    # pass-through in assemble_coding_outputs -- never guessed into a group.
    axial: dict[str, Any] | None = None
    selective: dict[str, Any] | None = None
    if gateway is not None:
        quote_of = {entry["source_id"]: entry["quote"] for entry in SYNTHETIC_TRANSCRIPTS}
        label_quotes: dict[str, str] = {}
        for source_id, label in {**(codebook_pass["labels"] if codebook_pass else {}), **coder_one_final}.items():
            label_quotes.setdefault(label, quote_of[source_id])
        codes_for_axial = [{"label": label, "quote": quote} for label, quote in sorted(label_quotes.items())]
        axial = suggest_categories(gateway, DEFAULT_LOCAL_MODEL_PROFILE, codes_for_axial, pii_guard=pii_guard, classification_tag="Confidential", trace_id=f"{RUN_ID}:axial")
        emit(NORDBROOK.tenant_id, nord_aggregate, "AxialCodingSuggested", {"categories": axial["categories"], "rejected": axial["rejected"], "unassigned": axial["unassigned"], "suggestion_source": axial["suggestion_source"]}, 23.35)
        write_json(runtime / "modules" / "research" / "axial_model_response.json", axial)
        if axial["categories"]:
            selective = suggest_themes(gateway, DEFAULT_LOCAL_MODEL_PROFILE, axial["categories"], pii_guard=pii_guard, classification_tag="Confidential", trace_id=f"{RUN_ID}:selective")
            emit(NORDBROOK.tenant_id, nord_aggregate, "SelectiveCodingSuggested", {"themes": [{"theme": t, "categories": c} for t, c in selective["themes"]], "rejected": selective["rejected"], "unassigned": selective["unassigned"], "suggestion_source": selective["suggestion_source"]}, 23.4)
            write_json(runtime / "modules" / "research" / "selective_model_response.json", selective)
    # Execute the Research evidence sub-chain through the generic Workflow IR executor.  The literature
    # adapter is explicitly offline/synthetic and therefore returns OFFLINE_SOURCE_STALE; it is not a
    # claim that current scholarship was searched.  Triangulation preserves that NEEDS_HUMAN_REVIEW state.
    coding_request = {
        "locked_code": locked_code,
        "ai_review": ai_review,
        "timestamp": clock.at(23.5),
        "pending_ai_labels": pending_ai_labels,
        "suggestion_source": None if open_coding is None else open_coding["suggestion_source"],
        "coder_two_labels": None if codebook_pass is None else codebook_pass["labels"],
        "coder_two_source": None if codebook_pass is None else codebook_pass["suggestion_source"],
        "category_of_label": None if axial is None else axial["category_of_label"],
        "themes_v11": None if axial is None else (selective["themes"] if selective is not None else []),
        "grouping_source": None if axial is None else {"axial": axial["suggestion_source"], "selective": None if selective is None else selective["suggestion_source"]},
    }

    def execute_coding(payload: dict[str, Any], _node: dict[str, Any]) -> dict[str, Any]:
        request = payload["research.coding_request"]
        outputs = assemble_coding_outputs(
            request["locked_code"],
            request["ai_review"],
            request["timestamp"],
            pending_ai_labels=request["pending_ai_labels"],
            suggestion_source=request["suggestion_source"],
            coder_two_labels=request["coder_two_labels"],
            coder_two_source=request["coder_two_source"],
            category_of_label=request["category_of_label"],
            themes_v11=request["themes_v11"],
            grouping_source=request["grouping_source"],
        )
        by_source_c1 = {code["source_id"]: code["label"] for code in outputs["coder_1"]["code_set"]}
        by_source_c2 = {code["source_id"]: code["label"] for code in outputs["coder_2"]["code_set"]}
        shared_units = sorted(set(by_source_c1) & set(by_source_c2))
        return {"coding_outputs": outputs, "coder_one": [by_source_c1[sid] for sid in shared_units], "coder_two": [by_source_c2[sid] for sid in shared_units]}

    def execute_statistics(payload: dict[str, Any], _node: dict[str, Any]) -> dict[str, Any]:
        coding = payload["outputs.coding"]
        if codebook_pass is None:
            coder_one, coder_two = expanded_synthetic_coder_judgments()
            judgment_source = "SYNTHETIC_48_UNITS"
        else:
            coder_one, coder_two = coding["coder_one"], coding["coder_two"]
            judgment_source = f"REAL_UNITS:{len(coder_one)}_SHARED_UNITS"
        if len(coder_one) < 2:
            raise InvariantViolation(f"KAPPA_INSUFFICIENT_UNITS: {len(coder_one)} unit(s) coded by both coders")
        return {"statistics": interrater_reliability_result(coder_one, coder_two), "judgment_source": judgment_source}

    runtime_subchain = project_workflow_ir(
        workflow_ir,
        [1, 4, 3, 5],
        {
            1: {"label": "coding", "input": "research.coding_request"},
            4: {"label": "statistics", "input": "outputs.coding"},
            3: {"label": "literature", "input": "research.question"},
            5: {"label": "triangulation", "input": ["outputs.coding", "outputs.literature"]},
        },
        workflow_id=f"{workflow_ir['id']}:coding-statistics",
    )
    runtime_result = execute_workflow_ir(
        runtime_subchain,
        {"research": {"question": "after-hours boundary erosion among remote workers", "coding_request": coding_request}},
        {
            "research.qualitative_coding": execute_coding,
            "run_statistics": execute_statistics,
            "literature_search": offline_literature_search,
            "evidence.triangulation": triangulate_themes_and_literature,
        },
        catalogs={"method": live, "capability": capabilities},
        journal_path=runtime / "platform" / "ai_execution" / "research_workflow.journal.json",
    )
    if runtime_result.status != "SUCCEEDED":
        failed_step = next(step for step in runtime_result.steps if step.status == "FAILED")
        raise InvariantViolation(f"RESEARCH_WORKFLOW_EXECUTION_FAILED: {failed_step.error}")
    coding_contract = runtime_result.steps[0].contract
    coding_outputs = runtime_result.context["outputs"]["coding"]["coding_outputs"]
    runtime_statistics = runtime_result.context["outputs"]["statistics"]
    literature = runtime_result.context["outputs"]["literature"]["literature"]
    triangulation = runtime_result.context["outputs"]["triangulation"]["triangulation"]
    if triangulation["status"] != "NEEDS_HUMAN_REVIEW" or triangulation["offline_status_code"] != "OFFLINE_SOURCE_STALE":
        raise InvariantViolation("TRIANGULATION_FRESHNESS_GUARD_FAILED: offline literature must remain review-gated")
    if codebook_pass is None:
        coder_one, coder_two = expanded_synthetic_coder_judgments()
    else:
        coder_one = runtime_result.context["outputs"]["coding"]["coder_one"]
        coder_two = runtime_result.context["outputs"]["coding"]["coder_two"]

    # Steps 16 (plan/rollback/approval) + real recovery-plan and current-state records before each transition.
    transition("METHODS_RESOLVED", "PLAN_COMPILED", 24)
    rollback_plan = build_rollback_plan("RB-PHASE5-SYNTHETIC-001", TASK_ID, EXECUTION_ID, {})
    contracts.validate(S["rollback"], rollback_plan, "rollback plan")
    write_json(runtime / "platform" / "ai_execution" / "rollback_plan.json", rollback_plan)
    transition("PLAN_COMPILED", "ROLLBACK_VALIDATED", 24.1)
    transition("ROLLBACK_VALIDATED", "APPROVED", 24.2, authority_level="A4")
    transition("APPROVED", "EXECUTING", 24.3)

    # The executor already routed statistics and literature through CapabilityCatalog.invoke.  Preserve the existing
    # semantic judgment source in the result while retaining the runtime's own observed shared-unit count.
    run_statistics_contract = next(step.contract for step in runtime_result.steps if step.ref == "run_statistics")
    statistics = {**runtime_statistics["statistics"], "judgment_source": runtime_statistics["judgment_source"], "runtime_execution": runtime_statistics["judgment_source"]}
    emit(NORDBROOK.tenant_id, nord_aggregate, "StatisticsCalculated", statistics, 24.5)
    method_execution_log.append(
        {
            "execution_id": "EX-METHOD-QUALCODE-001",
            "method_id": coding_contract["ref"],
            "method_version": coding_contract["version"],
            "workflow_id": workflow_ir["id"],
            "block_id": "coding",
            "contract_path": coding_contract["path"],
            "contract_sha256": coding_contract["content_sha256"],
            "prompt_version": "11",
        }
    )
    triangulation_contract = next(step.contract for step in runtime_result.steps if step.ref == "evidence.triangulation")
    method_execution_log.append(
        {
            "execution_id": "EX-METHOD-TRIANGULATION-001",
            "method_id": triangulation_contract["ref"],
            "method_version": triangulation_contract["version"],
            "workflow_id": workflow_ir["id"],
            "block_id": "triangulation",
            "contract_path": triangulation_contract["path"],
            "contract_sha256": triangulation_contract["content_sha256"],
            "prompt_version": "11",
        }
    )
    themes_v11 = coding_outputs["theme_set"]["themes"]
    golden_hash_v11 = sha256_json(themes_v11)
    emit(NORDBROOK.tenant_id, nord_aggregate, "ThemeSetProduced", {"prompt_version": 11, "themes": themes_v11}, 25)

    # Step 21: human reviews an AI grouping suggestion and rejects it; the system records a Diff, never an overwrite.
    theme_labels_v11 = [theme["label"] for theme in themes_v11]
    theme_grouping_diff = {
        "theme_id": themes_v11[0]["theme_id"] if themes_v11 else None,
        # The rejected proposal names the run's actual themes (fixture: boundary_erosion + emotional_exhaustion), not a literal.
        "ai_proposed": f"merge {' and '.join(theme_labels_v11[:2])} into one theme" if len(theme_labels_v11) >= 2 else f"merge {theme_labels_v11[0] if theme_labels_v11 else 'the theme set'} with a new theme",
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

    # MVP section 3 step 20 memo content (theme summary + evidence quote + triangulation result + Kappa); the contracted
    # capability's output type is ResearchMemoArtifact (artifact.generate_research_paper.capability.yaml).
    theme_labels = ", ".join(str(theme.get("label", theme.get("theme_id", "?"))) for theme in themes_v11)
    memo = "\n".join(
        [
            "# Synthetic research memo",
            "",
            f"Themes (prompt v11): {theme_labels or 'none recorded'}",
            "",
            trace["sentence"],
            f"Evidence: {trace['source_id']} at {trace['audio_timestamp']} (synthetic fixture; locator {p1_precision}).",
            f"Triangulation: {len(triangulation['findings'])} finding(s) linked to the offline corpus; status={triangulation['status']} ({triangulation['offline_status_code']}).",
            f"Cohen's Kappa: {statistics['kappa']} (95% bootstrap CI {statistics['confidence_interval_95']}; {statistics['interpretation_landis_koch_1977']}).",
            "Gates: " + ", ".join(f"{gate_id}={status}" for gate_id, status in gates.items()),
        ]
    )
    def execute_artifact(payload: dict[str, Any], _node: dict[str, Any]) -> dict[str, Any]:
        path = Path(payload["research.artifact_path"])
        memo_path = write_research_memo(path, payload["research.memo"])
        return {"artifact_path": str(memo_path), "artifact_name": memo_path.name}

    artifact_workflow = project_workflow_ir(
        workflow_ir,
        [6],
        {6: {"label": "artifact", "input": ["research.artifact_path", "research.memo"]}},
        workflow_id=f"{runtime_result.workflow_id}:artifact",
    )
    artifact_result = execute_workflow_ir(
        artifact_workflow,
        {"research": {"artifact_path": str(runtime / "artifacts" / "research_memo.md"), "memo": memo}},
        {"artifact.generate_research_paper": execute_artifact},
        catalogs={"capability": capabilities},
        journal_path=runtime / "platform" / "ai_execution" / "artifact_workflow.journal.json",
    )
    if artifact_result.status != "SUCCEEDED":
        failed_step = next(step for step in artifact_result.steps if step.status == "FAILED")
        raise InvariantViolation(f"RESEARCH_ARTIFACT_WORKFLOW_FAILED: {failed_step.error}")
    artifact_contract = artifact_result.steps[0].contract
    memo_path = Path(artifact_result.context["outputs"]["artifact"]["artifact_path"])
    write_json(
        runtime / "platform" / "ai_execution" / "workflow_runtime.json",
        {
            "workflow_id": runtime_result.workflow_id,
            "status": "SUCCEEDED",
            "projections": [runtime_subchain["projection"], artifact_workflow["projection"]],
            "phases": [runtime_result.as_dict(), artifact_result.as_dict()],
        },
    )
    emit(
        NORDBROOK.tenant_id,
        nord_aggregate,
        "ArtifactPublished",
        {
            "artifact": memo_path.name,
            "contract_backed": True,
            "capability_ref": artifact_contract["ref"],
            "capability_version": artifact_contract["version"],
            "contract_path": artifact_contract["path"],
            "trace": trace,
            "gates": gates,
        },
        26.5,
    )
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
    _, themes_v12 = live.invoke("research.qualitative_coding", build_v12_over_merged_theme_set, coding_outputs)
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
        "capability_version": run_statistics_contract["version"],  # the Capability Contract version that ran (manifest.schema.yaml), not the package version
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
    # Catalog invocations are homed on the manifest's method_execution_log, because the spec root has no capability
    # execution log yet (ADR-023 section Consequences 6). One entry per invocation the catalog actually observed
    # (transcribe x4, run_statistics, literature_search, artifact.generate_research_paper), in invocation order. `method_id` is
    # schema-required and carries the capability ref; every version field here is the CONTRACT version that ran -- the
    # same semantics as the method entry above, never the package version -- and each entry has its own invocation id,
    # distinct from the top-level execution id.
    for index, invocation in enumerate(capabilities.invocations, start=1):
        method_execution_log.append(
            {
                "execution_id": f"EX-CAP-{index:03d}",
                "method_id": invocation["ref"],
                "method_version": invocation["version"],
                "workflow_id": workflow_ir["id"],
                "block_id": invocation["ref"],
                "capability_ref": invocation["ref"],
                "contract_path": invocation["path"],
                "contract_sha256": invocation["content_sha256"],
                "capability_version": invocation["version"],
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
        results={
            "status": "PASS",
            "gates": list(gates),
            # The plan-time capability verdict reaches the audit record of record, not only a nested result field.
            "capability_plan_executable": executability["executable"],
            "capability_plan_fully_resolved": executability["fully_resolved"],
            "unresolved_capabilities": (capability_resolution["blocked"] or {}).get("unresolved", []),
        },
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
        "adapters": {"audio_mode": audio_factory.mode, "transcription_mode": transcriber.mode, "review_mode": config.review, "coding_mode": config.coding, "open_coding_model": None if open_coding is None else open_coding["suggestion_source"]["model_identifier"], "coder_two": "synthetic_fixture" if codebook_pass is None else "model", "grouping": "fixture" if axial is None else "model"},
        "open_coding": open_coding,
        "second_coder": codebook_pass,
        "axial": axial,
        "selective": selective,
        "step_status": {str(step): "PASS" for step in range(1, 29)},
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice)",
        "source_event_count": len(source_records) + 2,
        "statistics": statistics,
        "literature": literature,
        "triangulation": triangulation,
        "gates": gates,
        "gate_results": gate_results,
        "cas_isolation": {"tenant_a_path": nord_consent["path"], "tenant_b_path": cascadia_consent["path"], "same_hash": nord_consent["hash"] == cascadia_consent["hash"]},
        "cas_paths": {"tenant_a": nord_consent, "tenant_b": cascadia_consent},
        "transcriptions": transcriptions,
        "coding_outputs": coding_outputs,
        "method_resolution": {"blocked": blocked_resolution, "resolved": resolved_resolution, "method_ids": method_ids, "invoked": list(live.invocations)},
        "capability_resolution": {
            **capability_record,
            "invoked": list(capabilities.invocations),  # the catalog's own observation log, not a literal
            "not_performed": [ref for ref in plan_capability_refs if ref not in {entry["ref"] for entry in capabilities.invocations} and ref not in OUTSIDE_CAPABILITY_PLANE],
        },
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
    parser.add_argument("--transcription", choices=TRANSCRIPTION_MODES, default="fixture", help="fixture = deterministic tone WAV + declared transcript; offline-stt = Windows SAPI speech + cached faster-whisper (CPU, placeholder speakers); meeting-service = SAPI speech + GPU faster-whisper + real pyannote diarization via the meeting-service libs")
    parser.add_argument("--review", choices=REVIEW_MODES, default="fixture", help="fixture = deterministic Accept-and-Lock / Edit; interactive = terminal prompts")
    parser.add_argument("--coding", choices=CODING_MODES, default="fixture", help="fixture = synthetic pending AI labels; local-llm = a real local model (Ollama) proposes them from redacted transcripts")
    parser.add_argument("--local-model", default="gemma3:4b", help="Ollama model identifier used when --coding local-llm (must already be pulled)")
    parser.add_argument("--no-reset", action="store_true", help="reuse an existing (ownership-marked, empty) runtime directory instead of deleting it first")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, transcription=args.transcription, review=args.review, coding=args.coding, local_model=args.local_model, reset=not args.no_reset)
    try:
        result = run_research_slice(config)
    except AdapterUnavailable as error:
        print(f"UNAVAILABLE: {error}", file=sys.stderr)
        return 2
    except Exception as error:  # evidence first, then a non-zero exit; nothing partial was written for a gate FAIL
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print("PASS: synthetic Phase 5 Research Mode slice completed (28/28 steps, all gates PASS)")
    plan = result["capability_resolution"]["plan_executability"]
    if not plan["fully_resolved"]:
        # A completed run always had an executable plan: a non-executable one aborts at METHODS_RESOLVED -> BLOCKED.
        unresolved = (result["capability_resolution"]["resolution"]["blocked"] or {}).get("unresolved", [])
        print(f"WARN: compiled plan is executable but not fully resolved on this spec root -- capability refs without an ACTIVE contract (never invoked): {', '.join(unresolved)}; see ADR-023")
    print(f"adapters={result['adapters']}")
    print(f"Kappa={result['statistics']['kappa']} CI95={result['statistics']['confidence_interval_95']} gates={result['gates']}")
    print(f"Replay P2 T0={result['replays']['T0']['transcripts']['P2']['pii']}")
    print(f"Results: {result['runtime_dir']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
