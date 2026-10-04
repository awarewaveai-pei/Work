"""TEACH content reads; person records use the generic ``/me/docs/{kind}`` routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ai_lego.apps.api import main as api
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.platform.lessons import load_lessons, load_practice_cases


router = APIRouter()
FALLBACK_MESSAGE = "你所在的地方沒有這類練習案例，先顯示其他地方的案例。"


def _lesson_view(lesson: dict[str, Any]) -> dict[str, Any]:
    return {**lesson, **({"label": "草稿"} if lesson["state"] == "draft" else {})}


@router.get("/blocks/teach/lessons")
def list_lessons(subject: str | None = None, session: dict[str, Any] = Depends(api.require_session)) -> list[dict[str, Any]]:
    """List all lessons for a subject, including drafts labelled 草稿."""
    return [_lesson_view(item) for item in load_lessons().items if subject is None or item["subject"] == subject]


@router.get("/blocks/teach/lessons/{lesson_id}")
def get_lesson(lesson_id: str, session: dict[str, Any] = Depends(api.require_session)) -> dict[str, Any]:
    lesson = next((item for item in load_lessons().items if item["id"] == lesson_id), None)
    if lesson is None:
        raise HTTPException(status_code=404, detail=f"TEACH_LESSON_NOT_FOUND: {lesson_id!r}")
    return _lesson_view(lesson)


@router.get("/blocks/teach/practice-cases")
def list_practice_cases(session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    """Prefer the person's saved location, and explain when the list falls back."""
    docs = CaseDocs(repo)
    location = docs.current(session["tenant_id"], record_log.person(session["identity_id"]), "govern.location")
    place = location[-1]["content"].get("where") if location else None
    cases = list(load_practice_cases().items)
    local = [case for case in cases if place and case["place"] == place]
    other = [case for case in cases if case not in local]
    fallback = not local
    return {"cases": local + other, "place": place, "fallback": fallback, "message": FALLBACK_MESSAGE if fallback else ""}
