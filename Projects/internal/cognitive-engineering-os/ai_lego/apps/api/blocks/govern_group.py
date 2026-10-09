"""GOVERN's consents over HTTP (docs/platform/STEP34_SHARED_RULES.md §6, card 13): the person decides, item by item, which
documents of their own cases another may read. Nothing is shared by default. Read through platform/visibility.py
``shared_with`` only. Every save goes through the person's save path (blocks/docs.py ``_save``): GOVERN's check on a
consent is its BEFORE_SAVE hook (platform/block_hooks/govern_group.py), run inside the save's lock.

    GET  /me/consents                                   the person's consents (current version of each)
    POST /me/consents  {purpose, target, items, follow_versions, doc_id?, base_version?}   a new consent, or its next version
    POST /me/consents/{doc_id}/withdraw                 a new version, withdrawn: shares nothing from the next read on

Appeals (§9, card 30), read only through platform/visibility.py ``appeals_for`` (the writer masked unless named):
    POST   /me/appeals  {group_id, about_identity_id, text, named=false}   a participant's, about a facilitator of that group
    GET    /me/appeals                     mine          GET /me/appeals/export   mine, as a file
    DELETE /me/appeals/{doc_id}            mine, also after leaving the group
    GET    /govern/appeals[/{doc_id}]      what appeals_for gives a handler or supervisor; anyone else gets [] / the 404

不留紀錄 and the case's audit line (card 32):
    GET  /blocks/govern/spec                 the words the page shows before the person chooses 不留紀錄
    POST /projects/{id}/govern/close         closing a 不留紀錄 case erases it whole (the case erasure; no tombstone)
    GET  /projects/{id}/govern/used          which model and instructions each AI turn used, and every ruleset stamped on the
                                             case's records -- names, versions and fingerprints only, never what the records say

The process indicators (card 70, platform/indicators.py): presence facts about how a judgment was made, never a grade:
    GET  /projects/{id}/indicators           the case's owner only: its own records
    GET  /groups/{id}/indicators             a current member only (the missing group's 404 otherwise): the group's records as
                                             platform/visibility.py gives them to this member, so a round they have not unlocked is not in it
"""

from __future__ import annotations

from typing import Any

import json
import re

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from ai_lego.apps.api import main as api
from ai_lego.apps.api.blocks.docs import DocBody, _call, _save, _saved, case_owner
from ai_lego.apps.api.blocks.groups import member_group, not_found
from ai_lego.core.domain import doc_kinds
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation, group_gone
from ai_lego.platform import evidence, indicators, visibility
from ai_lego.data.object.json_artifact_store import JsonArtifactStore
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.platform import resources
from ai_lego.platform.block_hooks.assembler import proposals
from ai_lego.platform.identity.store import IdentityStore
from ai_lego.platform.rulesets import rulesets
from ai_lego.platform.visibility import Viewer

router = APIRouter()
KIND = "govern.consent"


def _mine(session: dict[str, Any]) -> record_log.Owner:
    return record_log.person(session["identity_id"])


class ConsentBody(BaseModel):
    purpose: str
    target: str
    items: list[dict[str, Any]] = []
    follow_versions: bool = True
    doc_id: str | None = None
    base_version: int | None = None


@router.get("/me/consents")
def my_consents(session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> list[dict[str, Any]]:
    return CaseDocs(repo).current(session["tenant_id"], _mine(session), KIND)


@router.post("/me/consents")
def save_consent(body: ConsentBody, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    """The person themselves writes it (the session's own person record); a consent made again after a withdrawal is its
    next version, not withdrawn."""
    content = {"purpose": body.purpose, "target": body.target, "items": body.items, "follow_versions": body.follow_versions, "withdrawn": False}
    return _save(repo, session, _mine(session), doc_kinds.require(KIND), DocBody(content=content, base_version=body.base_version), body.doc_id)


@router.post("/me/consents/{doc_id}/withdraw")
def withdraw_consent(doc_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    current = next((doc for doc in CaseDocs(repo).current(session["tenant_id"], _mine(session), KIND) if doc["doc_id"] == doc_id), None)
    if current is None:
        raise HTTPException(status_code=404, detail=f"CONSENT_NOT_FOUND: {doc_id!r}")
    body = DocBody(content={**current["content"], "withdrawn": True}, base_version=current["version"])
    return _save(repo, session, _mine(session), doc_kinds.require(KIND), body, doc_id)


# -- Appeals --------------------------------------------------------------------------------------------------------

APPEAL_NOT_FOUND = "APPEAL_NOT_FOUND"   # one answer for missing, not yours and not readable: an appeal's existence is not disclosed


class AppealBody(BaseModel):
    group_id: str
    about_identity_id: str
    text: str
    named: bool = False


def _appeals(session: dict[str, Any], repo: ProjectSourceRepository, store: IdentityStore) -> list[dict[str, Any]]:
    return visibility.appeals_for(CaseDocs(repo), store, Viewer(session["tenant_id"], session["identity_id"]))


@router.post("/me/appeals")
def make_appeal(body: AppealBody, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    """Only a current participant of the group, about a current facilitator of it; otherwise the group's own 404 (G2)."""
    tenant_id = session["tenant_id"]
    mine = repo.get_group_for(tenant_id, body.group_id, session["identity_id"])
    about = repo.get_group_for(tenant_id, body.group_id, body.about_identity_id)
    if mine is None or mine["my_role"] != "participant" or about is None or about["my_role"] != "facilitator":
        raise HTTPException(status_code=404, detail=f"GROUP_NOT_FOUND: {body.group_id!r}")
    owner = record_log.platform(tenant_id)
    content = {"group_id": body.group_id, "about_identity_id": body.about_identity_id, "text": body.text, "named": body.named}
    [saved] = _call(CaseDocs(repo).save_many, tenant_id, owner, [{"kind": visibility.APPEAL, "content": content}], api._me(session, "GOVERN"))
    return _saved(repo, session, owner, saved)   # the save path's crisis notice, to the writer


@router.get("/me/appeals")
def my_appeals(session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository),
               store: IdentityStore = Depends(api.get_store)) -> list[dict[str, Any]]:
    return [item for item in _appeals(session, repo, store) if item.get("mine")]


@router.get("/me/appeals/export")
def export_my_appeals(session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository),
                      store: IdentityStore = Depends(api.get_store)) -> Response:
    mine = [item for item in _appeals(session, repo, store) if item.get("mine")]
    return Response(json.dumps({"appeals": mine}, ensure_ascii=False, default=str, indent=2), media_type="application/json",
                    headers={"Content-Disposition": 'attachment; filename="my-appeals.json"'})


@router.delete("/me/appeals/{doc_id}")
def delete_my_appeal(doc_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository),
                     store: IdentityStore = Depends(api.get_store)) -> dict[str, str]:
    if not any(item["doc_id"] == doc_id and item.get("mine") for item in _appeals(session, repo, store)):
        raise HTTPException(status_code=404, detail=APPEAL_NOT_FOUND)
    try:   # CaseDocs refuses anyone but its sole writer again, under the lock (DOC_NOT_YOURS)
        CaseDocs(repo).delete(session["tenant_id"], record_log.platform(session["tenant_id"]), visibility.APPEAL, doc_id, api._me(session, "GOVERN"))
    except InvariantViolation as error:
        raise HTTPException(status_code=404, detail=APPEAL_NOT_FOUND) from error
    return {"status": "deleted", "doc_id": doc_id}


@router.get("/govern/appeals")
def appeals_to_handle(session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository),
                      store: IdentityStore = Depends(api.get_store)) -> list[dict[str, Any]]:
    return [item for item in _appeals(session, repo, store) if not item.get("mine")]


@router.get("/govern/appeals/{doc_id}")
def appeal_to_handle(doc_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository),
                     store: IdentityStore = Depends(api.get_store)) -> dict[str, Any]:
    found = next((item for item in _appeals(session, repo, store) if item["doc_id"] == doc_id and not item.get("mine")), None)
    if found is None:
        raise HTTPException(status_code=404, detail=APPEAL_NOT_FOUND)
    return found


# -- 不留紀錄 and the audit line ----------------------------------------------------------------------------------------

NO_RECORD_WARNING = "關掉之後整個案子會刪掉，不能匯出"
USED_LABELS = {"ai_turns": "每一次 AI 回答", "block": "哪一塊", "action": "做了什麼", "model": "用的模型", "instructions": "給 AI 的指令是哪一版",
               "at": "時間", "rulesets": "這個案子用到的規則和名單", "title": "名稱", "version": "版本", "fingerprint": "內容指紋",
               "resources": "求助資源的版本"}
_FINGERPRINT = re.compile(r"^[0-9a-f]{6,64}$")
_VERSION = re.compile(r"^[0-9][0-9A-Za-z.-]{0,19}$")


@router.get("/blocks/govern/spec")
def govern_spec() -> dict[str, Any]:
    return {"no_record": {"label": "不留紀錄", "warning": NO_RECORD_WARNING}, "resources": resources.version()}


@router.post("/projects/{project_id}/govern/close")
def close_case(project_id: str, session: dict[str, Any] = Depends(api.require_session), store: IdentityStore = Depends(api.get_store),
               repo: ProjectSourceRepository = Depends(api.get_project_source_repository), source_cas: TenantScopedCas = Depends(api.get_source_cas),
               artifact_store: JsonArtifactStore = Depends(api.get_artifact_store)) -> dict[str, Any]:
    """Closing a 不留紀錄 case: the case erasure, decided only if the intake still says so under the erasure's lock."""
    case_owner(project_id, session, repo)
    try:
        result = api.erase_case(store, repo, source_cas, artifact_store, session["tenant_id"], session["identity_id"], project_id, only_if_no_record=True)
    except InvariantViolation as error:
        if str(error).startswith("CASE_KEEPS_RECORDS"):
            raise HTTPException(status_code=409, detail=str(error)) from error
        raise
    return {"closed": True, "physical_cleanup": result["physical_cleanup"]}


def stamps(content: Any) -> list[dict[str, str]]:
    """Every ruleset stamp (Ruleset.stamp(): name, version, fingerprint) inside a record, by shape: a known ruleset's name,
    a version and a fingerprint of their own form -- nothing else of the record is read out."""
    known = rulesets()
    found: dict[tuple[str, str, str], dict[str, str]] = {}

    def take(name: Any, value: Any) -> None:
        if (isinstance(name, str) and name in known and isinstance(value, dict) and isinstance(value.get("version"), str) and _VERSION.match(value["version"])
                and isinstance(value.get("fingerprint"), str) and _FINGERPRINT.match(value["fingerprint"])):
            found[(name, value["version"], value["fingerprint"])] = {"name": name, "version": value["version"], "fingerprint": value["fingerprint"], "title": known[name].title}

    def walk(value: Any) -> None:
        if isinstance(value, dict):
            take(value.get("name"), value)
            for key, item in value.items():
                take(key, item)
                walk(item)
        elif isinstance(value, list):
            for item in value:
                walk(item)

    walk(content)
    return [found[key] for key in sorted(found)]


@router.get("/projects/{project_id}/govern/used")
def case_used(project_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    owner = case_owner(project_id, session, repo)
    tenant_id = session["tenant_id"]
    turns = [{"block": doc["content"]["block"], "action": doc["content"]["action"], "model": doc["content"]["model"],
              "instructions": doc["content"]["instructions_sha256"], "at": doc["at"]} for doc in CaseDocs(repo).current(tenant_id, owner, "govern.ai_call")]
    with repo.transaction(tenant_id) as connection:
        rows = connection.execute("SELECT payload_json->'content' AS content FROM events WHERE tenant_id=%s AND owner_kind='case' AND owner_id=%s AND event_type='DocSaved'",
                                  (tenant_id, project_id)).fetchall()
    found = {(item["name"], item["version"], item["fingerprint"]): item for row in rows for item in stamps(row["content"])}
    return {"labels": USED_LABELS, "ai_turns": turns, "rulesets": [found[key] for key in sorted(found)], "resources": resources.version()}


# -- the process indicators (card 70) -------------------------------------------------------------------------------------

@router.get("/projects/{project_id}/indicators")
def case_indicators(project_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    """The case's process facts (platform/indicators.py), from its own records, to its owner (a case that is not yours is the
    missing case's 404). The claim ledger is the one counting rule's (evidence.checked_claims), never recounted here."""
    owner = case_owner(project_id, session, repo)
    docs, tenant_id = CaseDocs(repo), session["tenant_id"]
    label = indicators.owner_label(indicators.CASE, project_id)
    records: dict[str, list[dict[str, Any]]] = {}
    for kind in indicators.reads(indicators.CASE):
        if kind == indicators.LEDGER:
            records[kind] = indicators.stamped_ledger(label, evidence.checked_claims(docs, tenant_id, owner))
        elif kind == indicators.PROPOSALS:
            records[kind] = indicators.stamped(label, proposals(docs, tenant_id, owner))
        else:
            records[kind] = indicators.stamped(label, docs.current(tenant_id, owner, kind))
    return indicators.describe(indicators.CASE, records)


@router.get("/groups/{group_id}/indicators")
def group_indicators(group_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    """The group's process facts, to a current member only (G2). Computed from what ``visibility.visible`` gives this member:
    another member's stance or restatement of a round or option they have not unlocked is not read, so it is not counted."""
    member_group(repo, session, group_id)
    docs, viewer = CaseDocs(repo), Viewer(session["tenant_id"], session["identity_id"])
    label = indicators.owner_label(indicators.GROUP, group_id)
    try:
        records = {kind: indicators.stamped(label, visibility.visible(docs, viewer, group_id, kind)) for kind in indicators.reads(indicators.GROUP)}
    except InvariantViolation as error:
        if group_gone(error):
            raise not_found(group_id) from None
        raise
    return indicators.describe(indicators.GROUP, records)
