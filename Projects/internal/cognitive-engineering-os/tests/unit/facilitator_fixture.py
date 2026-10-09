"""A person who finished the leader course, written the way TEACH writes it (a run per lesson of the facilitator course,
then the system's completion), for tests that need a facilitator without going through the pages."""

from __future__ import annotations

import datetime

from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.platform.lessons import FACILITATOR_COURSE, courses, load_lessons, load_practice_cases


def lesson_versions() -> dict[str, int]:
    versions = {item["id"]: item["version"] for item in load_lessons().items}
    return {lesson_id: versions[lesson_id] for lesson_id in courses()[FACILITATOR_COURSE]}


def run_content(lesson_id: str, version: int) -> dict:
    return {"lesson": lesson_id, "lesson_version": version, "practice_case": load_practice_cases().items[0]["id"], "role": "提出者", "notes": "我先寫出看到的事。"}


def make_eligible(docs: CaseDocs, tenant_id: str, identity_id: str) -> dict[str, str]:
    """The identity's ``teach.run`` ids by lesson, with the course's completion saved: eligible until one of them is deleted."""
    owner, versions, runs = record_log.person(identity_id), lesson_versions(), {}
    for lesson_id, version in versions.items():
        runs[lesson_id] = docs.save(tenant_id, owner, "teach.run", run_content(lesson_id, version), record_log.user(identity_id, "TEACH"))["doc_id"]
    docs.save(tenant_id, owner, "teach.completion", {"course": FACILITATOR_COURSE, "lesson_versions": versions, "at": datetime.date.today().isoformat()}, record_log.system("TEACH"))
    return runs
