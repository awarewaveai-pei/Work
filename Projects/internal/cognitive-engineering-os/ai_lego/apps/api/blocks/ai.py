"""A block's AI turn over HTTP (ai_lego/platform/ai_gate.py does the checks and the saving).

    POST /projects/{project_id}/ai/{block}/{action}   {context, doc_id?, base_version?}
    POST /me/ai/{block}/{action}                      the same with no case (only actions the card allows outside one)
    GET  /projects/{project_id}/ai/turns/{turn_id}    a background turn (below), for the person who asked
    GET  /me/ai/turns/{turn_id}

200 {"saved": doc} -- the AI's answer, saved as an AI-authored document;
200 {"handback": why} -- the card's 交還控制 (e.g. under two independent origins): no model call;
200 {"stopped": "crisis", "notice", "resources"} -- a crisis signal: no model call;
403 AI_PERMISSION_DENIED -- the 協作合約 does not grant what the action needs;
422 AI_ANSWER_* / 424 AI_PROVIDER_* / 429 budget -- main.ai_failure_status (never 502: the reason must reach the page).

A background turn (ai_gate.AiAction.background: its longest answer can outrun the 85 s a request may wait): every check above
runs in the request -- a refusal, the crisis stop and the hand-back are answered at once, nothing paid for -- then the model
call and the save run on a thread. The request waits SYNC_WAIT_SECONDS for it: done by then = the same answer as above; else
202 {"turn", "status": "PENDING"}, and GET .../ai/turns/{turn} answers 202 while it runs, then 200 {"saved"} or the failure's
status with its codes only: the record keeps no more (K8, ``_kept``), while a turn answered inside the wait also gives the
asker the rule's reason, as every turn does. The page's sentence is the same either way (lib/errors.ts reads the code). The turn's state is in the record log (CaseDocs.record_turn:
AiTurnStarted, then AiTurnAnswered in the save's transaction, or AiTurnFailed); whether its runner is alive is its run lock
(plan P-k), so a turn that ended with no outcome -- its server restarted, or its outcome could not be written -- answers
503 AI_TURN_RUNNER_LOST, never PENDING forever.
"""

from __future__ import annotations

import hashlib
import logging
import threading
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from ai_lego import PRODUCT_ROOT
from ai_lego.apps.api import main as api
from ai_lego.apps.api.main import _MeteredProvider
from ai_lego.data.events import record_log
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation, case_gone
from ai_lego.platform.ai_gate import AiRefused, Prepared, actions, prepare_ai
from ai_lego.platform.ai_gateway.provider import BACKGROUND_TIMEOUT_SECONDS, AnthropicProvider
from ai_lego.platform.identity.store import IdentityStore
from ai_lego.platform.workflow.run_lock import RunLock, acquire_run_lock, run_lock_state, run_lock_tag

router = APIRouter()
_log = logging.getLogger(__name__)
# How long the request waits for a background turn before answering 202: a turn done by then answers as any other (most
# EXPRESS drafts: 38.6 s on the 2026-10-13 walk). Under provider.DEFAULT_TIMEOUT_SECONDS, so the 202 reaches the page before
# nginx's 90 s (tests/unit/test_ai_turn_background.py).
SYNC_WAIT_SECONDS = 60.0
RUNNER_LOST = "AI_TURN_RUNNER_LOST: the AI stopped and left no outcome (the server restarted, or the outcome could not be written); ask again"
BUDGET = "AI_DAILY_TOKEN_BUDGET_EXCEEDED"


class AiBody(BaseModel):
    context: dict[str, Any] = {}
    doc_id: str | None = None
    base_version: int | None = None


def _status(error: InvariantViolation) -> int:
    if isinstance(error, AiRefused):
        return 403
    text = str(error)
    return api.ai_failure_status(error) or (409 if "STALE" in text or "SINGLETON" in text else 400)


def _refused(error: InvariantViolation) -> HTTPException:
    return HTTPException(status_code=_status(error), detail=str(error))


def _turn(block: str, action_name: str, project_id: str | None, body: AiBody, session: dict[str, Any], repo: ProjectSourceRepository, store: IdentityStore, provider: Any,
          response: Response, cas: TenantScopedCas | None = None) -> dict[str, Any]:
    action = actions().get((block, action_name))
    if action is None:
        raise HTTPException(status_code=404, detail=f"AI_ACTION_UNKNOWN: {block}.{action_name}")
    if project_id is not None:
        api._project_or_404(repo, session, project_id)
    model = api._require_ai(provider, store, session)
    if action.background and isinstance(model, AnthropicProvider):   # a test's provider passes through unchanged
        model = model.with_timeout(BACKGROUND_TIMEOUT_SECONDS)
    metered = _MeteredProvider(model, store, session, f"block:{block}.{action_name}")
    try:
        prepared = prepare_ai(action, tenant_id=session["tenant_id"], identity_id=session["identity_id"], project_id=project_id, context=body.context,
                              docs=CaseDocs(repo), doc_id=body.doc_id, base_version=body.base_version,
                              source_text=repo.active_source_reader(cas, session["tenant_id"], project_id) if project_id and cas is not None else None)
        if isinstance(prepared, dict):   # the crisis stop or the hand-back: no model call
            return prepared
        if not action.background:
            return prepared.answer(metered)
    except InvariantViolation as error:
        raise _refused(error) from error
    return _background(prepared, metered, response)


# -- a background turn ------------------------------------------------------------------------------------------------------

class _Waiter:
    """The launching request's own handle on its turn (never kept past the request): the runner sets it once, last."""

    def __init__(self) -> None:
        self.done = threading.Event()
        self.result: dict[str, Any] | None = None
        self.error: BaseException | None = None


def _lock_path(tenant_id: str, turn_id: str) -> Path:
    """The turn's run lock (plan P-k; one per turn, never deleted -- as an interpretation's)."""
    tenant_key = hashlib.sha256(tenant_id.encode("utf-8")).hexdigest()[:32]
    turn_key = hashlib.sha256(turn_id.encode("utf-8")).hexdigest()[:32]
    return PRODUCT_ROOT / ".runtime" / "ai-turn" / tenant_key / f"{turn_key}.lock"


def _running(tenant_id: str, turn_id: str) -> bool:
    path = _lock_path(tenant_id, turn_id)
    return run_lock_state(path) == "held" and run_lock_tag(path) == turn_id


def _kept(failure: BaseException) -> str:
    """What AiTurnFailed keeps (K8, as SynthesisFailed): the leading codes, never a message that can quote the model or the
    person. A budget refusal is kept whole: its scope and counts are the meter's own, and the page says whose limit it was."""
    text = str(failure)
    return text if isinstance(failure, InvariantViolation) and text.startswith(BUDGET) else api._failure_code(failure, "AI_TURN_FAILED")


def _run_turn(*, prepared: Prepared, provider: Any, turn_id: str, lock: RunLock, waiter: _Waiter) -> None:
    """Background-thread target: the model call and the save (its AiTurnAnswered in the same transaction), or AiTurnFailed --
    written before the lock is let go, so a finished runner with no outcome is one whose outcome could not be written
    (RUNNER_LOST says so). A case or an account erased meanwhile gets nothing written."""
    try:
        try:
            waiter.result = prepared.answer(provider, turn_id=turn_id)
        except Exception as failure:
            waiter.error = failure
            if not isinstance(failure, InvariantViolation):   # a refusal is logged by the gate; anything else here
                _log.exception("AI turn failed: action=%s.%s", prepared.action.block, prepared.action.name)
            status = _status(failure) if isinstance(failure, InvariantViolation) else 500
            try:
                prepared.docs.record_turn(prepared.tenant_id, prepared.owner, turn_id, "AiTurnFailed", {"status": status, "error": _kept(failure)},
                                          record_log.system(prepared.action.block))
            except InvariantViolation as gone:
                if not (case_gone(gone) or str(gone).startswith("IDENTITY_ERASED")):
                    raise
    finally:
        lock.release()
        waiter.done.set()


def _launch_turn(**kwargs: Any) -> None:
    threading.Thread(target=_run_turn, daemon=True, kwargs=kwargs).start()


def _background(prepared: Prepared, provider: Any, response: Response) -> dict[str, Any]:
    tenant_id, action = prepared.tenant_id, prepared.action
    turn_id = str(uuid4())
    lock = acquire_run_lock(_lock_path(tenant_id, turn_id), tag=turn_id)
    if lock is None:   # a fresh id's lock is only ever held by a status probe, for an instant
        raise HTTPException(status_code=409, detail="AI_TURN_IN_FLIGHT: the AI could not start this instant; ask again")
    waiter = _Waiter()
    try:
        prepared.docs.record_turn(tenant_id, prepared.owner, turn_id, "AiTurnStarted", {"block": action.block, "action": action.name},
                                  record_log.user(prepared.identity_id, action.block))
        _launch_turn(prepared=prepared, provider=provider, turn_id=turn_id, lock=lock, waiter=waiter)
    except BaseException as error:
        lock.release()   # the runner never started, so it cannot release
        if isinstance(error, InvariantViolation):
            raise _refused(error) from error
        raise
    if not waiter.done.wait(SYNC_WAIT_SECONDS):
        response.status_code = 202
        return {"turn": turn_id, "status": "PENDING"}
    if waiter.error is None:
        return {} if waiter.result is None else waiter.result   # only an absent result is none (test_absent_is_none)
    if isinstance(waiter.error, InvariantViolation):
        raise _refused(waiter.error) from waiter.error
    raise HTTPException(status_code=500, detail=_kept(waiter.error)) from waiter.error   # the code the record keeps (_run_turn logged it)


def _outcome(records: list[dict[str, Any]]) -> dict[str, Any] | None:
    return next((record for record in records if record["event_type"] in ("AiTurnAnswered", "AiTurnFailed")), None)


def _turn_state(docs: CaseDocs, session: dict[str, Any], owner: record_log.Owner, turn_id: str, response: Response) -> dict[str, Any]:
    """The turn as the POST would have answered it, for the person who asked (anyone else: 404, as a turn that never was)."""
    tenant_id = session["tenant_id"]
    records = docs.turn_records(tenant_id, owner, turn_id)
    started = next((record for record in records if record["event_type"] == "AiTurnStarted"), None)
    if started is None or started["by"] != session["identity_id"]:
        raise HTTPException(status_code=404, detail=f"AI_TURN_NOT_FOUND: {turn_id!r}")
    outcome = _outcome(records)
    if outcome is None:
        if _running(tenant_id, turn_id):
            response.status_code = 202
            return {"turn": turn_id, "status": "PENDING", "since": started["at"]}
        outcome = _outcome(docs.turn_records(tenant_id, owner, turn_id))   # probe first: it may have just finished
        if outcome is None:
            raise HTTPException(status_code=503, detail=RUNNER_LOST)
    said = outcome["payload"]
    if outcome["event_type"] == "AiTurnFailed":
        raise HTTPException(status_code=int(said["status"]), detail=said["error"])
    try:
        saved = next((version for version in docs.versions(tenant_id, owner, said["kind"], said["doc_id"]) if version["version"] == said["version"]), None)
    except InvariantViolation:
        saved = None   # the person deleted it since
    if saved is None:
        raise HTTPException(status_code=404, detail=f"AI_TURN_ANSWER_GONE: the answer {said['doc_id']!r} was deleted")
    return {"saved": saved, "model": said.get("model") or None}


# -- routes ----------------------------------------------------------------------------------------------------------------

@router.post("/projects/{project_id}/ai/{block}/{action_name}")
def case_ai_turn(project_id: str, block: str, action_name: str, body: AiBody, response: Response, session: dict[str, Any] = Depends(api.require_session),
                 repo: ProjectSourceRepository = Depends(api.get_project_source_repository), store: IdentityStore = Depends(api.get_store),
                 provider: Any = Depends(api.get_ai_provider), cas: TenantScopedCas = Depends(api.get_source_cas)) -> dict[str, Any]:
    return _turn(block, action_name, project_id, body, session, repo, store, provider, response, cas)


@router.post("/me/ai/{block}/{action_name}")
def my_ai_turn(block: str, action_name: str, body: AiBody, response: Response, session: dict[str, Any] = Depends(api.require_session),
               repo: ProjectSourceRepository = Depends(api.get_project_source_repository), store: IdentityStore = Depends(api.get_store),
               provider: Any = Depends(api.get_ai_provider)) -> dict[str, Any]:
    return _turn(block, action_name, None, body, session, repo, store, provider, response)


@router.get("/projects/{project_id}/ai/turns/{turn_id}")
def case_turn(project_id: str, turn_id: str, response: Response, session: dict[str, Any] = Depends(api.require_session),
              repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    api._project_or_404(repo, session, project_id)
    return _turn_state(CaseDocs(repo), session, record_log.case(project_id), turn_id, response)


@router.get("/me/ai/turns/{turn_id}")
def my_turn(turn_id: str, response: Response, session: dict[str, Any] = Depends(api.require_session),
            repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    return _turn_state(CaseDocs(repo), session, record_log.person(session["identity_id"]), turn_id, response)
