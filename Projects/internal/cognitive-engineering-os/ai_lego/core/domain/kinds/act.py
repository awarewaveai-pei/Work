"""ACT 行動與觀察 (contract card): a task card written from the judgment's one-sentence next step (the person's
prediction first), then observation notes -- weekly for the first month, then monthly, quarterly or yearly. The records
stay as written: LEARN compares them with what the person predicted, so a task and a note are never deleted.

``case_reminders`` / ``practice_reminders`` are the one place that decides what is due; the case list calls them
through ``GET /me/reminders`` (ai_lego/apps/api/blocks/act.py). The weekly rhythm starts when the person acted, not when the
card was written: ``started_at`` is the first version of the task marked 進行中 or 完成."""

from __future__ import annotations

import calendar
import datetime
from typing import Any, Iterable, Mapping

from ai_lego.core.domain.doc_kinds import DocKind, Field
from ai_lego.core.domain.kinds.decide import HOLD

STATUS = ("未開始", "進行中", "完成", "擱置", "停掉")
CLOSED = ("完成", "停掉", "擱置")      # no observation reminder for these
ACTED = ("進行中", "完成")             # 行動後: the person has begun the step; the first month's weeks count from the day they first said so
LONG_RHYTHM = ("月", "季", "年")
_FIRST_MONTH = (7, 14, 21, 28)
_LONG_MONTHS = {"月": 1, "季": 3, "年": 12}


def _mine(type: str = "text", max: int = 1000, **options) -> Field:
    return Field(type, max, human_only=True, **options)


KINDS = [
    DocKind("act.task", "ACT", "任務卡", {
        "title": _mine(max=300, required=True),
        "prediction": _mine(required=True),                  # 我預期會怎樣：寫成之後對得出來的樣子
        "due": _mine("date"),
        "risk": _mine(),
        "stop_condition": _mine(),                           # 行動的停止條件（不是「什麼時候停止分析」）
        "escalate_condition": _mine(),
        "owner": _mine(max=200),
        "irreversible": _mine("bool"),                       # 你確認：這一步做了不能反悔
        "hold": _mine("choice", choices=HOLD),               # 護欄 wait_or_review 之下，不能反悔的行動
        "status": _mine("choice", choices=STATUS),
        "long_rhythm": _mine("choice", choices=LONG_RHYTHM),   # 第一個月之後：按月、按季、按年
        "from_next_step": _mine(max=500),                    # 判斷卡上那一句，原文
        "whose_wish": _mine(max=500),                        # 行動前問：這正好是誰希望我做的（認知作戰常引導人轉傳、不投票、放棄）
    }, deletable=False),
    DocKind("act.note", "ACT", "觀察紀錄", {
        "task": Field("text", 64, required=True),            # the act.task doc_id
        "happened": Field("text", 2000),                     # 實際狀況
        "thoughts": Field("text", 2000),                     # 想法
        "adjustment": Field("text", 2000),                   # 要調整什麼
        "blocker": Field("text", 2000),                      # 卡在哪
        "numbers": Field("json", 8000),                      # [{"name", "value": number, "unit"}]：同一個名字兩筆就畫趨勢
    }, deletable=False),
    # The AI's three turns (each only reads and gives back; it never promises, never sets a number, never does the step)
    DocKind("act.split", "ACT", "AI 拆出來的小步", {
        "options": Field("json", 6000, required=True),       # [{"step", "why_small", "reversible": bool, "undo"}]，由你挑
    }, authors=frozenset({"ai"}), singleton=True),
    DocKind("act.flag", "ACT", "AI 提醒不能反悔的地方", {
        "irreversible": Field("list", 6),                    # 「任務：為什麼不能反悔」
        "affects_others": Field("list", 6),                  # 會影響到誰
    }, authors=frozenset({"ai"}), singleton=True),
    DocKind("act.trend", "ACT", "AI 整理的趨勢", {
        "summary": Field("text", 1500, required=True),
        "unclear": Field("list", 3),                         # 只有一筆、看不出趨勢的數字
    }, authors=frozenset({"ai"}), singleton=True),
]


def local_date(iso: str, utc_offset_minutes: int = 0) -> datetime.date:
    """The calendar day of an API timestamp (UTC, 2026-10-03T15:51:37Z) where the person lives."""
    moment = datetime.datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return (moment + datetime.timedelta(minutes=utc_offset_minutes)).date()


def add_months(day: datetime.date, months: int) -> datetime.date:
    total = day.year * 12 + day.month - 1 + months
    year, month = divmod(total, 12)
    return datetime.date(year, month + 1, min(day.day, calendar.monthrange(year, month + 1)[1]))


def checkpoints(start: datetime.date, long_rhythm: str | None, through: datetime.date) -> list[datetime.date]:
    """The days an observation comes due, up to ``through``: every week of the first month (day 7, 14, 21, 28), then
    every month, quarter or year after the start."""
    first_month_end = start + datetime.timedelta(days=_FIRST_MONTH[-1])
    found = [start + datetime.timedelta(days=days) for days in _FIRST_MONTH]
    step, count = _LONG_MONTHS.get(long_rhythm or "月", 1), 1
    while (day := add_months(start, step * count)) <= through:
        if day > first_month_end:
            found.append(day)
        count += 1
    return [day for day in sorted(set(found)) if day <= through]


def observation_due(start: datetime.date, long_rhythm: str | None, note_days: Iterable[datetime.date], today: datetime.date) -> dict[str, Any] | None:
    """The latest checkpoint that has passed with no note written since the checkpoint before it; None when the
    person is up to date. One note in a period settles that period."""
    points = checkpoints(start, long_rhythm, today)
    if not points:
        return None
    previous = points[-2] if len(points) > 1 else start
    if any(day > previous for day in note_days):
        return None
    return {"since": points[-1].isoformat(), "weekly": points[-1] <= start + datetime.timedelta(days=_FIRST_MONTH[-1])}


def _day(doc: Mapping[str, Any], key: str, offset: int) -> datetime.date:
    return local_date(doc[key], offset)


def started_at(versions: list[Mapping[str, Any]]) -> str | None:
    """When the person first marked the task 進行中 or 完成 (every version of one task, oldest first); None while it has not begun."""
    return next((version["at"] for version in versions if version["content"].get("status") in ACTED), None)


def case_reminders(tasks: list[dict[str, Any]], notes: list[dict[str, Any]], calibrations: list[dict[str, Any]], revisits: list[dict[str, Any]],
                   today: datetime.date, utc_offset_minutes: int = 0) -> list[dict[str, Any]]:
    """What is due in one case (each item: block, kind, text, since). ``tasks`` etc. are the current documents of
    act.task / act.note / learn.calibration / learn.revisit; a task carries ``started_at`` (see ``started_at``) -- one that has
    not begun has nothing to observe yet. A review counts from its latest version: updating one after the due date settles it."""
    due: list[dict[str, Any]] = []
    reviewed = [_day(doc, "at", utc_offset_minutes) for doc in calibrations]
    for task in tasks:
        content = task["content"]
        note_days = [_day(note, "created_at", utc_offset_minutes) for note in notes if note["content"].get("task") == task["doc_id"]]
        if content.get("status") not in CLOSED and task.get("started_at"):
            found = observation_due(_day(task, "started_at", utc_offset_minutes), content.get("long_rhythm"), note_days, today)
            if found:
                due.append({"block": "ACT", "kind": "note", "since": found["since"], "text": f"該記一筆觀察了：{content['title']}", "weekly": found["weekly"]})
    deadlines = [datetime.date.fromisoformat(task["content"]["due"]) for task in tasks if task["content"].get("due") and task["content"].get("status") != "停掉"]
    deadlines += [datetime.date.fromisoformat(doc["content"]["on"]) for doc in revisits]
    open_reviews = sorted(day for day in deadlines if day <= today and not any(done >= day for done in reviewed))
    if open_reviews:
        due.append({"block": "LEARN", "kind": "review", "since": open_reviews[0].isoformat(), "text": "到期了，回來對一下當初的判斷和預測"})
    return sorted(due, key=lambda item: item["since"])


def _week(day: datetime.date) -> tuple[int, int]:
    year, week, _ = day.isocalendar()
    return year, week


def practice_reminders(practice: Mapping[str, Any] | None, dailies: list[dict[str, Any]], sprints: list[dict[str, Any]],
                       today: datetime.date, utc_offset_minutes: int = 0) -> list[dict[str, Any]]:
    """The two practices the person set (每天 10 分鐘校準、每週 2 到 3 次 30 分鐘思考衝刺): what is still undone today / this week."""
    if not practice:
        return []
    due: list[dict[str, Any]] = []
    if practice.get("daily") and not any(_day(card, "created_at", utc_offset_minutes) == today for card in dailies):
        due.append({"block": "LEARN", "kind": "daily", "since": today.isoformat(), "text": "今天的 10 分鐘校準還沒寫"})
    wanted = int(practice.get("weekly_sprints") or 0)
    done = sum(1 for sprint in sprints if _week(_day(sprint, "created_at", utc_offset_minutes)) == _week(today))
    if wanted and done < wanted:
        monday = today - datetime.timedelta(days=today.weekday())
        due.append({"block": "LEARN", "kind": "sprint", "since": monday.isoformat(), "text": f"這週還差 {wanted - done} 次 30 分鐘的思考衝刺"})
    return due
