"""FACILITATE's checks before a save (docs/platform/STEP34_SHARED_RULES.md §5, §11; card 61), inside the save's lock, and
``drift_records``, the one place a leader's log leaves for research.

- ``facilitate.log``: written by a current facilitator of the log's group, naming a script and version that exist, each
  deviation saying what and why.
- ``facilitate.supervision``: written only by an eligible supervisor, only about a leader they supervise now (their link
  stands) -- eligibility is asked again here, not remembered.
- ``assembler.intake.led_by``: exactly one facilitator's identity id (a field GOVERN does not scan holds no free text).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.kinds.facilitate import MAX_DEVIATIONS
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation
from ai_lego.platform import visibility
from ai_lego.platform.scripts import load_scripts, usable_for_leading
from ai_lego.platform.visibility import Viewer

DRIFT_KIND = "facilitate.log"
PART = 1000   # characters of one "what" or "why"


def _text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip()) and len(value) <= PART


def _log_checked(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, content: dict[str, Any], _doc_id: str | None) -> None:
    group_id = content.get("group_id")
    try:   # the group still there and the writer in it, under the group lock until this save commits
        docs.reads.hold_group(tenant_id, str(group_id), owner.id)
    except InvariantViolation as error:
        if str(error).startswith(("GROUP_NOT_FOUND", "GROUP_ERASED")):
            raise InvariantViolation(f"GROUP_NOT_FOUND: {group_id!r}") from None
        raise
    if not visibility.is_leader_of(docs, Viewer(tenant_id, owner.id), str(group_id)):
        raise InvariantViolation("FACILITATE_LOG_NOT_LEADER: a log is written by a facilitator of the group it is about, who has finished the leader course")
    script = next((item for item in load_scripts().items if item["id"] == content.get("script")), None)
    if script is None or script["version"] != content.get("script_version"):
        raise InvariantViolation(f"FACILITATE_SCRIPT_VERSION_UNKNOWN: {content.get('script')!r} v{content.get('script_version')!r}")
    if not any(item["id"] == script["id"] for item in usable_for_leading()):   # only a script that may lead is one a session followed
        raise InvariantViolation(f"FACILITATE_SCRIPT_NOT_REVIEWED: {script['id']!r} is a draft or has no stop signal")
    deviated = [] if content.get("deviated") is None else content["deviated"]
    if (not isinstance(deviated, list) or len(deviated) > MAX_DEVIATIONS
            or any(not isinstance(item, dict) or set(item) != {"what", "why"} or not _text(item["what"]) or not _text(item["why"]) for item in deviated)):
        raise InvariantViolation(f"FACILITATE_DEVIATION_INVALID: at most {MAX_DEVIATIONS} entries, each {{what, why}}, both written")
    followed = content.get("followed")
    if not deviated and not (isinstance(followed, str) and followed.strip()):
        raise InvariantViolation("FACILITATE_LOG_EMPTY: write what followed the script, or where it did not and why")


def _supervision_checked(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, content: dict[str, Any], _doc_id: str | None) -> None:
    viewer = Viewer(tenant_id, owner.id)
    if not visibility.is_eligible_supervisor(docs, viewer):
        raise InvariantViolation("FACILITATE_SUPERVISOR_NOT_ELIGIBLE: a supervisor has finished the leader course and has led at least once")
    if not visibility.supervises(docs, viewer, str(content.get("supervisee"))):   # a stranger and a person who is not there answer alike
        raise InvariantViolation("FACILITATE_SUPERVISEE_NOT_FOUND: nobody you supervise has that id")


def _intake_checked(_docs: CaseDocs, _tenant_id: str, _owner: record_log.Owner, content: dict[str, Any], _doc_id: str | None) -> None:
    led_by = content.get("led_by")
    if led_by and (not isinstance(led_by, dict) or set(led_by) != {"facilitator_identity_id"} or not _text(led_by["facilitator_identity_id"])):
        raise InvariantViolation("FACILITATE_LED_BY_INVALID: name the facilitator who led this case, and nothing else")


def drift_records(docs: CaseDocs, repo: ProjectSourceRepository, tenant_id: str, consenting: set[str]) -> tuple[list[dict[str, Any]], list[str]]:
    """The part of a leader's logs that reaches research (card 31's rule, FACILITATE 「產出給誰」): the ``deviated`` entries
    of a log -- with its script and version, never what followed -- and only when the leader and every current participant
    of the log's group are in ``consenting`` (the identities whose research consent for the study stands). A log of a
    group that is gone, or with a participant who did not consent, is left out and named as such. Returns (records, one
    reason per log left out)."""
    records: list[dict[str, Any]] = []
    excluded: list[str] = []
    for facilitator in sorted(consenting):
        for log in docs.current(tenant_id, record_log.person(facilitator), DRIFT_KIND):
            content = log["content"]
            if not content.get("deviated"):
                continue
            members = repo.group_members(tenant_id, str(content.get("group_id", "")))
            participants = {member["identity_id"] for member in members if member["role"] == "participant"}
            if not members or not participants <= consenting:
                excluded.append("not_all_consented")
                continue
            records.append({"facilitator": facilitator, "group_id": content["group_id"], "version": log["version"],
                            "content": {"script": content["script"], "script_version": content["script_version"], "deviated": content["deviated"]}})
    return records, excluded


BEFORE_SAVE = {"facilitate.log": _log_checked, "facilitate.supervision": _supervision_checked, "assembler.intake": _intake_checked}
