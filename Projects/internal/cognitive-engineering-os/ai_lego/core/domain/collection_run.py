"""CollectionRun shared-kernel record (specs/domain/collection-run.schema.yaml; runtime table ``collection_runs``)."""

from __future__ import annotations

import re
from typing import Any, Mapping

from ai_lego.core.domain._intake_validation import require_timestamp, require_uuid
from ai_lego.errors import InvariantViolation

RUN_ID = re.compile(r"^[A-Za-z0-9_-]{1,80}$")  # = the Recipe run_id rule
MAX_SEEDS = 10
MAX_FETCHES = 200  # = next-admin lib/collect/run.ts DEFAULT_BUDGET.fetches
RUN_STATUSES = ("requested", "running", "completed", "failed")
REPORT_COUNTERS = ("fetched", "written", "unchanged", "refused")


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
    return {
        "run_id": run_id,
        "project_id": require_uuid("COLLECTION_RUN", "project_id", project_id),
        "tenant_id": require_uuid("COLLECTION_RUN", "tenant_id", tenant_id),
        "status": "requested",
        "seeds_count": seeds_count,
        "max_fetches": max_fetches,
        "requested_by_identity_id": require_uuid("COLLECTION_RUN", "requested_by_identity_id", requested_by_identity_id),
        "requested_at": require_timestamp("COLLECTION_RUN", requested_at, "requested_at"),
        "completed_at": None,
        "report": None,
    }
