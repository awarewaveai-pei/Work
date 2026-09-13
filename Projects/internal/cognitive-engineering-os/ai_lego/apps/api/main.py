"""Cognitive OS Phase 1 API. Run with::

    uvicorn ai_lego.apps.api.main:app --host 127.0.0.1 --port 8420

Endpoints:
    GET  /                           -- minimal browser dashboard (login + browse + run demo)
    GET  /methods                    -- list every ACTIVE Method Atlas method
    GET  /methods/{method_id}        -- one method's contract descriptor
    POST /auth/login                 -- {tenant_id, email, password} -> session cookie
    POST /auth/logout                -- revoke the caller's session
    POST /methods/{method_id}/invoke -- auth + entitlement required; body = builder kwargs
    GET  /methods/{method_id}/demo   -- auth required; runs the method's existing CLI slice

``/`` exists so a human has something to click, not just curl -- it only wraps the endpoints
above (same-origin fetch, no separate auth path, no new capability). ``/methods/{id}/invoke``
has no UI form because its request body shape is method-specific (240 different builder
signatures) -- the dashboard's "Run Demo" button uses the argument-free ``/demo`` endpoint
instead, which exists for exactly this reason.

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
import inspect
import os
import secrets
import subprocess
import sys
from pathlib import Path
from typing import Any

from fastapi import Cookie, Depends, FastAPI, HTTPException, Response
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from ai_lego import PRODUCT_ROOT, resolve_spec_root
from ai_lego.apps.api.dispatch import MethodDispatchError, invoke_builder, record_id_prefix, resolve_builder, resolve_gate_runner
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_execution.method_resolver import MethodCatalog
from ai_lego.platform.entitlement.check import check_entitlement
from ai_lego.platform.identity.store import IdentityStore

SESSION_COOKIE = "cognitive_os_session"
DEFAULT_DB_PATH = PRODUCT_ROOT / ".runtime" / "identity.sqlite3"

app = FastAPI(title="Cognitive OS API", version="0.1.0-phase1")


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
};

document.getElementById('logout-btn').onclick = async () => {
  await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
  loggedIn = false;
  document.getElementById('login-box').style.display = 'block';
  document.getElementById('app-box').style.display = 'none';
};

checkStatus();
loadMethods();
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
