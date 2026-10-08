"""GOVERN's check on a consent (docs/platform/STEP34_SHARED_RULES.md §6, card 13), before every person's save of one --
/me/consents and the generic /me/docs/govern.consent alike, inside the save's lock (blocks/docs.py _save).

Every item names a document of a case the person opened (as main._project_or_404 decides: a case that is someone
else's and one that is not there answer alike), of a case's kind, live; a pinned item a version it has. A group consent
names a group the person is in. A withdrawn version shares nothing, so it is not checked: withdrawing always works."""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain import doc_kinds
from ai_lego.core.domain.kinds.govern_group import MAX_ITEMS
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.errors import InvariantViolation

ITEM_KEYS = {"project_id", "kind", "doc_id", "version"}


def _check_consent(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, content: dict[str, Any], doc_id: str | None) -> None:
    if content.get("withdrawn") is True:
        return
    me, items = owner.id, content.get("items") or []
    if not isinstance(items, list) or len(items) > MAX_ITEMS:
        raise InvariantViolation(f"CONSENT_ITEMS_INVALID: at most {MAX_ITEMS} documents in one consent")
    if content.get("purpose") == "group" and docs.reads.membership(tenant_id, str(content.get("target")), me) is None:
        raise InvariantViolation("CONSENT_TARGET_NOT_FOUND: a consent for a group names a group you are in")
    for item in items:
        if not isinstance(item, dict) or set(item) - ITEM_KEYS or not all(isinstance(item.get(key), str) for key in ("project_id", "kind", "doc_id")):
            raise InvariantViolation("CONSENT_ITEMS_INVALID: each item is {project_id, kind, doc_id, version?}")
        project = docs.reads.case(tenant_id, item["project_id"])
        spec = doc_kinds.kinds().get(item["kind"])
        if project is None or project["created_by_identity_id"] != me or spec is None or spec.owner != "case":
            raise InvariantViolation(f"CONSENT_ITEM_NOT_FOUND: {item['doc_id']!r}")
        case = record_log.case(item["project_id"])
        if content.get("follow_versions") is True:   # as visibility.shared_with reads it: absent = pinned
            if not any(doc["doc_id"] == item["doc_id"] for doc in docs.current(tenant_id, case, item["kind"])):
                raise InvariantViolation(f"CONSENT_ITEM_NOT_FOUND: {item['doc_id']!r}")
        elif not any(doc["version"] == item.get("version") for doc in docs.versions(tenant_id, case, item["kind"], item["doc_id"])):
            raise InvariantViolation(f"CONSENT_ITEM_NOT_FOUND: {item['doc_id']!r} has no version {item.get('version')!r}")


BEFORE_SAVE = {"govern.consent": _check_consent}
