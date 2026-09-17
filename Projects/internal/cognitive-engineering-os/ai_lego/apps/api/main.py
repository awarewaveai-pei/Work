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
above (same-origin fetch, no separate auth path, no new capability). ``/methods/{id}/invoke``
has a generic JSON input form generated from the live builder signature; the method contract
and builder remain the authority for domain validation.

Phase 1 scope only -- see ``Projects/internal/cognitive-engineering-os/docs/
COGNITIVE_OS_DEPLOYMENT_BLUEPRINT.md``. No billing, no multi-tenant isolation testing yet
(single tenant), no rate limiting beyond "must be authenticated" (tracked as a Phase 1 build
task, not solved here -- see that blueprint's risk-classification.json entry).

``get_store``/``get_catalog`` are real FastAPI dependencies (``Depends(...)``), not plain
functions called from inside handlers -- this is what lets tests swap in a temp-file store via
``app.dependency_overrides`` without touching the real ``.runtime/identity.sqlite3``. A handler
that called ``get_store()`` directly would silently bypass any override and hit the real DB even
under test, which is exactly the bug this design avoids.
"""

from __future__ import annotations

import datetime
import threading
import hashlib
import inspect
import os
import re
import secrets
import sqlite3
import subprocess
import sys
import uuid
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

from fastapi import Cookie, Depends, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
import yaml

from ai_lego import PRODUCT_ROOT, resolve_spec_root
from ai_lego.apps.api.dispatch import MethodDispatchError, builder_takes_record_id, invoke_builder, invoke_gate_runner, method_binding_issues, record_id_prefix, resolve_builder, resolve_gate_runner
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.support import read_json
from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_execution.method_resolver import MethodCatalog
from ai_lego.platform.ai_execution.capability_resolver import CapabilityCatalog, capability_refs, plan_executability
from ai_lego.platform.entitlement.check import check_entitlement
from ai_lego.platform.ai_gateway.draft import AI_DRAFT_CAPABILITY, MAX_LABELS_PER_REQUEST, AiDraftProviderError, draft_method_kwargs, draft_recipe_source, recipe_draft_plan
from ai_lego.platform.ai_gateway.provider import AiProvider, daily_token_budget, provider_from_env
from ai_lego.platform.identity.store import IdentityStore
from ai_lego.core.domain.project import project_record
from ai_lego.core.domain.source import TEXT_MEDIA_TYPES, source_record
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.core.domain.custom_workflow import custom_workflow_record
from ai_lego.data.repositories.custom_workflow_repository import CustomWorkflowRepository
from ai_lego.platform.workflow.ir import compile_recipe_to_workflow_ir
from ai_lego.platform.workflow.capability_adapters import CapabilityAdapterRegistry
from ai_lego.platform.workflow.journal_protection import CasJournalContextProtector, LocalDevJournalKeyProvider, ResolverJournalKeyProvider
from ai_lego.platform.workflow.executor import execute_workflow_ir, missing_workflow_input_paths
from ai_lego.platform.workflow.workflow_gates import WorkflowGateRegistry
from ai_lego.apps.recipe_runtime import build_method_components, build_registered_capability_adapters, build_registered_workflow_gate_registry, wrap_capability_handlers_with_artifact_persistence
from ai_lego.data.object.json_artifact_store import JsonArtifactStore

SESSION_COOKIE = "cognitive_os_session"
DEFAULT_DB_PATH = PRODUCT_ROOT / ".runtime" / "identity.sqlite3"

app = FastAPI(title="Cognitive OS API", version="0.1.0-phase1")


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


def build_api_capability_adapters(capability_catalog: CapabilityCatalog, capability_ids: list[str]) -> CapabilityAdapterRegistry:
    """Build the API's explicit adapter set once for both plan and run paths."""
    return build_registered_capability_adapters(capability_catalog, capability_ids)


def build_api_workflow_gate_registry() -> WorkflowGateRegistry:
    """Build the explicit API gate set; domain runners are added by stable ref."""
    return build_registered_workflow_gate_registry("ai_lego.apps.api.main")


CONFIGURED_CORS_ORIGINS = configure_cors(app)
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


def workflow_journal_path(tenant_id: str, run_id: str) -> Path:
    """Resolve a journal path internally without exposing the host path to API clients."""
    if not isinstance(tenant_id, str) or not tenant_id or not isinstance(run_id, str) or re.fullmatch(r"[A-Za-z0-9_-]{1,80}", run_id) is None:
        raise InvariantViolation("WORKFLOW_JOURNAL_REFERENCE_INVALID")
    tenant_key = hashlib.sha256(tenant_id.encode("utf-8")).hexdigest()[:32]
    return PRODUCT_ROOT / ".runtime" / "workflows" / tenant_key / f"{run_id}.journal.json"


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


def _load_recipe_journal(session: dict[str, Any], recipe_id: str, run_id: str) -> dict[str, Any]:
    """Load and validate one tenant-scoped journal without exposing its filesystem path."""
    try:
        journal = workflow_journal_path(session["tenant_id"], run_id)
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


def get_store() -> IdentityStore:
    db_path = Path(os.environ.get("COGNITIVE_OS_DB_PATH", DEFAULT_DB_PATH))
    return IdentityStore(db_path)


def get_artifact_store() -> JsonArtifactStore:
    """Tenant-scoped CAS for capability-emitted artifacts (OQ-PROPOSAL-1). Separate CAS root from
    ``workflow-cas`` (journal encryption): different lifecycle, different reader (any authenticated tenant
    request vs. only the journal machinery)."""
    return JsonArtifactStore(TenantScopedCas(PRODUCT_ROOT / ".runtime" / "artifact-cas"))


def get_ai_provider() -> AiProvider | None:
    """``None`` = no key configured; /ai/* answers 503 AI_PROVIDER_UNCONFIGURED. Tests override this dependency."""
    return provider_from_env()


def get_catalog() -> MethodCatalog:
    return MethodCatalog.from_spec_root(resolve_spec_root())


def require_session(cognitive_os_session: str | None = Cookie(default=None), store: IdentityStore = Depends(get_store)) -> dict[str, Any]:
    if cognitive_os_session is None:
        raise HTTPException(status_code=401, detail="AUTH_REQUIRED: no session cookie")
    session = store.resolve_session(cognitive_os_session)
    if session is None:
        raise HTTPException(status_code=401, detail="AUTH_REQUIRED: session invalid or expired")
    return session


class LoginRequest(BaseModel):
    tenant_id: str
    email: str
    password: str


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


def _method_display_metadata() -> dict[str, dict[str, str]]:
    """``method_id -> {name_en, name_zh, blurb_en, blurb_zh}``, read fresh per call -- same
    no-cache convention as ``list_recipes`` below, so dashboard copy edits don't need a restart.
    Deliberately a separate file from each contract's own ``description`` (AI/engineer-facing
    per AGENTS.md §9, not end-user copy) -- see the file's own header for why. Fails open to
    ``{}`` if the file is missing so a browse-copy problem never 500s the method list."""
    path = resolve_spec_root() / "methods" / "registry" / "method-display-metadata.yaml"
    if not path.exists():
        return {}
    document = yaml.safe_load(path.read_text(encoding="utf-8"))
    entries = document.get("entries") if isinstance(document, dict) else None
    return entries if isinstance(entries, dict) else {}


@app.get("/methods")
def list_methods(catalog: MethodCatalog = Depends(get_catalog)) -> list[dict[str, Any]]:
    display = _method_display_metadata()
    return [
        {"method_id": method_id, **{k: v for k, v in entry.items() if k != "content_sha256"}, "display": display.get(method_id)}
        for method_id, entry in sorted(catalog.contracts.items())
    ]


@app.get("/recipes")
def list_recipes() -> list[dict[str, Any]]:
    """List the real validated Recipe files; no hand-maintained registry."""
    recipe_dir = resolve_spec_root() / "recipes" / "validated"
    recipes = []
    for path in sorted(recipe_dir.glob("*.recipe.yaml")):
        recipe = yaml.safe_load(path.read_text(encoding="utf-8"))
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


@app.post("/recipes/{recipe_id}/run")
def run_recipe(
    recipe_id: str,
    body: dict[str, Any],
    session: dict[str, Any] = Depends(require_session),
    catalog: MethodCatalog = Depends(get_catalog),
    store: IdentityStore = Depends(get_store),
    artifact_store: JsonArtifactStore = Depends(get_artifact_store),
) -> dict[str, Any]:
    """Execute a Recipe through the shared durable Workflow runtime.

    ``body`` is ``{"source": {...}, "run_id": "optional", "resume": false}``.
    Bindings in the compiled IR are the only builder arguments; there is no
    positional guessing or fallback to the single-method API.
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
    capability_adapters = build_api_capability_adapters(capability_catalog, resolvable_capability_ids)
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
    run_id = body.get("run_id") or uuid.uuid4().hex
    if not isinstance(run_id, str) or re.fullmatch(r"[A-Za-z0-9_-]{1,80}", run_id) is None:
        raise HTTPException(status_code=400, detail="WORKFLOW_RUN_ID_INVALID: use 1-80 ASCII letters, numbers, '_' or '-'")
    resume = body.get("resume", False)
    if not isinstance(resume, bool):
        raise HTTPException(status_code=400, detail="WORKFLOW_RESUME_INVALID: resume must be boolean")
    journal = workflow_journal_path(session["tenant_id"], run_id)
    journal_ref = workflow_journal_ref(session["tenant_id"], run_id)
    classification = body.get("data_classification", "INTERNAL")
    if classification not in {"PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"}:
        raise HTTPException(status_code=400, detail="WORKFLOW_DATA_CLASSIFICATION_INVALID")
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
    handlers: dict[str, Any] = dict(capability_handlers)
    handlers.update(method_handlers)

    def evaluate_api_workflow_gate(context: dict[str, Any], workflow: dict[str, Any]) -> list[dict[str, Any]]:
        return workflow_gate_registry.evaluate(workflow_gate_refs, context, workflow)

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
) -> dict[str, Any]:
    """Return a tenant-scoped, metadata-only view of one durable Recipe run."""
    record = _load_recipe_journal(session, recipe_id, run_id)
    return {
        "recipe_id": recipe_id,
        "run_id": run_id,
        "journal_ref": workflow_journal_ref(session["tenant_id"], run_id),
        **_journal_run_summary(record),
    }


@app.get("/recipes/{recipe_id}/runs/{run_id}/result")
def recipe_run_result(
    recipe_id: str,
    run_id: str,
    session: dict[str, Any] = Depends(require_session),
) -> dict[str, Any]:
    """Return tenant-scoped durable outputs, restoring protected journal context when needed."""
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
    """Expose a safe, generic input descriptor for the dashboard.

    The descriptor is derived from the live builder signature. It is not a
    substitute for a domain JSON Schema; the invoke endpoint remains the
    authority and validates the actual method contract/gates.
    """
    if not catalog.is_resolvable(method_id):
        raise HTTPException(status_code=404, detail=f"METHOD_RESOLUTION_BLOCKED: no ACTIVE contract for {method_id!r}")
    try:
        builder = resolve_builder(method_id)
    except MethodDispatchError as error:
        raise HTTPException(status_code=501, detail=f"DISPATCH_UNAVAILABLE: {error}") from error
    parameters = []
    for name, parameter in inspect.signature(builder).parameters.items():
        has_default = parameter.default is not inspect.Parameter.empty
        parameters.append(
            {
                "name": name,
                "required": not has_default,
                "default": None if not has_default else parameter.default,
                "annotation": None if parameter.annotation is inspect.Parameter.empty else str(parameter.annotation),
            }
        )
    return {
        "method_id": method_id,
        "contract": catalog.require(method_id),
        "display": _method_display_metadata().get(method_id),
        "parameters": parameters,
        "schema_source": "builder_signature_only",
    }


@app.post("/auth/login")
def login(payload: LoginRequest, response: Response, store: IdentityStore = Depends(get_store)) -> dict[str, str]:
    token = store.authenticate(payload.tenant_id, payload.email, payload.password)
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

    try:
        record = invoke_builder(builder, record_id, provenance, body)
    except InvariantViolation as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    gate_results = gate_runner(record, "api.invoke", datetime.datetime.now(datetime.timezone.utc).isoformat())
    return {"record": record, "gate_results": gate_results}


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


_AI_BUDGET_LOCKS: dict[str, threading.Lock] = {}
_AI_BUDGET_LOCKS_GUARD = threading.Lock()


def _ai_budget_lock_for(tenant_id: str) -> threading.Lock:
    """One lock per tenant, created on first use. Serializing a tenant's OWN AI-draft requests end to end
    (check budget -> call provider -> record usage) is what actually closes the TOCTOU race a plain
    check-then-later-record sequence has: two concurrent requests for the SAME tenant would otherwise both
    read the same pre-call usage total and both pass the check before either commits (critic finding,
    2026-09-17). Different tenants never contend for the same lock. SCOPE: this closes the race for exactly
    the deployment Phase 1 actually runs (``uvicorn`` with no ``--workers``, one process -- see Dockerfile
    CMD) -- a future multi-process/multi-instance deployment would need a DB-level reservation instead of an
    in-process lock; not attempted here (Phase 2 concern, tracked, not silently assumed away)."""
    with _AI_BUDGET_LOCKS_GUARD:
        lock = _AI_BUDGET_LOCKS.get(tenant_id)
        if lock is None:
            lock = threading.Lock()
            _AI_BUDGET_LOCKS[tenant_id] = lock
        return lock


def _today_utc_start_iso() -> str:
    now = datetime.datetime.now(datetime.timezone.utc)
    return now.strftime("%Y-%m-%dT00:00:00Z")


def _require_ai(provider: AiProvider | None, store: IdentityStore, session: dict[str, Any]) -> AiProvider:
    if provider is None:
        raise HTTPException(status_code=503, detail="AI_PROVIDER_UNCONFIGURED: set COGNITIVE_OS_ANTHROPIC_API_KEY (deploy/.env) to enable AI drafting")
    if not check_entitlement(store, session["tenant_id"], AI_DRAFT_CAPABILITY):
        raise HTTPException(status_code=403, detail=f"ENTITLEMENT_DENIED: tenant {session['tenant_id']!r} may not invoke {AI_DRAFT_CAPABILITY!r}")
    try:
        budget = daily_token_budget()
    except InvariantViolation as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    used = store.ai_usage_totals(session["tenant_id"], since=_today_utc_start_iso())
    used_tokens = used["input_tokens"] + used["output_tokens"]
    if used_tokens >= budget:
        raise HTTPException(status_code=429, detail=f"AI_DAILY_TOKEN_BUDGET_EXCEEDED: {used_tokens}/{budget} tokens used today (UTC); resets at midnight UTC")
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
    used_today = store.ai_usage_totals(session["tenant_id"], since=_today_utc_start_iso())
    return {
        "configured": provider is not None,
        "model": provider.model if provider else None,
        "usage": store.ai_usage_totals(session["tenant_id"]),
        "budget": {
            "daily_limit": budget,
            "used_today": used_today["input_tokens"] + used_today["output_tokens"],
            "remaining_today": None if budget is None else max(0, budget - used_today["input_tokens"] - used_today["output_tokens"]),
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
    with _ai_budget_lock_for(session["tenant_id"]):
        active = _require_ai(provider, store, session)
        try:
            result = draft_method_kwargs(method_id, payload.brief, provider=active, spec_root=resolve_spec_root(), catalog=catalog)
        except AiDraftProviderError as error:
            store.record_ai_usage(session["tenant_id"], session["identity_id"], f"draft:{method_id}", active.model, error.input_tokens, error.output_tokens)
            raise HTTPException(status_code=502, detail=str(error)) from error
        except InvariantViolation as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        store.record_ai_usage(session["tenant_id"], session["identity_id"], f"draft:{method_id}", result.model, result.input_tokens, result.output_tokens)
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
    with _ai_budget_lock_for(session["tenant_id"]):
        active = _require_ai(provider, store, session)
        try:
            result = draft_recipe_source(recipe_id, payload.brief, provider=active, spec_root=resolve_spec_root(), catalog=catalog, labels=payload.labels, source=payload.source)
        except AiDraftProviderError as error:
            store.record_ai_usage(session["tenant_id"], session["identity_id"], f"draft-recipe:{recipe_id}", active.model, error.input_tokens, error.output_tokens)
            raise HTTPException(status_code=502, detail=str(error)) from error
        except InvariantViolation as error:
            code = str(error)
            if "RECIPE_NOT_FOUND" in code or "RECIPE_ID_MISMATCH" in code:
                raise HTTPException(status_code=404, detail=code) from error
            raise HTTPException(status_code=400, detail=code) from error
        store.record_ai_usage(session["tenant_id"], session["identity_id"], f"draft-recipe:{recipe_id}", result["model"], result["usage"]["input_tokens"], result["usage"]["output_tokens"])
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


def get_project_source_repository() -> ProjectSourceRepository:
    return ProjectSourceRepository(PRODUCT_ROOT / ".runtime" / "projects.sqlite3")


def get_custom_workflow_repository() -> CustomWorkflowRepository:
    """Own SQLite file, not ``projects.sqlite3`` -- a Custom Workflow is an ordered list of
    method_ids the tenant picked, not a Project/Source aggregate; see
    ``ai_lego/core/domain/custom_workflow.py`` for the full separation rationale."""
    return CustomWorkflowRepository(PRODUCT_ROOT / ".runtime" / "custom_workflows.sqlite3")


def get_source_cas() -> TenantScopedCas:
    """Separate CAS root from ``artifact-cas`` (capability-emitted artifacts) and ``workflow-cas`` (journal
    encryption): Source content has its own lifecycle (a Project's raw intake material, not a workflow
    byproduct) and its own reader (any project member, not only the journal machinery)."""
    return TenantScopedCas(PRODUCT_ROOT / ".runtime" / "source-cas")


def _project_or_404(repo: ProjectSourceRepository, tenant_id: str, project_id: str) -> dict[str, Any]:
    project = repo.get_project(tenant_id, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail=f"PROJECT_NOT_FOUND: {project_id!r}")
    return project


def _domain_error_status(error: InvariantViolation) -> int:
    return 404 if "NOT_FOUND" in str(error) else 400


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
    except sqlite3.IntegrityError as error:
        # platform_projects has UNIQUE(tenant_id, workspace_id, name) -- a double-submit or client retry
        # after a timeout hits this, not a programming error; answer a clean 409, not a raw 500.
        raise HTTPException(status_code=409, detail=f"PROJECT_NAME_ALREADY_EXISTS_IN_WORKSPACE: {payload.name!r}") from error


@app.get("/projects")
def list_projects(
    workspace_id: str | None = None,
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
) -> list[dict[str, Any]]:
    return repo.list_projects(session["tenant_id"], workspace_id)


@app.get("/projects/{project_id}")
def get_project(
    project_id: str,
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
) -> dict[str, Any]:
    return _project_or_404(repo, session["tenant_id"], project_id)


@app.get("/projects/{project_id}/history")
def project_history(
    project_id: str,
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
) -> list[dict[str, Any]]:
    """Phase 1's Versioning primitive: the append-only event log for this Project's own aggregate id."""
    _project_or_404(repo, session["tenant_id"], project_id)
    return repo.list_events(session["tenant_id"], f"project:{project_id}")


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
    project = _project_or_404(repo, session["tenant_id"], project_id)
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
    cas_path = source_cas.put(session["tenant_id"], content_bytes)
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
        )
        return repo.add_source(record, cas_path)
    except InvariantViolation as error:
        raise HTTPException(status_code=_domain_error_status(error), detail=str(error)) from error


@app.get("/projects/{project_id}/sources")
def list_sources(
    project_id: str,
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
) -> list[dict[str, Any]]:
    _project_or_404(repo, session["tenant_id"], project_id)
    return repo.list_sources(session["tenant_id"], project_id)


@app.get("/projects/{project_id}/sources/{source_id}")
def get_source(
    project_id: str,
    source_id: str,
    session: dict[str, Any] = Depends(require_session),
    repo: ProjectSourceRepository = Depends(get_project_source_repository),
) -> dict[str, Any]:
    _project_or_404(repo, session["tenant_id"], project_id)
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
    _project_or_404(repo, session["tenant_id"], project_id)
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
    _project_or_404(repo, session["tenant_id"], project_id)
    if repo.get_source(session["tenant_id"], project_id, source_id) is None:
        raise HTTPException(status_code=404, detail=f"SOURCE_NOT_FOUND: {source_id!r}")
    return repo.list_events(session["tenant_id"], f"source:{source_id}")


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
    except InvariantViolation as error:
        raise HTTPException(status_code=_domain_error_status(error), detail=str(error)) from error
    return repo.create(record)


@app.get("/workflows/custom")
def list_custom_workflows(
    session: dict[str, Any] = Depends(require_session),
    repo: CustomWorkflowRepository = Depends(get_custom_workflow_repository),
) -> list[dict[str, Any]]:
    return repo.list(session["tenant_id"])


@app.get("/workflows/custom/{workflow_id}")
def get_custom_workflow(
    workflow_id: str,
    session: dict[str, Any] = Depends(require_session),
    repo: CustomWorkflowRepository = Depends(get_custom_workflow_repository),
) -> dict[str, Any]:
    workflow = repo.get(session["tenant_id"], workflow_id)
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
    if repo.get(session["tenant_id"], workflow_id) is None:
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
    updated = repo.update(session["tenant_id"], workflow_id, validated["title"], validated["method_ids"], now)
    if updated is None:
        raise HTTPException(status_code=404, detail=f"CUSTOM_WORKFLOW_NOT_FOUND: {workflow_id!r}")
    return updated


@app.delete("/workflows/custom/{workflow_id}")
def delete_custom_workflow(
    workflow_id: str,
    session: dict[str, Any] = Depends(require_session),
    repo: CustomWorkflowRepository = Depends(get_custom_workflow_repository),
) -> dict[str, str]:
    if not repo.delete(session["tenant_id"], workflow_id):
        raise HTTPException(status_code=404, detail=f"CUSTOM_WORKFLOW_NOT_FOUND: {workflow_id!r}")
    return {"status": "ok"}
