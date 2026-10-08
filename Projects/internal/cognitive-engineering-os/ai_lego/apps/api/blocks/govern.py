"""GOVERN's routes (build step 1): help, export, account deletion and the version records.

    GET  /govern/help?where=                 the non-therapy notice and help for where the person is -- open to anyone: a person
                                             in a crisis must not meet a login wall (a session only supplies their saved place)
    GET  /govern/account                     what deleting the account removes and what stays
    POST /govern/account/erase  {confirm}    完整刪除: every case, every personal record, the workflows, then the identity
    GET  /govern/export?format=json|md       everything the person owns
    GET  /projects/{id}/govern/export?...    one case: every document version and record, each with its author and block
    GET  /projects/{id}/govern/versions      which model and instructions answered, the rules in use, the kinds of records held

A recipe run is the runner's own (main._run_journal): its journal sits in the runner's folder, and a run on a case names
the case in a sidecar. Export carries the runs, and erasing an account takes the runs that no case erase already took.

GOVERN moves data and never reads it into an AI: nothing here asks a model for anything, and the export and the
erasure carry text they never look at (the contract card: 匯出和刪除只搬動資料，不看內容).
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Response
import psycopg
from pydantic import BaseModel

from ai_lego.apps.api import main as api
from ai_lego.apps.api.blocks.docs import case_owner
from ai_lego.core.domain import doc_kinds
from ai_lego.core.support import read_json
from ai_lego.data.events import record_log
from ai_lego.data.object.json_artifact_store import JsonArtifactStore
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.custom_workflow_repository import CustomWorkflowRepository
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation
from ai_lego.platform import integrity, safety
from ai_lego.platform.erasure import PERSON, Erasure, artifact_reference_ok
from ai_lego.platform.ai_gate import PREAMBLE
from ai_lego.platform.identity.store import IdentityStore
from ai_lego.platform.rulesets import rulesets
from ai_lego.platform.safety import risk
from ai_lego.platform.workflow.run_lock import lock_path_for, run_lock_state

router = APIRouter()

EXPORT_FORMAT = "cognitive-os-export/1"
ERASE_PHRASE = "刪除我的帳號"
PROTECTED_RUNS_KEPT = "加密保護的工作流執行（{count} 筆）：它們每一步的加密內容檔還留在主機上，沒有金鑰的人讀不出來；這一項還不能一起刪。"
KEPT_AFTER_ERASURE = [
    "每個被刪掉的案子，留一筆「已抹除」：只有案子的代號、什麼時候刪的、刪了多少筆，沒有任何你寫的內容。",
    "帳號本身留一個空殼，標成「已刪除」：沒有信箱、沒有名字，也登不進去。同一個信箱可以重新註冊。",
    "AI 用量只記次數和 token 數，用來算全站的每日額度；不再連到你。",
    "2026-10-03 以前跑的工作流執行，留在主機的共用資料夾，沒有記是誰跑的，所以不會在這裡一起刪。",
]
AUTHOR_LABEL = {"user": "你寫的", "ai": "AI 寫的", "joint": "AI 起草、你改過", "system": "系統"}


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


@router.get("/govern/help")
def help_for(where: str | None = Query(default=None, max_length=200), cognitive_os_session: str | None = Cookie(default=None),
             store: IdentityStore = Depends(api.get_store), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    place = (where or "").strip() or None
    session = store.resolve_session(cognitive_os_session) if place is None and cognitive_os_session else None
    if session is not None:
        saved = CaseDocs(repo).current(session["tenant_id"], record_log.person(session["identity_id"]), "govern.location")
        place = saved[-1]["content"]["where"] if saved else None
    return {"notice": safety.NOT_THERAPY, "where": place, "covered": safety.covers(place), "resources": safety.resources(place)}


# -- recipe runs ------------------------------------------------------------------------------------------------------

JOURNAL_SUFFIX = ".journal.json"


def _runs_folder(tenant_id: str, identity_id: str) -> Path:
    return api.workflow_journal_path(tenant_id, "x", identity_id).parent


def _run_ids(folder: Path) -> list[str]:
    """Every run the folder holds anything of: a journal, a lock, or the sidecar (a run that died before its first record has no journal)."""
    return sorted({path.name.split(".")[0] for path in folder.iterdir() if path.name.endswith((JOURNAL_SUFFIX, ".lock", ".case.json"))}) if folder.is_dir() else []


def _read_journal(folder: Path, run_id: str) -> Any:
    """The journal as written, or None when there is none or it is not JSON (a half-written file names nothing)."""
    path = folder / f"{run_id}{JOURNAL_SUFFIX}"
    try:
        return read_json(path) if path.is_file() else None
    except (ValueError, OSError):
        return None


def _references(value: Any) -> list[Any]:
    """Every ``cas_reference`` anywhere in a journal -- the way to find a run's artifacts only for a run made before the server
    recorded them for runs on no case. Whatever it finds is a claim in a file, so each use treats it as one."""
    if isinstance(value, dict):
        found = [value["cas_reference"]] if "cas_reference" in value else []
        return found + [reference for item in value.values() for reference in _references(item)]
    if isinstance(value, list):
        return [reference for item in value for reference in _references(item)]
    return []


def _listed(folder: Path, run_id: str) -> list[Any]:
    """The artifacts a run stored: what the server wrote beside it when each was stored (main._record_run_artifact; the journal
    may be encrypted and names nothing then). Only a run with no such record is read from its journal."""
    sidecar = folder / f"{run_id}.case.json"
    if sidecar.is_file():
        return list(read_json(sidecar).get("artifacts", []))
    return _references(_read_journal(folder, run_id))


def _person_runs(tenant_id: str, identity_id: str, artifact_store: JsonArtifactStore, only_case: str | None = None) -> list[dict[str, Any]]:
    """The person's runs with their journals and artifacts; ``only_case``: just the runs made on that case. An artifact that
    cannot be read comes out with ``value: null`` and the reason, never as an error for the whole export."""
    folder = _runs_folder(tenant_id, identity_id)
    runs = []
    for run_id in _run_ids(folder):
        sidecar = folder / f"{run_id}.case.json"
        project_id = read_json(sidecar).get("project_id") if sidecar.is_file() else None
        if only_case is not None and project_id != only_case:
            continue
        artifacts, seen = [], set()
        for reference in _listed(folder, run_id):
            key = json.dumps(reference, sort_keys=True, default=str)
            if key in seen:
                continue
            seen.add(key)
            kind = reference.get("artifact_type") if isinstance(reference, dict) else None
            if not artifact_reference_ok(reference):   # a field in the export, not a refusal shown to a person
                artifacts.append({"artifact_type": kind, "value": None, "error": "ARTIFACT_REFERENCE_MALFORMED"})
                continue
            try:
                artifacts.append({"artifact_type": kind, "value": artifact_store.read(tenant_id, reference)})
            except InvariantViolation as error:
                artifacts.append({"artifact_type": kind, "value": None, "error": str(error)[:80]})
        runs.append({"run_id": run_id, "project_id": project_id, "journal": _read_journal(folder, run_id), "artifacts": artifacts})
    return runs


def _protected_runs(tenant_id: str, identity_id: str) -> int:
    """Runs whose journal keeps its context as ciphertext in workflow-cas: erasing removes the journal and the artifacts
    the server recorded, not those ciphertext files (one per saved step)."""
    folder = _runs_folder(tenant_id, identity_id)
    journals = [_read_journal(folder, run_id) for run_id in _run_ids(folder)]
    return sum(1 for journal in journals if isinstance(journal, dict) and isinstance(journal.get("context"), dict) and journal["context"].get("protected") is True)


def _run_still_going(tenant_id: str, identity_id: str) -> bool:
    folder = _runs_folder(tenant_id, identity_id)
    return any(run_lock_state(lock_path_for(folder / f"{run_id}{JOURNAL_SUFFIX}")) == "held" for run_id in _run_ids(folder))


def _person_runs_to_erase(tenant_id: str, identity_id: str) -> list[dict[str, Any]]:
    """What is left in the person's run folder once their cases are decided (those named their own runs): every run, with
    the artifacts recorded for it, as the erasure's outbox names them. Reads only; refuses while one runs."""
    folder = _runs_folder(tenant_id, identity_id)
    if _run_still_going(tenant_id, identity_id):
        raise HTTPException(status_code=409, detail="PROJECT_BUSY: a workflow run is still running; wait for it to finish, then delete the account")
    return [{"run_id": run_id, "identity_id": identity_id, "artifacts": _listed(folder, run_id)} for run_id in _run_ids(folder)]


# -- export -----------------------------------------------------------------------------------------------------------

def _records(connection: psycopg.Connection, tenant_id: str, owner: record_log.Owner) -> list[dict[str, Any]]:
    """Every record an owner holds, in the order written, each with its author and block (a row from before they were
    recorded says so: author null); not DocRead, the bookkeeping of having viewed a document."""
    rows = connection.execute(
        "SELECT aggregate_id, sequence, event_type, occurred_at, schema_version, payload_json, author, block FROM events "
        "WHERE tenant_id=%s AND owner_kind=%s AND owner_id=%s AND event_type <> 'DocRead' ORDER BY write_order", (tenant_id, owner.kind, owner.id)).fetchall()
    return [{"aggregate_id": row["aggregate_id"], "sequence": row["sequence"], "type": row["event_type"], "at": row["occurred_at"], "schema_version": row["schema_version"],
             "author": row["author"], "block": row["block"], "payload": row["payload_json"]} for row in rows]


def _written_in_groups(connection: psycopg.Connection, tenant_id: str, identity_id: str) -> list[dict[str, Any]]:
    """What the person wrote in groups, also ones they left (G3: theirs to export) -- only the versions they wrote, never
    another member's (Codex F4). By the record's writer, like the account erasure that removes them."""
    rows = connection.execute(
        "SELECT owner_id, aggregate_id, sequence, event_type, occurred_at, schema_version, payload_json, author, block FROM events "
        "WHERE tenant_id=%s AND owner_kind='group' AND author_identity_id=%s ORDER BY write_order", (tenant_id, identity_id)).fetchall()
    return [{"group_id": row["owner_id"], "aggregate_id": row["aggregate_id"], "sequence": row["sequence"], "type": row["event_type"], "at": row["occurred_at"],
             "schema_version": row["schema_version"], "author": row["author"], "block": row["block"], "payload": row["payload_json"]} for row in rows]


def _case_export(repo: ProjectSourceRepository, source_cas: TenantScopedCas, artifact_store: JsonArtifactStore, tenant_id: str, project: dict[str, Any],
                 runs: list[dict[str, Any]]) -> dict[str, Any]:
    project_id = project["project_id"]
    with repo.transaction(tenant_id) as connection:
        records = _records(connection, tenant_id, record_log.case(project_id))
    sources = []
    for source in repo.list_sources(tenant_id, project_id):
        cas_path = repo.get_source_content_reference(tenant_id, project_id, source["source_id"])
        try:
            content = source_cas.read(tenant_id, cas_path).decode("utf-8") if cas_path else None
        except (InvariantViolation, UnicodeDecodeError):
            content = None
        sources.append({**{key: value for key, value in source.items() if key != "artifact_uri"}, "content": content})
    artifacts = []
    for reference in repo.project_artifact_references(tenant_id, project_id):
        try:
            artifacts.append({"artifact_type": reference.get("artifact_type"), "value": artifact_store.read(tenant_id, reference)})
        except InvariantViolation:
            artifacts.append({"artifact_type": reference.get("artifact_type"), "value": None})
    return {"project": project, "records": records, "sources": sources, "artifacts": artifacts, "runs": [run for run in runs if run["project_id"] == project_id]}


def _fence(text: str, language: str = "") -> str:
    ticks = "`" * max(3, max((len(run) for run in re.findall(r"`+", text)), default=0) + 1)
    return f"{ticks}{language}\n{text}\n{ticks}"


def _field(name: str, value: Any) -> list[str]:
    if isinstance(value, str):
        lines = value.split("\n")
        return [f"- **{name}**：{lines[0]}", *[f"    {line}" for line in lines[1:]]]
    if isinstance(value, list) and all(isinstance(item, str) for item in value):
        return [f"- **{name}**：", *[f"    - {item}" for item in value]]
    return [f"- **{name}**：", *[f"    {line}" for line in _fence(json.dumps(value, ensure_ascii=False, indent=2), "json").split("\n")]]


def _who(record: dict[str, Any]) -> str:
    return f"{AUTHOR_LABEL.get(record['author'], '記作者之前的紀錄')} · {record['block'] or '—'} · {record['at']}"


def _records_markdown(records: list[dict[str, Any]], level: str) -> list[str]:
    docs: dict[str, list[dict[str, Any]]] = {}
    others: list[dict[str, Any]] = []
    for record in records:
        (docs.setdefault(record["aggregate_id"], []) if record["type"] in record_log.DOC_EVENTS else others).append(record)
    lines: list[str] = []
    for versions in docs.values():
        kind = versions[0]["payload"].get("kind", "?")
        spec = doc_kinds.kinds().get(kind)
        lines += ["", f"{level} {spec.title if spec else kind}（{kind}）"]
        for record in versions:
            if record["type"] == "DocDeleted":
                lines.append(f"- 已刪除 · {_who(record)}")
                continue
            lines += ["", f"**第 {record['payload'].get('version')} 版** · {_who(record)}", ""]
            for name, value in (record["payload"].get("content") or {}).items():
                lines += _field(name, value)
    if others:
        lines += ["", f"{level} 其他紀錄"]
        for record in others:
            lines += ["", f"**{record['type']}** · {_who(record)}", "", _fence(json.dumps(record["payload"], ensure_ascii=False, indent=2), "json")]
    return lines


def _runs_markdown(runs: list[dict[str, Any]]) -> list[str]:
    lines: list[str] = []
    for run in runs:
        lines += ["", f"### 工作流執行：{run['run_id']}", "", _fence(json.dumps(run["journal"], ensure_ascii=False, indent=2), "json")]
        for artifact in run["artifacts"]:
            lines += ["", f"#### 這次執行的 AI 產出：{artifact['artifact_type']}", "", _fence(json.dumps(artifact["value"], ensure_ascii=False, indent=2), "json")]
    return lines


def _markdown(export: dict[str, Any]) -> str:
    lines = ["# 認知作業系統：資料匯出", "", f"匯出時間：{export['exported_at']}", f"範圍：{'整個帳號' if export['scope'] == 'account' else '一個案子'}",
             "每一筆都標了作者（你寫的、AI 寫的、AI 起草你改過的、系統）和哪一塊寫的。刪掉的卡只留「已刪除」，內容已經不在。"]
    if export.get("identity"):
        lines += ["", "## 帳號", f"- 信箱：{export['identity']['email']}", f"- 名字：{export['identity']['display_name']}", f"- 建立時間：{export['identity']['created_at']}"]
    for case in export["cases"]:
        project = case["project"]
        lines += ["", f"## 案子：{project['name']}", f"- 代號：{project['project_id']}", f"- 建立時間：{project['created_at']}", f"- 目的：{project['purpose']}", f"- 資料分類：{project['data_classification']}"]
        lines += _records_markdown(case["records"], "###")
        for source in case["sources"]:
            lines += ["", f"### 來源：{source['title']}", f"- 類型：{source['media_type']} · 建立時間：{source['created_at']}"]
            lines += ["", _fence(source["content"])] if source["content"] is not None else ["- 內容：這份來源的內容已經不在了。"]
        for artifact in case["artifacts"]:
            lines += ["", f"### AI 產出：{artifact['artifact_type']}", "", _fence(json.dumps(artifact["value"], ensure_ascii=False, indent=2), "json")]
        lines += _runs_markdown(case["runs"])
    person = export.get("person")
    if person is not None:
        lines += ["", "## 你個人的紀錄（不屬於任何案子）", *_records_markdown(person["records"], "###")]
        lines += ["", "## 自訂工作流"] + [f"- {item['title']}（{len(item['method_ids'])} 個工具）" for item in person["workflows"]]
        lines += _runs_markdown(person["runs"])
    return "\n".join(lines) + "\n"


def _download(export: dict[str, Any], fmt: str, name: str) -> Response:
    if fmt == "md":
        body, media = _markdown(export), "text/markdown; charset=utf-8"
    else:
        body, media = json.dumps(export, ensure_ascii=False, indent=2), "application/json; charset=utf-8"
    return Response(content=body, media_type=media, headers={"Content-Disposition": f'attachment; filename="{name}.{fmt}"'})


Format = Literal["json", "md"]


@router.get("/projects/{project_id}/govern/export")
def export_case(project_id: str, fmt: Format = Query(default="json", alias="format"), session: dict[str, Any] = Depends(api.require_session),
                repo: ProjectSourceRepository = Depends(api.get_project_source_repository), source_cas: TenantScopedCas = Depends(api.get_source_cas),
                artifact_store: JsonArtifactStore = Depends(api.get_artifact_store)) -> Response:
    project = api._project_or_404(repo, session, project_id)
    runs = _person_runs(session["tenant_id"], session["identity_id"], artifact_store, only_case=project_id)
    export = {"format": EXPORT_FORMAT, "exported_at": _now(), "scope": "case", "cases": [_case_export(repo, source_cas, artifact_store, session["tenant_id"], project, runs)]}
    return _download(export, fmt, f"cognitive-os-case-{project_id[:8]}")


def _my_cases(repo: ProjectSourceRepository, session: dict[str, Any]) -> list[dict[str, Any]]:
    mine = [project for project in repo.list_projects(session["tenant_id"]) if project["created_by_identity_id"] == session["identity_id"]]
    return sorted(mine, key=lambda project: (project["created_at"], project["name"]))   # the repository breaks a tie inside one second by random id


@router.get("/govern/export")
def export_account(fmt: Format = Query(default="json", alias="format"), session: dict[str, Any] = Depends(api.require_session), store: IdentityStore = Depends(api.get_store),
                   repo: ProjectSourceRepository = Depends(api.get_project_source_repository), source_cas: TenantScopedCas = Depends(api.get_source_cas),
                   artifact_store: JsonArtifactStore = Depends(api.get_artifact_store), workflows: CustomWorkflowRepository = Depends(api.get_custom_workflow_repository)) -> Response:
    tenant_id, me = session["tenant_id"], session["identity_id"]
    identity = store.get_identity(me) or {}
    with repo.transaction(tenant_id) as connection:   # a workflow's own records go with the workflows, as when they had their own file
        records = [record for record in _records(connection, tenant_id, record_log.person(me)) if not record["aggregate_id"].startswith(CustomWorkflowRepository.AGGREGATE_PREFIX)]
        group_records = _written_in_groups(connection, tenant_id, me)
    runs = _person_runs(tenant_id, me, artifact_store)
    export = {
        "format": EXPORT_FORMAT, "exported_at": _now(), "scope": "account",
        "identity": {key: identity.get(key) for key in ("identity_id", "email", "display_name", "created_at")},
        "cases": [_case_export(repo, source_cas, artifact_store, tenant_id, project, runs) for project in _my_cases(repo, session)],
        "person": {"records": records, "workflows": workflows.list(tenant_id, me), "runs": [run for run in runs if run["project_id"] is None]},
        "groups": group_records,
    }
    return _download(export, fmt, "cognitive-os-account")


# -- account deletion -------------------------------------------------------------------------------------------------

@router.get("/govern/account")
def account_summary(session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository),
                    workflows: CustomWorkflowRepository = Depends(api.get_custom_workflow_repository)) -> dict[str, Any]:
    tenant_id, me = session["tenant_id"], session["identity_id"]
    with repo.transaction(tenant_id) as connection:
        personal = connection.execute("SELECT COUNT(DISTINCT aggregate_id) FROM events WHERE tenant_id=%s AND owner_kind='person' AND owner_id=%s AND event_type='DocSaved'", (tenant_id, me)).fetchone()[0]
    protected = _protected_runs(tenant_id, me)
    return {"cases": [{"project_id": project["project_id"], "name": project["name"], "created_at": project["created_at"]} for project in _my_cases(repo, session)],
            "personal_records": personal, "workflows": len(workflows.list(tenant_id, me)), "runs": len(_run_ids(_runs_folder(tenant_id, me))),
            "keeps": [*KEPT_AFTER_ERASURE, *([PROTECTED_RUNS_KEPT.format(count=protected)] if protected else [])], "phrase": ERASE_PHRASE}


class EraseBody(BaseModel):
    confirm: str


@router.post("/govern/account/erase")
def erase_account(body: EraseBody, response: Response, session: dict[str, Any] = Depends(api.require_session), store: IdentityStore = Depends(api.get_store),
                  repo: ProjectSourceRepository = Depends(api.get_project_source_repository), source_cas: TenantScopedCas = Depends(api.get_source_cas),
                  artifact_store: JsonArtifactStore = Depends(api.get_artifact_store), workflows: CustomWorkflowRepository = Depends(api.get_custom_workflow_repository)) -> dict[str, Any]:
    """First ask every case and run whether it is still being worked on: one that is stops the whole thing before anything
    is deleted. Then each case through the case erasure itself (no entitlement gate: deleting what is yours is a right),
    then the person's own part -- workflows, records and identity in one decision, the runs on no case in its outbox
    (ai_lego/platform/erasure.py). A failure before that decision commits leaves the person able to sign in and retry;
    after it, the files are finished by the erasure workflow. What cannot be deleted (a corrupt artifact reference) is
    listed in ``failed``; 202 with ``physical_cleanup: "pending"`` while a file is not gone yet."""
    if body.confirm.strip() != ERASE_PHRASE:
        raise HTTPException(status_code=400, detail=f"ACCOUNT_ERASE_NOT_CONFIRMED: type {ERASE_PHRASE!r} to confirm")
    tenant_id, me = session["tenant_id"], session["identity_id"]
    cases = _my_cases(repo, session)
    reasons = [reason for project in cases if (reason := api.case_blocker(repo, tenant_id, me, project["project_id"]))]
    if _run_still_going(tenant_id, me):
        reasons.append("a workflow run is still running")
    if reasons:
        raise HTTPException(status_code=409, detail=f"PROJECT_BUSY: {reasons[0]}; wait for it to finish, then delete the account")
    erasure = api.erasure_for(repo, source_cas, artifact_store)
    try:   # G5 decided under the person lock before any case is erased; the person's group part goes with it (Codex F3)
        in_groups = erasure.decide_groups(tenant_id, me)
    except InvariantViolation as error:
        if str(error).startswith("ACCOUNT_IS_LAST_CONVENER"):
            raise HTTPException(status_code=409, detail=str(error)) from error
        raise
    failed: list[dict[str, str]] = []
    states: set[str] = set()   # each erasure's physical_cleanup: done, pending (a retry will do it), blocked (an operator must look)
    for project in cases:
        erased = api.erase_case(store, repo, source_cas, artifact_store, tenant_id, me, project["project_id"])
        failed += erased.get("failed", [])
        states.add(erased["physical_cleanup"])
    for earlier in erasure.resume(tenant_id=tenant_id, erased_by_identity_id=me):   # a case erased before whose files were not all gone
        if earlier["subject_kind"] != PERSON:
            failed += earlier.get("failed", [])
            states.add(earlier["physical_cleanup"])
    try:
        counts = erasure.decide_person(tenant_id, me, lambda: _person_runs_to_erase(tenant_id, me))   # read inside the decision, under the person lock
    except InvariantViolation as error:   # a case opened meanwhile, or a second deletion that waited for the first: nothing decided
        if str(error).startswith(("ACCOUNT_HAS_LIVE_CASES", "ACCOUNT_ALREADY_ERASED", "ACCOUNT_IS_LAST_CONVENER")):
            raise HTTPException(status_code=409, detail=str(error)) from error
        raise
    counts = {**counts, **{key: counts.get(key, 0) + value for key, value in in_groups.items()}}
    person = erasure.finish(tenant_id, PERSON, me)
    failed += person["failed"]
    states.add(person["physical_cleanup"])
    cleanup = next((state for state in ("pending", "blocked") if state in states), "done")
    response.delete_cookie(api.SESSION_COOKIE)
    if cleanup != "done":
        response.status_code = 202
    return {"cases": len(cases), **counts, "tombstone": cleanup == "done", "physical_cleanup": cleanup, "failed": failed}


# -- version records --------------------------------------------------------------------------------------------------

def kind_definition(spec: doc_kinds.DocKind) -> dict[str, Any]:
    return {"block": spec.block, "owner": spec.owner, "authors": sorted(spec.authors), "deletable": spec.deletable, "singleton": spec.singleton,
            "fields": {name: [field.type, field.max, field.required, list(field.choices), field.human_only, *(["cited"] if field.cited else [])] for name, field in sorted(spec.fields.items())}}


def rules_in_use() -> list[dict[str, str]]:
    """The rules every AI call and every save in this platform is decided with, each with the fingerprint of what it says now."""
    return [
        {"name": "ai_preamble", "label": "給 AI 的共用指令", "version": safety.digest(PREAMBLE)},
        {"name": "crisis", "label": "危機詞表和各地求助資源", "version": safety.fingerprint()},
        {"name": "high_risk", "label": "高風險分類詞表", "version": risk.fingerprint()},
        {"name": "record_kinds", "label": "每一種紀錄有哪些格子、誰能寫", "version": safety.digest({kind: kind_definition(spec) for kind, spec in sorted(doc_kinds.kinds().items())})},
        {"name": "integrity", "label": "完整性核心的規則", "version": integrity.rules_version()},
        *[{"name": item.name, "label": item.title, "version": f"v{item.version}-{item.fingerprint()}", "maintainer": item.maintainer, "block": item.block}
          for item in sorted(rulesets().values(), key=lambda ruleset: ruleset.name)],
    ]


@router.get("/projects/{project_id}/govern/versions")
def versions(project_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    owner = case_owner(project_id, session, repo)
    calls = [{**{key: doc["content"][key] for key in ("block", "action", "model", "instructions_sha256")}, "at": doc["at"]} for doc in CaseDocs(repo).current(session["tenant_id"], owner, "govern.ai_call")]
    with repo.transaction(session["tenant_id"]) as connection:
        rows = connection.execute(
            "SELECT payload_json->>'kind' AS kind, COUNT(DISTINCT payload_json->>'doc_id') AS documents, COUNT(*) AS versions FROM events "
            "WHERE tenant_id=%s AND owner_kind='case' AND owner_id=%s AND event_type='DocSaved' GROUP BY 1 ORDER BY 1", (session["tenant_id"], project_id)).fetchall()
    known = doc_kinds.kinds()
    held = [{"kind": row["kind"], "block": known[row["kind"]].block if row["kind"] in known else None, "title": known[row["kind"]].title if row["kind"] in known else None,
             "definition": safety.digest(kind_definition(known[row["kind"]])) if row["kind"] in known else None, "documents": row["documents"], "versions": row["versions"]} for row in rows]
    return {"ai_calls": calls, "rules": rules_in_use(), "kinds": held}
