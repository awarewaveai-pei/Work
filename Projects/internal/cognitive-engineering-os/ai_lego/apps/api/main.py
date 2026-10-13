"""Cognitive OS Phase 1 API. Run with::

    uvicorn ai_lego.apps.api.main:app --host 127.0.0.1 --port 8420

Endpoints:
    GET  /                           -- minimal browser dashboard (login + browse + run demo)
    GET  /methods                    -- list every ACTIVE Method Atlas method
    GET  /methods/{method_id}        -- one method's contract descriptor
    GET  /recipes                    -- list ACTIVE validated Recipes
    GET  /recipes/{recipe_id}/plan   -- compile and resolve one Recipe
    GET  /recipes/{recipe_id}/form   -- describe the Source fields a Recipe needs
    POST /recipes/{recipe_id}/run    -- auth + entitlement + registered adapters
    GET  /recipes/{recipe_id}/runs/{run_id} -- auth + tenant-scoped run summary
    GET  /recipes/{recipe_id}/runs/{run_id}/result -- auth + tenant-scoped projected outputs
    POST /auth/login                 -- {tenant_id, email, password} -> session cookie
    POST /auth/logout                -- revoke the caller's session
    POST /methods/{method_id}/invoke -- auth + entitlement required; body = builder kwargs
    GET  /methods/{method_id}/demo   -- auth required; runs the method's existing CLI slice
    GET/POST/PUT/DELETE /workflows/custom[/{workflow_id}] -- tenant's own self-assembled method
        chains (dashboard "組成工作流"); each step still runs via /methods/{id}/invoke

``/`` exists so a human has something to click, not just curl -- it only wraps the endpoints
above (same-origin fetch, no separate auth path, no new capability). ``/methods/{id}/form`` is a
field tree derived from each method's own typed-object record schema (``method_form.py``); the
method contract and builder remain the authority for domain validation.

Phase 1 scope only -- see ``Projects/internal/cognitive-engineering-os/docs/
COGNITIVE_OS_DEPLOYMENT_BLUEPRINT.md``. No billing, no multi-tenant isolation testing yet
(single tenant), no rate limiting beyond "must be authenticated" (tracked as a Phase 1 build
task, not solved here -- see that blueprint's risk-classification.json entry).

``get_databases``/``get_store``/``get_catalog`` are real FastAPI dependencies (``Depends(...)``), not plain
functions called from inside handlers -- this is what lets tests swap in their own PostgreSQL database via
``app.dependency_overrides`` without touching the configured one (COGNITIVE_OS_DATABASE_URLS). A handler
that called ``get_store()`` directly would silently bypass any override and hit the real DB even
under test, which is exactly the bug this design avoids.
"""

from __future__ import annotations

import datetime
import threading
from time import monotonic as _monotonic
import hashlib
import hmac
import json
import os
import re
import secrets
import subprocess
import sys
import uuid
from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path
from typing import Any, AsyncIterator, Callable, Literal
from urllib.parse import urlparse

from fastapi import Cookie, Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.exception_handlers import http_exception_handler
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse
from psycopg.errors import UniqueViolation
from pydantic import BaseModel, ConfigDict, Field
import yaml
from ai_lego.core.yaml_safe import safe_load as safe_load_yaml

from ai_lego import PRODUCT_ROOT, resolve_spec_root
from ai_lego.apps.api.dispatch import MethodDispatchError, builder_takes_record_id, invoke_builder, invoke_gate_runner, method_binding_issues, record_id_prefix, resolve_builder, resolve_gate_runner, run_gate_runner
from ai_lego.apps.api.method_form import TYPED_OBJECTS, describe_method_form, load_forms, record_schema_name
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.support import read_json
import logging

from ai_lego.errors import InvariantViolation, case_gone
from ai_lego.platform.ai_execution.method_resolver import MethodCatalog
from ai_lego.platform.ai_execution.capability_resolver import CapabilityCatalog, capability_refs, plan_executability
from ai_lego.platform.entitlement.check import check_entitlement
from ai_lego.platform.ai_gateway.draft import AI_DRAFT_CAPABILITY, MAX_BRIEF_CHARS, MAX_LABELS_PER_REQUEST, AiDraftProviderError, draft_method_kwargs, draft_recipe_source, recipe_draft_plan
from ai_lego.platform.ai_gateway.pricing import cost_twd
from ai_lego.platform.ai_gateway.provider import (DEFAULT_MODEL, SCOPE_PERSON, SCOPE_TENANT, AiProvider, AnthropicProvider, ProviderCallError, budget_exceeded, daily_person_budget,
                                                  daily_token_budget, fits_budget, provider_from_env)
from ai_lego.platform.catalog.display_catalog import catalog_payload, load_catalog, registry_fingerprint
from ai_lego.platform.identity.store import IdentityStore
from ai_lego.platform.net.collection_service import CollectionServiceClient, collection_service_from_env
from ai_lego.core.domain._intake_validation import require_text, require_uuid
from ai_lego.core.domain.project import project_record
from ai_lego.core.domain.source import OUTLINK_CHARS, OUTLINKS_ITEMS, TEXT_MEDIA_TYPES, source_record
from ai_lego.core.domain.collection_run import MAX_FETCHES, MAX_SEEDS, collection_run_record, query_language
from ai_lego.data.db import Databases
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.data.events import record_log
from ai_lego.platform import block_hooks
from ai_lego.core.domain.blocks import FAMILY_BLOCK, INTERNAL, block_of_family
from ai_lego.core.domain.custom_workflow import custom_workflow_record
from ai_lego.data.repositories.custom_workflow_repository import CustomWorkflowRepository
from ai_lego.platform.workflow.ir import compile_recipe_to_workflow_ir
from ai_lego.platform.workflow.capability_adapters import CapabilityAdapterRegistry
from ai_lego.platform.workflow.journal_protection import CasJournalContextProtector, LocalDevJournalKeyProvider, ResolverJournalKeyProvider
from ai_lego.platform.workflow.executor import execute_workflow_ir, missing_workflow_input_paths, _atomic_write_journal, _journal_record
from ai_lego.platform.workflow.human_required import load_human_required, missing_human_required
from ai_lego.platform.workflow.run_lock import RunLock, acquire_run_lock, lock_path_for, run_lock_state, run_lock_tag
from ai_lego.platform.workflow.workflow_gates import WorkflowGateRegistry
from ai_lego.apps.recipe_runtime import build_method_components, build_registered_capability_adapters, build_registered_workflow_gate_registry, wrap_capability_handlers_with_artifact_persistence
from ai_lego.data.object.json_artifact_store import JsonArtifactStore
from ai_lego.platform.erasure import CASE as ERASURE_CASE, Erasure, admit_run, sidecar_of
from ai_lego.modules.research.interpret_method_record import INTERPRET_MAX_TOKENS, INTERPRET_TIMEOUT_SECONDS, build_prompt_manifest, record_sha256, result_page_shows, run_interpretation
from ai_lego.modules.research.gates import claim_citations, iter_claims
from ai_lego.modules.research.source_manifest import DEFAULT_MAX_CHARS
from ai_lego.modules.research.synthesis import run_synthesis, validate_subject
from ai_lego.modules.research.report_render import render_research_report

SESSION_COOKIE = "cognitive_os_session"



def _warm_reads() -> None:
    """What a read route would parse on its first request in this worker, parsed at start instead (capacity rig, 2026-10-12: the
    catalog, the TEACH and FACILITATE content with the catalog behind their subject check, and one method form, which builds the
    contracts and schema index every form shares -- 22 s with the pure-Python YAML loader, 4.8 s with libyaml's, imports included)."""
    from ai_lego.platform.lessons import load_lessons, load_practice_cases
    from ai_lego.platform.scripts import load_scripts

    catalog = get_catalog()
    load_lessons()
    load_practice_cases()
    load_scripts()
    for method_id in sorted(catalog.contracts)[:5]:
        try:
            method_form(method_id, catalog)
            return
        except HTTPException:   # this one has no builder or is not resolvable: the next one warms the same shared tables
            continue


@asynccontextmanager
async def _lifespan(started: FastAPI) -> AsyncIterator[None]:
    """At start, in every worker process: finish every erasure a crash or a filesystem error left with files still on
    disk (ai_lego/platform/erasure.py; two workers never work one item: outbox.claim), and build the display catalog, so
    the first visitor after a deploy never pays its parse (8.9 s cold, measured 2026-10-11). Logged, never fatal: an
    unfinished job stays for the next start or a repeated DELETE; a catalog that cannot be built is built, or refused
    with its 503, by the first GET /catalog."""
    try:
        _display_catalog_payload()
    except Exception:
        logging.getLogger(__name__).exception("display catalog not built at start; the first GET /catalog tries again")
    try:
        _warm_reads()
    except Exception:
        logging.getLogger(__name__).exception("read routes not warmed at start; the first request of each kind in this worker parses its files")
    overrides = started.dependency_overrides
    try:
        repo = overrides[get_project_source_repository]() if get_project_source_repository in overrides else ProjectSourceRepository(overrides.get(get_databases, get_databases)())
        finished = resume_pending_erasures(repo, overrides.get(get_source_cas, get_source_cas)(), overrides.get(get_artifact_store, get_artifact_store)())
        if finished:
            logging.getLogger(__name__).info("erasures resumed at start: %s", [(job["subject_kind"], job["subject_id"], job["physical_cleanup"]) for job in finished])
        attention = erasure_for(repo, overrides.get(get_source_cas, get_source_cas)(), overrides.get(get_artifact_store, get_artifact_store)()).needs_attention()
        if attention:   # an operator must look: python -m ai_lego.platform.erasure lists the same
            logging.getLogger(__name__).error("erasure items need an operator: %s", [(item["subject_kind"], item["subject_id"], item["item_no"], item["state"], item["error"], item["attempts"]) for item in attention])
    except Exception:
        logging.getLogger(__name__).exception("erasures could not be resumed at start; they stay pending")
    yield


app = FastAPI(title="Cognitive OS API", version="0.1.0-phase1", lifespan=_lifespan)


def configure_cors(target_app: FastAPI, raw_origins: str | None = None) -> tuple[str, ...]:
    """Install explicit-origin CORS; empty configuration intentionally emits no CORS headers."""
    raw = os.environ.get("COGNITIVE_OS_CORS_ORIGINS", "") if raw_origins is None else raw_origins
    origins = tuple(origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip())
    if "*" in origins:
        raise ValueError("COGNITIVE_OS_CORS_ORIGINS must not contain '*' because session credentials are enabled")
    for origin in origins:
        parsed = urlparse(origin)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.path or parsed.query or parsed.fragment:
            raise ValueError(f"COGNITIVE_OS_CORS_ORIGIN_INVALID: expected an explicit http(s) origin, got {origin!r}")
    if origins:
        target_app.add_middleware(
            CORSMiddleware,
            allow_origins=list(origins),
            allow_credentials=True,
            allow_methods=["GET", "POST"],
            allow_headers=["Content-Type"],
        )
    return origins


def build_api_capability_adapters(
    capability_catalog: CapabilityCatalog,
    capability_ids: list[str],
    *,
    project_sources: list[dict[str, Any]] | None = None,
) -> CapabilityAdapterRegistry:
    """Build the API's explicit adapter set once for both plan and run paths.

    ``project_sources`` (RESEARCH_LINES_MASTER_PLAN WC-P2-07b) is forwarded to
    ``build_registered_capability_adapters`` unchanged; ``None`` keeps every existing
    caller's offline-fixture ``literature_search`` behaviour (``recipe_plan``, the direct
    capability-invoke endpoint, and a ``run_recipe`` with no ``project_id``).
    """
    return build_registered_capability_adapters(capability_catalog, capability_ids, project_sources=project_sources)


def build_api_workflow_gate_registry() -> WorkflowGateRegistry:
    """Build the explicit API gate set; domain runners are added by stable ref."""
    return build_registered_workflow_gate_registry("ai_lego.apps.api.main")


CONFIGURED_CORS_ORIGINS = configure_cors(app)


class ApiPrefixMiddleware:
    """`/api/<path>` is the public path of every route: prod nginx routes `/api/` here and the web app
    rewrites `/api/*` here; a local uvicorn serves the same routes at the root. Accepting both lets the
    dashboard call `/api` in every environment with no per-environment setting (RESEARCH_LINES_MASTER_PLAN
    WC-PIb-02). Outermost, so every other middleware and every route sees the unprefixed path."""

    def __init__(self, app: Any) -> None:
        self.app = app

    @staticmethod
    def _strip(value: Any) -> Any:
        """`/api` or `/api/...` without the prefix, else None (str path and bytes raw_path alike)."""
        prefix, slash = ("/api", "/") if isinstance(value, str) else (b"/api", b"/")
        if value == prefix:
            return slash
        return value[len(prefix):] if value.startswith(prefix + slash) else None

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") in ("http", "websocket"):
            path = self._strip(scope.get("path", ""))
            raw_path = scope.get("raw_path")
            raw_stripped = self._strip(raw_path) if isinstance(raw_path, bytes) else None
            # both or neither: an encoded prefix (/%61pi/...) decodes to /api/ but is not the prefix --
            # stripping by the decoded length would corrupt raw_path, so it is left as sent (404)
            if path is not None and (raw_path is None or raw_stripped is not None):
                scope = dict(scope, path=path)
                if raw_stripped is not None:
                    scope["raw_path"] = raw_stripped
        await self.app(scope, receive, send)


app.add_middleware(ApiPrefixMiddleware)
JOURNAL_KEY_RESOLVER: Callable[[str, str], bytes] | None = None


def _api_journal_context(context: dict[str, Any]) -> dict[str, Any]:
    """Persist checkpoint state without embedding the request's raw ``source`` object."""
    return {"steps": context.get("steps", {}), "outputs": context.get("outputs", {})}


def _api_workflow_result(result: Any) -> dict[str, Any]:
    """Return execution evidence without echoing the caller's raw Source payload."""
    payload = result.as_dict()
    payload["context"] = _api_journal_context(result.context)
    return payload


def build_api_journal_protector(tenant_id: str, run_id: str) -> CasJournalContextProtector | None:
    """Build a protected journal using local-dev or an explicitly injected external KMS resolver."""
    mode = os.environ.get("COGNITIVE_OS_JOURNAL_KEY_MODE", "disabled")
    if mode == "disabled":
        return None
    if mode not in {"local-dev", "external"}:
        raise InvariantViolation("WORKFLOW_JOURNAL_KEY_MODE_UNSUPPORTED: production requires a KMS provider")
    tenant_namespace = hashlib.sha256(tenant_id.encode("utf-8")).hexdigest()[:32]
    if mode == "local-dev":
        key = LocalDevJournalKeyProvider().key_for(tenant_namespace, "workflow-journal")
    else:
        if not callable(JOURNAL_KEY_RESOLVER):
            raise InvariantViolation("WORKFLOW_JOURNAL_EXTERNAL_KEY_PROVIDER_NOT_CONFIGURED")
        key = ResolverJournalKeyProvider(JOURNAL_KEY_RESOLVER).key_for(tenant_id, "workflow-journal")
    return CasJournalContextProtector(
        TenantScopedCas(PRODUCT_ROOT / ".runtime" / "workflow-cas"),
        tenant_namespace,
        run_id,
        key,
        projector=_api_journal_context,
    )


def workflow_journal_path(tenant_id: str, run_id: str, identity_id: str | None = None) -> Path:
    """Resolve a journal path internally without exposing the host path to API clients. With ``identity_id``: the
    run's owner's own folder (every run since 2026-10-03); without: the tenant folder runs used before."""
    if not isinstance(tenant_id, str) or not tenant_id or not isinstance(run_id, str) or re.fullmatch(r"[A-Za-z0-9_-]{1,80}", run_id) is None:
        raise InvariantViolation("WORKFLOW_JOURNAL_REFERENCE_INVALID")
    tenant_key = hashlib.sha256(tenant_id.encode("utf-8")).hexdigest()[:32]
    folder = PRODUCT_ROOT / ".runtime" / "workflows" / tenant_key
    if identity_id is not None:
        folder = folder / hashlib.sha256(identity_id.encode("utf-8")).hexdigest()[:32]
    return folder / f"{run_id}.journal.json"


def _run_journal(session: dict[str, Any], run_id: str) -> Path:
    """A recipe run is its runner's (critic 2026-10-03: a run on my case was readable by run_id from the whole tenant).
    A run started before then lives in the tenant folder with no owner on record: it stays readable as it was."""
    own = workflow_journal_path(session["tenant_id"], run_id, session["identity_id"])
    legacy = workflow_journal_path(session["tenant_id"], run_id)
    return legacy if not own.exists() and not lock_path_for(own).exists() and legacy.exists() else own


def _run_case_path(journal: Path) -> Path:
    """Beside every run of the runner's own folder: which case (none for a run on no case) and every artifact the run stored,
    written by the server when the artifact is stored -- so erasing the case or the account erases the run, whether or not the
    journal is encrypted."""
    return sidecar_of(journal)


def _record_run_artifact(case_file: Path, output: Any) -> Any:
    reference = output.get("artifact", {}).get("cas_reference") if isinstance(output, dict) and isinstance(output.get("artifact"), dict) else None
    if reference is not None:
        record = read_json(case_file)
        record["artifacts"].append(reference)
        tmp = case_file.with_suffix(".tmp")
        tmp.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
        tmp.replace(case_file)
    return output


def _case_run_files(tenant_id: str, identity_id: str, project_id: str) -> list[tuple[Path, Path]]:
    """(sidecar, journal) of every run the person ran on this case."""
    folder = workflow_journal_path(tenant_id, "x", identity_id).parent
    sidecars = [path for path in folder.glob("*.case.json") if read_json(path).get("project_id") == project_id] if folder.is_dir() else []
    return [(path, path.with_name(path.name.replace(".case.json", ".journal.json"))) for path in sidecars]


def case_blocker(repo: ProjectSourceRepository, tenant_id: str, identity_id: str, project_id: str) -> str | None:
    """Why this case cannot be erased right now, in words, or None: an analysis or a synthesis is writing into it (the account deletion
    asks every case before it deletes anything; a run still going is asked of the runner's whole run folder, one place)."""
    if any(item["status"] == "PENDING" for item in _analyses(repo, tenant_id, project_id).get(project_id, [])):
        return "an analysis is still running"
    if run_lock_state(_synthesis_lock_path(tenant_id, project_id)) == "held":
        return "a synthesis is still running"
    return None


def _case_runs(tenant_id: str, identity_id: str, project_id: str) -> list[dict[str, Any]]:
    """Every recipe run the person ran on this case, as the erasure's outbox names it (run id, runner, the artifacts its
    sidecar recorded). Reads only; refuses while one runs."""
    runs = _case_run_files(tenant_id, identity_id, project_id)
    if any(run_lock_state(lock_path_for(journal)) == "held" for _, journal in runs):
        raise HTTPException(status_code=409, detail="PROJECT_BUSY: a workflow run on this case is still running; wait for it to finish, then delete")
    return [{"run_id": journal.name[: -len(".journal.json")], "identity_id": identity_id, "artifacts": list(read_json(case_file).get("artifacts", []))} for case_file, journal in runs]


def _admit_run(repo: ProjectSourceRepository, session: dict[str, Any], project_id: str | None, journal: Path, recipe_id: str, run_id: str,
               case_file: Path | None) -> RunLock:
    """The run's lock taken and its sidecar written under the admission locks (erasure.admit_run): an erase deciding at the
    same time either waits for this and then finds the run (refusing while it runs), or commits first and this finds no
    case (CASE_ERASED, a 404) or no identity (401) and writes nothing."""
    lease: RunLock | None = None
    try:
        with repo.transaction(session["tenant_id"]) as connection:
            try:
                admit_run(connection, session["tenant_id"], session["identity_id"], project_id)
            except InvariantViolation as error:
                if str(error).startswith("IDENTITY_ERASED"):
                    raise HTTPException(status_code=401, detail=str(error)) from error
                raise
            lease = _acquire_run_lock(journal, recipe_id)
            if lease is None:
                raise HTTPException(status_code=409, detail={"code": "WORKFLOW_RUN_IN_FLIGHT", "run_id": run_id})
            if case_file is not None and not case_file.exists():
                case_file.parent.mkdir(parents=True, exist_ok=True)
                case_file.write_text(json.dumps({"project_id": project_id, "artifacts": []}), encoding="utf-8")
    except BaseException:
        if lease is not None:
            lease.release()
        raise
    return lease


def erasure_for(repo: ProjectSourceRepository, source_cas: TenantScopedCas, artifact_store: JsonArtifactStore) -> Erasure:
    """The erasure workflow over this request's stores (ai_lego/platform/erasure.py); runs are found where this API keeps them."""
    return Erasure(repo, source_cas, artifact_store, workflow_journal_path)


def resume_pending_erasures(repo: ProjectSourceRepository, source_cas: TenantScopedCas, artifact_store: JsonArtifactStore) -> list[dict[str, Any]]:
    """Finish every erasure whose decision committed but whose files are not all gone (a crash, a filesystem error)."""
    return erasure_for(repo, source_cas, artifact_store).resume()


def workflow_journal_ref(tenant_id: str, run_id: str) -> str:
    """Return a stable opaque reference; storage location remains an API-internal detail."""
    tenant_key = hashlib.sha256(tenant_id.encode("utf-8")).hexdigest()[:32]
    return f"workflow-journal://{tenant_key}/{run_id}"


def _journal_gate_summary(gate: Any) -> dict[str, Any]:
    if not isinstance(gate, dict):
        raise InvariantViolation("WORKFLOW_JOURNAL_GATE_INVALID")
    return {key: gate[key] for key in ("gate_id", "id", "status") if key in gate}


def _journal_run_summary(journal: dict[str, Any]) -> dict[str, Any]:
    """Project a journal for status inspection without exposing context or outputs."""
    steps: list[dict[str, Any]] = []
    for raw_step in journal["steps"]:
        if not isinstance(raw_step, dict):
            raise InvariantViolation("WORKFLOW_JOURNAL_STEP_INVALID")
        step = {
            key: raw_step[key]
            for key in ("index", "label", "node_kind", "ref", "status", "input_paths", "error")
            if key in raw_step
        }
        if "gates" in raw_step:
            if not isinstance(raw_step["gates"], list):
                raise InvariantViolation("WORKFLOW_JOURNAL_GATES_INVALID")
            step["gates"] = [_journal_gate_summary(gate) for gate in raw_step["gates"]]
        steps.append(step)
    workflow_gates = journal.get("workflow_gates", [])
    if not isinstance(workflow_gates, list):
        raise InvariantViolation("WORKFLOW_JOURNAL_WORKFLOW_GATES_INVALID")
    return {
        "status": journal["status"],
        "next_index": journal["next_index"],
        "workflow_sha256": journal["workflow_sha256"],
        "initial_context_sha256": journal["initial_context_sha256"],
        "steps": steps,
        "workflow_gates": [_journal_gate_summary(gate) for gate in workflow_gates],
    }


def _api_result_context(context: Any) -> dict[str, Any]:
    """Project restored journal context to the API's non-Source result surface."""
    if not isinstance(context, dict):
        raise InvariantViolation("WORKFLOW_JOURNAL_RESULT_CONTEXT_INVALID")
    steps = context.get("steps")
    outputs = context.get("outputs")
    if not isinstance(steps, dict) or not isinstance(outputs, dict):
        raise InvariantViolation("WORKFLOW_JOURNAL_RESULT_CONTEXT_INVALID")
    return {"steps": steps, "outputs": outputs}


def _journal_run_result(journal: dict[str, Any], context: Any) -> dict[str, Any]:
    """Project durable execution outputs without returning raw journal fields."""
    summary = _journal_run_summary(journal)
    result_context = _api_result_context(context)
    result_steps: list[dict[str, Any]] = []
    for summary_step in summary["steps"]:
        step = dict(summary_step)
        index = step.get("index")
        if isinstance(index, int) and str(index) in result_context["steps"]:
            # Read outputs only from the protected/projected context. Never echo a raw
            # step record, because an untrusted or future journal field could contain Source.
            step["output"] = result_context["steps"][str(index)]
        result_steps.append(step)
    return {
        **summary,
        "workflow": {
            "workflow_id": journal["workflow_id"],
            "status": summary["status"],
            "context": result_context,
            "steps": result_steps,
            "workflow_gates": summary["workflow_gates"],
        },
    }


def _refuse_run_of_erased_case(repo: ProjectSourceRepository, session: dict[str, Any], run_id: str) -> None:
    """A run on a case is read only while the case is there: after an erase is decided its files may still be on disk until
    the cleanup removes them, and nobody reads them meanwhile (CASE_ERASED, the 404 every other read of the case gives)."""
    try:
        sidecar = _run_case_path(_run_journal(session, run_id))
    except (KeyError, InvariantViolation):
        return   # the route's own 400
    project_id = read_json(sidecar).get("project_id") if sidecar.is_file() else None
    if isinstance(project_id, str) and repo.get_project(session["tenant_id"], project_id) is None:
        raise HTTPException(status_code=404, detail=f"CASE_ERASED: case {project_id!r} no longer exists; its runs are not read")


def _load_recipe_journal(session: dict[str, Any], recipe_id: str, run_id: str) -> dict[str, Any]:
    """Load and validate one tenant-scoped journal without exposing its filesystem path."""
    try:
        journal = _run_journal(session, run_id)
    except (KeyError, InvariantViolation) as error:
        raise HTTPException(status_code=400, detail="WORKFLOW_RUN_ID_INVALID") from error
    if not journal.is_file():
        raise HTTPException(status_code=404, detail="WORKFLOW_RUN_NOT_FOUND")
    try:
        record = read_json(journal)
        if not isinstance(record, dict):
            raise InvariantViolation("WORKFLOW_JOURNAL_INVALID")
        SchemaContracts(resolve_spec_root()).validate(
            "ai-lego://specs/execution/workflow-journal.schema.yaml",
            record,
            "workflow run journal",
        )
    except Exception as error:
        raise HTTPException(status_code=500, detail="WORKFLOW_JOURNAL_UNREADABLE_OR_INVALID") from error
    if record["workflow_id"] != recipe_id:
        raise HTTPException(status_code=404, detail="WORKFLOW_RUN_NOT_FOUND")
    return record


def _restore_api_result_context(record: dict[str, Any], tenant_id: str, run_id: str) -> dict[str, Any]:
    """Restore protected result state or fail closed when its key boundary is unavailable."""
    stored_context = record.get("context")
    if not isinstance(stored_context, dict):
        raise InvariantViolation("WORKFLOW_JOURNAL_RESULT_CONTEXT_INVALID")
    if stored_context.get("protected") is True:
        try:
            protector = build_api_journal_protector(tenant_id, run_id)
            if protector is None:
                raise InvariantViolation("WORKFLOW_JOURNAL_RESULT_PROTECTION_REQUIRED")
            stored_context = protector.restore(stored_context)
        except InvariantViolation as error:
            raise HTTPException(status_code=503, detail="WORKFLOW_JOURNAL_RESULT_PROTECTION_REQUIRED") from error
    return _api_result_context(stored_context)


@lru_cache(maxsize=1)
def _process_databases() -> Databases:
    """The process's pools, one per region of COGNITIVE_OS_DATABASE_URLS, built on first use. A region whose schema is not
    at head stops it here (the engine never migrates by itself: docs/platform/STORAGE_SWITCH.md D2)."""
    databases = Databases.from_env()
    workers = os.environ.get("COGNITIVE_OS_API_WORKERS", "").strip()
    try:
        for region in databases.regions():
            databases.require_schema_at_head(region)
            databases.require_connection_budget(region, int(workers) if workers.isdecimal() else 1)
    except BaseException:
        databases.close()   # a refused start must not leave its pools (and their threads) behind for the next request to repeat
        raise
    return databases


def get_databases() -> Databases:
    return _process_databases()


def get_store(databases: Databases = Depends(get_databases)) -> IdentityStore:
    return IdentityStore(databases)


def get_artifact_store() -> JsonArtifactStore:
    """Tenant-scoped CAS for capability-emitted artifacts (OQ-PROPOSAL-1). Separate CAS root from
    ``workflow-cas`` (journal encryption): different lifecycle, different reader (any authenticated tenant
    request vs. only the journal machinery)."""
    return JsonArtifactStore(TenantScopedCas(PRODUCT_ROOT / ".runtime" / "artifact-cas"))


def get_project_source_repository(databases: Databases = Depends(get_databases)) -> ProjectSourceRepository:
    return ProjectSourceRepository(databases)


def _safe_cost_twd(model: str, input_tokens: int, output_tokens: int) -> float | None:
    """A money figure is display only: a bad COGNITIVE_OS_AI_PRICES_JSON / COGNITIVE_OS_USD_TWD must not turn every result
    page and estimate into a 500. None = no figure (the page shows tokens only)."""
    try:
        return cost_twd(model, input_tokens, output_tokens)
    except InvariantViolation as failure:
        logging.getLogger(__name__).warning("cost unavailable: %s", failure)
        return None


def _date_has_passed(iso_date: str) -> bool:
    """True when the calendar date is over everywhere on Earth (UTC-12 has reached the next day): a due date the user
    picked in their own zone is never refused or flagged early because the server runs on UTC."""
    return iso_date < (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=12)).date().isoformat()


def get_source_cas() -> TenantScopedCas:
    """Separate CAS root from ``artifact-cas`` (capability-emitted artifacts) and ``workflow-cas`` (journal
    encryption): Source content has its own lifecycle (a Project's raw intake material, not a workflow
    byproduct) and its own reader (any project member, not only the journal machinery)."""
    return TenantScopedCas(PRODUCT_ROOT / ".runtime" / "source-cas")


def _owned_project(repo: ProjectSourceRepository, session: dict[str, Any], project_id: str) -> dict[str, Any] | None:
    """A case is the person's who opened it (ARCH_DECIDED 5: 讀案子時查是不是本人). Someone else -- the same organisation
    included -- sees nothing; workspace members arrive with COLLAB (build step 3), through this one function."""
    project = repo.get_project(session["tenant_id"], project_id)
    return project if project is not None and project["created_by_identity_id"] == session["identity_id"] else None


def _project_or_404(repo: ProjectSourceRepository, session: dict[str, Any], project_id: str) -> dict[str, Any]:
    """The same 404 for a case that does not exist and one that is not yours: existence is not disclosed."""
    project = _owned_project(repo, session, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail=f"PROJECT_NOT_FOUND: {project_id!r}")
    return project


def _granted_project_or_404(repo: ProjectSourceRepository, grant: dict[str, str], project_id: str) -> dict[str, Any]:
    """The collector reaches a case only through a grant scoped to it (require_grant checked the project); it is not the owner."""
    project = repo.get_project(grant["tenant_id"], project_id)
    if project is None:
        raise HTTPException(status_code=404, detail=f"PROJECT_NOT_FOUND: {project_id!r}")
    return project


def _me(session: dict[str, Any], block: str) -> record_log.Writer:
    """A record the signed-in person wrote, from ``block``."""
    return record_log.user(session["identity_id"], block)


def _tool_block(catalog: MethodCatalog, method_id: Any) -> str:
    """The block a tool's records are written by: its contract family (core/domain/blocks.py)."""
    entry = catalog.contracts.get(method_id) if isinstance(method_id, str) else None
    if entry is None:
        raise HTTPException(status_code=409, detail=f"RECORD_TOOL_UNKNOWN: {method_id!r} is not in the catalog; its records cannot name a block")
    try:
        return block_of_family(entry.get("family"))
    except InvariantViolation as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


def _interpretation_block(events: list[dict[str, Any]], catalog: MethodCatalog) -> str:
    """The block of an analysis, as recorded when it was asked for; one asked for before blocks were recorded reads it
    off its tool."""
    requested = next((event for event in events if event["event_type"] == "InterpretationRequested"), None)
    if requested is None:
        raise HTTPException(status_code=404, detail="INTERPRETATION_NOT_FOUND")
    return requested.get("block") or _tool_block(catalog, requested["payload"].get("method_id"))


def _interpretation_or_404(repo: ProjectSourceRepository, session: dict[str, Any], interpretation_id: str) -> dict[str, Any]:
    """A finished analysis of one of the person's own cases."""
    stored = repo.get_interpretation(session["tenant_id"], interpretation_id)
    if stored is None or _owned_project(repo, session, stored["project_id"]) is None:
        raise HTTPException(status_code=404, detail=f"INTERPRETATION_NOT_FOUND: {interpretation_id!r}")
    return stored


def get_ai_provider() -> AiProvider | None:
    """``None`` = no key configured; /ai/* answers 503 AI_PROVIDER_UNCONFIGURED. Tests override this dependency."""
    return provider_from_env()


def get_interpretation_provider(provider: AiProvider | None = Depends(get_ai_provider)) -> AiProvider | None:
    """The interpretation runs in the background and writes a whole result page: the real provider gets the long
    timeout; a test's provider (overriding get_ai_provider) passes through unchanged."""
    return provider.with_timeout(INTERPRET_TIMEOUT_SECONDS) if isinstance(provider, AnthropicProvider) else provider


@lru_cache(maxsize=4)
def _cached_method_catalog(spec_root_string: str) -> MethodCatalog:
    """Cache the read-only method contract scan -- ``from_spec_root`` reads, parses and
    sha256-hashes every ACTIVE method contract (281 files) on each call; uncached, that ran on
    every single dashboard click (2026-09-18: measured ~1s flat per request, list_methods and
    method_form alike). Same fix as ir.py's ``_schema_contracts`` for the same reason -- no test
    ever overrides ``get_catalog`` with a different spec root (see test_custom_workflow_api.py),
    so caching by that root's string is safe for the process lifetime."""
    return MethodCatalog.from_spec_root(Path(spec_root_string))


def get_catalog() -> MethodCatalog:
    return _cached_method_catalog(str(resolve_spec_root()))


# CapabilityCatalog deliberately NOT cached like MethodCatalog above: two tests
# (test_optional_unresolved_capability_is_visible_but_not_a_plan_blocker and
# test_api_skips_unresolved_recommended_capability_without_registering_an_uncontracted_adapter)
# monkeypatch `CapabilityCatalog.from_spec_root` itself via patch.object to inject a modified
# test catalog; an lru_cache wrapper around it returns the first (real) result on every later
# call with the same spec-root string, silently ignoring the patch (proven 2026-09-18: both
# tests failed with cache in place -- IndexError / SUCCEEDED-not-NOT_INVOKED). Its call sites
# were never part of the measured dashboard slowness anyway (that was list_methods/method_form,
# both MethodCatalog-only), so there is no performance reason to cache it too.


def require_session(cognitive_os_session: str | None = Cookie(default=None), store: IdentityStore = Depends(get_store)) -> dict[str, Any]:
    if cognitive_os_session is None:
        raise HTTPException(status_code=401, detail="AUTH_REQUIRED: no session cookie")
    session = store.resolve_session(cognitive_os_session)
    if session is None:
        raise HTTPException(status_code=401, detail="AUTH_REQUIRED: session invalid or expired")
    return session


class LoginRequest(BaseModel):
    tenant_id: str | None = None   # optional: without it the address is looked up in every tenant (authenticate_anywhere)
    email: str
    password: str


class HandoffMintRequest(BaseModel):
    project_id: str


_DASHBOARD_PATH = Path(__file__).with_name("dashboard.html")
_DASHBOARD_HTML = _DASHBOARD_PATH.read_text(encoding="utf-8")


@app.get("/")
def dashboard() -> HTMLResponse:
    """Minimal browser UI -- see module docstring. No auth of its own; the page's JS calls the
    same auth/methods/demo endpoints a curl user would, so it carries no capability the API
    didn't already expose. This is the app's first page with a real login form, so it sets
    X-Frame-Options to block a clickjacking overlay (there was no HTML surface to iframe before
    this route existed)."""
    return HTMLResponse(content=_DASHBOARD_HTML, headers={"X-Frame-Options": "DENY"})


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness probe only (no DB/spec-root touch) -- matches this deployment's own
    docker-compose healthcheck and every other aware-wave.com service's ``/api/health``
    convention. Deliberately cheap: a slow spec-root scan or DB open here would make the
    container healthcheck itself a load-bearing dependency on those subsystems being healthy,
    which is backwards for a liveness probe."""
    return {"status": "ok"}


_DISPLAY_METADATA_CACHE: dict[str, Any] = {}


def _method_display_metadata() -> dict[str, dict[str, str]]:
    """``method_id -> {name_en, name_zh, blurb_en, blurb_zh}``, re-read when the file changes (mtime and size) -- so dashboard copy
    edits don't need a restart, and a request does not parse the file.
    Deliberately a separate file from each contract's own ``description`` (AI/engineer-facing
    per AGENTS.md §9, not end-user copy) -- see the file's own header for why. Fails open to
    ``{}`` if the file is missing OR fails to parse (critic finding 2026-09-18: a malformed-but-
    present file must not 500 /methods and /methods/{id}/form, the two basic discovery routes)."""
    path = resolve_spec_root() / "methods" / "registry" / "method-display-metadata.yaml"
    try:
        stat = path.stat()
    except OSError:
        return {}
    stamp = (str(path), stat.st_mtime_ns, stat.st_size)   # the parse is 0.4 s of pure-Python YAML: once per file change, not per request
    if _DISPLAY_METADATA_CACHE.get("stamp") != stamp:
        try:
            document = safe_load_yaml(path.read_text(encoding="utf-8"))
        except (OSError, yaml.YAMLError):
            document = None
        entries = document.get("entries") if isinstance(document, dict) else None
        _DISPLAY_METADATA_CACHE.update(stamp=stamp, entries=entries if isinstance(entries, dict) else {})
    return _DISPLAY_METADATA_CACHE["entries"]


@app.get("/methods")
def list_methods(catalog: MethodCatalog = Depends(get_catalog)) -> list[dict[str, Any]]:
    display = _method_display_metadata()
    return [
        {"method_id": method_id, **{k: v for k, v in entry.items() if k != "content_sha256"}, "display": display.get(method_id)}
        for method_id, entry in sorted(catalog.contracts.items())
    ]


_CATALOG_CACHE: dict[str, Any] = {}


def _catalog_fingerprint() -> tuple[int, int]:
    """(file count, hash of names, mtimes and sizes) of every file the display catalog reads -- a registry edit changes it, so the cached
    payload is rebuilt without a restart (same freshness as /methods), while an unchanged tree costs a few stat calls
    instead of a 1.3 s parse of every contract."""
    return registry_fingerprint()


_CATALOG_RECHECK_SECONDS = 2.0   # the fingerprint is a glob and 280 stats (7 ms): looked at most this often, so a registry edit shows within it


def _display_catalog_payload() -> dict[str, Any]:
    """The cached payload (and its JSON bytes, 390 KB: serialized once, not per request), rebuilt when the registry's files changed
    (_catalog_fingerprint). Per process: each worker builds its own copy at start (_lifespan); it is read-only, so N copies never
    disagree for longer than an edit."""
    now = _monotonic()
    if "payload" in _CATALOG_CACHE and now - _CATALOG_CACHE.get("checked", float("-inf")) < _CATALOG_RECHECK_SECONDS:
        return _CATALOG_CACHE["payload"]
    fingerprint = _catalog_fingerprint()
    if _CATALOG_CACHE.get("fingerprint") != fingerprint:
        payload = catalog_payload(load_catalog())
        body = JSONResponse(payload).body
        _CATALOG_CACHE.update(fingerprint=fingerprint, payload=payload, body=body, etag='"' + hashlib.sha256(body).hexdigest()[:32] + '"')
    _CATALOG_CACHE["checked"] = now
    return _CATALOG_CACHE["payload"]


@app.get("/catalog")
def display_catalog(request: Request) -> Response:
    """Everything the web app's home page, tool directory and workflow list show, from the loader the mocks are checked
    with (ai_lego/platform/catalog/display_catalog.py). Public like /methods. A registry gap is a 503 that names it --
    never a half-labelled page. ETag = hash of the body (same in every worker): the web tier keeps its parsed copy and asks
    `If-None-Match`, so a render costs a 304 instead of 390 KB over the wire and a JSON parse (apps/cognitive-web/lib/catalog.ts)."""
    try:
        _display_catalog_payload()
        etag = _CATALOG_CACHE["etag"]
        tags = [part.strip().removeprefix("W/") for part in request.headers.get("if-none-match", "").split(",")]   # RFC 9110 13.1.2: a list, `*`, weak validators
        if "*" in tags or etag in tags:
            return Response(status_code=304, headers={"ETag": etag})
        return Response(content=_CATALOG_CACHE["body"], media_type="application/json", headers={"ETag": etag})
    except (ValueError, OSError, yaml.YAMLError, InvariantViolation) as error:   # a gap, a missing or unparsable file
        raise HTTPException(status_code=503, detail=f"CATALOG_INVALID: {type(error).__name__}: {error}") from error


@app.get("/recipes")
def list_recipes() -> list[dict[str, Any]]:
    """List the real validated Recipe files; no hand-maintained registry."""
    recipe_dir = resolve_spec_root() / "recipes" / "validated"
    recipes = []
    for path in sorted(recipe_dir.glob("*.recipe.yaml")):
        recipe = safe_load_yaml(path.read_text(encoding="utf-8"))
        if not isinstance(recipe, dict) or recipe.get("status") != "ACTIVE":
            continue
        recipes.append({"recipe_id": recipe.get("id"), "version": str(recipe.get("version")), "status": recipe.get("status"), "step_count": len(recipe.get("steps", []))})
    return recipes


@app.get("/recipes/{recipe_id}/plan")
def recipe_plan(recipe_id: str, method_catalog: MethodCatalog = Depends(get_catalog)) -> dict[str, Any]:
    """Compile one Recipe and return the authoritative fail-closed plan verdict."""
    try:
        workflow_ir = compile_recipe_to_workflow_ir(resolve_spec_root(), recipe_id, "R0")
    except InvariantViolation as error:
        if "RECIPE_NOT_FOUND" in str(error) or "RECIPE_ID_MISMATCH" in str(error):
            raise HTTPException(status_code=404, detail=str(error)) from error
        raise HTTPException(status_code=400, detail=str(error)) from error
    method_ids = [node["method_id"] for node in workflow_ir["nodes"] if node["node_kind"] == "method"]
    method_resolution = method_catalog.resolve(method_ids)
    method_dispatch_readiness: dict[str, list[str]] = {"registered": [], "missing": []}
    method_binding_issues_by_node: list[dict[str, Any]] = []
    for method_id in sorted(set(method_ids)):
        try:
            resolve_builder(method_id)
            resolve_gate_runner(method_id)
        except MethodDispatchError:
            method_dispatch_readiness["missing"].append(method_id)
        else:
            method_dispatch_readiness["registered"].append(method_id)
    for index, node in enumerate(workflow_ir["nodes"]):
        if node.get("node_kind") != "method" or not isinstance(node.get("bindings"), dict):
            continue
        try:
            builder = resolve_builder(node["method_id"])
        except MethodDispatchError:
            continue
        issues = method_binding_issues(builder, node["bindings"])
        if issues:
            method_binding_issues_by_node.append({"index": index, "ref": node["method_id"], "issues": issues})
    capability_catalog = CapabilityCatalog.from_spec_root(resolve_spec_root())
    capability_resolution = capability_catalog.resolve(capability_refs(workflow_ir))
    executability = plan_executability(workflow_ir, capability_resolution)
    capability_ids = capability_refs(workflow_ir)
    resolvable_capability_ids = [ref for ref in capability_ids if capability_catalog.is_resolvable(ref)]
    capability_adapters = build_api_capability_adapters(capability_catalog, resolvable_capability_ids)
    adapter_readiness = capability_adapters.availability(capability_ids)
    workflow_gate_registry = build_api_workflow_gate_registry()
    workflow_gate_refs = list(workflow_ir.get("workflow_gate_refs", []))
    if "workflow_execution_integrity" not in workflow_gate_refs:
        workflow_gate_refs.insert(0, "workflow_execution_integrity")
    workflow_gate_readiness = workflow_gate_registry.availability(workflow_gate_refs)
    workflow_gate_ready = not workflow_gate_readiness["missing"]
    adapter_blocking = [
        {"ref": node["ref"], "label": node.get("label"), "necessity": node.get("necessity", "RECOMMENDED")}
        for node in workflow_ir["nodes"]
        if node.get("node_kind") == "capability"
        and node["ref"] in adapter_readiness["missing"]
        and str(node.get("necessity", "RECOMMENDED")).startswith("REQUIRED_")
    ]
    adapter_ready = not adapter_blocking
    missing_bindings = [
        {"index": index, "label": node.get("label"), "ref": node.get("ref", node.get("method_id"))}
        for index, node in enumerate(workflow_ir["nodes"])
        if not isinstance(node.get("bindings"), dict)
    ]
    binding_ready = not missing_bindings and not method_binding_issues_by_node
    method_ready = method_resolution["blocked"] is None
    dispatch_ready = not method_dispatch_readiness["missing"]
    return {
        "recipe_id": recipe_id,
        "workflow_ir": workflow_ir,
        "method_resolution": method_resolution,
        "method_dispatch_readiness": {**method_dispatch_readiness, "ready": dispatch_ready},
        "capability_resolution": capability_resolution,
        "plan_executability": executability,
        "adapter_readiness": {**adapter_readiness, "blocking": adapter_blocking, "ready": adapter_ready},
        "workflow_gate_readiness": {**workflow_gate_readiness, "refs": workflow_gate_refs, "ready": workflow_gate_ready},
        "binding_readiness": {"missing": missing_bindings, "method_issues": method_binding_issues_by_node, "ready": binding_ready},
        "blockers": [
            *([{"code": "METHOD_RESOLUTION_BLOCKED", "detail": method_resolution["blocked"]}] if method_resolution["blocked"] else []),
            *([{"code": "METHOD_DISPATCH_BLOCKED", "detail": {"missing": method_dispatch_readiness["missing"]}}] if method_dispatch_readiness["missing"] else []),
            *([{"code": "CAPABILITY_RESOLUTION_BLOCKED", "detail": capability_resolution["blocked"]}] if capability_resolution["blocked"] and not executability["executable"] else []),
            *([{"code": "CAPABILITY_ADAPTER_BLOCKED", "detail": adapter_blocking}] if adapter_blocking else []),
            *([{"code": "METHOD_BINDING_BLOCKED", "detail": method_binding_issues_by_node}] if method_binding_issues_by_node else []),
            *([{"code": "WORKFLOW_BINDING_BLOCKED", "detail": missing_bindings}] if missing_bindings else []),
            *([{"code": "WORKFLOW_GATE_BLOCKED", "detail": workflow_gate_readiness}] if not workflow_gate_ready else []),
        ],
        "status": "READY" if method_ready and dispatch_ready and executability["executable"] and adapter_ready and binding_ready and workflow_gate_ready else "BLOCKED",
    }


@app.get("/recipes/{recipe_id}/form")
def recipe_form(recipe_id: str) -> dict[str, Any]:
    """Expose a generic Source descriptor derived from compiled bindings.

    This is intentionally a descriptor, not a guessed JSON Schema: domain
    contracts remain authoritative and the run endpoint still performs the
    actual path/type/gate checks.
    """
    try:
        workflow_ir = compile_recipe_to_workflow_ir(resolve_spec_root(), recipe_id, "R0")
    except InvariantViolation as error:
        if "RECIPE_NOT_FOUND" in str(error) or "RECIPE_ID_MISMATCH" in str(error):
            raise HTTPException(status_code=404, detail=str(error)) from error
        raise HTTPException(status_code=400, detail=str(error)) from error
    fields: dict[str, dict[str, Any]] = {}
    for index, node in enumerate(workflow_ir["nodes"]):
        bindings = node.get("bindings")
        paths: list[str] = []
        if isinstance(bindings, dict):
            paths.extend(value for value in bindings.values() if isinstance(value, str))
        declared = node.get("input")
        if isinstance(declared, str):
            paths.append(declared)
        elif isinstance(declared, list):
            paths.extend(value for value in declared if isinstance(value, str))
        for path in dict.fromkeys(paths):
            if not path.startswith("source."):
                continue
            source_path = path.removeprefix("source.")
            field = fields.setdefault(source_path, {"path": source_path, "required": True, "consumers": []})
            field["consumers"].append({"index": index, "label": node.get("label"), "ref": node.get("ref", node.get("method_id"))})
    return {"recipe_id": recipe_id, "workflow_id": workflow_ir["id"], "source_fields": list(fields.values()), "schema_source": "compiled_workflow_bindings"}


# One (tenant, run_id) executes at most once at a time, on either path and in any worker process: the runner
# holds an OS lock on <run_id>.lock next to the journal for the whole run (platform/workflow/run_lock.py; Codex
# oracle 2026-09-27/28, critic 2026-09-28). Status reads that lock: before the first journal record a held lock
# is RUNNING and a free one is LOST; a RUNNING journal carries runner alive|lost. A lost run is recovered only by
# an explicit resume that first takes the lock.
def _acquire_run_lock(journal_path: Path, recipe_id: str) -> RunLock | None:
    return acquire_run_lock(lock_path_for(journal_path), tag=recipe_id)


def _runner_alive(journal_path: Path) -> bool:
    return run_lock_state(lock_path_for(journal_path)) == "held"


def _journal_status(journal_path: Path) -> str | None:
    try:
        record = read_json(journal_path)
    except Exception:
        return None  # unreadable: the executor's own restore answers it
    return record.get("status") if isinstance(record, dict) else None


# A drive-letter path (Windows) or a leading-slash path (POSIX) written into a journal's error text would
# leak the host filesystem layout to whoever reads the journal (the same boundary _load_recipe_journal's
# docstring already protects for the path itself); stripped from the message before it is ever written.
_HOST_PATH_RE = re.compile(r"(?<!\w)[A-Za-z]:[\\/][^\s\"']*|(?<![\w:./])/[^\s\"']*")


def _redact_host_paths(message: str) -> str:
    return _HOST_PATH_RE.sub("<path-redacted>", message)


def _fail_recipe_journal(
    *,
    journal_path: Path,
    workflow_ir: dict[str, Any],
    initial_context: dict[str, Any],
    journal_context_projector: Callable[[dict[str, Any]], Any] | None,
    journal_context_protector: Any,
    error: BaseException,
    label: str = "async-run",
) -> None:
    """Leave a readable FAILED journal after ``execute_workflow_ir`` raises past its own per-step handling.

    ``execute_workflow_ir`` already turns almost every failure into a ``FAILED`` journal record itself (one
    per node, via the same ``_atomic_write_journal``/``_journal_record`` pair reused here); the residual gap is
    an exception it raises without having written one yet -- an early guard clause before the run's first
    journal write, or the ``workflow_gate_runner`` call, which is not wrapped in its per-step try/except. In a
    synchronous run that gap still reaches the caller as an HTTP error; in an async run there is no HTTP
    response left to carry it, so polling ``GET /recipes/{id}/runs/{run_id}`` must see it instead. Reusing the
    executor's own journal writer (rather than a second status store) keeps the encrypted-journal path
    (``journal_context_protector``) correct for CONFIDENTIAL/RESTRICTED runs.
    """
    message = _redact_host_paths(str(error) or error.__class__.__name__)
    # node_kind is schema-constrained to {method, capability} (specs/execution/workflow-journal.schema.yaml);
    # this synthetic marker step is neither, but "method" is the closest valid choice, and the label/ref/error
    # below make it unambiguous this came from the async wrapper rather than a real recipe node.
    failed_step = {"index": 0, "label": label, "node_kind": "method", "ref": "run_recipe", "status": "FAILED", "input_paths": [], "error": message}
    try:
        existing = read_json(journal_path) if journal_path.exists() else None
    except Exception:
        existing = None
    if isinstance(existing, dict) and isinstance(existing.get("steps"), list):
        failed_step["index"] = existing.get("next_index", len(existing["steps"]))
        existing["status"] = "FAILED"
        existing["steps"].append(failed_step)
        _atomic_write_journal(journal_path, existing)
        return
    context = dict(initial_context)
    context.setdefault("steps", {})
    context.setdefault("outputs", {})
    record = _journal_record(workflow_ir, initial_context, "FAILED", context, [], 0, journal_context_projector, journal_context_protector)
    record["steps"].append(failed_step)
    _atomic_write_journal(journal_path, record)


def _run_recipe_async(*, lease: RunLock, **kwargs: Any) -> None:
    """Background-thread target for ``async:true`` runs (template: ``_launch_interpretation``)."""
    fail_kwargs = {
        "journal_path": kwargs["journal_path"],
        "workflow_ir": kwargs["workflow_ir"],
        "initial_context": kwargs["initial_context"],
        "journal_context_projector": kwargs["journal_context_projector"],
        "journal_context_protector": kwargs["journal_context_protector"],
    }
    try:
        execute_workflow_ir(
            kwargs["workflow_ir"],
            kwargs["initial_context"],
            kwargs["handlers"],
            catalogs=kwargs["catalogs"],
            gate_runners=kwargs["gate_runners"],
            workflow_gate_runner=kwargs["workflow_gate_runner"],
            journal_path=kwargs["journal_path"],
            resume=kwargs["resume"],
            journal_context_projector=kwargs["journal_context_projector"],
            journal_context_protector=kwargs["journal_context_protector"],
        )
    except Exception as error:
        # A journal that already exists belongs to another run (the sync path answers 409 for this and the
        # async pre-check does too); never rewrite it as FAILED from here (Codex oracle 2026-09-27).
        if not str(error).startswith("WORKFLOW_JOURNAL_EXISTS_REQUIRES_RESUME"):
            _fail_recipe_journal(**fail_kwargs, error=error)
    finally:
        lease.release()


@app.post("/recipes/{recipe_id}/run")
def run_recipe(
    recipe_id: str,
    body: dict[str, Any],
    response: Response,
    session: dict[str, Any] = Depends(require_session),
    catalog: MethodCatalog = Depends(get_catalog),
    store: IdentityStore = Depends(get_store),
    artifact_store: JsonArtifactStore = Depends(get_artifact_store),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
) -> dict[str, Any]:
    """Execute a Recipe through the shared durable Workflow runtime.

    ``body`` is ``{"source": {...}, "run_id": "optional", "resume": false, "project_id": "optional", "async": false}``.
    Bindings in the compiled IR are the only builder arguments; there is no
    positional guessing or fallback to the single-method API. ``async:true``
    runs the same execution in a background thread and returns 202 immediately;
    progress is read through the existing ``GET /recipes/{id}/runs/{run_id}``.
    """
    try:
        workflow_ir = compile_recipe_to_workflow_ir(resolve_spec_root(), recipe_id, "R0")
    except InvariantViolation as error:
        if "RECIPE_NOT_FOUND" in str(error) or "RECIPE_ID_MISMATCH" in str(error):
            raise HTTPException(status_code=404, detail=str(error)) from error
        raise HTTPException(status_code=400, detail=str(error)) from error
    nodes = workflow_ir["nodes"]
    method_ids = [node["method_id"] for node in nodes if node["node_kind"] == "method"]
    capability_ids = capability_refs(workflow_ir)
    if any(not isinstance(node.get("bindings"), dict) for node in nodes):
        raise HTTPException(status_code=400, detail="WORKFLOW_BINDINGS_REQUIRED: every workflow node must declare explicit bindings")
    invalid_method_bindings: list[dict[str, Any]] = []
    for index, node in enumerate(nodes):
        if node["node_kind"] != "method":
            continue
        try:
            builder = resolve_builder(node["method_id"])
        except MethodDispatchError:
            continue
        issues = method_binding_issues(builder, node["bindings"])
        if issues:
            invalid_method_bindings.append({"index": index, "ref": node["method_id"], "issues": issues})
    if invalid_method_bindings:
        raise HTTPException(status_code=400, detail={"code": "WORKFLOW_METHOD_BINDINGS_INVALID", "nodes": invalid_method_bindings})
    method_resolution = catalog.resolve(method_ids)
    if method_resolution["blocked"] is not None:
        raise HTTPException(status_code=409, detail=method_resolution["blocked"])
    for method_id in sorted(set(method_ids)):
        try:
            resolve_builder(method_id)
            resolve_gate_runner(method_id)
        except MethodDispatchError as error:
            raise HTTPException(status_code=501, detail=f"DISPATCH_UNAVAILABLE: {error}") from error
    capability_catalog = CapabilityCatalog.from_spec_root(resolve_spec_root())
    capability_resolution = capability_catalog.resolve(capability_ids)
    if capability_resolution["blocked"] is not None:
        executability = plan_executability(workflow_ir, capability_resolution)
        if not executability["executable"]:
            raise HTTPException(status_code=409, detail={"code": "CAPABILITY_PLAN_NOT_EXECUTABLE", "plan_executability": executability, "resolution": capability_resolution["blocked"]})
    resolvable_capability_ids = [ref for ref in capability_ids if capability_catalog.is_resolvable(ref)]
    project_id = body.get("project_id")
    # Existence-only check (never raises): the authoritative 404/400 for a bad project_id is still
    # below, at the classification derivation, unchanged in order relative to every other check in
    # this function. An unknown project_id gets no project_sources, same as no project_id at all
    # (RESEARCH_LINES_MASTER_PLAN WC-P2-07b, P-K9).
    project_sources: list[dict[str, Any]] | None = None
    if isinstance(project_id, str) and _owned_project(repo, session, project_id) is not None:
        project_sources = repo.list_sources(session["tenant_id"], project_id)
    capability_adapters = build_api_capability_adapters(capability_catalog, resolvable_capability_ids, project_sources=project_sources)
    workflow_gate_registry = build_api_workflow_gate_registry()
    workflow_gate_refs = list(workflow_ir.get("workflow_gate_refs", []))
    if "workflow_execution_integrity" not in workflow_gate_refs:
        workflow_gate_refs.insert(0, "workflow_execution_integrity")
    try:
        workflow_gate_registry.require_for(workflow_gate_refs)
    except InvariantViolation as error:
        raise HTTPException(status_code=501, detail=str(error)) from error
    try:
        capability_handlers = capability_adapters.handlers_for(resolvable_capability_ids)
    except InvariantViolation as error:
        raise HTTPException(status_code=501, detail=str(error)) from error
    capability_handlers = wrap_capability_handlers_with_artifact_persistence(capability_handlers, session["tenant_id"], artifact_store)
    for ref in [*method_ids, *capability_ids]:
        if not check_entitlement(store, session["tenant_id"], ref):
            raise HTTPException(status_code=403, detail=f"ENTITLEMENT_DENIED: tenant {session['tenant_id']!r} may not invoke {ref!r}")
    source = body.get("source")
    if not isinstance(source, dict):
        raise HTTPException(status_code=400, detail="WORKFLOW_SOURCE_REQUIRED: body.source must be a JSON object")
    missing_source_paths = missing_workflow_input_paths(workflow_ir, {"source": source})
    if missing_source_paths:
        raise HTTPException(
            status_code=400,
            detail={"code": "WORKFLOW_SOURCE_FIELDS_MISSING", "paths": list(missing_source_paths)},
        )
    # A value-judgment field (weights/scores/scale, an argument's warrant/qualifier) has no correct value
    # without a human (RESEARCH_LINES_MASTER_PLAN §3.4 C5); refused before journal so a half-run is never
    # recorded for one, and AI drafting (draft_recipe_source) separately never fills it.
    human_required_missing = missing_human_required(workflow_ir, source, load_human_required(resolve_spec_root()))
    if human_required_missing:
        raise HTTPException(status_code=422, detail={"code": "HUMAN_REQUIRED_MISSING", "fields": human_required_missing})
    run_id = body.get("run_id") or uuid.uuid4().hex
    if not isinstance(run_id, str) or re.fullmatch(r"[A-Za-z0-9_-]{1,80}", run_id) is None:
        raise HTTPException(status_code=400, detail="WORKFLOW_RUN_ID_INVALID: use 1-80 ASCII letters, numbers, '_' or '-'")
    resume = body.get("resume", False)
    if not isinstance(resume, bool):
        raise HTTPException(status_code=400, detail="WORKFLOW_RESUME_INVALID: resume must be boolean")
    async_run = body.get("async", False)
    if not isinstance(async_run, bool):
        raise HTTPException(status_code=400, detail="WORKFLOW_ASYNC_INVALID: async must be boolean")
    journal = _run_journal(session, run_id)
    journal_ref = workflow_journal_ref(session["tenant_id"], run_id)
    # The classification is the Project's, never the caller's (RESEARCH_LINES_MASTER_PLAN K9): a body value is refused
    # rather than ignored, because silently ignoring CONFIDENTIAL would drop the encrypted-journal requirement below.
    # No Project = INTERNAL. Project vocabulary is Title_Case, run vocabulary UPPER (see the NOTE above CreateProjectRequest).
    if "data_classification" in body:
        raise HTTPException(status_code=400, detail="WORKFLOW_DATA_CLASSIFICATION_SERVER_DERIVED: send project_id; the run takes that Project's classification")
    if project_id is None:
        classification = "INTERNAL"
    elif isinstance(project_id, str):
        classification = _project_or_404(repo, session, project_id)["data_classification"].upper()
    else:
        raise HTTPException(status_code=400, detail="WORKFLOW_PROJECT_ID_INVALID")
    try:
        journal_protector = build_api_journal_protector(session["tenant_id"], run_id)
    except InvariantViolation as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    if classification in {"CONFIDENTIAL", "RESTRICTED"} and journal_protector is None:
        raise HTTPException(status_code=503, detail="WORKFLOW_JOURNAL_PROTECTION_REQUIRED: confidential/restricted source requires an encrypted journal provider")

    try:
        method_handlers, gate_runners = build_method_components(nodes, validator="api.recipe")
    except MethodDispatchError as error:
        raise HTTPException(status_code=501, detail=f"DISPATCH_UNAVAILABLE: {error}") from error
    case_file = _run_case_path(journal) if journal == workflow_journal_path(session["tenant_id"], run_id, session["identity_id"]) else None
    if case_file is not None:   # written at admission (_admit_run), before any handler runs
        capability_handlers = {ref: (lambda payload, node, inner=handler: _record_run_artifact(case_file, inner(payload, node))) for ref, handler in capability_handlers.items()}
    handlers: dict[str, Any] = dict(capability_handlers)
    handlers.update(method_handlers)

    def evaluate_api_workflow_gate(context: dict[str, Any], workflow: dict[str, Any]) -> list[dict[str, Any]]:
        return workflow_gate_registry.evaluate(workflow_gate_refs, context, workflow)

    execution_kwargs = {
        "workflow_ir": workflow_ir,
        "initial_context": {"source": source},
        "handlers": handlers,
        "catalogs": {"method": catalog, "capability": capability_catalog},
        "gate_runners": gate_runners,
        "workflow_gate_runner": evaluate_api_workflow_gate,
        "journal_path": journal,
        "resume": resume,
        "journal_context_projector": None if journal_protector is not None else _api_journal_context,
        "journal_context_protector": journal_protector,
    }
    # Every refusal happens before the run lock is taken: its file records "accepted" (a refused run_id must stay
    # absent, not read back as LOST -- critic 2026-09-28 r2). The executor keeps the same checks as a backstop.
    if journal.is_file() and not resume:
        raise HTTPException(status_code=409, detail={"code": "WORKFLOW_RUN_EXISTS_REQUIRES_RESUME", "run_id": run_id})
    if resume and not journal.is_file():
        raise HTTPException(status_code=404, detail={"code": "WORKFLOW_RUN_NOT_FOUND", "run_id": run_id})
    lease = _admit_run(repo, session, project_id if isinstance(project_id, str) else None, journal, recipe_id, run_id, case_file)
    try:
        if resume and _journal_status(journal) == "RUNNING":
            # We hold the run lock, so no live runner owns this RUNNING journal: its runner died mid-run. Record
            # that as the failure it is (keeps every completed checkpoint) so the executor resumes from next_index.
            logging.getLogger(__name__).warning("recipe run %s: runner lost mid-run; recovering from its last checkpoint", run_id)
            _fail_recipe_journal(
                journal_path=journal,
                workflow_ir=workflow_ir,
                initial_context={"source": source},
                journal_context_projector=execution_kwargs["journal_context_projector"],
                journal_context_protector=journal_protector,
                error=InvariantViolation("WORKFLOW_RUNNER_LOST: the previous runner stopped before finishing; resumed from its last completed step"),
                label="runner-lost",
            )
        if async_run:
            threading.Thread(target=_run_recipe_async, daemon=True, kwargs={**execution_kwargs, "lease": lease}).start()
    except BaseException:
        lease.release()  # no thread = nothing else will ever release it
        raise
    if async_run:
        response.status_code = 202
        return {"status": "RUNNING", "run_id": run_id, "journal_ref": journal_ref}

    try:
        result = execute_workflow_ir(
            workflow_ir,
            {"source": source},
            handlers,
            catalogs={"method": catalog, "capability": capability_catalog},
            gate_runners=gate_runners,
            workflow_gate_runner=evaluate_api_workflow_gate,
            journal_path=journal,
            resume=resume,
            journal_context_projector=None if journal_protector is not None else _api_journal_context,
            journal_context_protector=journal_protector,
        )
    except InvariantViolation as error:
        if str(error).startswith("WORKFLOW_JOURNAL_EXISTS_REQUIRES_RESUME"):
            raise HTTPException(
                status_code=409,
                detail={"code": "WORKFLOW_RUN_EXISTS_REQUIRES_RESUME", "run_id": run_id},
            ) from error
        raise
    finally:
        lease.release()
    gates = {str(step.index): list(step.gates) for step in result.steps if step.gates is not None}
    workflow_gates = list(result.workflow_gates or [])
    if result.status != "SUCCEEDED":
        return {"status": "FAILED", "run_id": run_id, "workflow": _api_workflow_result(result), "gates": gates, "workflow_gates": workflow_gates, "journal_ref": journal_ref, "method_resolution": method_resolution, "capability_resolution": capability_resolution}
    passed = all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for step_gates in gates.values() for gate in step_gates) and all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in workflow_gates)
    return {"status": "PASS" if passed else "GATE_FAILED", "run_id": run_id, "workflow": _api_workflow_result(result), "gates": gates, "workflow_gates": workflow_gates, "journal_ref": journal_ref, "method_resolution": method_resolution, "capability_resolution": capability_resolution}


@app.get("/recipes/{recipe_id}/runs/{run_id}")
def recipe_run_status(
    recipe_id: str,
    run_id: str,
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
) -> dict[str, Any]:
    """Return a tenant-scoped, metadata-only view of one durable Recipe run. A RUNNING run also carries
    ``runner``: ``alive`` (its run lock is held) or ``lost`` (its runner died; ``resume:true`` recovers it). An
    accepted run whose runner died before its first journal record is ``LOST`` (submit it again)."""
    tenant_id = session["tenant_id"]
    _refuse_run_of_erased_case(repo, session, run_id)
    try:
        journal_path: Path | None = _run_journal(session, run_id)
    except (KeyError, InvariantViolation):
        journal_path = None  # _load_recipe_journal below answers the 400
    if journal_path is not None and not journal_path.is_file():
        state = run_lock_state(lock_path_for(journal_path))
        if state != "absent" and run_lock_tag(lock_path_for(journal_path)) != recipe_id:
            state = "absent"  # accepted for another recipe: this recipe has no such run (the 404 below)
        if state != "absent" and not journal_path.is_file():  # re-check: the runner may have just written it
            # Accepted, no journal record yet: its runner is either still starting (held) or died (free).
            status, runner = ("RUNNING", "alive") if state == "held" else ("LOST", "lost")
            return {"recipe_id": recipe_id, "run_id": run_id, "journal_ref": workflow_journal_ref(tenant_id, run_id), "status": status, "steps": [], "workflow_gates": [], "journal_written": False, "runner": runner}
    record = _load_recipe_journal(session, recipe_id, run_id)
    summary = _journal_run_summary(record)
    body = {"recipe_id": recipe_id, "run_id": run_id, "journal_ref": workflow_journal_ref(tenant_id, run_id), **summary}
    if summary["status"] == "RUNNING" and journal_path is not None:
        if _runner_alive(journal_path):
            body["runner"] = "alive"
        else:
            # the runner may have finished between the journal read and the lock probe: re-read before saying lost
            body = {"recipe_id": recipe_id, "run_id": run_id, "journal_ref": workflow_journal_ref(tenant_id, run_id), **_journal_run_summary(_load_recipe_journal(session, recipe_id, run_id))}
            if body["status"] == "RUNNING":
                body["runner"] = "lost"
    return body


@app.get("/recipes/{recipe_id}/runs/{run_id}/result")
def recipe_run_result(
    recipe_id: str,
    run_id: str,
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
) -> dict[str, Any]:
    """Return tenant-scoped durable outputs, restoring protected journal context when needed."""
    _refuse_run_of_erased_case(repo, session, run_id)
    record = _load_recipe_journal(session, recipe_id, run_id)
    try:
        context = _restore_api_result_context(record, session["tenant_id"], run_id)
        result = _journal_run_result(record, context)
    except HTTPException:
        raise
    except InvariantViolation as error:
        raise HTTPException(status_code=500, detail="WORKFLOW_JOURNAL_RESULT_UNREADABLE_OR_INVALID") from error
    return {
        "recipe_id": recipe_id,
        "run_id": run_id,
        "journal_ref": workflow_journal_ref(session["tenant_id"], run_id),
        **result,
    }


@app.get("/methods/{method_id}")
def get_method(method_id: str, catalog: MethodCatalog = Depends(get_catalog)) -> dict[str, Any]:
    if not catalog.is_resolvable(method_id):
        raise HTTPException(status_code=404, detail=f"METHOD_RESOLUTION_BLOCKED: no ACTIVE contract for {method_id!r}")
    return catalog.require(method_id)


@app.get("/methods/{method_id}/form")
def method_form(method_id: str, catalog: MethodCatalog = Depends(get_catalog)) -> dict[str, Any]:
    """The dashboard's input form: a field tree derived from the method's own typed-object record
    schema, labelled from ``methods/registry/method-input-forms.yaml`` (``method_form.py``). System
    parameters (record_id/provenance/version/generated_by_method) and the domain identity param
    (analysis_id...) are never fields -- /invoke supplies them. The invoke endpoint stays the authority.
    """
    if not catalog.is_resolvable(method_id):
        raise HTTPException(status_code=404, detail=f"METHOD_RESOLUTION_BLOCKED: no ACTIVE contract for {method_id!r}")
    try:
        builder = resolve_builder(method_id)
    except MethodDispatchError as error:
        raise HTTPException(status_code=501, detail=f"DISPATCH_UNAVAILABLE: {error}") from error
    spec_root = resolve_spec_root()
    form = describe_method_form(spec_root, {mid: entry["path"] for mid, entry in catalog.contracts.items()}, method_id, builder, load_forms(spec_root))
    return {
        "method_id": method_id,
        "contract": catalog.require(method_id),
        "display": _method_display_metadata().get(method_id),
        "form": {key: form[key] for key in ("fields", "workflow_only", "record_schema", "example") if key in form},
        "schema_source": "record_schema",
    }


@app.post("/auth/login")
def login(payload: LoginRequest, response: Response, store: IdentityStore = Depends(get_store)) -> dict[str, str]:
    """{email, password} and, optionally, tenant_id. Without it: one tenant whose account the password opens -> the
    session; several -> 409 LOGIN_CHOOSE_WORKSPACE naming only those (send again with the chosen tenant_id); none -> the
    same 401, at the same cost, as a wrong password."""
    if payload.tenant_id:
        token = store.authenticate(payload.tenant_id, payload.email, payload.password)
    else:
        found = store.authenticate_anywhere(payload.email, payload.password)
        if found is not None and "choose" in found:
            raise HTTPException(status_code=409, detail={"code": "LOGIN_CHOOSE_WORKSPACE", "workspaces": found["choose"]})
        token = found["session"] if found is not None else None
    if token is None:
        raise HTTPException(status_code=401, detail="AUTH_FAILED: invalid credentials")
    response.set_cookie(SESSION_COOKIE, token, httponly=True, samesite="strict", secure=True, max_age=12 * 3600)
    return {"status": "ok"}


@app.post("/auth/logout")
def logout(response: Response, cognitive_os_session: str | None = Cookie(default=None), store: IdentityStore = Depends(get_store)) -> dict[str, str]:
    if cognitive_os_session is not None:
        store.revoke_session(cognitive_os_session)
    response.delete_cookie(SESSION_COOKIE)
    return {"status": "ok"}


@app.post("/methods/{method_id}/invoke")
def invoke_method(
    method_id: str,
    body: dict[str, Any],
    session: dict[str, Any] = Depends(require_session),
    catalog: MethodCatalog = Depends(get_catalog),
    store: IdentityStore = Depends(get_store),
) -> dict[str, Any]:
    if not catalog.is_resolvable(method_id):
        raise HTTPException(status_code=404, detail=f"METHOD_RESOLUTION_BLOCKED: no ACTIVE contract for {method_id!r}")

    if not check_entitlement(store, session["tenant_id"], method_id):
        raise HTTPException(status_code=403, detail=f"ENTITLEMENT_DENIED: tenant {session['tenant_id']!r} may not invoke {method_id!r}")

    try:
        builder = resolve_builder(method_id)
        gate_runner = resolve_gate_runner(method_id)
        record_id = f"{record_id_prefix(method_id, required=builder_takes_record_id(builder)) or ''}{secrets.token_hex(8).upper()}"
    except MethodDispatchError as error:
        raise HTTPException(status_code=501, detail=f"DISPATCH_UNAVAILABLE: {error}") from error

    provenance = body.pop("provenance", None) or make_provenance("AI_INFERENCE", "AI_GENERATED")
    injected = {"method_catalog": catalog}  # live server objects a builder/gate declares by name (guided_mode)

    try:
        record = invoke_builder(builder, record_id, provenance, body, injected)
    except InvariantViolation as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    gate_results = run_gate_runner(gate_runner, record, "api.invoke", datetime.datetime.now(datetime.timezone.utc).isoformat(), injected, body)
    return {"record": record, "gate_results": gate_results}


@app.post("/capabilities/{capability_id}/invoke")
def invoke_capability(
    capability_id: str,
    body: dict[str, Any],
    session: dict[str, Any] = Depends(require_session),
    store: IdentityStore = Depends(get_store),
    artifact_store: JsonArtifactStore = Depends(get_artifact_store),
) -> dict[str, Any]:
    """Direct one-shot capability invocation outside a Recipe/workflow graph -- e.g. the dashboard's
    chart-generation panel. Mirrors /methods/{id}/invoke's shape (resolve -> entitlement -> dispatch
    -> InvariantViolation-as-400), and reuses the exact same adapter-build + artifact-persistence
    wrapping the recipe runtime uses (build_api_capability_adapters,
    wrap_capability_handlers_with_artifact_persistence) so a chart generated here is validated and
    stored the same way one generated inside a recipe run would be -- not a parallel, divergent path.

    Generic over EVERY registered capability (see recipe_runtime.build_registered_capability_adapters),
    not chart-only -- deliberately not narrowed to artifact.generate_chart, matching this
    dispatch layer's existing "new capability needs zero new endpoint code" convention. Not a new
    privilege boundary: check_entitlement is a Phase-1 stub granting any active tenant everything
    regardless of ref (ai_lego/platform/entitlement/check.py), and any tenant could already reach
    every one of these same handlers today by composing a trivial 1-node custom workflow via
    POST /workflows/custom + /recipes/{id}/run (critic review, 2026-09-18)."""
    capability_catalog = CapabilityCatalog.from_spec_root(resolve_spec_root())
    if not capability_catalog.is_resolvable(capability_id):
        raise HTTPException(status_code=404, detail=f"CAPABILITY_RESOLUTION_BLOCKED: no ACTIVE contract for {capability_id!r}")

    if not check_entitlement(store, session["tenant_id"], capability_id):
        raise HTTPException(status_code=403, detail=f"ENTITLEMENT_DENIED: tenant {session['tenant_id']!r} may not invoke {capability_id!r}")

    try:
        adapters = build_api_capability_adapters(capability_catalog, [capability_id])
        handler = adapters.require_for([capability_id])[capability_id]
    except InvariantViolation as error:
        raise HTTPException(status_code=501, detail=f"CAPABILITY_ADAPTER_UNAVAILABLE: {error}") from error

    persisted_handler = wrap_capability_handlers_with_artifact_persistence({capability_id: handler}, session["tenant_id"], artifact_store)[capability_id]
    try:
        result = persisted_handler(body, {})
    except InvariantViolation as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return dict(result)


@app.get("/methods/{method_id}/demo")
def demo_method(method_id: str, session: dict[str, Any] = Depends(require_session), catalog: MethodCatalog = Depends(get_catalog)) -> dict[str, Any]:
    if not catalog.is_resolvable(method_id):
        raise HTTPException(status_code=404, detail=f"METHOD_RESOLUTION_BLOCKED: no ACTIVE contract for {method_id!r}")
    if "." not in method_id:
        raise HTTPException(status_code=404, detail=f"DEMO_UNAVAILABLE: malformed method_id {method_id!r}")
    name = method_id.split(".", 1)[1]
    cli_path = PRODUCT_ROOT / "ai_lego" / "apps" / "cli" / f"run_{name}_slice.py"
    if not cli_path.exists():
        raise HTTPException(status_code=404, detail=f"DEMO_UNAVAILABLE: no CLI slice at {cli_path.name} for {method_id!r}")
    result = subprocess.run(
        [sys.executable, "-m", f"ai_lego.apps.cli.run_{name}_slice"],
        cwd=PRODUCT_ROOT,
        capture_output=True,
        text=True,
        timeout=60,
    )
    return {"method_id": method_id, "exit_code": result.returncode, "stdout": result.stdout, "stderr": result.stderr}


# -- AI gateway (Master Plan Phase 1 "AI Gateway" plane; first content 2026-09-17) ------------------------------


class DraftRequest(BaseModel):
    brief: str
    labels: list[str] | None = None
    source: dict[str, Any] | None = None


PROMPT_RESERVE_TOKENS = 12_000   # the least a call's input reserves
FRAMING_RESERVE_TOKENS = 1_000   # message and tool-use framing the API adds (its tool-use system prompt is ~350 tokens)


def worst_input_tokens(*sent: str) -> int:
    """An upper bound of the input tokens a call is billed for: a byte-level tokenizer makes at most one token per
    UTF-8 byte of what is sent (a character is not a bound: one emoji is several tokens), plus the framing."""
    return max(PROMPT_RESERVE_TOKENS, sum(len(text.encode("utf-8")) for text in sent) + FRAMING_RESERVE_TOKENS)


class AiBudgetRefused(InvariantViolation):
    """A metered call refused before it started: today's budget cannot hold its worst case (answered 429)."""


def _budget_refused(error: BaseException | None) -> bool:
    """Whether a budget refusal caused this error, however many runners wrapped it (a recipe draft wraps a method draft)."""
    while error is not None:
        if isinstance(error, AiBudgetRefused):
            return True
        error = error.__cause__
    return False


def ai_failure_status(error: BaseException) -> int | None:
    """The status of a request the AI could not answer, or None when the error is not the AI's (the route decides).
    Never 502/504: Cloudflare puts its own page in place of those and the person never sees why (2026-10-11 walk).
    Today's budget 429; an answer that broke a rule, or that our own cap cut off (AI_ANSWER_*), 422; the provider
    unreachable, refusing or malformed (AI_PROVIDER_*), 424. Read through every wrapper (a recipe draft's AI_DRAFT_FAILED
    wraps the method's AI_ANSWER_TRUNCATED: Codex review 2026-10-11 F2). tests/unit/test_ai_failure_status.py holds every route to it."""
    if _budget_refused(error):
        return 429
    while error is not None:
        text = str(error)
        if text.startswith("AI_DAILY_TOKEN_BUDGET_EXCEEDED"):
            return 429
        if text.startswith("AI_ANSWER"):
            return 422
        if text.startswith("AI_PROVIDER"):
            return 424
        error = error.__cause__
    return None


def _interpretation_schema_version() -> str:
    try:
        return str((safe_load_yaml((resolve_spec_root() / "specs" / "cognitive" / "typed-objects" / "method-interpretation.schema.yaml").read_text(encoding="utf-8")) or {}).get("version") or "")
    except (OSError, yaml.YAMLError):
        return ""


def _today_utc_start_iso() -> str:
    now = datetime.datetime.now(datetime.timezone.utc)
    return now.strftime("%Y-%m-%dT00:00:00Z")


def _ai_budgets(provider: AiProvider | None, store: IdentityStore, session: dict[str, Any]) -> tuple[int, int]:
    """(this person's daily share, the tenant's daily ceiling), once the provider is configured and the tenant may use AI
    (503 / 403 otherwise). Either value misconfigured is a 503, never unlimited."""
    if provider is None:
        raise HTTPException(status_code=503, detail="AI_PROVIDER_UNCONFIGURED: set COGNITIVE_OS_ANTHROPIC_API_KEY (deploy/.env) to enable AI drafting")
    if not check_entitlement(store, session["tenant_id"], AI_DRAFT_CAPABILITY):
        raise HTTPException(status_code=403, detail=f"ENTITLEMENT_DENIED: tenant {session['tenant_id']!r} may not invoke {AI_DRAFT_CAPABILITY!r}")
    try:
        return daily_person_budget(), daily_token_budget()
    except InvariantViolation as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


def _require_ai(provider: AiProvider | None, store: IdentityStore, session: dict[str, Any]) -> AiProvider:
    """Refuse a request before any work when AI is off, not allowed, or today's budget is spent (429). Each paid call
    is then checked again, atomically with its reservation, by _MeteredProvider."""
    person_budget, tenant_budget = _ai_budgets(provider, store, session)
    for scope, budget, who in ((SCOPE_PERSON, person_budget, session["identity_id"]), (SCOPE_TENANT, tenant_budget, None)):
        totals = store.ai_usage_totals(session["tenant_id"], since=_today_utc_start_iso(), identity_id=who)
        used = totals["input_tokens"] + totals["output_tokens"]   # reserved rows (calls in flight) at their worst case
        if not fits_budget(used, 0, budget):
            raise HTTPException(status_code=429, detail=budget_exceeded(used, budget, scope=scope))
    return provider


class ArtifactReadRequest(BaseModel):
    reference: dict[str, Any]


@app.post("/artifacts/read")
def read_artifact(payload: ArtifactReadRequest, session: dict[str, Any] = Depends(require_session), artifact_store: JsonArtifactStore = Depends(get_artifact_store)) -> dict[str, Any]:
    """Read back a ``cas_reference`` a Recipe run emitted (``persist_artifact_output``). Tenant- and
    content-hash-verified by ``JsonArtifactStore.read`` -- a reference from another tenant, or one whose
    content_sha256 does not match the stored bytes, is refused, not silently substituted."""
    try:
        return artifact_store.read(session["tenant_id"], payload.reference)
    except InvariantViolation as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.get("/ai/status")
def ai_status(session: dict[str, Any] = Depends(require_session), provider: AiProvider | None = Depends(get_ai_provider), store: IdentityStore = Depends(get_store)) -> dict[str, Any]:
    try:
        budget = daily_token_budget()
    except InvariantViolation:
        budget = None
    try:
        person_budget = daily_person_budget()
    except InvariantViolation:
        person_budget = None
    today = store.ai_usage_totals(session["tenant_id"], since=_today_utc_start_iso())
    reserved = today["reserved"]   # calls in flight (or whose process died) at their worst case, as the check counts them
    used = today["input_tokens"] + today["output_tokens"] - reserved
    mine = store.ai_usage_totals(session["tenant_id"], since=_today_utc_start_iso(), identity_id=session["identity_id"])
    my_reserved = mine["reserved"]
    my_used = mine["input_tokens"] + mine["output_tokens"] - my_reserved
    return {
        "your_budget": {   # this person's own daily share: the number that runs out first for one person
            "daily_limit": person_budget,
            "used_today": my_used,
            "reserved_in_flight": my_reserved,
            "remaining_today": None if person_budget is None else max(0, person_budget - my_used - my_reserved),
        },
        "configured": provider is not None,
        "model": provider.model if provider else None,
        "usage": store.ai_usage_totals(session["tenant_id"]),
        "budget": {
            "daily_limit": budget,
            "used_today": used,
            "reserved_in_flight": reserved,
            "remaining_today": None if budget is None else max(0, budget - used - reserved),
        },
    }


@app.get("/recipes/{recipe_id}/draft-plan")
def recipe_draft_plan_endpoint(recipe_id: str, session: dict[str, Any] = Depends(require_session)) -> dict[str, Any]:
    try:
        return {"recipe_id": recipe_id, "nodes": recipe_draft_plan(resolve_spec_root(), recipe_id)}
    except InvariantViolation as error:
        if "RECIPE_NOT_FOUND" in str(error) or "RECIPE_ID_MISMATCH" in str(error):
            raise HTTPException(status_code=404, detail=str(error)) from error
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/ai/draft/method/{method_id}")
def ai_draft_method(
    method_id: str,
    payload: DraftRequest,
    session: dict[str, Any] = Depends(require_session),
    catalog: MethodCatalog = Depends(get_catalog),
    store: IdentityStore = Depends(get_store),
    provider: AiProvider | None = Depends(get_ai_provider),
) -> dict[str, Any]:
    if not catalog.is_resolvable(method_id):
        raise HTTPException(status_code=404, detail=f"METHOD_RESOLUTION_BLOCKED: no ACTIVE contract for {method_id!r}")
    active = _require_ai(provider, store, session)   # 503 / 403 / 429 before anything is built
    metered = _MeteredProvider(active, store, session, f"draft:{method_id}")   # every call, a repair round too, metered
    try:
        result = draft_method_kwargs(method_id, payload.brief, provider=metered, spec_root=resolve_spec_root(), catalog=catalog)
    except AiDraftProviderError as error:
        raise HTTPException(status_code=ai_failure_status(error) or 424, detail=str(error)) from error
    except InvariantViolation as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return result.as_dict()


@app.post("/ai/draft/recipe/{recipe_id}")
def ai_draft_recipe(
    recipe_id: str,
    payload: DraftRequest,
    session: dict[str, Any] = Depends(require_session),
    catalog: MethodCatalog = Depends(get_catalog),
    store: IdentityStore = Depends(get_store),
    provider: AiProvider | None = Depends(get_ai_provider),
) -> dict[str, Any]:
    if not payload.labels or len(payload.labels) > MAX_LABELS_PER_REQUEST:
        raise HTTPException(status_code=400, detail=f"AI_DRAFT_LABELS_REQUIRED: draft 1..{MAX_LABELS_PER_REQUEST} nodes per request (one model call each); the dashboard drafts node by node")
    active = _require_ai(provider, store, session)   # 503 / 403 / 429 before anything is built
    metered = _MeteredProvider(active, store, session, f"draft-recipe:{recipe_id}")   # every call, a repair round too, metered
    try:
        result = draft_recipe_source(recipe_id, payload.brief, provider=metered, spec_root=resolve_spec_root(), catalog=catalog, labels=payload.labels, source=payload.source)
    except AiDraftProviderError as error:
        raise HTTPException(status_code=ai_failure_status(error) or 424, detail=str(error)) from error
    except InvariantViolation as error:
        code = str(error)
        if "RECIPE_NOT_FOUND" in code or "RECIPE_ID_MISMATCH" in code:
            raise HTTPException(status_code=404, detail=code) from error
        raise HTTPException(status_code=400, detail=code) from error
    return result


# -- Projects + Sources (Master Plan Phase 1 Core Platform: "Project", "Source Import") -------------------------
#
# Domain records (ai_lego/core/domain/{project,source}.py) and their SQLite repository
# (ai_lego/data/repositories/project_source_repository.py, with a built-in append-only `events` table --
# Phase 1's Versioning primitive) already existed, fully tested, from earlier Phase 5 research work; this is
# the first HTTP surface + entitlement wiring for them (2026-09-17).


PROJECT_MANAGE_CAPABILITY = "project.manage"
SOURCE_MANAGE_CAPABILITY = "source.manage"
MAX_SOURCE_CONTENT_BYTES = 5 * 1024 * 1024  # 5 MiB; Phase 1 Source Import is UTF-8 text only, not bulk file upload
# Not an independent number: /projects/{id}/sources/brief's composed text is pasted straight into the
# dashboard's AI-draft "brief" field, and require_brief() (draft.py) rejects anything past MAX_BRIEF_CHARS --
# reusing that exact cap means a non-truncated response is always immediately usable by /ai/draft/*.
MAX_SOURCE_BRIEF_CHARS = MAX_BRIEF_CHARS


def get_custom_workflow_repository(databases: Databases = Depends(get_databases)) -> CustomWorkflowRepository:
    """Own repository and table, not the Project/Source one -- a Custom Workflow is an ordered list of
    method_ids the tenant picked, not a Project/Source aggregate; see
    ``ai_lego/core/domain/custom_workflow.py`` for the full separation rationale."""
    return CustomWorkflowRepository(databases)


@app.post("/auth/handoff/mint")
def mint_handoff(
    payload: HandoffMintRequest,
    session: dict[str, Any] = Depends(require_session),
    store: IdentityStore = Depends(get_store),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
) -> dict[str, str]:
    """Cross-origin session handoff, step 1 of 2 (see store.py's handoff_code section header for the
    full design rationale). ALWAYS mints for session's OWN identity_id/tenant_id -- payload carries
    only which Project the resulting browser tab should land on, never who to mint for, so this
    cannot be used to obtain a session for anyone other than whoever already holds the calling
    session (next-admin's own service-tenant login today; nothing more privileged than a caller
    already logged in as the target identity, same as every other require_session route).

    Placed here (after _project_or_404/get_project_source_repository, not up by /auth/login) because
    FastAPI's Depends(...) defaults are evaluated at `def` time, not call time -- defining this any
    earlier in the file raises NameError before either name exists (caught by test collection: moving
    it fixed a real collection-time crash the first placement introduced)."""
    try:
        # Defense in depth (critic suggestion, 2026-09-18): redeem_handoff's redirect_path is built
        # from payload.project_id below. It is safe today on THREE independent, already-true
        # invariants (a query-string value can't hijack a relative redirect's host; _project_or_404
        # just below only accepts an id that already matches a stored row; every stored project_id is
        # server-generated via project_record()'s own require_uuid) -- but all three are transitive,
        # not enforced at this call site itself. require_uuid is the same validator project_record()
        # uses, so this rejects exactly the same shapes that could never have been a real project_id.
        require_uuid("HANDOFF", "project_id", payload.project_id)
    except InvariantViolation as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    _project_or_404(repo, session, payload.project_id)
    # Relative on purpose: resolved against /auth/handoff it lands on the dashboard wherever the API is
    # mounted -- "/" locally, "/expert/" behind the prod nginx split (which 302s /auth/handoff there).
    code = store.issue_handoff_code(session["identity_id"], session["tenant_id"], f"../?project={payload.project_id}")
    return {"code": code}


@app.get("/auth/handoff")
def redeem_handoff(code: str, store: IdentityStore = Depends(get_store)) -> RedirectResponse:
    """Step 2 of 2: the browser's own request, no session cookie yet -- code is the only credential.
    Single-use and 60s-lived (HANDOFF_CODE_TTL); either exhausted resolves to the same 400 as a
    fabricated code, not a distinguishing error, since a real one and a replayed one both mean this
    request should not be trusted."""
    redeemed = store.redeem_handoff_code(code)
    if redeemed is None:
        raise HTTPException(status_code=400, detail="HANDOFF_CODE_INVALID_OR_EXPIRED")
    token = store.issue_session_for_identity(redeemed["identity_id"], redeemed["tenant_id"])
    response = RedirectResponse(url=redeemed["redirect_path"], status_code=302)
    response.set_cookie(SESSION_COOKIE, token, httponly=True, samesite="strict", secure=True, max_age=12 * 3600)
    return response


def _domain_error_status(error: InvariantViolation) -> int:
    return 404 if "NOT_FOUND" in str(error) else 400


@app.exception_handler(InvariantViolation)
async def _case_gone_midway(request: Request, error: InvariantViolation) -> JSONResponse:
    """A write that lost the race with the case's erasure (CASE_ERASED, SOURCE_PROJECT_NOT_FOUND) reaches no route's own
    handler; it is a 404 like any other request for that case now, not a server error. Anything else is re-raised."""
    if case_gone(error):
        return JSONResponse(status_code=404, content={"detail": str(error)})
    raise error


@app.exception_handler(HTTPException)
async def _case_gone_behind_a_status(request: Request, error: HTTPException) -> JSONResponse:
    """The same rule where a route caught the error and chose its own status (ingest's 400, a block's 409 or 500): a case
    erased while the request ran is a 404 whatever the route would have said (Codex 2026-10-04 F3). Routes keep no copy."""
    cause = error.__cause__ or error.__context__
    if isinstance(cause, InvariantViolation) and case_gone(cause):
        return JSONResponse(status_code=404, content={"detail": str(cause)})
    return await http_exception_handler(request, error)


def _record_schema_properties(spec_root: Path, catalog: MethodCatalog, method_id: str) -> set[str] | None:
    """Top-level field names of ``method_id``'s own output record schema, or None when it cannot be
    resolved. Used to keep a next step's prefill/needs_input honest about the TARGET tool's real fields
    (N-13): the model names the CURRENT method's manifest ids as prefill sources, but the field name it
    proposes on the target side is a guess like any other and is checked the same way citations are."""
    if not catalog.is_resolvable(method_id):
        return None
    contract = catalog.require(method_id)
    contract_path = spec_root / contract["path"]
    if not contract_path.is_file():
        return None
    schema_name = record_schema_name(spec_root, method_id, contract, contract_path.read_text(encoding="utf-8"))
    schema_path = spec_root / TYPED_OBJECTS / schema_name if schema_name else None
    if not schema_path or not schema_path.is_file():
        return None
    try:
        doc = safe_load_yaml(schema_path.read_text(encoding="utf-8"))
    except yaml.YAMLError:
        return None
    properties = (doc or {}).get("properties") if isinstance(doc, dict) else None
    return set(properties) if isinstance(properties, dict) else None


def _run_interpretation(
    *, interpretation_id: str, method_id: str, project_id: str, session: dict[str, Any],
    record: dict[str, Any], contract: dict[str, Any], display: dict[str, Any] | None,
    sources: list[dict[str, Any]], catalog: MethodCatalog, provider: AiProvider,
    store: IdentityStore, repo: ProjectSourceRepository, artifact_store: JsonArtifactStore,
    feedback: str = "", previous: dict[str, Any] | None = None, rerun_id: str | None = None,
    record_gates: list[dict[str, Any]] | None = None, lock: RunLock, block: str,
) -> None:
    """``feedback``/``previous``: the user returned an earlier version (退回並說原因) and this run redoes it; ``rerun_id``:
    this run answers a due rerun reminder, fulfilled when the result is saved; ``record_gates``: the method's own
    gates on the record (層序…), stored with the analysis. Every model call -- a retry too -- is metered by
    ``_MeteredProvider`` (budget check + reservation before it, usage right after; P-45 and Codex 2026-09-28).
    ``lock``: this Project's interpretation run lock, released only after the outcome is written (readers rely on it)."""
    try:
        _interpret_and_record(
            interpretation_id=interpretation_id, method_id=method_id, project_id=project_id, session=session, record=record,
            contract=contract, display=display, sources=sources, catalog=catalog, provider=provider, store=store, repo=repo,
            artifact_store=artifact_store, feedback=feedback, previous=previous, rerun_id=rerun_id, record_gates=record_gates, block=block,
        )
    finally:
        lock.release()


def _interpret_and_record(
    *, interpretation_id: str, method_id: str, project_id: str, session: dict[str, Any],
    record: dict[str, Any], contract: dict[str, Any], display: dict[str, Any] | None,
    sources: list[dict[str, Any]], catalog: MethodCatalog, provider: AiProvider,
    store: IdentityStore, repo: ProjectSourceRepository, artifact_store: JsonArtifactStore,
    feedback: str, previous: dict[str, Any] | None, rerun_id: str | None, record_gates: list[dict[str, Any]] | None, block: str,
) -> None:
    tenant_id = session["tenant_id"]
    outcome: dict[str, Any] | None = None
    error: str | None = None
    metered = _MeteredProvider(provider, store, session, f"interpret:{method_id}", run_id=interpretation_id)   # what was billed, call by call
    try:
        display_metadata = _method_display_metadata()
        spec_root = resolve_spec_root()
        contract_text = (spec_root / catalog.require(method_id)["path"]).read_text(encoding="utf-8")
        schema_name = record_schema_name(spec_root, method_id, contract, contract_text)
        schema_path = spec_root / TYPED_OBJECTS / schema_name if schema_name else None
        # ⑧ recommends what is new to this page and this project (operator 2026-09-29): not what ③ draws, not this tool
        # itself, not a tool the project already ran
        excluded = {key: "③ 已經畫出" for key in result_page_shows(spec_root, method_id)}
        excluded.update({item["method_id"]: "這個專案已經做過" for item in repo.analyses(tenant_id, project_id).get(project_id, [])
                         if item["status"] == "DONE" and item.get("method_id")})
        # a person's tool never recommends an engineering one (ENTRY_SLICE1_CHECKLIST.md item 5); an engineering tool, run by
        # its own address, may still point at the next engineering step
        if FAMILY_BLOCK.get(method_id.split(".")[0]) != INTERNAL:   # .get: an unmapped family is simply not engineering here
            excluded.update({key: "工程工具，只給內部" for key in catalog.contracts if FAMILY_BLOCK.get(key.split(".")[0]) == INTERNAL})
        excluded[method_id] = "就是這個工具"
        outcome = run_interpretation(
            method_id=method_id, contract=contract, display=display, record=record,
            sources=sources, provider=metered, spec_root=spec_root,
            schema_contracts=SchemaContracts(spec_root),
            active_method_ids={key for key in catalog.contracts if catalog.is_resolvable(key)}, interpretation_id=interpretation_id,
            catalog_lines=[f"{key} — {display_metadata.get(key, {}).get('name_zh', key)}" for key in sorted(catalog.contracts) if catalog.is_resolvable(key)],
            record_schema_text=schema_path.read_text(encoding="utf-8") if schema_path and schema_path.exists() else "",
            feedback=feedback, previous=previous,
            target_record_fields=lambda target_id: _record_schema_properties(spec_root, catalog, target_id),
            excluded_method_ids=excluded,
        )
        error = outcome["error"]
    except HTTPException as failure:
        error = str(failure.detail)
    except Exception as failure:
        error = str(failure)
    if repo.get_project(tenant_id, project_id) is None:   # erased while the model was answering: nothing to write to, not even a failure
        return
    if error is not None or outcome is None or outcome["interpretation"] is None:
        failure = {"interpretation_id": interpretation_id, "error": error or "INTERPRETATION_FAILED"}
        if metered.input_tokens or metered.output_tokens:
            failure.update({"input_tokens": metered.input_tokens, "output_tokens": metered.output_tokens})
        repo.append_event(tenant_id, project_id, "InterpretationFailed", failure, record_log.system(block))
        return
    reference, saved = None, False
    try:
        reference = artifact_store.put(tenant_id, "MethodInterpretation", {
            "record": record, "interpretation": outcome["interpretation"], "gate_results": outcome["gate_results"],
            "attempts": outcome.get("attempts", []),   # per model call: output size and why it was refused
            "prompt_manifest": build_prompt_manifest(record, sources),
            "record_gate_results": record_gates or [],   # the method's own gates (層序…) for the approve bar
            "schema_version": str(_interpretation_schema_version()),
        })
        repo.save_interpretation(
            tenant_id, project_id, interpretation_id, reference,
            datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"), block=block,   # microseconds, like the request's event: whole seconds could put finished_at before requested_at
        )
        saved = True
        if rerun_id:
            repo.append_event(tenant_id, project_id, "RerunFulfilled", {"rerun_id": rerun_id, "interpretation_id": interpretation_id}, record_log.system("ACT"))
    except Exception as failure:
        if reference is not None and not saved:   # never an artifact no row points at: a case erased meanwhile names it nowhere
            artifact_store.delete_if_present(tenant_id, reference)
        if case_gone(failure):   # erased while the result was being stored: nothing to write to, not even a failure
            return
        repo.append_event(tenant_id, project_id, "InterpretationFailed", {"interpretation_id": interpretation_id, "error": str(failure)}, record_log.system(block))


RUNNER_LOST = "INTERPRETATION_RUNNER_LOST: the analysis stopped before it finished (the server restarted); run it again"


def _interpretation_lock_path(tenant_id: str, interpretation_id: str) -> Path:
    """Its runner's lock (plan P-k; one per run, like a workflow run's ``<run_id>.lock``, never deleted)."""
    tenant_key = hashlib.sha256(tenant_id.encode("utf-8")).hexdigest()[:32]
    run_key = hashlib.sha256(interpretation_id.encode("utf-8")).hexdigest()[:32]
    return PRODUCT_ROOT / ".runtime" / "interpretation" / tenant_key / f"{run_key}.lock"


def _interpretation_running(tenant_id: str, interpretation_id: str) -> bool:
    path = _interpretation_lock_path(tenant_id, interpretation_id)
    return run_lock_state(path) == "held" and run_lock_tag(path) == interpretation_id


def _analyses(repo: ProjectSourceRepository, tenant_id: str, project_id: str | None = None, *, project_ids: list[str] | None = None) -> dict[str, list[dict[str, Any]]]:
    """``repo.analyses`` with each PENDING whose runner is gone read as FAILED / RUNNER_LOST (N-64: a restart mid-run
    left it PENDING forever and the Project undeletable). Probes first, then re-reads: a runner writes its outcome
    before it lets go of the lock, so one that finished between the reads shows its real outcome. Nothing PENDING and
    gone: the first read is the answer (no second scan). ``project_ids``: only these cases."""
    read = (lambda: repo.analyses(tenant_id, project_id)) if project_id else (lambda: repo.analyses(tenant_id, project_ids=project_ids))
    first = read()
    lost = {item["interpretation_id"] for items in first.values() for item in items
            if item["status"] == "PENDING" and not _interpretation_running(tenant_id, item["interpretation_id"])}
    if not lost:
        return first
    analyses = read()
    for items in analyses.values():
        for item in items:
            if item["status"] == "PENDING" and item["interpretation_id"] in lost:
                item.update(status="FAILED", error=RUNNER_LOST)
    return analyses


def _launch_interpretation(**kwargs: Any) -> None:
    threading.Thread(target=_run_interpretation, daemon=True, kwargs=kwargs).start()


@app.post("/methods/{method_id}/interpret", status_code=202)
def interpret_method(
    method_id: str,
    body: dict[str, Any],
    session: dict[str, Any] = Depends(require_session),
    catalog: MethodCatalog = Depends(get_catalog),
    store: IdentityStore = Depends(get_store),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
    artifact_store: JsonArtifactStore = Depends(get_artifact_store),
    provider: AiProvider | None = Depends(get_interpretation_provider),
) -> dict[str, Any]:
    """Interpret one validated method record and persist the immutable result to a Project."""
    if not catalog.is_resolvable(method_id):
        raise HTTPException(status_code=404, detail=f"METHOD_RESOLUTION_BLOCKED: no ACTIVE contract for {method_id!r}")
    project_id = body.get("project_id")
    if not isinstance(project_id, str) or not project_id:
        raise HTTPException(status_code=400, detail="PROJECT_ID_REQUIRED: interpretation is project-bound")
    _project_or_404(repo, session, project_id)
    block = _tool_block(catalog, method_id)
    revision, feedback, previous = _revision_of(body.get("revision"), repo, artifact_store, session["tenant_id"], project_id)
    rerun_id = _open_rerun_of(body.get("rerun_id"), method_id, repo, session["tenant_id"], project_id)
    builder_body = dict(body)
    for key in ("project_id", "revision", "rerun_id"):
        builder_body.pop(key, None)
    try:
        builder = resolve_builder(method_id)
        gate_runner = resolve_gate_runner(method_id)
        record_id = f"{record_id_prefix(method_id, required=builder_takes_record_id(builder)) or ''}{secrets.token_hex(8).upper()}"
        provenance = builder_body.pop("provenance", None) or make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = invoke_builder(builder, record_id, provenance, builder_body, {"method_catalog": catalog})
        gate_results = run_gate_runner(gate_runner, record, "api.interpret", datetime.datetime.now(datetime.timezone.utc).isoformat(), {"method_catalog": catalog}, builder_body)
    except MethodDispatchError as error:
        raise HTTPException(status_code=501, detail=f"DISPATCH_UNAVAILABLE: {error}") from error
    except InvariantViolation as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    if any(not isinstance(gate, dict) or gate.get("status") not in {"PASS", "NOT_APPLICABLE"} for gate in gate_results):
        raise HTTPException(status_code=422, detail={"error": "METHOD_GATES_FAILED", "gate_results": gate_results})
    provider = _require_ai(provider, store, session)

    entry = catalog.require(method_id)
    contract_path = resolve_spec_root() / entry["path"]
    contract = safe_load_yaml(contract_path.read_text(encoding="utf-8"))
    if not isinstance(contract, dict):
        raise HTTPException(status_code=500, detail="METHOD_CONTRACT_INVALID")
    interpretation_id = f"INTERP-{uuid.uuid4().hex.upper()}"
    sources = repo.list_sources(session["tenant_id"], project_id)
    lock = acquire_run_lock(_interpretation_lock_path(session["tenant_id"], interpretation_id), tag=interpretation_id)
    if lock is None:   # a fresh id's lock is only ever held by a status probe, for an instant
        raise HTTPException(status_code=409, detail="INTERPRETATION_IN_FLIGHT: the analysis could not start this instant; retry")
    try:
        repo.append_event(
            session["tenant_id"], project_id, "InterpretationRequested",
            {"interpretation_id": interpretation_id, "method_id": method_id, "record_sha256": record_sha256(record),
             **({"revision": revision} if revision else {}), **({"rerun_id": rerun_id} if rerun_id else {})},
            _me(session, block),
        )
        worker_kwargs = {
            "interpretation_id": interpretation_id, "method_id": method_id, "project_id": project_id,
            "session": dict(session), "record": record, "contract": contract,
            "display": _method_display_metadata().get(method_id), "sources": sources,
            "catalog": catalog, "provider": provider, "store": store, "repo": repo, "artifact_store": artifact_store,
            "feedback": feedback, "previous": previous, "rerun_id": rerun_id, "record_gates": gate_results, "lock": lock, "block": block,
        }
        _launch_interpretation(**worker_kwargs)
    except BaseException:
        lock.release()   # the worker never started, so it cannot release
        raise
    return {"interpretation_id": interpretation_id, "status": "PENDING", "project_id": project_id}


@app.get("/interpretations/{interpretation_id}")
def get_interpretation(
    interpretation_id: str,
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
    artifact_store: JsonArtifactStore = Depends(get_artifact_store),
) -> dict[str, Any]:
    events = repo.interpretation_events(session["tenant_id"], interpretation_id)
    project_id = events[-1]["aggregate_id"].removeprefix("project:") if events else None
    if project_id is None or _owned_project(repo, session, project_id) is None:
        raise HTTPException(status_code=404, detail=f"INTERPRETATION_NOT_FOUND: {interpretation_id!r}")
    requested = next((event["payload"] for event in events if event["event_type"] == "InterpretationRequested"), {})
    outcome = next((event for event in reversed(events) if event["event_type"] in ("InterpretationCreated", "InterpretationFailed")), None)
    shared = {"interpretation_id": interpretation_id, "project_id": project_id, "method_id": requested.get("method_id"), "revision": requested.get("revision"), "rerun_id": requested.get("rerun_id")}
    if outcome is None:
        if _interpretation_running(session["tenant_id"], interpretation_id):
            return {**shared, "status": "PENDING"}
        events = repo.interpretation_events(session["tenant_id"], interpretation_id)   # probe first: it may have just finished
        outcome = next((event for event in reversed(events) if event["event_type"] in ("InterpretationCreated", "InterpretationFailed")), None)
        if outcome is None:
            return {**shared, "status": "FAILED", "error": RUNNER_LOST}
    if outcome["event_type"] == "InterpretationFailed":
        return {**shared, "status": "FAILED", "error": outcome["payload"]["error"]}
    stored = repo.get_interpretation(session["tenant_id"], interpretation_id)
    if stored is None:
        raise HTTPException(status_code=500, detail="INTERPRETATION_ARTIFACT_MISSING")
    try:
        artifact = artifact_store.read(session["tenant_id"], stored["artifact_reference"])
    except InvariantViolation as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    judgment = next(({"stance": event["payload"]["stance"], "text": event["payload"]["text"]} for event in reversed(events) if event["event_type"] == "InterpretationJudged"), None)
    result = artifact["interpretation"]
    usage = result.get("usage") if isinstance(result.get("usage"), dict) else {}
    # N-59/P-27: the analysis THIS one redoes via 到期重跑 (its own revision.of covers 依原因重做) -- a reload has no
    # in-memory `previous`, so the run page's compare link is only recoverable by reading it back from here.
    rerun_of = next((item["interpretation_id"] for item in repo.reruns(session["tenant_id"], project_id).get(project_id, []) if item["fulfilled_by"] == interpretation_id), None)
    return {**shared, "status": "DONE", "created_at": stored["created_at"], "record": artifact["record"], "result": result, "gate_results": artifact["gate_results"],
            "record_gate_results": artifact.get("record_gate_results", []), "schema_version": artifact.get("schema_version"),
            "manifest": artifact.get("prompt_manifest", build_prompt_manifest(artifact["record"])), "judgment": judgment, "approval": _latest_approval(events), "rerun_of": rerun_of,
            "cost_twd": _safe_cost_twd(str(result.get("model", "")), int(usage.get("input_tokens") or 0), int(usage.get("output_tokens") or 0))}


def _latest_approval(events: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The last 核准／退回 decision on an interpretation, from its events (None until one is made)."""
    for event in reversed(events):
        if event["event_type"] in ("InterpretationApproved", "InterpretationReturned"):
            return {"decision": "approve" if event["event_type"] == "InterpretationApproved" else "return", "at": event["occurred_at"], "by_name": event["payload"].get("by_name"), "reason": event["payload"].get("reason")}
    return None


def _revision_of(revision: Any, repo: ProjectSourceRepository, artifact_store: JsonArtifactStore, tenant_id: str, project_id: str) -> tuple[dict[str, str] | None, str, dict[str, Any] | None]:
    """A run that redoes an earlier analysis of the same project after the user returned it: ``revision`` =
    {of: interpretation_id, reason}. -> (the payload to store, the reason for the prompt, the previous version's
    headline/summary/findings for the prompt); (None, "", None) without a revision."""
    if revision is None:
        return None, "", None
    if not isinstance(revision, dict) or not isinstance(revision.get("of"), str) or not isinstance(revision.get("reason"), str) or not revision["reason"].strip():
        raise HTTPException(status_code=400, detail="REVISION_INVALID: revision = {of: interpretation_id, reason: text}")
    reason = revision["reason"].strip()
    if len(reason) > MAX_APPROVAL_REASON_CHARS:
        raise HTTPException(status_code=400, detail=f"REVISION_REASON_TOO_LONG: at most {MAX_APPROVAL_REASON_CHARS} characters")
    stored = repo.get_interpretation(tenant_id, revision["of"])
    if stored is None or stored["project_id"] != project_id:
        raise HTTPException(status_code=404, detail=f"INTERPRETATION_NOT_FOUND: {revision['of']!r} is not a finished analysis of this project")
    try:
        result = artifact_store.read(tenant_id, stored["artifact_reference"])["interpretation"]
    except InvariantViolation as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    previous = {key: result.get(key) for key in ("headline", "summary", "findings") if result.get(key) is not None}
    return {"of": revision["of"], "reason": reason}, reason, previous


def _open_rerun_of(rerun_id: Any, method_id: str, repo: ProjectSourceRepository, tenant_id: str, project_id: str) -> str | None:
    """The rerun reminder this run answers; it must be this project's, still open, and for this same method
    (P-26: a stale ?rerun= link from a different tool's analysis must not silently attach)."""
    if rerun_id is None:
        return None
    if not isinstance(rerun_id, str) or not any(item["rerun_id"] == rerun_id and item["fulfilled_by"] is None and item["method_id"] in (None, method_id) for item in repo.reruns(tenant_id, project_id).get(project_id, [])):
        raise HTTPException(status_code=400, detail=f"RERUN_NOT_OPEN: {rerun_id!r} is not an open rerun reminder of this project for {method_id!r}")
    return rerun_id


@app.post("/interpretations/{interpretation_id}/judgment")
def judge_interpretation(
    interpretation_id: str,
    body: dict[str, Any],
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
    catalog: MethodCatalog = Depends(get_catalog),
) -> dict[str, str]:
    stored = _interpretation_or_404(repo, session, interpretation_id)
    stance = body.get("stance")
    if stance not in {"agree", "partial", "disagree"}:
        raise HTTPException(status_code=400, detail="JUDGMENT_STANCE_INVALID")
    text = body.get("text", "")
    if not isinstance(text, str):
        raise HTTPException(status_code=400, detail="JUDGMENT_TEXT_INVALID")
    block = _interpretation_block(repo.interpretation_events(session["tenant_id"], interpretation_id), catalog)
    repo.append_event(session["tenant_id"], stored["project_id"], "InterpretationJudged", {"interpretation_id": interpretation_id, "stance": stance, "text": text[:2000]}, _me(session, block))
    return {"status": "recorded", "stance": stance}


MAX_APPROVAL_REASON_CHARS = 2000
DEFAULT_ESTIMATE_TOKENS = (11_000, 7_000)   # input, output: one iceberg result page measured 2026-09-28 (5.8k-7.5k out), before this tenant has run the tool
DEFAULT_ESTIMATE_SECONDS = 150            # a run measured 79-160 s locally, 2026-09-28
_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _iso_date_or_400(value: Any, name: str) -> str:
    if not isinstance(value, str) or not _ISO_DATE.match(value):
        raise HTTPException(status_code=400, detail=f"{name}_INVALID: expected YYYY-MM-DD")
    try:
        datetime.date.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{name}_INVALID: not a calendar date") from None
    return value


def _now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _by_name(store: IdentityStore, session: dict[str, Any]) -> str:
    identity = store.get_identity(session["identity_id"]) or {}
    return str(identity.get("display_name") or identity.get("email") or session["identity_id"])


class ApprovalRequest(BaseModel):
    decision: str
    reason: str = ""


@app.post("/interpretations/{interpretation_id}/approval")
def approve_interpretation(
    interpretation_id: str,
    payload: ApprovalRequest,
    session: dict[str, Any] = Depends(require_session),
    store: IdentityStore = Depends(get_store),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
    catalog: MethodCatalog = Depends(get_catalog),
) -> dict[str, Any]:
    """核准 = this version is the project's official record (who, when); 退回 = it stays, with the reason it was sent
    back, and a new run may redo it (POST /methods/{id}/interpret with revision). The latest decision stands."""
    stored = _interpretation_or_404(repo, session, interpretation_id)
    if payload.decision not in {"approve", "return"}:
        raise HTTPException(status_code=400, detail="APPROVAL_DECISION_INVALID: approve or return")
    reason = payload.reason.strip()
    if payload.decision == "return" and not reason:
        raise HTTPException(status_code=400, detail="RETURN_REASON_REQUIRED: say why it goes back")
    if len(reason) > MAX_APPROVAL_REASON_CHARS:
        raise HTTPException(status_code=400, detail=f"APPROVAL_REASON_TOO_LONG: at most {MAX_APPROVAL_REASON_CHARS} characters")
    by_name = _by_name(store, session)
    kind = "InterpretationApproved" if payload.decision == "approve" else "InterpretationReturned"
    block = _interpretation_block(repo.interpretation_events(session["tenant_id"], interpretation_id), catalog)
    repo.append_event(session["tenant_id"], stored["project_id"], kind, {"interpretation_id": interpretation_id, "by": session["identity_id"], "by_name": by_name, "reason": reason}, _me(session, block))
    return {"decision": payload.decision, "at": _now_iso(), "by_name": by_name, "reason": reason}


@app.get("/methods/{method_id}/estimate")
def method_estimate(
    method_id: str,
    session: dict[str, Any] = Depends(require_session),
    store: IdentityStore = Depends(get_store),
    catalog: MethodCatalog = Depends(get_catalog),
    provider: AiProvider | None = Depends(get_ai_provider),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
) -> dict[str, Any]:
    """What one run of this tool is likely to cost (花錢前先講): the mean of the tenant's last runs of it, or a full
    result page's typical size before any; the money figure follows the price table (None for an unknown model)."""
    if not catalog.is_resolvable(method_id):
        raise HTTPException(status_code=404, detail=f"METHOD_RESOLUTION_BLOCKED: no ACTIVE contract for {method_id!r}")
    recent = store.ai_usage_recent(session["tenant_id"], f"interpret:{method_id}", limit=5)
    if recent:
        input_tokens = round(sum(item["input_tokens"] for item in recent) / len(recent))
        output_tokens = round(sum(item["output_tokens"] for item in recent) / len(recent))
        model = recent[0]["model"]
    else:
        input_tokens, output_tokens = DEFAULT_ESTIMATE_TOKENS
        model = provider.model if provider is not None else DEFAULT_MODEL
    # the most a run can cost: two calls (one retry), each up to the output ceiling
    upper_input, upper_output = 2 * max(input_tokens, DEFAULT_ESTIMATE_TOKENS[0]), 2 * INTERPRET_MAX_TOKENS
    return {"method_id": method_id, "model": model, "input_tokens": input_tokens, "output_tokens": output_tokens, "tokens": input_tokens + output_tokens,
            "twd": _safe_cost_twd(model, input_tokens, output_tokens), "based_on": len(recent),
            "tokens_max": upper_input + upper_output, "twd_max": _safe_cost_twd(model, upper_input, upper_output),
            "seconds": _typical_seconds(_analyses(repo, session["tenant_id"]), method_id)}


def _typical_seconds(analyses: dict[str, list[dict[str, Any]]], method_id: str) -> int:
    """How long this tool's last finished runs took for the tenant (mean of up to 5), or the measured default."""
    spans = []
    for item in sorted((a for runs in analyses.values() for a in runs if a.get("method_id") == method_id and a.get("status") == "DONE" and a.get("finished_at")), key=lambda a: a["finished_at"], reverse=True)[:5]:
        try:
            started = datetime.datetime.fromisoformat(item["requested_at"].replace("Z", "+00:00"))
            finished = datetime.datetime.fromisoformat(item["finished_at"].replace("Z", "+00:00"))
            spans.append(max(1, int((finished - started).total_seconds())))
        except (KeyError, ValueError, AttributeError):
            continue
    return round(sum(spans) / len(spans)) if spans else DEFAULT_ESTIMATE_SECONDS


class TaskRow(BaseModel):
    title: str
    owner: str = ""
    due: str = ""
    proof: str = ""
    target: str = ""
    when: str = ""


TASK_STATUSES = ("not_started", "in_progress", "done", "on_hold")
TASK_KINDS = ("task", "plan_change")


_PLAN_FIELDS = (("title", "action"), ("when", "when"), ("proof", "proof"), ("owner", "owner"), ("target", "target"))


def _plan_row_author(plan: list[Any], row: dict[str, Any]) -> str:
    """共用紀錄: AI 起草、你改過的算「共同」；你一字沒改照收的算「AI」. The due date is not compared: it is the plan's
    「when」 turned into a calendar date on the page, not a word anyone wrote."""
    for drafted in plan:
        if isinstance(drafted, dict) and all(str(row[mine] or "").strip() == str(drafted.get(theirs) or "").strip() for mine, theirs in _PLAN_FIELDS):
            return "ai"
    return "joint"


class CreateTasksRequest(BaseModel):
    interpretation_id: str | None = None
    option: str | None = None
    parent_task_id: str | None = None
    kind: str = "task"
    tasks: list[TaskRow]


class TaskUpdateRequest(BaseModel):
    done: bool | None = None
    owner: str | None = None
    due: str | None = None
    status: str | None = None


@app.post("/projects/{project_id}/tasks")
def create_tasks(
    project_id: str,
    payload: CreateTasksRequest,
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
    artifact_store: JsonArtifactStore = Depends(get_artifact_store),
) -> list[dict[str, Any]]:
    """⑦ 把行動計畫存成任務 (no ``parent_task_id``: TASKS_ALREADY_SAVED refuses saving the same analysis's plan twice),
    or 從一張任務卡新增任務／調整方案 (``parent_task_id`` set: the new row inherits its parent's ``interpretation_id``
    and skips that one-shot-per-analysis check, which is not what this is)."""
    tenant_id = session["tenant_id"]
    _project_or_404(repo, session, project_id)
    drafted_plan: list[Any] | None = None   # the AI's plan these rows came from; None = the person typed them
    if not 1 <= len(payload.tasks) <= 20:
        raise HTTPException(status_code=400, detail="TASKS_COUNT_INVALID: 1 to 20 tasks per call")
    if payload.kind not in TASK_KINDS:
        raise HTTPException(status_code=400, detail=f"TASK_KIND_INVALID: expected one of {TASK_KINDS}")
    if payload.parent_task_id is not None:
        parent = next((task for task in repo.tasks(tenant_id, project_id).get(project_id, []) if task["task_id"] == payload.parent_task_id), None)
        if parent is None:
            raise HTTPException(status_code=404, detail=f"TASK_PARENT_NOT_FOUND: {payload.parent_task_id!r}")
        interpretation_id = parent["interpretation_id"]
    else:
        interpretation_id = payload.interpretation_id
        if interpretation_id is not None:
            stored = repo.get_interpretation(tenant_id, interpretation_id)
            if stored is None or stored["project_id"] != project_id:
                raise HTTPException(status_code=404, detail=f"INTERPRETATION_NOT_FOUND: {interpretation_id!r} is not a finished analysis of this project")
            if any(task["interpretation_id"] == interpretation_id for task in repo.tasks(tenant_id, project_id).get(project_id, [])):
                raise HTTPException(status_code=409, detail=f"TASKS_ALREADY_SAVED: {interpretation_id!r} already has tasks saved")
            try:
                solutions = artifact_store.read(tenant_id, stored["artifact_reference"])["interpretation"].get("solutions")
            except InvariantViolation as error:
                raise HTTPException(status_code=500, detail=str(error)) from error
            drafted_plan = solutions.get("plan") if isinstance(solutions, dict) and isinstance(solutions.get("plan"), list) else []
    option = payload.option.strip()[:100] if isinstance(payload.option, str) and payload.option.strip() else None
    rows = []
    for task in payload.tasks:
        title = task.title.strip()
        if not title or len(title) > 300:
            raise HTTPException(status_code=400, detail="TASK_TITLE_INVALID: 1 to 300 characters")
        if not task.due:
            raise HTTPException(status_code=400, detail="TASK_DUE_REQUIRED: every task needs a due date")
        rows.append({"task_id": str(uuid.uuid4()), "interpretation_id": interpretation_id, "parent_task_id": payload.parent_task_id, "kind": payload.kind,
                     "title": title, "owner": task.owner.strip()[:100], "due": _iso_date_or_400(task.due, "TASK_DUE"),
                     "proof": task.proof.strip()[:300], "target": task.target.strip()[:300], "when": task.when.strip()[:100], "option": option})
    for row in rows:
        author = "user" if drafted_plan is None else _plan_row_author(drafted_plan, row)
        writer = _me(session, "ACT") if author == "user" else record_log.Writer(author, "ACT", session["identity_id"] if author == "joint" else None)
        repo.append_event(tenant_id, project_id, "TaskCreated", row, writer)
    return repo.tasks(tenant_id, project_id).get(project_id, [])


@app.get("/projects/{project_id}/tasks")
def list_tasks(
    project_id: str,
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
) -> list[dict[str, Any]]:
    _project_or_404(repo, session, project_id)
    return repo.tasks(session["tenant_id"], project_id).get(project_id, [])


@app.post("/projects/{project_id}/tasks/{task_id}")
def mark_task(
    project_id: str,
    task_id: str,
    payload: TaskUpdateRequest,
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
) -> dict[str, Any]:
    """Toggle done (kept for old callers; TaskDone still works, mapped to a status), set the 4-state board
    (not_started/in_progress/done/on_hold) and/or fill in an owner/due the plan left blank (N-84: ProjectPage's
    inline editor for a task whose owner or due is still empty)."""
    tenant_id = session["tenant_id"]
    _project_or_404(repo, session, project_id)
    if not any(task["task_id"] == task_id for task in repo.tasks(tenant_id, project_id).get(project_id, [])):
        raise HTTPException(status_code=404, detail=f"TASK_NOT_FOUND: {task_id!r}")
    if payload.status is not None and payload.status not in TASK_STATUSES:
        raise HTTPException(status_code=400, detail=f"TASK_STATUS_INVALID: expected one of {TASK_STATUSES}")
    if payload.done is not None:
        repo.append_event(tenant_id, project_id, "TaskDone", {"task_id": task_id, "done": payload.done}, _me(session, "ACT"))
    if payload.owner is not None or payload.due is not None or payload.status is not None:
        update: dict[str, Any] = {"task_id": task_id}
        if payload.owner is not None:
            update["owner"] = payload.owner.strip()[:100]
        if payload.due is not None:
            update["due"] = _iso_date_or_400(payload.due, "TASK_DUE")
        if payload.status is not None:
            update["status"] = payload.status
        repo.append_event(tenant_id, project_id, "TaskUpdated", update, _me(session, "ACT"))
    return next(task for task in repo.tasks(tenant_id, project_id)[project_id] if task["task_id"] == task_id)


class TaskNumberRow(BaseModel):
    name: str
    value: float
    unit: str = ""


class TaskNoteRequest(BaseModel):
    happened: str = ""
    thoughts: str = ""
    adjustment: str = ""
    blocker: str = ""
    numbers: list[TaskNumberRow] = []
    next_check: str | None = None


@app.post("/projects/{project_id}/tasks/{task_id}/notes")
def note_task(
    project_id: str,
    task_id: str,
    payload: TaskNoteRequest,
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
) -> dict[str, Any]:
    """一筆任務紀錄 (任務卡的「寫一筆紀錄」): 實際狀況／想法／調整方針／卡住了／實際數字，至少填一項；
    tasks() reads the task's journal back oldest first, with next_check = the latest entry's."""
    tenant_id = session["tenant_id"]
    _project_or_404(repo, session, project_id)
    if not any(task["task_id"] == task_id for task in repo.tasks(tenant_id, project_id).get(project_id, [])):
        raise HTTPException(status_code=404, detail=f"TASK_NOT_FOUND: {task_id!r}")
    happened = payload.happened.strip()[:300]
    thoughts = payload.thoughts.strip()[:300]
    adjustment = payload.adjustment.strip()[:300]
    blocker = payload.blocker.strip()[:300]
    if len(payload.numbers) > 5:
        raise HTTPException(status_code=400, detail="TASK_NOTE_NUMBERS_TOO_MANY: at most 5 numbers per note")
    numbers = []
    for row in payload.numbers:
        name = row.name.strip()[:100]
        if not name:
            raise HTTPException(status_code=400, detail="TASK_NOTE_NUMBER_NAME_INVALID: 1 to 100 characters")
        numbers.append({"name": name, "value": row.value, "unit": row.unit.strip()[:20]})
    if not (happened or thoughts or adjustment or blocker or numbers):
        raise HTTPException(status_code=400, detail="TASK_NOTE_EMPTY: fill in at least one of happened/thoughts/adjustment/blocker/numbers")
    next_check = _iso_date_or_400(payload.next_check, "TASK_NOTE_NEXT_CHECK") if payload.next_check else None
    note = {"task_id": task_id, "note_id": str(uuid.uuid4()), "happened": happened, "thoughts": thoughts, "adjustment": adjustment, "blocker": blocker, "numbers": numbers, "next_check": next_check}
    repo.append_event(tenant_id, project_id, "TaskNoted", note, _me(session, "ACT"))
    return next(task for task in repo.tasks(tenant_id, project_id)[project_id] if task["task_id"] == task_id)


class RerunRequest(BaseModel):
    due: str


@app.post("/interpretations/{interpretation_id}/rerun")
def schedule_rerun(
    interpretation_id: str,
    payload: RerunRequest,
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
) -> dict[str, Any]:
    """到期重跑並比較: a reminder, due on a date, to run this analysis again with new numbers and compare the two. The
    project page and 我的案子 show it once due; the run that answers it names it (rerun_id) and fulfils it."""
    tenant_id = session["tenant_id"]
    stored = _interpretation_or_404(repo, session, interpretation_id)
    due = _iso_date_or_400(payload.due, "RERUN_DUE")
    if _date_has_passed(due):
        raise HTTPException(status_code=400, detail="RERUN_DUE_INVALID: the date has passed")
    if any(item["interpretation_id"] == interpretation_id and item["fulfilled_by"] is None for item in repo.reruns(tenant_id, stored["project_id"]).get(stored["project_id"], [])):
        raise HTTPException(status_code=409, detail=f"RERUN_ALREADY_SCHEDULED: {interpretation_id!r} already has an open rerun reminder")
    events = repo.interpretation_events(tenant_id, interpretation_id)
    method_id = next((event["payload"].get("method_id") for event in events if event["event_type"] == "InterpretationRequested"), None)
    rerun = {"rerun_id": str(uuid.uuid4()), "interpretation_id": interpretation_id, "method_id": method_id, "due": due}
    repo.append_event(tenant_id, stored["project_id"], "RerunScheduled", rerun, _me(session, "ACT"))
    return next(item for item in repo.reruns(tenant_id, stored["project_id"])[stored["project_id"]] if item["rerun_id"] == rerun["rerun_id"])


@app.get("/projects/{project_id}/reruns")
def list_reruns(
    project_id: str,
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
) -> list[dict[str, Any]]:
    _project_or_404(repo, session, project_id)
    return repo.reruns(session["tenant_id"], project_id).get(project_id, [])


# -- Synthesis (RESEARCH_LINES_MASTER_PLAN §12.8 WC-P2-06; runner P-h, subject P-j): the interpret shape, one runner for
# three kinds. Events carry ids, counts and error codes only (K8): a runner message can quote model text about the
# subject, so SynthesisFailed keeps its leading codes, never the message -- plus the schema violations as paths and
# keywords (SchemaContracts.violations; the synthesis schemas close every object, so a path is schema names and indexes).

_ERROR_CODES = re.compile(r"([A-Z][A-Z0-9_]{2,})(?=:|$)(?:: ([A-Z][A-Z0-9_]{2,})(?=:|$))?")


def _error_code(message: str) -> str:
    """``"SYNTHESIS_REJECTED_AFTER_REPAIR: SYNTHESIS_GATE_FAILED: {...}"`` -> the first two codes; no code -> SYNTHESIS_FAILED."""
    match = _ERROR_CODES.match(message or "")
    return ": ".join(code for code in match.groups() if code) if match else "SYNTHESIS_FAILED"


def _failure_code(failure: BaseException) -> str:
    """A domain error keeps its codes; anything else (the provider raises urllib's HTTPError/URLError as they come)
    keeps its class name and HTTP status -- neither carries request or model text."""
    if isinstance(failure, InvariantViolation):
        return _error_code(str(failure))
    status = getattr(failure, "code", None)
    return f"SYNTHESIS_FAILED: {type(failure).__name__}" + (f" {status}" if isinstance(status, int) else "")


class _MeteredProvider:
    """The one way the API pays for a model call (drafts, interpretation, synthesis -- tests/unit/test_every_paid_call_is_metered.py).
    EVERY paid call -- a retry or a repair too -- first reserves its worst case (bytes sent + output ceiling) as an
    ai_usage row, in the same database transaction that checks it fits today's budget (store.reserve_ai_usage:
    no thread or process can pass the same check in between, and no lock spans the model call -- P-45). After the
    call the row becomes what it cost (a billed failure too; its worst case when that cannot be read). A process
    that dies mid-call, or a settle that fails, leaves the worst case counted -- nothing about spending lives in
    memory. ``run_id`` groups a run's calls for the estimate. The runner reads a refusal as a provider error."""

    def __init__(self, inner: AiProvider, store: IdentityStore, session: dict[str, Any], purpose: str, run_id: str | None = None) -> None:
        self._inner, self._store, self._session, self._purpose, self._run_id = inner, store, session, purpose, run_id
        self.model = inner.model
        self.input_tokens = 0
        self.output_tokens = 0
        if callable(getattr(inner, "complete_json", None)):   # offered only when the wrapped provider has it
            self.complete_json = lambda system, user, *, max_tokens, **options: self._metered(   # the tool definition is input too
                (system, user, json.dumps(options, ensure_ascii=False, default=str)), max_tokens, lambda: inner.complete_json(system, user, max_tokens=max_tokens, **options))

    def complete(self, system: str, user: str, *, max_tokens: int) -> Any:
        return self._metered((system, user), max_tokens, lambda: self._inner.complete(system, user, max_tokens=max_tokens))

    def _metered(self, sent: tuple[str, ...], max_tokens: int, call: Callable[[], Any]) -> Any:
        worst_input = worst_input_tokens(*sent)   # all this call can bill: output (thinking included) <= max_tokens
        try:
            person_budget, tenant_budget = _ai_budgets(self._inner, self._store, self._session)
        except HTTPException as refusal:
            raise InvariantViolation(str(refusal.detail)) from refusal
        worst = worst_input + max_tokens
        reservation = self._store.reserve_ai_usage_for(
            self._session["tenant_id"], self._session["identity_id"], self._purpose, self.model, worst_input, max_tokens,
            since=_today_utc_start_iso(), person_fits=lambda used: fits_budget(used, worst, person_budget),
            tenant_fits=lambda used: fits_budget(used, worst, tenant_budget), run_id=self._run_id,
        )
        usage_id = reservation.usage_id
        if usage_id is None:
            mine = reservation.refused_by == SCOPE_PERSON
            raise AiBudgetRefused(budget_exceeded(reservation.person_used if mine else reservation.tenant_used, person_budget if mine else tenant_budget, worst,
                                                  scope=SCOPE_PERSON if mine else SCOPE_TENANT))
        try:
            completion = call()
        except ProviderCallError as billed:
            if billed.usage_known:
                self._settle(usage_id, self.model, billed.input_tokens, billed.output_tokens)
            else:   # answered, cost unknown: the worst case stands
                self._settle(usage_id, self.model, worst_input, max_tokens)
            raise
        except BaseException:
            self._settle(usage_id, self.model, 0, 0)
            raise
        self._settle(usage_id, completion.model, completion.input_tokens, completion.output_tokens)
        return completion

    def _settle(self, usage_id: int, model: str, input_tokens: int, output_tokens: int) -> None:
        self.input_tokens += input_tokens   # every call made is recorded, an unbilled failure as a 0-token call
        self.output_tokens += output_tokens
        try:
            self._store.settle_ai_usage(self._session["tenant_id"], usage_id, model, input_tokens, output_tokens)
        except Exception as failure:   # the row stays reserved at its worst case: the budget never loses the bill
            raise InvariantViolation("AI_USAGE_RECORD_FAILED") from failure


def _synthesis_lock_path(tenant_id: str, project_id: str) -> Path:
    """One synthesis at a time per Project (plan P-k run lock, tagged with the running synthesis_id)."""
    tenant_key = hashlib.sha256(tenant_id.encode("utf-8")).hexdigest()[:32]
    project_key = hashlib.sha256(project_id.encode("utf-8")).hexdigest()[:32]
    return PRODUCT_ROOT / ".runtime" / "synthesis" / tenant_key / f"{project_key}.lock"


def _run_synthesis(
    *, synthesis_id: str, kind: str, project_id: str, session: dict[str, Any], subject: dict[str, Any],
    sources: list[dict[str, Any]], artifact_type: str, provider: AiProvider,
    store: IdentityStore, repo: ProjectSourceRepository, artifact_store: JsonArtifactStore, lock: RunLock,
) -> None:
    tenant_id = session["tenant_id"]
    metered = _MeteredProvider(provider, store, session, f"synthesis:{kind}", run_id=synthesis_id)
    try:
        try:
            spec_root = resolve_spec_root()
            outcome = run_synthesis(
                kind=kind, project_id=project_id, subject=subject, sources=sources, provider=metered,
                spec_root=spec_root, schema_contracts=SchemaContracts(spec_root), synthesis_id=synthesis_id,
            )
            error = None if outcome["error"] is None else _error_code(outcome["error"])
        except Exception as failure:
            outcome, error = None, _failure_code(failure)
        if repo.get_project(tenant_id, project_id) is None:   # erased meanwhile: nothing of it may be written back
            return
        if error is None and outcome is not None and outcome["artifact"] is not None:
            reference = None
            try:
                reference = artifact_store.put(tenant_id, artifact_type, outcome["artifact"])
                repo.save_synthesis(
                    tenant_id, project_id, synthesis_id, kind, reference,
                    datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
                )
                return
            except Exception as failure:
                if reference is not None:   # never an artifact no row points at
                    artifact_store.delete_if_present(tenant_id, reference)
                error = _failure_code(failure)
        repo.append_event(tenant_id, project_id, "SynthesisFailed", {
            "synthesis_id": synthesis_id, "kind": kind, "error": error or "SYNTHESIS_FAILED",
            "input_tokens": metered.input_tokens, "output_tokens": metered.output_tokens,
            # Where the answer broke the schema, never its values (the error keeps only codes for the same reason).
            "violations": list((outcome or {}).get("violations") or []),
        }, record_log.system("VERIFY"))
    finally:
        lock.release()


def _launch_synthesis(**kwargs: Any) -> None:
    threading.Thread(target=_run_synthesis, daemon=True, kwargs=kwargs).start()


@app.post("/projects/{project_id}/synthesis", status_code=202)
def create_synthesis(
    project_id: str,
    body: dict[str, Any],
    session: dict[str, Any] = Depends(require_session),
    store: IdentityStore = Depends(get_store),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
    source_cas: TenantScopedCas = Depends(get_source_cas),
    artifact_store: JsonArtifactStore = Depends(get_artifact_store),
    provider: AiProvider | None = Depends(get_interpretation_provider),
) -> dict[str, Any]:
    """Synthesize the Project's active Sources into a ``kind`` typed object, in the background (GET the id for the
    result). Everything that can be refused is refused here, before a paid call: body, subject (P-j), an ACTIVE
    ``synthesis.<kind>`` contract, at least one active Source, provider and budget."""
    tenant_id = session["tenant_id"]
    _project_or_404(repo, session, project_id)
    unknown = sorted(set(body) - {"kind", "subject"})
    if unknown:
        raise HTTPException(status_code=400, detail=f"SYNTHESIS_REQUEST_INVALID: unknown keys {unknown}; body is {{kind, subject}}")
    kind = body.get("kind")
    try:
        subject = validate_subject(kind, body.get("subject"))
    except InvariantViolation as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    capability_id = f"synthesis.{kind}"
    capability_catalog = CapabilityCatalog.from_spec_root(resolve_spec_root())
    if not capability_catalog.is_resolvable(capability_id):
        raise HTTPException(status_code=404, detail=f"CAPABILITY_RESOLUTION_BLOCKED: no ACTIVE contract for {capability_id!r}")
    contract = safe_load_yaml((resolve_spec_root() / capability_catalog.require(capability_id)["path"]).read_text(encoding="utf-8"))
    artifact_type = contract["output"]["type"][0]   # DossierBrief / DecisionEvidenceBrief / LiteratureMatrix
    # Only active rows are read (a superseded blob is never cited), and only the part a manifest entry can span
    # (DEFAULT_MAX_CHARS) is kept for the background run; the runner still decides what enters the manifest.
    sources = []
    for row in repo.list_sources(tenant_id, project_id):
        if row["status"] != "active":
            continue
        try:
            text = source_cas.read(tenant_id, repo.get_source_content_reference(tenant_id, project_id, row["source_id"])).decode("utf-8")
        except InvariantViolation as error:
            raise HTTPException(status_code=500, detail=f"SOURCE_CONTENT_UNREADABLE: {row['source_id']}") from error
        sources.append({"row": row, "text": text[:DEFAULT_MAX_CHARS]})
    if not sources:
        raise HTTPException(status_code=400, detail="SYNTHESIS_NO_SOURCES: the project has no active Source to synthesize from")
    provider = _require_ai(provider, store, session)
    synthesis_id = f"SYN-{uuid.uuid4().hex.upper()}"
    lock = acquire_run_lock(_synthesis_lock_path(tenant_id, project_id), tag=synthesis_id)
    if lock is None:
        raise HTTPException(status_code=409, detail="SYNTHESIS_IN_FLIGHT: this project already has a synthesis running; GET it, then retry")
    try:
        repo.append_event(tenant_id, project_id, "SynthesisRequested", {"synthesis_id": synthesis_id, "kind": kind, "source_count": len(sources)}, _me(session, "VERIFY"))
        _launch_synthesis(
            synthesis_id=synthesis_id, kind=kind, project_id=project_id, session=dict(session), subject=subject,
            sources=sources, artifact_type=artifact_type, provider=provider, store=store, repo=repo, artifact_store=artifact_store,
            lock=lock,
        )
    except BaseException:
        lock.release()   # the worker never started, so it cannot release
        raise
    return {"synthesis_id": synthesis_id, "status": "PENDING", "project_id": project_id, "kind": kind}


@app.get("/projects/{project_id}/synthesis/{synthesis_id}")
def get_synthesis(
    project_id: str,
    synthesis_id: str,
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
    artifact_store: JsonArtifactStore = Depends(get_artifact_store),
) -> dict[str, Any]:
    tenant_id = session["tenant_id"]
    _project_or_404(repo, session, project_id)
    events = repo.synthesis_events(tenant_id, project_id, synthesis_id)
    if not events:
        raise HTTPException(status_code=404, detail=f"SYNTHESIS_NOT_FOUND: {synthesis_id!r}")
    latest = events[-1]
    base = {"synthesis_id": synthesis_id, "project_id": project_id, "kind": events[0]["payload"].get("kind"), "requested_at": events[0]["occurred_at"]}
    if latest["event_type"] == "SynthesisRequested":
        lock_path = _synthesis_lock_path(tenant_id, project_id)
        running = run_lock_state(lock_path) == "held" and run_lock_tag(lock_path) == synthesis_id
        if not running and repo.synthesis_events(tenant_id, project_id, synthesis_id)[-1]["event_type"] == "SynthesisRequested":
            # its worker died before a terminal event (plan P-k): not PENDING forever; POST again
            return {**base, "status": "LOST"}
        if running:
            return {**base, "status": "PENDING"}
        return get_synthesis(project_id, synthesis_id, session, repo, artifact_store)  # it finished between the reads
    if latest["event_type"] == "SynthesisFailed":
        return {**base, "status": "FAILED", "error": latest["payload"]["error"], "violations": latest["payload"].get("violations", []), "finished_at": latest["occurred_at"]}
    stored = repo.get_synthesis(tenant_id, project_id, synthesis_id)
    if stored is None:
        raise HTTPException(status_code=500, detail="SYNTHESIS_ARTIFACT_MISSING")
    try:
        artifact = artifact_store.read(tenant_id, stored["artifact_reference"])
    except InvariantViolation as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    return {
        **base, "status": "DONE", "finished_at": stored["created_at"], "result": artifact["synthesis"], "gate_results": artifact["gate_results"],
        "manifest": artifact["manifest"], "prompt_version": artifact["prompt_version"], "latency_ms": artifact["latency_ms"],
    }


class CreateReportRequest(BaseModel):
    synthesis_id: str
    run_results: list[dict[str, Any]] = Field(default_factory=list)


def _read_report(repo: ProjectSourceRepository, artifact_store: JsonArtifactStore, tenant_id: str, project_id: str, report_id: str) -> dict[str, Any]:
    """One read of the report: its body plus the exact CAS reference that body came from, so a later
    write can state which version it replaces."""
    stored = repo.get_report(tenant_id, project_id, report_id)
    if stored is None:
        raise HTTPException(status_code=404, detail=f"REPORT_NOT_FOUND: {report_id!r}")
    try:
        artifact = artifact_store.read(tenant_id, stored["artifact_reference"])
    except InvariantViolation as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    return {"report": artifact["report"], "gate_results": artifact.get("gate_results", []), "created_at": stored["created_at"],
            "artifact_reference": stored["artifact_reference"]}


def _public_report(result: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in result.items() if key != "artifact_reference"}


@app.post("/projects/{project_id}/reports", status_code=201)
def create_report(
    project_id: str,
    payload: CreateReportRequest,
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
    artifact_store: JsonArtifactStore = Depends(get_artifact_store),
) -> dict[str, Any]:
    """Render and persist a project-bound report from an existing synthesis.

    ``run_results`` must be empty: a caller-supplied run body would put unverifiable gate statuses into an
    approvable report. It opens only once the project-level run binding can prove the run belongs to this Project.
    """
    if payload.run_results:
        raise HTTPException(status_code=422, detail="REPORT_RUN_RESULTS_UNBOUND: run results are not accepted until project-level run binding exists")
    tenant_id = session["tenant_id"]
    _project_or_404(repo, session, project_id)
    synthesis = repo.get_synthesis(tenant_id, project_id, payload.synthesis_id)
    if synthesis is None:
        raise HTTPException(status_code=404, detail=f"SYNTHESIS_NOT_FOUND: {payload.synthesis_id!r}")
    try:
        synthesis_artifact = artifact_store.read(tenant_id, synthesis["artifact_reference"])
        rendered = render_research_report(
            report_id=f"RPT-{uuid.uuid4().hex.upper()}", project_id=project_id,
            synthesis_artifact=synthesis_artifact, run_results=payload.run_results,
        )
    except InvariantViolation as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    report_id = rendered["report"]["report_id"]
    reference = artifact_store.put(tenant_id, "ResearchReport", rendered)
    try:
        repo.save_report(tenant_id, project_id, report_id, reference, _now_iso())
    except Exception:
        artifact_store.delete_if_present(tenant_id, reference)
        raise
    return {"report_id": report_id, "project_id": project_id, "status": "AI_GENERATED", "gate_results": rendered["gate_results"], "report": rendered["report"]}


@app.get("/projects/{project_id}/reports/{report_id}")
def get_report(
    project_id: str,
    report_id: str,
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
    artifact_store: JsonArtifactStore = Depends(get_artifact_store),
) -> dict[str, Any]:
    _project_or_404(repo, session, project_id)
    return _public_report(_read_report(repo, artifact_store, session["tenant_id"], project_id, report_id))


@app.get("/projects/{project_id}/reports/{report_id}/export", response_class=PlainTextResponse)
def export_report_markdown(
    project_id: str,
    report_id: str,
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
    artifact_store: JsonArtifactStore = Depends(get_artifact_store),
) -> PlainTextResponse:
    _project_or_404(repo, session, project_id)
    result = _read_report(repo, artifact_store, session["tenant_id"], project_id, report_id)
    return PlainTextResponse(result["report"]["markdown"], media_type="text/markdown; charset=utf-8")


class ReportApprovalRequest(BaseModel):
    decision: str
    reason: str = ""


@app.post("/projects/{project_id}/reports/{report_id}/approval")
def approve_report(
    project_id: str,
    report_id: str,
    payload: ReportApprovalRequest,
    session: dict[str, Any] = Depends(require_session),
    store: IdentityStore = Depends(get_store),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
    artifact_store: JsonArtifactStore = Depends(get_artifact_store),
) -> dict[str, Any]:
    tenant_id = session["tenant_id"]
    _project_or_404(repo, session, project_id)
    current = _read_report(repo, artifact_store, tenant_id, project_id, report_id)
    if payload.decision not in {"approve", "reject"}:
        raise HTTPException(status_code=400, detail="REPORT_APPROVAL_DECISION_INVALID: approve or reject")
    reason = payload.reason.strip()
    if payload.decision == "reject" and not reason:
        raise HTTPException(status_code=400, detail="REPORT_REJECTION_REASON_REQUIRED")
    if len(reason) > MAX_APPROVAL_REASON_CHARS:
        raise HTTPException(status_code=400, detail=f"REPORT_APPROVAL_REASON_TOO_LONG: at most {MAX_APPROVAL_REASON_CHARS} characters")
    if payload.decision == "approve" and current["report"]["report_state"] == "HUMAN_APPROVED":
        raise HTTPException(status_code=409, detail="REPORT_ALREADY_APPROVED")
    if payload.decision == "approve" and any(g.get("status") == "FAIL" for g in current["gate_results"]):
        raise HTTPException(status_code=409, detail="REPORT_GATE_FAILED: a report with failed integrity gates cannot be approved")
    old_reference = current["artifact_reference"]
    previous_state = current["report"]["report_state"]
    report = dict(current["report"])
    report["report_state"] = "HUMAN_APPROVED" if payload.decision == "approve" else "AI_GENERATED"
    report["approved_by"] = session["identity_id"] if payload.decision == "approve" else None
    # decision_id makes every report version's bytes unique: the CAS is content-addressed, so without it two versions
    # (a repeated reject, a concurrent identical decision) share one blob and deleting the replaced/losing one deletes the live one.
    updated = {"report": report, "gate_results": current["gate_results"], "decision_id": uuid.uuid4().hex}
    reference = artifact_store.put(tenant_id, "ResearchReport", updated)
    by_name = _by_name(store, session)
    event_type = "ReportApproved" if payload.decision == "approve" else "ReportRejected"
    try:
        repo.update_report_reference(
            tenant_id, project_id, report_id, old_reference, reference, event_type,
            {"report_id": report_id, "by": session["identity_id"], "by_name": by_name, "reason": reason, "previous_state": previous_state},
            writer=_me(session, "VERIFY"),
        )
    except InvariantViolation as error:
        artifact_store.delete_if_present(tenant_id, reference)
        if str(error) == "REPORT_STALE":
            raise HTTPException(status_code=409, detail="REPORT_STALE: the report changed while this decision was being made; reload and decide again") from error
        raise
    except Exception:
        artifact_store.delete_if_present(tenant_id, reference)
        raise
    artifact_store.delete_if_present(tenant_id, old_reference)
    return {"report_id": report_id, "decision": payload.decision, "report_state": report["report_state"], "by_name": by_name, "reason": reason}


# NOTE: `data_classification` values here (Public/Internal/Confidential/Restricted, defined by
# ai_lego.core.domain._intake_validation.DATA_CLASSIFICATIONS) are Title_Case and a DIFFERENT vocabulary from
# the Recipe run classification check a few hundred lines above (PUBLIC/INTERNAL/CONFIDENTIAL/RESTRICTED) --
# both internally consistent, not interchangeable (critic finding 2026-09-17, disclosed not unified).


class CreateProjectRequest(BaseModel):
    name: str
    purpose: str
    data_classification: str
    workspace_id: str | None = None


class CreateSourceRequest(BaseModel):
    title: str
    media_type: str
    data_classification: str
    content: str
    doi: str | None = None
    authors: list[str] | None = None
    venue: str | None = None
    published_at: str | None = None


@app.post("/projects")
def create_project(
    payload: CreateProjectRequest,
    session: dict[str, Any] = Depends(require_session),
    store: IdentityStore = Depends(get_store),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
) -> dict[str, Any]:
    if not check_entitlement(store, session["tenant_id"], PROJECT_MANAGE_CAPABILITY):
        raise HTTPException(status_code=403, detail=f"ENTITLEMENT_DENIED: tenant {session['tenant_id']!r} may not invoke {PROJECT_MANAGE_CAPABILITY!r}")
    workspace_id = payload.workspace_id
    if workspace_id is None:
        workspaces = store.list_workspaces(session["tenant_id"])
        if len(workspaces) == 0:
            raise HTTPException(status_code=400, detail="PROJECT_WORKSPACE_ID_REQUIRED: tenant has no workspaces yet -- provision one first")
        if len(workspaces) > 1:
            raise HTTPException(status_code=400, detail=f"PROJECT_WORKSPACE_ID_REQUIRED: tenant has {len(workspaces)} workspaces; specify workspace_id explicitly")
        workspace_id = workspaces[0]["workspace_id"]
    elif store.get_workspace(session["tenant_id"], workspace_id) is None:
        raise HTTPException(status_code=404, detail=f"WORKSPACE_NOT_FOUND: {workspace_id!r}")
    try:
        record = project_record(
            str(uuid.uuid4()),
            session["tenant_id"],
            workspace_id,
            payload.name,
            payload.purpose,
            payload.data_classification,
            session["identity_id"],
            datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        )
        return repo.create_project(record)
    except InvariantViolation as error:
        raise HTTPException(status_code=_domain_error_status(error), detail=str(error)) from error
    except UniqueViolation as error:
        # platform_projects has UNIQUE (tenant_id, workspace_id, created_by_identity_id, name) -- a double-submit or
        # client retry after a timeout hits this, not a programming error; answer a clean 409, not a raw 500.
        raise HTTPException(status_code=409, detail=f"PROJECT_NAME_ALREADY_EXISTS_IN_WORKSPACE: {payload.name!r}") from error


@app.get("/projects")
def list_projects(
    workspace_id: str | None = None,
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
) -> list[dict[str, Any]]:
    tenant_id = session["tenant_id"]
    mine = repo.list_projects(tenant_id, workspace_id, created_by=session["identity_id"])   # this person only: every read below is bounded by their cases, not the tenant
    ids = [project["project_id"] for project in mine]
    analyses, activity, tasks, reruns = _analyses(repo, tenant_id, project_ids=ids), repo.last_activity(tenant_id, project_ids=ids), repo.tasks(tenant_id, project_ids=ids), repo.reruns(tenant_id, project_ids=ids)   # four event scans once, not per project
    cases = CaseDocs(repo).owners_with(tenant_id, "case", "assembler.intake", owner_ids=ids)
    return [_project_with_activity(project, analyses, activity, tasks, reruns, project["project_id"] in cases) for project in mine if project["created_by_identity_id"] == session["identity_id"]]


def _project_with_activity(project: dict[str, Any], analyses: dict[str, list[dict[str, Any]]], activity: dict[str, str], tasks: dict[str, list[dict[str, Any]]], reruns: dict[str, list[dict[str, Any]]], is_case: bool) -> dict[str, Any]:
    """A Project with what it holds (GET /projects and GET /projects/{id} alike): when it last moved, how many analyses,
    the tools they used, the latest one, its open and overdue tasks, the rerun reminders that are due, and ``is_case``:
    it has 開案資料 (a case), or it only holds analyses run from 直接分析 (我的分析)."""
    own = analyses.get(project["project_id"], [])
    today = datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    open_tasks = [task for task in tasks.get(project["project_id"], []) if not task["done"]]
    due_dates = sorted(task["due"] for task in open_tasks if task["due"])
    return {
        **project, "is_case": is_case, "updated_at": activity.get(project["project_id"], project["created_at"]), "analysis_count": len(own),
        "methods": list(dict.fromkeys(item["method_id"] for item in own if item["method_id"])), "latest_analysis": own[-1] if own else None,
        "tasks": {"open": len(open_tasks), "overdue": sum(1 for task in open_tasks if task["due"] and _date_has_passed(task["due"])), "due_today": sum(1 for task in open_tasks if task["due"] == today), "next_due": due_dates[0] if due_dates else None},
        "reruns_due": sum(1 for item in reruns.get(project["project_id"], []) if item["fulfilled_by"] is None and item["due"] <= today),
    }


@app.get("/projects/{project_id}/analyses")
def project_analyses(
    project_id: str,
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
) -> list[dict[str, Any]]:
    """The Project's analyses, newest first (each opens with GET /interpretations/{interpretation_id})."""
    _project_or_404(repo, session, project_id)
    return list(reversed(_analyses(repo, session["tenant_id"], project_id).get(project_id, [])))


# IMPORTANT: this route must stay registered BEFORE /projects/{project_id} below -- same reason as
# /projects/{project_id}/sources/brief above (a literal "erased" segment would otherwise be swallowed by
# {project_id} and this route would never be reached).
@app.get("/projects/erased")
def list_erased_projects(
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
) -> list[dict[str, Any]]:
    """已抹除 (N-66): every deleted Project's tombstone -- the row and its content are already gone (ai_lego/platform/erasure.py),
    only this ProjectErased event stays, written once its files are gone too."""
    return repo.erased_projects(session["tenant_id"], session["identity_id"])


@app.get("/projects/{project_id}")
def get_project(
    project_id: str,
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
) -> dict[str, Any]:
    tenant_id = session["tenant_id"]
    project = _project_or_404(repo, session, project_id)
    return _project_with_activity(project, _analyses(repo, tenant_id, project_id), repo.last_activity(tenant_id, project_id), repo.tasks(tenant_id, project_id), repo.reruns(tenant_id, project_id),
                                  bool(CaseDocs(repo).current(tenant_id, record_log.case(project_id), "assembler.intake")))


class RenameProjectRequest(BaseModel):
    name: str


@app.patch("/projects/{project_id}")
def rename_project(
    project_id: str,
    payload: RenameProjectRequest,
    session: dict[str, Any] = Depends(require_session),
    store: IdentityStore = Depends(get_store),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
) -> dict[str, Any]:
    """N-83: 專案名稱 is editable after creation (create_project's own name stays a one-time default, not a
    dead end)."""
    tenant_id = session["tenant_id"]
    if not check_entitlement(store, tenant_id, PROJECT_MANAGE_CAPABILITY):
        raise HTTPException(status_code=403, detail=f"ENTITLEMENT_DENIED: tenant {tenant_id!r} may not invoke {PROJECT_MANAGE_CAPABILITY!r}")
    _project_or_404(repo, session, project_id)
    try:
        name = require_text("PROJECT", "name", payload.name, maximum=200)
        project = repo.rename_project(tenant_id, project_id, name, session["identity_id"])
    except InvariantViolation as error:
        raise HTTPException(status_code=_domain_error_status(error), detail=str(error)) from error
    except UniqueViolation as error:
        raise HTTPException(status_code=409, detail=f"PROJECT_NAME_ALREADY_EXISTS_IN_WORKSPACE: {payload.name!r}") from error
    return _project_with_activity(project, _analyses(repo, tenant_id, project_id), repo.last_activity(tenant_id, project_id), repo.tasks(tenant_id, project_id), repo.reruns(tenant_id, project_id),
                                  bool(CaseDocs(repo).current(tenant_id, record_log.case(project_id), "assembler.intake")))


@app.get("/projects/{project_id}/history")
def project_history(
    project_id: str,
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
) -> list[dict[str, Any]]:
    """Phase 1's Versioning primitive: the append-only event log for this Project's own aggregate id."""
    _project_or_404(repo, session, project_id)
    return repo.list_events(session["tenant_id"], f"project:{project_id}")


@app.delete("/projects/{project_id}")
def erase_project(
    project_id: str,
    only: Literal["analysis"] | None = None,
    session: dict[str, Any] = Depends(require_session),
    store: IdentityStore = Depends(get_store),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
    source_cas: TenantScopedCas = Depends(get_source_cas),
    artifact_store: JsonArtifactStore = Depends(get_artifact_store),
) -> Any:
    """Project-level erasure (RESEARCH_LINES_MASTER_PLAN D10, K7; ai_lego/platform/erasure.py): one transaction erases the
    case's rows, closes its grants and names what is left on disk; the files go after it commits. 200 with
    ``physical_cleanup: "done"`` when every file is gone and the ProjectErased tombstone is written; 202 with
    ``"pending"`` when the case is already unreadable but a file is not gone yet -- DELETE again (the case answers 404
    to everything else) or the server finishes it at its next start. ``?only=analysis`` (我的分析, a result page's 這份結果
    要怎麼處理): a project that became a case since the page loaded (開案資料 saved in another tab) answers 409
    PROJECT_IS_A_CASE and is not erased -- checked inside the erasure's decision, under the case lock."""
    tenant_id = session["tenant_id"]
    if not check_entitlement(store, tenant_id, PROJECT_MANAGE_CAPABILITY):
        raise HTTPException(status_code=403, detail=f"ENTITLEMENT_DENIED: tenant {tenant_id!r} may not invoke {PROJECT_MANAGE_CAPABILITY!r}")
    erasure = erasure_for(repo, source_cas, artifact_store)
    if erasure.pending_for(tenant_id, ERASURE_CASE, project_id, session["identity_id"]):   # decided before, files not all gone yet
        result = _without_empty_failed({"project_id": project_id, **erasure.finish(tenant_id, ERASURE_CASE, project_id)})
    else:
        _project_or_404(repo, session, project_id)
        result = erase_case(store, repo, source_cas, artifact_store, tenant_id, session["identity_id"], project_id, only_if_not_case=only == "analysis")
    return result if result["physical_cleanup"] == "done" else JSONResponse(status_code=202, content=result)


def _without_empty_failed(result: dict[str, Any]) -> dict[str, Any]:
    return result if result.get("failed") else {key: value for key, value in result.items() if key != "failed"}


def erase_case(store: IdentityStore, repo: ProjectSourceRepository, source_cas: TenantScopedCas, artifact_store: JsonArtifactStore,
               tenant_id: str, identity_id: str, project_id: str, *, only_if_no_record: bool = False, only_if_not_case: bool = False) -> dict[str, Any]:
    """The case erasure itself, for a case the caller has already shown is the person's. No entitlement gate: it is also what
    the account deletion calls, and deleting what is yours is a right a suspended tenant does not take away. What cannot be
    deleted (a corrupt artifact reference) comes back in ``failed`` and does not stop the erasure. ``physical_cleanup``
    says whether every file is gone yet. ``store`` stays in the signature for the callers; the grants close inside the
    erasure's own decision transaction."""
    if any(item["status"] == "PENDING" for item in _analyses(repo, tenant_id, project_id).get(project_id, [])):
        raise HTTPException(status_code=409, detail="PROJECT_BUSY: an analysis is still running; wait for it to finish, then delete")
    synthesis_lock = acquire_run_lock(_synthesis_lock_path(tenant_id, project_id), tag="erase")
    if synthesis_lock is None:   # a synthesis is writing into this case; held until the decision commits so none can start
        raise HTTPException(status_code=409, detail="PROJECT_BUSY: a synthesis is still running; wait for it to finish, then delete")
    try:
        runs = lambda: _case_runs(tenant_id, identity_id, project_id)   # noqa: E731 -- read inside the decision, under the case lock
        result = erasure_for(repo, source_cas, artifact_store).erase_case(tenant_id, project_id, identity_id, runs, only_if_no_record=only_if_no_record,
                                                                          only_if_not_case=only_if_not_case)   # later writes: CASE_ERASED
    except InvariantViolation as error:
        if str(error).startswith("PROJECT_NOT_FOUND"):
            raise HTTPException(status_code=404, detail=f"PROJECT_NOT_FOUND: {project_id!r}") from error
        if str(error).startswith("PROJECT_IS_A_CASE"):   # decided under the case lock (erasure.decide_case), so no intake slips past it
            raise HTTPException(status_code=409, detail=str(error)) from error
        raise
    finally:
        synthesis_lock.release()
    return _without_empty_failed({"project_id": project_id, **result})


@app.post("/projects/{project_id}/sources")
def create_source(
    project_id: str,
    payload: CreateSourceRequest,
    session: dict[str, Any] = Depends(require_session),
    store: IdentityStore = Depends(get_store),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
    source_cas: TenantScopedCas = Depends(get_source_cas),
) -> dict[str, Any]:
    if not check_entitlement(store, session["tenant_id"], SOURCE_MANAGE_CAPABILITY):
        raise HTTPException(status_code=403, detail=f"ENTITLEMENT_DENIED: tenant {session['tenant_id']!r} may not invoke {SOURCE_MANAGE_CAPABILITY!r}")
    project = _project_or_404(repo, session, project_id)
    if payload.media_type not in TEXT_MEDIA_TYPES:
        raise HTTPException(status_code=400, detail=f"SOURCE_MEDIA_TYPE_UNSUPPORTED: {payload.media_type!r} not in {sorted(TEXT_MEDIA_TYPES)} (Phase 1 Source Import is UTF-8 text only)")
    if payload.data_classification != project["data_classification"]:
        # Checked here too (repo.add_source enforces the same rule as defense-in-depth): failing BEFORE the
        # CAS write means a guaranteed-to-fail request (trivially triggerable by any authenticated tenant)
        # never leaves an orphaned, never-referenced, never-cleaned object under that tenant's CAS namespace.
        raise HTTPException(status_code=400, detail=f"SOURCE_PROJECT_CLASSIFICATION_MISMATCH: source {payload.data_classification!r} != project {project['data_classification']!r}")
    content_bytes = payload.content.encode("utf-8")
    if len(content_bytes) > MAX_SOURCE_CONTENT_BYTES:
        raise HTTPException(status_code=400, detail=f"SOURCE_CONTENT_TOO_LARGE: {len(content_bytes)} bytes exceeds {MAX_SOURCE_CONTENT_BYTES}")
    source_id = str(uuid.uuid4())
    # cas_path_for predicts put()'s return value without any I/O (pure function of tenant_id+content) --
    # validate first, physically write only after source_record() passes, so a rejected request never
    # orphans a CAS blob nothing will ever reference.
    cas_path = TenantScopedCas.cas_path_for(session["tenant_id"], content_bytes)
    artifact_uri = TenantScopedCas.artifact_uri(session["tenant_id"], project_id, source_id, cas_path)
    try:
        record = source_record(
            source_id,
            project_id,
            session["tenant_id"],
            payload.title,
            payload.media_type,
            payload.data_classification,
            cas_path["hash"],
            len(content_bytes),
            artifact_uri,
            session["identity_id"],
            datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            doi=payload.doi,
            authors=payload.authors,
            venue=payload.venue,
            published_at=payload.published_at,
            # A manually-entered Source with a DOI is citable literature by definition (RESEARCH_LINES_MASTER_PLAN
            # WC-P2-07b, P-K11); without one there is no fact to stamp, so it stays null as before.
            source_class="academic" if payload.doi else None,
        )
    except InvariantViolation as error:
        raise HTTPException(status_code=_domain_error_status(error), detail=str(error)) from error
    added = repo.add_source(record, cas_path, put_content=lambda: source_cas.put(session["tenant_id"], content_bytes), writer=_me(session, "GATHER"))
    block_hooks.after_sources(CaseDocs(repo), session["tenant_id"], record_log.case(project_id), {"run": None, "source_ids": [source_id], "aside": [], "pasted": True})
    return added


@app.get("/projects/{project_id}/sources")
def list_sources(
    project_id: str,
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
) -> list[dict[str, Any]]:
    _project_or_404(repo, session, project_id)
    return repo.list_sources(session["tenant_id"], project_id)


# Hard cap on synthesis artifacts one search request may read (work bound independent of tenant size). Past it the
# affected Projects are reported in ``incomplete`` -- the response never claims "no findings" for evidence it did not read.
MAX_SEARCH_SYNTHESIS_READS = 200


def _collect_cited_findings(synthesis: dict[str, Any], project_id: str, known: dict[str, list[dict[str, Any]]]) -> None:
    """Append to ``known[source_id]`` only citation-backed synthesis claims; arbitrary prose is never a finding.
    ``known`` holds one Project's matched Sources, so a citation can only land on a Source of the same Project.
    Claims come from ``iter_claims`` -- the same walk the citation_integrity gate uses -- so a claim cited from
    ``studies``/``options``/``criteria``/``evidence``/``related_entities``/``conflicts`` is found like a summary one."""
    for path, claim, _ in iter_claims(synthesis):
        top_level = path.removeprefix("$.").split(".")[0]
        name, _, index = top_level.partition("[")
        if name == "sections" and index.rstrip("]").isdigit():
            section = (synthesis.get("sections") or [])[int(index.rstrip("]"))]
            heading = str(section.get("heading") or "section") if isinstance(section, dict) else "section"
        else:
            heading = name
        text = next((str(claim[key]) for key in ("text", "claim", "name") if claim.get(key)), "")
        for citation in claim_citations(claim):
            if not isinstance(citation, str) or not citation.startswith("source:"):
                continue
            source_id = citation.removeprefix("source:")
            if source_id not in known:
                continue
            finding = {"heading": heading, "text": text, "citation": citation,
                       "synthesis_id": synthesis.get("synthesis_id"), "project_id": project_id}
            if finding not in known[source_id]:
                known[source_id].append(finding)


@app.get("/sources/search")
def search_sources(
    q: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(50, ge=1, le=100),
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
    artifact_store: JsonArtifactStore = Depends(get_artifact_store),
) -> dict[str, Any]:
    """Search only this tenant's active Sources and expose synthesis findings that cite each match."""
    tenant_id = session["tenant_id"]
    try:
        matches, truncated = repo.search_active_sources(tenant_id, q, limit, session["identity_id"])
    except InvariantViolation as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    findings: dict[tuple[str, str], list[dict[str, Any]]] = {(row["project_id"], row["source_id"]): [] for row in matches}
    incomplete: dict[str, str] = {}   # project_id -> why its findings may be missing; never silently empty
    budget = MAX_SEARCH_SYNTHESIS_READS
    for project_id in dict.fromkeys(row["project_id"] for row in matches):   # only Projects that hold a match are opened
        known = {source_id: items for (owner, source_id), items in findings.items() if owner == project_id}
        for reference in repo.project_artifact_references(tenant_id, project_id):
            if reference.get("artifact_type") not in {"LiteratureMatrix", "DossierBrief", "DecisionEvidenceBrief"}:
                continue
            if budget == 0:
                incomplete.setdefault(project_id, "SEARCH_ARTIFACT_BUDGET_EXCEEDED")
                break
            budget -= 1
            try:
                artifact = artifact_store.read(tenant_id, reference)
            except InvariantViolation as failure:
                logging.getLogger(__name__).warning("source search: synthesis artifact unreadable in project %s (%s): %s", project_id, reference.get("content_sha256"), failure)
                incomplete.setdefault(project_id, "ARTIFACT_UNREADABLE")
                continue
            synthesis = artifact.get("synthesis")
            if not isinstance(synthesis, dict):
                incomplete.setdefault(project_id, "ARTIFACT_MALFORMED")
                continue
            _collect_cited_findings(synthesis, project_id, known)
    results = [
        {"source": row, "project": {"project_id": row["project_id"], "name": row["project_name"], "purpose": row["project_purpose"]},
         "findings": findings[(row["project_id"], row["source_id"])], "findings_complete": row["project_id"] not in incomplete}
        for row in matches
    ]
    return {"query": q, "results": results, "truncated": truncated, "limit": limit,
            "incomplete": [{"project_id": pid, "reason": reason} for pid, reason in incomplete.items()]}


def _source_brief_block(source: dict[str, Any], content: str) -> str:
    """One Source's contribution to a composed literature brief: a ``## title`` heading, a byline line
    (authors/venue/published_at -- only the parts actually present), the doi if present, then the full
    content, terminated by a ``---`` separator."""
    byline_parts = []
    if source.get("authors"):
        byline_parts.append(", ".join(source["authors"]))
    if source.get("venue"):
        byline_parts.append(source["venue"])
    if source.get("published_at"):
        byline_parts.append(source["published_at"])
    lines = [f"## {source['title']}"]
    if byline_parts:
        lines.append(", ".join(byline_parts))
    if source.get("doi"):
        lines.append(source["doi"])
    lines.extend(["", content, "", "---", ""])
    return "\n".join(lines)


# IMPORTANT: this route must stay registered BEFORE /projects/{project_id}/sources/{source_id} below --
# FastAPI/Starlette matches routes in registration order, so a literal "brief" segment would otherwise be
# swallowed by {source_id} and this route would never be reached (would 404 as SOURCE_NOT_FOUND: 'brief').
@app.get("/projects/{project_id}/sources/brief")
def project_sources_brief(
    project_id: str,
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
    source_cas: TenantScopedCas = Depends(get_source_cas),
) -> dict[str, Any]:
    """Compose this Project's Sources into one text blob for the dashboard's "帶入 Project 來源當背景資料"
    button, which pastes the result straight into the AI-draft brief field. No entitlement check --
    matches ``list_sources`` above (read-only, same permissiveness; Phase 1 has no read-scoped capability
    for this resource, and gating a read with a manage-capability would be stricter than its sibling
    route for no stated reason).

    Whole-source granularity: a Source is included only if its FULL block fits under
    ``MAX_SOURCE_BRIEF_CHARS``, never cut mid-source (a severed sentence would misrepresent the source
    and hide exactly which part is missing) -- so ``sources_included`` can be 0 when even the first
    Source alone exceeds the cap. ``truncated``/``sources_included``/``sources_total`` always disclose
    when the picture is incomplete, including that edge case.
    """
    _project_or_404(repo, session, project_id)
    sources = repo.list_sources(session["tenant_id"], project_id)
    blocks: list[str] = []
    included = 0
    total_chars = 0
    truncated = False
    for source in sources:
        cas_path = repo.get_source_content_reference(session["tenant_id"], project_id, source["source_id"])
        if cas_path is None:
            raise HTTPException(status_code=500, detail=f"SOURCE_CONTENT_REFERENCE_MISSING: {source['source_id']!r}")
        try:
            content = source_cas.read(session["tenant_id"], cas_path).decode("utf-8")
        except InvariantViolation as error:
            raise HTTPException(status_code=500, detail=str(error)) from error
        block = _source_brief_block(source, content)
        if total_chars + len(block) > MAX_SOURCE_BRIEF_CHARS:
            truncated = True
            break
        blocks.append(block)
        total_chars += len(block)
        included += 1
    return {
        "project_id": project_id,
        "brief": "".join(blocks),
        "sources_total": len(sources),
        "sources_included": included,
        "truncated": truncated,
    }


@app.get("/projects/{project_id}/sources/{source_id}")
def get_source(
    project_id: str,
    source_id: str,
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
) -> dict[str, Any]:
    _project_or_404(repo, session, project_id)
    source = repo.get_source(session["tenant_id"], project_id, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail=f"SOURCE_NOT_FOUND: {source_id!r}")
    return source


@app.get("/projects/{project_id}/sources/{source_id}/content")
def get_source_content(
    project_id: str,
    source_id: str,
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
    source_cas: TenantScopedCas = Depends(get_source_cas),
) -> dict[str, str]:
    _project_or_404(repo, session, project_id)
    cas_path = repo.get_source_content_reference(session["tenant_id"], project_id, source_id)
    if cas_path is None:
        raise HTTPException(status_code=404, detail=f"SOURCE_NOT_FOUND: {source_id!r}")
    try:
        content_bytes = source_cas.read(session["tenant_id"], cas_path)
    except InvariantViolation as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return {"content": content_bytes.decode("utf-8")}


@app.get("/projects/{project_id}/sources/{source_id}/history")
def source_history(
    project_id: str,
    source_id: str,
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
) -> list[dict[str, Any]]:
    _project_or_404(repo, session, project_id)
    if repo.get_source(session["tenant_id"], project_id, source_id) is None:
        raise HTTPException(status_code=404, detail=f"SOURCE_NOT_FOUND: {source_id!r}")
    return repo.list_events(session["tenant_id"], f"source:{source_id}")


# ---------------------------------------------------------------------------
# Research collection runs (RESEARCH_LINES_MASTER_PLAN §3.2 step 2, §12.7 I-d/I-f/I-g/I-h). The operator asks for a
# run -- plan first, confirm second (C7); COS issues a one-shot grant and hands only its REFERENCE to the Collection
# Service (next-admin), which exchanges it for the token, ingests Sources and completes the run.
# ---------------------------------------------------------------------------

RESEARCH_COLLECT_CAPABILITY = "research.collect"
# = next-admin lib/collect/search/query-plan.ts MAX_QUERIES per entity seed: the plan shows this ceiling, not an exact
# count (the exact preview is P3).
RESEARCH_MAX_QUERIES_PER_ENTITY = 16
MAX_RESEARCH_SEED_META_BYTES = 4096
_GRANT_ERROR_STATUS = {"GRANT_NOT_FOUND": 404, "GRANT_ALREADY_EXCHANGED": 409, "GRANT_EXPIRED": 410}


class CollectionSeed(BaseModel):
    model_config = ConfigDict(extra="forbid")
    uri: str
    meta: dict[str, Any] | None = None


class CollectionBudget(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fetches: int = MAX_FETCHES


class CollectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    seeds: list[CollectionSeed]
    budget: CollectionBudget | None = None
    confirm: bool = False


class CollectionCompleteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["completed", "failed"]
    report: dict[str, Any] | None = None
    # Accepted for the caller's own logs, never stored: it can quote a URL (plan K8).
    error: str | None = None
    # Wire v2 (STEP2_SHARED_RULES §4.1; examples specs/wire/collector.v2.json): pages set aside with no text, and the
    # search channels the run used or could not use. Typed Any and checked by wire_error inside the route: a 422 before
    # the handler would leave the run open until its deadline.
    aside: Any = None
    channels: Any = None

    def wire_error(self) -> str | None:
        def text(value: Any, low: int, high: int) -> bool:
            return isinstance(value, str) and low <= len(value) <= high

        # only an absent list is empty: `or []` let "" and 0 through as no pages (Codex 2026-10-04)
        aside, channels = [] if self.aside is None else self.aside, [] if self.channels is None else self.channels
        if not isinstance(aside, list) or not all(isinstance(item, dict) for item in aside):
            return "aside: a list of pages"
        if not isinstance(channels, list) or not all(isinstance(item, dict) for item in channels):
            return "channels: a list"
        if len(aside) > 200:
            return "aside: at most 200 pages"
        for item in aside:
            if set(item) != {"url", "title", "reason"}:
                return "aside: each page is {url, title, reason}"
            if not (text(item["url"], 1, 2048) and item["url"].startswith(("https://", "http://"))):
                return "aside: url is an http(s) address of at most 2048 characters"
            if not text(item["title"], 0, 300) or not text(item["reason"], 1, 300):
                return "aside: title at most 300 characters, reason 1..300"
        if len(channels) > 20:
            return "channels: at most 20"
        for item in channels:
            if set(item) != {"provider", "lang", "state", "why"}:
                return "channels: each is {provider, lang, state, why}"
            # Never Perplexity (the operator's decision after unexplained charges): a run that used it is refused.
            if item["provider"] not in ("serper", "brave"):
                return "channels: provider is serper or brave"
            if item["lang"] not in ("zh", "en") or item["state"] not in ("ok", "unreachable", "no_key") or not text(item["why"], 0, 300):
                return "channels: lang zh|en, state ok|unreachable|no_key, why at most 300 characters"
        # collect merges a channel's reports into one row (orchestrator.ts mergeChannel); two rows for one pair are
        # ambiguous -- the second 「ok」 would hide the first 「unreachable」 and read as 查不到 (Codex VERIFY r5 F1)
        if len({(item["provider"], item["lang"]) for item in channels}) != len(channels):
            return "channels: each (provider, lang) once"
        return None


def get_collection_service() -> CollectionServiceClient | None:
    """``None`` = COLLECT_RESEARCH_RUNS_TOKEN unset; a confirmed run answers 503. Tests override this dependency."""
    return collection_service_from_env()


def _research_seeds(payload: CollectionRequest) -> list[dict[str, Any]]:
    # Wire v2 (STEP2_SHARED_RULES §4.1): exactly two shapes -- a claim to search for (engines serper|brave only: never
    # Perplexity, the operator's decision after unexplained charges), or an https URL with no meta or only `pasted`.
    # Any other entity:// seed would reach the collector's name search, which honours its own engine setting.
    # = next-admin search/query-plan.ts CLAIM_ANGLES and app/api/internal/collect/runs/research-run-request.ts.
    claim_lists = {
        "angles": ("primary", "news", "factcheck", "precedent", "field", "opposite", "origin"),
        "languages": ("zh", "en"),
        "providers": ("serper", "brave"),
    }

    def refuse(why: str) -> HTTPException:
        return HTTPException(status_code=400, detail=f"COLLECTION_SEEDS_INVALID: {why}")

    if not 1 <= len(payload.seeds) <= MAX_SEEDS:
        raise refuse(f"1..{MAX_SEEDS} seeds")
    seeds: list[dict[str, Any]] = []
    for seed in payload.seeds:
        if len(seed.uri) > 2048 or any(seed.uri == kept["uri"] for kept in seeds):
            raise refuse("each seed uri at most 2048 characters, and given once")
        if seed.uri.startswith("https://"):
            if seed.meta is not None and (set(seed.meta) != {"pasted"} or not isinstance(seed.meta["pasted"], bool)):
                raise refuse("an https:// seed has no meta, or only pasted: true or false")
            seeds.append({"uri": seed.uri} if seed.meta is None else {"uri": seed.uri, "meta": {"pasted": seed.meta["pasted"]}})
            continue
        if not re.fullmatch(r"entity://claim/[A-Za-z0-9_-]{1,64}", seed.uri):
            raise refuse("a seed is an https:// URL or entity://claim/<id of 1..64 letters, digits, _ or ->")
        meta = seed.meta
        if meta is None or set(meta) != {"kind", "entityName", *claim_lists} or meta["kind"] != "claim":
            raise refuse("a claim seed's meta is exactly kind (claim), entityName, angles, languages, providers")
        if len(json.dumps(meta, ensure_ascii=False).encode("utf-8")) > MAX_RESEARCH_SEED_META_BYTES:
            raise refuse(f"meta over {MAX_RESEARCH_SEED_META_BYTES} bytes")
        if not isinstance(meta["entityName"], str) or not meta["entityName"].strip() or len(meta["entityName"]) > 200:
            raise refuse("entityName is the claim, 1..200 characters")
        for key, allowed in claim_lists.items():
            values = meta[key]
            if not isinstance(values, list) or not values or len(set(map(str, values))) != len(values) or not all(isinstance(v, str) and v in allowed for v in values):
                raise refuse(f"{key} is a non-empty list without repeats from {', '.join(allowed)}")
        if meta["languages"] != [query_language(meta["entityName"])]:   # never words of one language searched as another
            raise refuse(f"a claim seed searches in one language, the one its words are written in ({query_language(meta['entityName'])}); "
                         "another language is another seed with the words translated")
        seeds.append({"uri": seed.uri, "meta": meta})
    return seeds


@app.post("/projects/{project_id}/collections")
def request_collection(
    project_id: str,
    payload: CollectionRequest,
    response: Response,
    session: dict[str, Any] = Depends(require_session),
    store: IdentityStore = Depends(get_store),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
    service: CollectionServiceClient | None = Depends(get_collection_service),
) -> dict[str, Any]:
    """Without ``confirm: true`` this only returns the plan and writes nothing (C7)."""
    return start_collection(project_id, payload, response, session, store, repo, service)


def start_collection(project_id: str, payload: CollectionRequest, response: Response, session: dict[str, Any], store: IdentityStore,
                     repo: ProjectSourceRepository, service: CollectionServiceClient | None, *, reserve: Callable[[str], None] | None = None) -> dict[str, Any]:
    """The collections route's work, for a block's own route too. ``reserve(run_id)``: that block's record of the run,
    saved once the run exists and before the Collection Service is asked; it raises to refuse, and the run then fails
    with nothing sent (VERIFY: one open 「去查」 per claim version, checked in the same save)."""
    tenant_id = session["tenant_id"]
    if not check_entitlement(store, tenant_id, RESEARCH_COLLECT_CAPABILITY):
        raise HTTPException(status_code=403, detail=f"ENTITLEMENT_DENIED: tenant {tenant_id!r} may not invoke {RESEARCH_COLLECT_CAPABILITY!r}")
    _project_or_404(repo, session, project_id)
    seeds = _research_seeds(payload)
    fetches = (payload.budget or CollectionBudget()).fetches
    if not 1 <= fetches <= MAX_FETCHES:
        raise HTTPException(status_code=400, detail=f"COLLECTION_BUDGET_INVALID: fetches 1..{MAX_FETCHES}")
    entity_seeds = sum(1 for seed in seeds if seed["uri"].startswith("entity://"))
    plan = {"seeds": len(seeds), "max_queries": entity_seeds * RESEARCH_MAX_QUERIES_PER_ENTITY, "max_fetches": fetches}
    if not payload.confirm:
        return {"plan": plan, "confirm_required": True}
    if service is None:
        raise HTTPException(status_code=503, detail="COLLECTION_SERVICE_UNCONFIGURED: COLLECT_RESEARCH_RUNS_TOKEN is not set")
    collector = store.find_collector_identity(tenant_id)
    if collector is None:
        raise HTTPException(status_code=409, detail="COLLECTOR_IDENTITY_MISSING: run bootstrap_service_identity --tenant-id <this tenant> --email research-collector@cognitive-os.local")
    run_id = uuid.uuid4().hex
    now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    # One deadline for the run and its grant (core/domain/collection_run.py RUN_TTL): whatever happens after this line
    # -- a crash, a grant nobody exchanges, a Collection Service that never calls back -- the run reads as failed once
    # the deadline passes, and the grant stops working at the same instant.
    run = repo.create_collection_run(collection_run_record(run_id, project_id, tenant_id, len(seeds), fetches, session["identity_id"], now), seeds)
    grant_ref = store.issue_collect_grant(tenant_id, project_id, run_id, collector["identity_id"], run["deadline_at"])
    if reserve is not None:
        try:
            reserve(run_id)
        except BaseException:
            repo.finish_collection_run(tenant_id, run_id, "failed", None)
            store.close_collect_grant(grant_ref)
            raise
    try:
        service.start_run(grant_ref, project_id, run_id, seeds, {"fetches": fetches})
    except InvariantViolation as error:
        # A known refusal: the run fails now instead of waiting out its deadline.
        repo.finish_collection_run(tenant_id, run_id, "failed", None)
        store.close_collect_grant(grant_ref)
        raise HTTPException(status_code=424, detail=f"COLLECTION_SERVICE_UNAVAILABLE: {error}") from error   # never 502 (ai_failure_status)
    response.status_code = 202
    return {"run_id": run_id, "status": "requested", "plan": plan}


@app.get("/projects/{project_id}/collections/{run_id}")
def get_collection(
    project_id: str,
    run_id: str,
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
) -> dict[str, Any]:
    _project_or_404(repo, session, project_id)
    run = repo.get_collection_run(session["tenant_id"], project_id, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"COLLECTION_RUN_NOT_FOUND: {run_id!r}")
    return run


def _collection_bearer_ok(authorization: str | None) -> bool:
    expected = os.environ.get("COLLECT_RESEARCH_RUNS_TOKEN", "").strip()
    scheme, _, value = (authorization or "").partition(" ")
    return bool(expected) and scheme.lower() == "bearer" and hmac.compare_digest(value.strip().encode("utf-8"), expected.encode("utf-8"))


@app.post("/collect-grants/{grant_ref}/exchange")
def exchange_collect_grant(
    grant_ref: str,
    authorization: str | None = Header(default=None),
    store: IdentityStore = Depends(get_store),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
) -> dict[str, Any]:
    """next-admin trades the run's grant reference for its token, once (I-d). Bearer = COLLECT_RESEARCH_RUNS_TOKEN.
    ``wire_versions``: the ingest/completion shapes this engine accepts (IngestSource.schema_version); next-admin sends
    v2 only when it is listed, so either side can deploy first (an older engine answers without the key = v1 only)."""
    if not _collection_bearer_ok(authorization):
        raise HTTPException(status_code=401, detail="COLLECT_TOKEN_INVALID")
    try:
        grant = store.exchange_collect_grant(grant_ref)
    except InvariantViolation as error:
        code = str(error).split(":")[0]
        raise HTTPException(status_code=_GRANT_ERROR_STATUS.get(code, 400), detail=code) from error
    try:
        repo.mark_collection_running(grant["tenant_id"], grant["run_id"])
    except InvariantViolation as error:
        store.close_collect_grant(grant_ref)  # the run already ended; its grant dies with it
        raise HTTPException(status_code=410, detail="GRANT_EXPIRED") from error
    return {"grant_token": grant["grant_token"], "project_id": grant["project_id"], "run_id": grant["run_id"], "expires_at": grant["expires_at"],
            "wire_versions": IngestSource.model_json_schema()["properties"]["schema_version"]["enum"]}


def require_grant(project_id: str, authorization: str | None = Header(default=None), store: IdentityStore = Depends(get_store)) -> dict[str, str]:
    """``Authorization: Grant <token>`` for the Collection Service's writes (I-e/I-f); bound to one project and run."""
    scheme, _, token = (authorization or "").partition(" ")
    grant = store.resolve_collect_grant(token.strip()) if scheme.lower() == "grant" else None
    if grant is None:
        raise HTTPException(status_code=401, detail="GRANT_INVALID")
    if grant["project_id"] != project_id:
        raise HTTPException(status_code=403, detail="GRANT_PROJECT_MISMATCH")
    return grant


@app.post("/projects/{project_id}/collections/{run_id}/complete")
def complete_collection(
    project_id: str,
    run_id: str,
    payload: CollectionCompleteRequest,
    grant: dict[str, str] = Depends(require_grant),
    store: IdentityStore = Depends(get_store),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
) -> dict[str, str]:
    """Ends the run and voids its grant (I-f). A malformed report still ends it, as failed -- never left running."""
    if grant["run_id"] != run_id:
        raise HTTPException(status_code=403, detail="GRANT_RUN_MISMATCH")
    wire_error = payload.wire_error()
    try:
        if wire_error is not None:
            run = repo.finish_collection_run(grant["tenant_id"], run_id, "failed", None)
        else:
            run = repo.finish_collection_run(grant["tenant_id"], run_id, payload.status, payload.report)
    except InvariantViolation as error:
        if "REPORT_INVALID" in str(error):
            repo.finish_collection_run(grant["tenant_id"], run_id, "failed", None)
        store.close_collect_grant(grant["grant_ref"])
        raise HTTPException(status_code=400 if "REPORT_INVALID" in str(error) else 409, detail=str(error)) from error
    store.close_collect_grant(grant["grant_ref"])
    if wire_error is not None:
        raise HTTPException(status_code=400, detail=f"COLLECTION_COMPLETE_INVALID: {wire_error}")
    # what the run delivered (healthy or not) gets its cards (GATHER); source_ids None = every active source without one
    block_hooks.after_sources(CaseDocs(repo), grant["tenant_id"], record_log.case(project_id),
                              {"run": run_id, "source_ids": None, "aside": payload.aside or [], "channels": payload.channels or [], "pasted": False})
    return {"run_id": run_id, "status": run["status"]}


MAX_INGEST_BATCH = 25  # = next-admin sink/cognitive INGEST_BATCH


class IngestSource(BaseModel):
    """One collected document as next-admin's sink/cognitive projects it (plan §3.4 C1)."""

    model_config = ConfigDict(extra="forbid")
    canonical_url: str
    source_uri: str
    content_sha256: str
    mime: str
    content_type: str
    title: str
    author: str | None = None
    published_at: str | None = None
    fetched_at: str
    text: str
    provenance: dict[str, Any]
    collector: str
    source_class: str | None = None
    relevance: dict[str, Any] = {}
    schema_version: Literal["1", "2"]

    @staticmethod
    def relevance_checks() -> dict[str, Callable[[Any], bool]]:
        """Every v2 relevance key and its type (= specs/wire/collector.v2.json `relevance`, one rule set both sides
        test against), so a block reading relevance never meets a shape it did not expect."""

        def text(high: int) -> Callable[[Any], bool]:
            return lambda value: isinstance(value, str) and 1 <= len(value) <= high

        def short_id(value: Any) -> bool:
            return isinstance(value, str) and re.fullmatch(r"[a-z][a-z0-9_-]{0,39}", value) is not None

        def texts(items: int, high: int) -> Callable[[Any], bool]:
            return lambda value: isinstance(value, list) and len(value) <= items and all(text(high)(item) for item in value)

        return {
            "entityConfidence": lambda value: value in (None, "anchored", "name_only", "weak", "peripheral"),
            "entityAnchorsHit": texts(12, 200),
            "searchProvider": lambda value: value in ("serper", "brave"),
            "searchLang": lambda value: value in ("zh", "en"),
            "searchQuery": text(500),
            "searchAngle": short_id,
            "pasted": lambda value: isinstance(value, bool),
            "aside": text(300),
            "imageUrl": lambda value: text(2048)(value) and value.startswith(("https://", "http://")),
            "outlinks": texts(OUTLINKS_ITEMS, OUTLINK_CHARS),
        }

    def stored_relevance(self) -> dict[str, Any]:
        """What is stored: one shape whatever the wire version. v1 (free-form) keeps only the keys and values v2 allows,
        and is not pasted (v1 had no pasted seed)."""
        if self.schema_version == "2":
            return dict(self.relevance)
        checks = self.relevance_checks()
        kept = {key: value for key, value in self.relevance.items() if key in checks and key != "pasted" and checks[key](value)}
        return {**kept, "pasted": False}

    def relevance_error(self) -> str | None:
        """v1 is converted (stored_relevance), never refused; a v2 key or value outside the rules refuses the batch.
        The size cap is source_record's."""
        if self.schema_version == "1":
            return None
        checks = self.relevance_checks()
        unknown = sorted(set(self.relevance) - set(checks))
        if unknown:
            return f"unknown key {unknown[0]!r}"
        if "pasted" not in self.relevance:
            return "pasted is missing"
        for key, value in self.relevance.items():
            if not checks[key](value):
                return f"{key} has the wrong type or length"
        if self.relevance["pasted"] and any(key.startswith("search") for key in self.relevance):
            return "a pasted page carries no search keys"
        return None


class IngestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    run_id: str
    sources: list[IngestSource]


@app.post("/projects/{project_id}/sources/ingest")
def ingest_sources(
    project_id: str,
    payload: IngestRequest,
    grant: dict[str, str] = Depends(require_grant),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
    source_cas: TenantScopedCas = Depends(get_source_cas),
) -> dict[str, Any]:
    """The Collection Service's Sources for one run (I-e). The whole batch is checked before anything is written;
    what counts as new, unchanged or a new version is decided by the repository inside one transaction (C2)."""
    tenant_id = grant["tenant_id"]
    if payload.run_id != grant["run_id"]:
        raise HTTPException(status_code=403, detail="GRANT_RUN_MISMATCH")
    if not 1 <= len(payload.sources) <= MAX_INGEST_BATCH:
        raise HTTPException(status_code=400, detail=f"SOURCE_INGEST_BATCH_INVALID: 1..{MAX_INGEST_BATCH} sources")
    run = repo.get_collection_run(tenant_id, project_id, payload.run_id)
    if run is None or run["status"] != "running":
        raise HTTPException(status_code=409, detail="COLLECTION_RUN_NOT_RUNNING")
    project = _granted_project_or_404(repo, grant, project_id)
    latest: dict[str, tuple[IngestSource, bytes]] = {}
    for item in payload.sources:
        content = item.text.encode("utf-8")
        if hashlib.sha256(content).hexdigest() != item.content_sha256:
            raise HTTPException(status_code=400, detail=f"SOURCE_HASH_MISMATCH: {item.canonical_url[:200]!r}")
        if not content or len(content) > MAX_SOURCE_CONTENT_BYTES:
            raise HTTPException(status_code=400, detail=f"SOURCE_CONTENT_SIZE_INVALID: {item.canonical_url[:200]!r}")
        relevance_error = item.relevance_error()
        if relevance_error is not None:
            raise HTTPException(status_code=400, detail=f"SOURCE_RELEVANCE_INVALID: {item.canonical_url[:200]!r}: {relevance_error}")
        latest[item.canonical_url] = (item, content)  # the last copy of a URL in the batch wins
    now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    items: list[tuple[dict[str, Any], dict[str, str]]] = []
    contents: dict[str, bytes] = {}
    for item, content in latest.values():
        source_id = str(uuid.uuid4())
        cas_path = TenantScopedCas.cas_path_for(tenant_id, content)
        try:
            record = source_record(
                source_id,
                project_id,
                tenant_id,
                (item.title.strip() or item.canonical_url)[:300],
                "text/plain",
                project["data_classification"],
                cas_path["hash"],
                len(content),
                TenantScopedCas.artifact_uri(tenant_id, project_id, source_id, cas_path),
                grant["collector_identity_id"],
                now,
                authors=[item.author.strip()] if item.author and item.author.strip() else None,
                published_at=item.published_at if item.published_at and len(item.published_at) <= 40 else None,
                canonical_url=item.canonical_url,
                source_uri=item.source_uri,
                fetched_at=item.fetched_at,
                provenance=item.provenance,
                source_class=item.source_class,
                relevance=item.stored_relevance(),
            )
        except InvariantViolation as error:
            raise HTTPException(status_code=_domain_error_status(error), detail=str(error)) from error
        items.append((record, cas_path))
        contents[cas_path["hash"]] = content
    try:
        results = repo.ingest_batch(tenant_id, project_id, items, put_content=lambda cas_path: source_cas.put(tenant_id, contents[cas_path["hash"]]))
    except InvariantViolation as error:
        raise HTTPException(status_code=400, detail=f"SOURCE_INGEST_REFUSED: {error}") from error
    # every batch, not only the run's end: a run that dies after ingesting still gets its cards (GATHER)
    block_hooks.after_sources(CaseDocs(repo), tenant_id, record_log.case(project_id), {"run": payload.run_id, "source_ids": None, "pasted": False})
    return {"results": results}


# ---------------------------------------------------------------------------
# Custom Workflows -- a tenant's own self-assembled chain of existing methods
# (dashboard "組成工作流"; operator 2026-09-18). No entitlement capability of its
# own: saving/naming a list of method_ids is not sensitive, and each step is still
# gated by that method's own entitlement check at invoke time (unchanged). See
# ai_lego/core/domain/custom_workflow.py for why this is not a Recipe or a Project.
# ---------------------------------------------------------------------------


class CustomWorkflowRequest(BaseModel):
    title: str
    method_ids: list[str]


def _unresolvable_method_ids(catalog: MethodCatalog, method_ids: list[str]) -> list[str]:
    return [method_id for method_id in method_ids if not catalog.is_resolvable(method_id)]


@app.post("/workflows/custom")
def create_custom_workflow(
    payload: CustomWorkflowRequest,
    session: dict[str, Any] = Depends(require_session),
    repo: CustomWorkflowRepository = Depends(get_custom_workflow_repository),
    catalog: MethodCatalog = Depends(get_catalog),
) -> dict[str, Any]:
    unresolvable = _unresolvable_method_ids(catalog, payload.method_ids)
    if unresolvable:
        raise HTTPException(status_code=400, detail=f"CUSTOM_WORKFLOW_METHOD_ID_UNRESOLVABLE: {unresolvable!r}")
    now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    try:
        record = custom_workflow_record(str(uuid.uuid4()), session["tenant_id"], payload.title, payload.method_ids, session["identity_id"], now, now)
        return repo.create(record)
    except InvariantViolation as error:
        raise HTTPException(status_code=_domain_error_status(error), detail=str(error)) from error
    except UniqueViolation as error:
        # workflow_id is a fresh uuid4() (line above), so this is only reachable via an
        # astronomically unlikely UUID collision -- caught anyway to match the sibling
        # create_project/create_source convention (critic finding 2026-09-18: a raw 500 here
        # would be surprising to an engineer used to that convention).
        raise HTTPException(status_code=409, detail="CUSTOM_WORKFLOW_ID_COLLISION") from error


@app.get("/workflows/custom")
def list_custom_workflows(
    session: dict[str, Any] = Depends(require_session),
    repo: CustomWorkflowRepository = Depends(get_custom_workflow_repository),
) -> list[dict[str, Any]]:
    return repo.list(session["tenant_id"], session["identity_id"])


@app.get("/workflows/custom/{workflow_id}")
def get_custom_workflow(
    workflow_id: str,
    session: dict[str, Any] = Depends(require_session),
    repo: CustomWorkflowRepository = Depends(get_custom_workflow_repository),
) -> dict[str, Any]:
    workflow = repo.get(session["tenant_id"], workflow_id, session["identity_id"])
    if workflow is None:
        raise HTTPException(status_code=404, detail=f"CUSTOM_WORKFLOW_NOT_FOUND: {workflow_id!r}")
    return workflow


@app.put("/workflows/custom/{workflow_id}")
def update_custom_workflow(
    workflow_id: str,
    payload: CustomWorkflowRequest,
    session: dict[str, Any] = Depends(require_session),
    repo: CustomWorkflowRepository = Depends(get_custom_workflow_repository),
    catalog: MethodCatalog = Depends(get_catalog),
) -> dict[str, Any]:
    if repo.get(session["tenant_id"], workflow_id, session["identity_id"]) is None:
        raise HTTPException(status_code=404, detail=f"CUSTOM_WORKFLOW_NOT_FOUND: {workflow_id!r}")
    unresolvable = _unresolvable_method_ids(catalog, payload.method_ids)
    if unresolvable:
        raise HTTPException(status_code=400, detail=f"CUSTOM_WORKFLOW_METHOD_ID_UNRESOLVABLE: {unresolvable!r}")
    now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    try:
        # Reuses custom_workflow_record purely for its title/method_ids validation+normalization
        # (e.g. title.strip()) -- created_at/updated_at here are throwaway, repo.update keeps the real one.
        validated = custom_workflow_record(workflow_id, session["tenant_id"], payload.title, payload.method_ids, session["identity_id"], now, now)
    except InvariantViolation as error:
        raise HTTPException(status_code=_domain_error_status(error), detail=str(error)) from error
    updated = repo.update(session["tenant_id"], workflow_id, validated["title"], validated["method_ids"], now, session["identity_id"])
    if updated is None:
        raise HTTPException(status_code=404, detail=f"CUSTOM_WORKFLOW_NOT_FOUND: {workflow_id!r}")
    return updated


@app.delete("/workflows/custom/{workflow_id}")
def delete_custom_workflow(
    workflow_id: str,
    session: dict[str, Any] = Depends(require_session),
    repo: CustomWorkflowRepository = Depends(get_custom_workflow_repository),
) -> dict[str, str]:
    if not repo.delete(session["tenant_id"], workflow_id, session["identity_id"]):
        raise HTTPException(status_code=404, detail=f"CUSTOM_WORKFLOW_NOT_FOUND: {workflow_id!r}")
    return {"status": "ok"}


# The platform's block routes (ai_lego/apps/api/blocks/): mounted last, so a block module can import any name above.
from ai_lego.apps.api.blocks import mount as _mount_blocks  # noqa: E402

_mount_blocks(app)
