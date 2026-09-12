"""Cognitive OS Phase 1 API. Run with::

    uvicorn ai_lego.apps.api.main:app --host 127.0.0.1 --port 8420

Endpoints:
    GET  /methods                    -- list every ACTIVE Method Atlas method
    GET  /methods/{method_id}        -- one method's contract descriptor
    POST /auth/login                 -- {tenant_id, email, password} -> session cookie
    POST /auth/logout                -- revoke the caller's session
    POST /methods/{method_id}/invoke -- auth + entitlement required; body = builder kwargs
    GET  /methods/{method_id}/demo   -- auth required; runs the method's existing CLI slice

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
import os
import secrets
import subprocess
import sys
from pathlib import Path
from typing import Any

from fastapi import Cookie, Depends, FastAPI, HTTPException, Response
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


@app.get("/methods")
def list_methods(catalog: MethodCatalog = Depends(get_catalog)) -> list[dict[str, Any]]:
    return [{"method_id": method_id, **{k: v for k, v in entry.items() if k != "content_sha256"}} for method_id, entry in sorted(catalog.contracts.items())]


@app.get("/methods/{method_id}")
def get_method(method_id: str, catalog: MethodCatalog = Depends(get_catalog)) -> dict[str, Any]:
    if not catalog.is_resolvable(method_id):
        raise HTTPException(status_code=404, detail=f"METHOD_RESOLUTION_BLOCKED: no ACTIVE contract for {method_id!r}")
    return catalog.require(method_id)


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
    except MethodDispatchError as error:
        raise HTTPException(status_code=501, detail=f"DISPATCH_UNAVAILABLE: {error}") from error

    record_id = f"{record_id_prefix(method_id)}{secrets.token_hex(8).upper()}"
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
