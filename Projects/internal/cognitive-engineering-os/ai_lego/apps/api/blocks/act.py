"""ACT's reminders (the card: weekly for the first month after a task, then monthly, quarterly or yearly; 提醒出現在
「我的案子」首頁). Email is not sent (checklist). The rule itself is core/domain/kinds/act.py.

    GET /projects/{project_id}/act/reminders   what is due in this case
    GET /me/reminders                          what is due in every case of the person, plus the two practices they set
    both take ?today=YYYY-MM-DD&utc_offset=<minutes east of UTC> (the person's own day; default: today in UTC)
"""

from __future__ import annotations

import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from ai_lego.apps.api import main as api
from ai_lego.core.domain.kinds.act import case_reminders, practice_reminders, started_at
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository

router = APIRouter()


def _today(today: str | None, utc_offset: int) -> datetime.date:
    if today is None:
        return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=utc_offset)).date()
    try:
        return datetime.date.fromisoformat(today)
    except ValueError:
        raise HTTPException(status_code=400, detail="REMINDER_DATE_INVALID: today is YYYY-MM-DD") from None


def _case(docs: CaseDocs, tenant_id: str, project: dict[str, Any], today: datetime.date, utc_offset: int) -> list[dict[str, Any]]:
    owner = record_log.case(project["project_id"])
    tasks, notes, calibrations, revisits = (docs.current(tenant_id, owner, kind) for kind in ("act.task", "act.note", "learn.calibration", "learn.revisit"))
    tasks = [{**task, "started_at": started_at(docs.versions(tenant_id, owner, "act.task", task["doc_id"]))} for task in tasks]
    found = case_reminders(tasks, notes, calibrations, revisits, today, utc_offset)
    return [{**item, "scope": "case", "project_id": project["project_id"], "project_name": project["name"], "path": f"/projects/{project['project_id']}/{item['block'].lower()}"} for item in found]


@router.get("/projects/{project_id}/act/reminders")
def case_reminder_list(project_id: str, today: str | None = None, utc_offset: int = Query(0, ge=-840, le=840), session: dict[str, Any] = Depends(api.require_session),
                       repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> list[dict[str, Any]]:
    project = api._project_or_404(repo, session, project_id)
    return _case(CaseDocs(repo), session["tenant_id"], project, _today(today, utc_offset), utc_offset)


@router.get("/me/reminders")
def my_reminders(today: str | None = None, utc_offset: int = Query(0, ge=-840, le=840), session: dict[str, Any] = Depends(api.require_session),
                 repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> list[dict[str, Any]]:
    day, docs, tenant_id = _today(today, utc_offset), CaseDocs(repo), session["tenant_id"]
    found = [item for project in repo.list_projects(tenant_id, created_by=session["identity_id"]) if project["created_by_identity_id"] == session["identity_id"] for item in _case(docs, tenant_id, project, day, utc_offset)]
    me = record_log.person(session["identity_id"])
    practice = docs.current(tenant_id, me, "learn.practice")
    found += [{**item, "scope": "person", "path": "/me/learn"}
              for item in practice_reminders(practice[-1]["content"] if practice else None, docs.current(tenant_id, me, "learn.daily"), docs.current(tenant_id, me, "learn.sprint"), day, utc_offset)]
    return sorted(found, key=lambda item: item["since"])
