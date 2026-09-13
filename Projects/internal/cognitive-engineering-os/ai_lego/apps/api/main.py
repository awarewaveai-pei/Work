"""Cognitive OS Phase 1 API. Run with::

    uvicorn ai_lego.apps.api.main:app --host 127.0.0.1 --port 8420

Endpoints:
    GET  /                           -- minimal browser dashboard (login + browse + run demo)
    GET  /methods                    -- list every ACTIVE Method Atlas method
    GET  /methods/{method_id}        -- one method's contract descriptor
    GET  /recipes                    -- list ACTIVE validated Recipes
    GET  /recipes/{recipe_id}/plan   -- compile and resolve one Recipe
    POST /recipes/{recipe_id}/run    -- auth + entitlement + registered adapters
    POST /auth/login                 -- {tenant_id, email, password} -> session cookie
    POST /auth/logout                -- revoke the caller's session
    POST /methods/{method_id}/invoke -- auth + entitlement required; body = builder kwargs
    GET  /methods/{method_id}/demo   -- auth required; runs the method's existing CLI slice

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
import hashlib
import inspect
import os
import re
import secrets
import subprocess
import sys
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from fastapi import Cookie, Depends, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
import yaml

from ai_lego import PRODUCT_ROOT, resolve_spec_root
from ai_lego.apps.api.dispatch import MethodDispatchError, invoke_builder, invoke_gate_runner, record_id_prefix, resolve_builder, resolve_gate_runner
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.evidence_triangulation import offline_literature_search
from ai_lego.platform.ai_execution.method_resolver import MethodCatalog
from ai_lego.platform.ai_execution.capability_resolver import CapabilityCatalog, capability_refs, plan_executability
from ai_lego.platform.entitlement.check import check_entitlement
from ai_lego.platform.identity.store import IdentityStore
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.platform.workflow.ir import compile_recipe_to_workflow_ir
from ai_lego.platform.workflow.capability_adapters import CapabilityAdapterRegistry
from ai_lego.platform.workflow.journal_protection import CasJournalContextProtector, LocalDevJournalKeyProvider
from ai_lego.platform.workflow.executor import execute_workflow_ir

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
    adapters = CapabilityAdapterRegistry(capability_catalog)
    # Only the deterministic, local, read-only literature fixture is exposed here.
    # External providers need their own egress, freshness and policy adapter.
    if "literature_search" in capability_ids:
        adapters.register("literature_search", offline_literature_search)
    return adapters


CONFIGURED_CORS_ORIGINS = configure_cors(app)


def _api_journal_context(context: dict[str, Any]) -> dict[str, Any]:
    """Persist checkpoint state without embedding the request's raw ``source`` object."""
    return {"steps": context.get("steps", {}), "outputs": context.get("outputs", {})}


def build_api_journal_protector(tenant_id: str, run_id: str) -> CasJournalContextProtector | None:
    """Build only the explicitly opted-in local-dev protector; production KMS is a later adapter."""
    mode = os.environ.get("COGNITIVE_OS_JOURNAL_KEY_MODE", "disabled")
    if mode == "disabled":
        return None
    if mode != "local-dev":
        raise InvariantViolation("WORKFLOW_JOURNAL_KEY_MODE_UNSUPPORTED: production requires a KMS provider")
    tenant_namespace = hashlib.sha256(tenant_id.encode("utf-8")).hexdigest()[:32]
    key = LocalDevJournalKeyProvider().key_for(tenant_namespace, "workflow-journal")
    return CasJournalContextProtector(
        TenantScopedCas(PRODUCT_ROOT / ".runtime" / "workflow-cas"),
        tenant_namespace,
        run_id,
        key,
        projector=_api_journal_context,
    )


def get_store() -> IdentityStore:
    db_path = Path(os.environ.get("COGNITIVE_OS_DB_PATH", DEFAULT_DB_PATH))
    return IdentityStore(db_path)


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


_DASHBOARD_HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Cognitive OS -- Phase 1</title>
<style>
  body { font-family: -apple-system, Segoe UI, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
  h1 { font-size: 1.3rem; }
  #login-box, #app-box { border: 1px solid #ddd; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
  input { display: block; width: 100%; box-sizing: border-box; margin: 0.3rem 0 0.8rem; padding: 0.4rem; }
  button { padding: 0.4rem 0.9rem; cursor: pointer; }
  #status { font-size: 0.85rem; color: #666; margin-bottom: 0.8rem; }
  #search { margin-bottom: 0.6rem; }
  .method-row { border-bottom: 1px solid #eee; padding: 0.5rem 0; display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
  .method-meta { flex: 1; min-width: 0; }
  .method-id { font-family: monospace; font-size: 0.9rem; font-weight: 600; }
  .family-tag { display: inline-block; font-size: 0.7rem; background: #eef; color: #335; border-radius: 4px; padding: 1px 6px; margin-left: 6px; }
  #result { white-space: pre-wrap; font-family: monospace; font-size: 0.8rem; background: #111; color: #0f0; padding: 1rem; border-radius: 6px; max-height: 400px; overflow: auto; }
  .error { color: #c00; }
</style>
</head>
<body>
<h1>Cognitive OS -- Phase 1</h1>
<div id="status">checking session...</div>

<div id="login-box">
  <label>Tenant ID <input id="tenant_id"></label>
  <label>Email <input id="email" type="email"></label>
  <label>Password <input id="password" type="password"></label>
  <button id="login-btn">Log in</button>
  <span id="login-error" class="error"></span>
</div>

<div id="app-box" style="display:none">
  <button id="logout-btn">Log out</button>
  <input id="search" placeholder="Filter methods by id (e.g. foresight, cross_impact_analysis)...">
  <div id="method-list"></div>
  <h2>Recipes</h2>
  <div id="recipe-list"></div>
  <textarea id="recipe-json" rows="10" style="width:100%; box-sizing:border-box; margin:0.6rem 0; font-family:monospace" placeholder='{"problem": ..., "swot": ..., "decision": ...}'>{}</textarea>
  <div id="invoke-box" style="display:none; border-top:1px solid #ddd; margin-top:1rem; padding-top:1rem">
    <div id="invoke-method" class="method-id"></div>
    <div id="invoke-help" class="method-meta"></div>
    <textarea id="invoke-json" rows="12" style="width:100%; box-sizing:border-box; margin:0.6rem 0; font-family:monospace">{}</textarea>
    <button id="invoke-btn">Run with JSON</button>
  </div>
</div>

<h3>Result</h3>
<div id="result">(nothing run yet)</div>

<script>
let methods = [];
let loggedIn = false;

async function checkStatus() {
  const r = await fetch('/methods', { credentials: 'same-origin' });
  document.getElementById('status').textContent = r.ok ? 'API reachable, ' + (await r.clone().json()).length + ' methods available' : 'API unreachable';
}

async function loadMethods() {
  const r = await fetch('/methods', { credentials: 'same-origin' });
  methods = await r.json();
  renderMethods();
}

function renderMethods() {
  // /methods only returns {method_id, path, status, version, content_sha256} -- there is no
  // separate title/family field in the catalog, so nothing here reads one. All text nodes use
  // textContent (never innerHTML) because method_id is free text from a YAML `id` field with no
  // format enforcement (ai_lego/platform/ai_execution/contract_catalog.py scan_contract_files) --
  // treat it as untrusted even though today's ~249 contract files are all team-authored.
  const q = document.getElementById('search').value.toLowerCase();
  const list = document.getElementById('method-list');
  while (list.firstChild) list.removeChild(list.firstChild);
  methods
    .filter(m => !q || m.method_id.toLowerCase().includes(q))
    .forEach(m => {
      const row = document.createElement('div');
      row.className = 'method-row';

      const meta = document.createElement('div');
      meta.className = 'method-meta';
      const idLine = document.createElement('span');
      idLine.className = 'method-id';
      idLine.textContent = m.method_id;
      meta.appendChild(idLine);
      const family = m.method_id.includes('.') ? m.method_id.split('.')[0] : '';
      if (family) {
        const tag = document.createElement('span');
        tag.className = 'family-tag';
        tag.textContent = family;
        meta.appendChild(tag);
      }
      row.appendChild(meta);

      const btn = document.createElement('button');
      btn.textContent = 'Run Demo';
      btn.disabled = !loggedIn;
      btn.onclick = () => runDemo(m.method_id);
      const formBtn = document.createElement('button');
      formBtn.textContent = 'Open Input';
      formBtn.disabled = !loggedIn;
      formBtn.onclick = () => openForm(m.method_id);
      const actions = document.createElement('div');
      actions.appendChild(btn);
      actions.appendChild(formBtn);
      row.appendChild(actions);
      list.appendChild(row);
    });
}

async function loadRecipes() {
  const r = await fetch('/recipes', { credentials: 'same-origin' });
  if (!r.ok) return;
  const recipes = await r.json();
  const list = document.getElementById('recipe-list');
  while (list.firstChild) list.removeChild(list.firstChild);
  recipes.forEach(recipe => {
    const row = document.createElement('div');
    row.className = 'method-row';
    const label = document.createElement('span');
    label.className = 'method-id';
    label.textContent = recipe.recipe_id + ' (' + recipe.step_count + ' steps)';
    row.appendChild(label);
    const button = document.createElement('button');
    button.textContent = 'Run Recipe';
    button.disabled = !loggedIn;
    button.onclick = () => runRecipe(recipe.recipe_id);
    row.appendChild(button);
    list.appendChild(row);
  });
}

async function runDemo(methodId) {
  document.getElementById('result').textContent = 'running ' + methodId + ' ...';
  const r = await fetch(`/methods/${encodeURIComponent(methodId)}/demo`, { credentials: 'same-origin' });
  const body = await r.json();
  document.getElementById('result').textContent = JSON.stringify(body, null, 2);
}

async function openForm(methodId) {
  const r = await fetch(`/methods/${encodeURIComponent(methodId)}/form`, { credentials: 'same-origin' });
  const body = await r.json();
  if (!r.ok) { document.getElementById('result').textContent = JSON.stringify(body, null, 2); return; }
  document.getElementById('invoke-box').style.display = 'block';
  document.getElementById('invoke-method').textContent = methodId;
  document.getElementById('invoke-help').textContent = 'Required/optional parameters: ' + body.parameters.map(p => p.name + (p.required ? ' (required)' : ' (optional)')).join(', ') + '. Values must be valid JSON.';
  document.getElementById('invoke-json').value = '{}';
  document.getElementById('invoke-btn').onclick = () => runLive(methodId);
}

async function runLive(methodId) {
  let body;
  try { body = JSON.parse(document.getElementById('invoke-json').value); }
  catch (error) { document.getElementById('result').textContent = 'Invalid JSON: ' + error.message; return; }
  document.getElementById('result').textContent = 'invoking ' + methodId + ' ...';
  const r = await fetch(`/methods/${encodeURIComponent(methodId)}/invoke`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  document.getElementById('result').textContent = JSON.stringify(await r.json(), null, 2);
}

async function runRecipe(recipeId) {
  let source;
  try { source = JSON.parse(document.getElementById('recipe-json').value); }
  catch (error) { document.getElementById('result').textContent = 'Invalid JSON: ' + error.message; return; }
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    document.getElementById('result').textContent = 'Recipe source must be a JSON object';
    return;
  }
  document.getElementById('result').textContent = 'running recipe ' + recipeId + ' ...';
  const r = await fetch(`/recipes/${encodeURIComponent(recipeId)}/run`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source }) });
  document.getElementById('result').textContent = JSON.stringify(await r.json(), null, 2);
}

document.getElementById('search').addEventListener('input', renderMethods);

document.getElementById('login-btn').onclick = async () => {
  document.getElementById('login-error').textContent = '';
  const r = await fetch('/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenant_id: document.getElementById('tenant_id').value,
      email: document.getElementById('email').value,
      password: document.getElementById('password').value,
    }),
  });
  if (!r.ok) {
    document.getElementById('login-error').textContent = (await r.json()).detail || 'login failed';
    return;
  }
  loggedIn = true;
  document.getElementById('login-box').style.display = 'none';
  document.getElementById('app-box').style.display = 'block';
  renderMethods();
  loadRecipes();
};

document.getElementById('logout-btn').onclick = async () => {
  await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
  loggedIn = false;
  document.getElementById('login-box').style.display = 'block';
  document.getElementById('app-box').style.display = 'none';
};

checkStatus();
loadMethods();
loadRecipes();
</script>
</body>
</html>"""


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


@app.get("/methods")
def list_methods(catalog: MethodCatalog = Depends(get_catalog)) -> list[dict[str, Any]]:
    return [{"method_id": method_id, **{k: v for k, v in entry.items() if k != "content_sha256"}} for method_id, entry in sorted(catalog.contracts.items())]


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
    capability_catalog = CapabilityCatalog.from_spec_root(resolve_spec_root())
    capability_resolution = capability_catalog.resolve(capability_refs(workflow_ir))
    executability = plan_executability(workflow_ir, capability_resolution)
    capability_ids = capability_refs(workflow_ir)
    capability_adapters = build_api_capability_adapters(capability_catalog, capability_ids)
    adapter_readiness = capability_adapters.availability(capability_ids)
    adapter_blocking = [
        {"ref": node["ref"], "label": node.get("label"), "necessity": node.get("necessity", "RECOMMENDED")}
        for node in workflow_ir["nodes"]
        if node.get("node_kind") == "capability"
        and node["ref"] in adapter_readiness["missing"]
        and str(node.get("necessity", "RECOMMENDED")).startswith("REQUIRED_")
    ]
    adapter_ready = not adapter_blocking
    method_ready = method_resolution["blocked"] is None
    return {
        "recipe_id": recipe_id,
        "workflow_ir": workflow_ir,
        "method_resolution": method_resolution,
        "capability_resolution": capability_resolution,
        "plan_executability": executability,
        "adapter_readiness": {**adapter_readiness, "blocking": adapter_blocking, "ready": adapter_ready},
        "status": "READY" if method_ready and executability["executable"] and adapter_ready else "BLOCKED",
    }


@app.post("/recipes/{recipe_id}/run")
def run_recipe(
    recipe_id: str,
    body: dict[str, Any],
    session: dict[str, Any] = Depends(require_session),
    catalog: MethodCatalog = Depends(get_catalog),
    store: IdentityStore = Depends(get_store),
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
    method_resolution = catalog.resolve(method_ids)
    if method_resolution["blocked"] is not None:
        raise HTTPException(status_code=409, detail=method_resolution["blocked"])
    capability_catalog = CapabilityCatalog.from_spec_root(resolve_spec_root())
    capability_resolution = capability_catalog.resolve(capability_ids)
    if capability_resolution["blocked"] is not None:
        raise HTTPException(status_code=409, detail=capability_resolution["blocked"])
    capability_adapters = build_api_capability_adapters(capability_catalog, capability_ids)
    try:
        capability_handlers = capability_adapters.handlers_for(capability_ids)
    except InvariantViolation as error:
        raise HTTPException(status_code=501, detail=str(error)) from error
    for ref in [*method_ids, *capability_ids]:
        if not check_entitlement(store, session["tenant_id"], ref):
            raise HTTPException(status_code=403, detail=f"ENTITLEMENT_DENIED: tenant {session['tenant_id']!r} may not invoke {ref!r}")
    source = body.get("source")
    if not isinstance(source, dict):
        raise HTTPException(status_code=400, detail="WORKFLOW_SOURCE_REQUIRED: body.source must be a JSON object")
    run_id = body.get("run_id") or uuid.uuid4().hex
    if not isinstance(run_id, str) or re.fullmatch(r"[A-Za-z0-9_-]{1,80}", run_id) is None:
        raise HTTPException(status_code=400, detail="WORKFLOW_RUN_ID_INVALID: use 1-80 ASCII letters, numbers, '_' or '-'")
    resume = body.get("resume", False)
    if not isinstance(resume, bool):
        raise HTTPException(status_code=400, detail="WORKFLOW_RESUME_INVALID: resume must be boolean")
    tenant_key = hashlib.sha256(session["tenant_id"].encode("utf-8")).hexdigest()[:32]  # stable opaque namespace; tenant identity never enters a path
    journal = PRODUCT_ROOT / ".runtime" / "workflows" / tenant_key / f"{run_id}.journal.json"
    classification = body.get("data_classification", "INTERNAL")
    if classification not in {"PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"}:
        raise HTTPException(status_code=400, detail="WORKFLOW_DATA_CLASSIFICATION_INVALID")
    try:
        journal_protector = build_api_journal_protector(session["tenant_id"], run_id)
    except InvariantViolation as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    if classification in {"CONFIDENTIAL", "RESTRICTED"} and journal_protector is None:
        raise HTTPException(status_code=503, detail="WORKFLOW_JOURNAL_PROTECTION_REQUIRED: confidential/restricted source requires an encrypted journal provider")

    handlers: dict[str, Any] = dict(capability_handlers)
    for method_id in method_ids:
        try:
            builder = resolve_builder(method_id)
            gate_runner = resolve_gate_runner(method_id)
        except MethodDispatchError as error:
            raise HTTPException(status_code=501, detail=f"DISPATCH_UNAVAILABLE: {error}") from error

        def handler(payload: dict[str, Any], _node: dict[str, Any], _builder=builder) -> dict[str, Any]:
            bindings = payload.get("__bindings__")
            if not isinstance(bindings, dict):
                raise InvariantViolation("WORKFLOW_BINDINGS_REQUIRED: executor did not expose bindings")
            return invoke_builder(_builder, "", make_provenance("AI_INFERENCE", "AI_GENERATED"), bindings)

        handlers[method_id] = handler
    result = execute_workflow_ir(
        workflow_ir,
        {"source": source},
        handlers,
        catalogs={"method": catalog, "capability": capability_catalog},
        journal_path=journal,
        resume=resume,
        journal_context_projector=None if journal_protector is not None else _api_journal_context,
        journal_context_protector=journal_protector,
    )
    if result.status != "SUCCEEDED":
        return {"status": "FAILED", "run_id": run_id, "workflow": result.as_dict(), "journal": str(journal), "method_resolution": method_resolution, "capability_resolution": capability_resolution}
    gates: dict[str, list[dict[str, Any]]] = {}
    for index, node in enumerate(nodes):
        if node["node_kind"] != "method":
            continue
        output = result.context["steps"][str(index)]
        try:
            gates[str(index)] = invoke_gate_runner(
                resolve_gate_runner(node["method_id"]),
                output,
                result.context,
                "api.recipe",
                datetime.datetime.now(datetime.timezone.utc).isoformat(),
            )
        except (InvariantViolation, MethodDispatchError) as error:
            raise HTTPException(status_code=422, detail=f"WORKFLOW_GATE_EVALUATION_FAILED: {error}") from error
    passed = all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for step_gates in gates.values() for gate in step_gates)
    return {"status": "PASS" if passed else "GATE_FAILED", "run_id": run_id, "workflow": result.as_dict(), "gates": gates, "journal": str(journal), "method_resolution": method_resolution, "capability_resolution": capability_resolution}


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
    return {"method_id": method_id, "contract": catalog.require(method_id), "parameters": parameters, "schema_source": "builder_signature_only"}


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
        record_id = f"{record_id_prefix(method_id)}{secrets.token_hex(8).upper()}"
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
