"""CollectionRun shared-kernel record (specs/domain/collection-run.schema.yaml; runtime table ``collection_runs``)."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping

from ai_lego.core.domain._intake_validation import require_timestamp, require_uuid
from ai_lego.errors import InvariantViolation

RUN_ID = re.compile(r"^[A-Za-z0-9_-]{1,80}$")  # = the Recipe run_id rule
MAX_SEEDS = 10
MAX_FETCHES = 200  # = next-admin lib/collect/run.ts DEFAULT_BUDGET.fetches
RUN_STATUSES = ("requested", "running", "completed", "failed")
OPEN_STATUSES = ("requested", "running")
REPORT_COUNTERS = ("fetched", "written", "unchanged", "refused")
# How long a run may stay open. The one deadline: the run row stores it and the run's grant is issued to expire at the
# same instant, so "the grant is dead" and "the run is over" can never disagree. Long enough for Trigger to queue the run
# and for the crawl (capped at 240 s in next-admin) to finish; a leaked grant token dies within the hour.
RUN_TTL = timedelta(minutes=30)
_HAN = re.compile(r"[\u3400-\u9fff\uf900-\ufaff]")


def query_language(text: str) -> str:
    """The language a claim seed's words are written in: zh when they hold any Chinese character, else en. A claim seed
    searches in exactly this language (main._research_seeds): 2026-10-11 a Chinese question with English words appended
    (「…修改條件嗎？ official statement document」) found a dictionary entry for 嗎. A second language is a second seed
    whose words are a translation (GATHER's AI queries), or no second seed."""
    return "zh" if _HAN.search(text) else "en"


def _instant(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def effective_status(stored_status: str, deadline_at: str, now: datetime | None = None) -> str:
    """The run's status as every reader must see it: an open run past its deadline is failed -- nobody can finish it
    any more (its grant expired at the same instant). Derived, never written back."""
    now = now or datetime.now(timezone.utc)
    if stored_status in OPEN_STATUSES and now >= _instant(deadline_at):
        return "failed"
    return stored_status


def run_report(report: Mapping[str, Any] | None) -> dict[str, Any] | None:
    """The collector's summary of one run: four non-negative counters + why it stopped. ``None`` = no report."""
    if report is None:
        return None
    if not isinstance(report, Mapping) or set(report) != {*REPORT_COUNTERS, "stopped_by"}:
        raise InvariantViolation("COLLECTION_RUN_REPORT_INVALID")
    for key in REPORT_COUNTERS:
        value = report[key]
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise InvariantViolation("COLLECTION_RUN_REPORT_INVALID")
    stopped_by = report["stopped_by"]
    if not isinstance(stopped_by, str) or not 1 <= len(stopped_by) <= 40:
        raise InvariantViolation("COLLECTION_RUN_REPORT_INVALID")
    return {key: report[key] for key in (*REPORT_COUNTERS, "stopped_by")}


def collection_run_record(
    run_id: str,
    project_id: str,
    tenant_id: str,
    seeds_count: int,
    max_fetches: int,
    requested_by_identity_id: str,
    requested_at: str,
) -> dict[str, Any]:
    """A newly requested run; it becomes running, then completed or failed, only through the repository."""
    if not isinstance(run_id, str) or RUN_ID.fullmatch(run_id) is None:
        raise InvariantViolation("COLLECTION_RUN_ID_INVALID")
    for value, maximum, code in ((seeds_count, MAX_SEEDS, "COLLECTION_RUN_SEEDS_INVALID"), (max_fetches, MAX_FETCHES, "COLLECTION_RUN_BUDGET_INVALID")):
        if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= maximum:
            raise InvariantViolation(code)
    requested = require_timestamp("COLLECTION_RUN", requested_at, "requested_at")
    return {
        "run_id": run_id,
        "project_id": require_uuid("COLLECTION_RUN", "project_id", project_id),
        "tenant_id": require_uuid("COLLECTION_RUN", "tenant_id", tenant_id),
        "status": "requested",
        "seeds_count": seeds_count,
        "max_fetches": max_fetches,
        "requested_by_identity_id": require_uuid("COLLECTION_RUN", "requested_by_identity_id", requested_by_identity_id),
        "requested_at": requested,
        "deadline_at": (_instant(requested) + RUN_TTL).astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "completed_at": None,
        "report": None,
    }
