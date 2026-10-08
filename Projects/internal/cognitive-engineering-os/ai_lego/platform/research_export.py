"""The research export (docs/platform/STEP34_SHARED_RULES.md §6, §10; card 31): what of a study leaves, what is left out,
and why. The only consumer of ``research`` consents; reached by the operator's CLI (apps/cli/research_export.py), never by
a web route (tests/unit/test_research_export.py scans apps/api).

Leaves: every document a live research consent for the study names, as stored, with its kind and version, under a
pseudonymous ``subject`` (HMAC-SHA256 with the study's own secret). Taken out: the account (identity ids, email, display
name, a contact) and the three places (where it happened, where you are, where each party is) wherever they sit in a
document. Not taken out: names inside the person's own text -- the page asks them to remove those first, and the header
says the file does not guarantee nobody can be recognised. It never calls itself anonymous. Nothing is filtered by how a
case went: one that did not change, failed or was abandoned is in when its consent is live.

FACILITATE's drift records (``facilitate.log``, card 61) come in only when the facilitator and every current participant
of that group hold a live research consent for the study.
"""

from __future__ import annotations

import ast
import hashlib
import hmac
import json
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Mapping

from ai_lego.core.domain import doc_kinds
from ai_lego.data import db
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation
from ai_lego.platform import visibility

CONSENT = "govern.consent"
DRIFT_KIND = "facilitate.log"   # card 61's; until it is registered no drift record exists
SECRET_ENV_PREFIX = "COGNITIVE_OS_STUDY_SECRET_"

HEADER_ZH = "這份檔案拿掉了帳號和三個地點（發生地、你在哪裡、當事人各在哪裡）；不保證認不出是誰。內文裡的人名沒有拿掉。"
HEADER_EN = "this file removes the account and three places; it does not guarantee that a person cannot be recognised. Names inside the text are not removed."

# The three places, by the key names the kinds use for them, removed wherever they appear (a json field's nested key
# too: a MAP item's ``place``). A new key that looks like a place fails test_research_export's gate until it is here or
# in NOT_A_PLACE.
PLACE_KEYS = {
    "happened_in": "發生地 (assembler.intake)",
    "you_are_in": "你在哪裡 (assembler.intake)",
    "others_in": "當事人各在哪裡 (assembler.intake)",
    "where": "你在哪裡 (govern.location, collab.place)",
    "place": "a MAP item's place (map.layers), the place whose fact-check list VERIFY used",
    "jurisdictions": "適用哪裡的法律 (context.*, taken from the intake's places)",
}
NOT_A_PLACE = {"hide_places": "a yes/no switch (collab contract), no place in it", "placements": "map.placement: which MAP layer a card goes in"}
PLACE_LIKE = re.compile(r"place|where|happened_in|you_are_in", re.IGNORECASE)
# The account: who someone is, as the platform knows them. field_contact: someone to ask, a person's contact.
ACCOUNT_KEYS = frozenset({"email", "display_name", "field_contact"})
REASONS = ("consent_withdrawn", "consent_missing_item", "case_erased", "not_all_consented")


def _is_account_key(key: str) -> bool:
    return key in ACCOUNT_KEYS or key == "identity_id" or key.endswith("_identity_id")


def scrub(value: Any) -> Any:
    """The value without the account and the places, at any depth; everything else exactly as stored."""
    if isinstance(value, Mapping):
        return {key: scrub(item) for key, item in value.items() if key not in PLACE_KEYS and not _is_account_key(key)}
    if isinstance(value, list):
        return [scrub(item) for item in value]
    return value


def unhandled_place_keys(kinds_dir: Path) -> list[str]:
    """Every key in the kind modules (a field name, a dict key, an ``unread_keys`` entry) that looks like a place and is
    neither removed (PLACE_KEYS) nor reviewed as not one (NOT_A_PLACE)."""
    found = []
    for path in sorted(kinds_dir.glob("*.py")):
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            names = []
            if isinstance(node, ast.Dict):
                names = [key.value for key in node.keys if isinstance(key, ast.Constant) and isinstance(key.value, str)]
            elif isinstance(node, ast.keyword) and node.arg == "unread_keys" and isinstance(node.value, (ast.Tuple, ast.List)):
                names = [item.value for item in node.value.elts if isinstance(item, ast.Constant) and isinstance(item.value, str)]
            found += [f"{path.name}: {name}" for name in names if PLACE_LIKE.search(name) and name not in PLACE_KEYS and name not in NOT_A_PLACE]
    return found


def study_secret(study_id: str, environ: Mapping[str, str]) -> bytes:
    name = SECRET_ENV_PREFIX + re.sub(r"[^A-Z0-9]", "_", study_id.upper())
    secret = environ.get(name, "")
    if not secret.strip():
        raise InvariantViolation(f"RESEARCH_STUDY_SECRET_MISSING: set {name}; nothing is exported without the study's own secret")
    return secret.encode("utf-8")


def _pseudonym(secret: bytes, label: str, value: str) -> str:
    return hmac.new(secret, f"{label}:{value}".encode("utf-8"), hashlib.sha256).hexdigest()


def _moment(value: datetime | str) -> datetime:
    return value if isinstance(value, datetime) else datetime.fromisoformat(value.replace("Z", "+00:00"))


def _state_at(versions: list[dict[str, Any]], moment: datetime | str) -> dict[str, Any] | None:
    """The version of a consent in force at ``moment`` (the last one written by then), or None. The database answers a
    moment as text (db: ISO), the caller as a datetime: both are read here."""
    moment = _moment(moment)
    before = [version for version in versions if _moment(version["at"]) <= moment]
    return before[-1] if before else None


def _consents(docs: CaseDocs, repo: ProjectSourceRepository, tenant_id: str, study_id: str) -> list[tuple[str, list[dict[str, Any]]]]:
    """(owner identity, every version of the consent) for each research consent any version of which names the study."""
    with repo.transaction(tenant_id) as connection:
        rows = connection.execute(
            "SELECT DISTINCT owner_id, payload_json->>'doc_id' AS doc_id FROM events WHERE tenant_id=%s AND owner_kind='person' AND event_type='DocSaved' "
            "AND payload_json->>'kind' = %s AND payload_json->'content'->>'purpose' = 'research' AND payload_json->'content'->>'target' = %s ORDER BY owner_id, doc_id",
            (tenant_id, CONSENT, study_id),
        ).fetchall()
    found = []
    for row in rows:
        try:
            found.append((row["owner_id"], docs.versions(tenant_id, record_log.person(row["owner_id"]), CONSENT, row["doc_id"])))
        except InvariantViolation:   # its owner's account erased in between: nothing of theirs leaves
            continue
    return found


def _live(versions: list[dict[str, Any]], study_id: str, moment: datetime) -> dict[str, Any] | None:
    state = _state_at(versions, moment)
    if state is None or state["content"].get("purpose") != "research" or state["content"].get("target") != study_id or state["content"].get("withdrawn"):
        return None
    return state


def _last_export(repo: ProjectSourceRepository, tenant_id: str, study_id: str) -> datetime | str | None:
    with repo.transaction(tenant_id) as connection:
        row = connection.execute("SELECT MAX(exported_at) AS at FROM research_exports WHERE tenant_id=%s AND study_id=%s", (tenant_id, study_id)).fetchone()
    return row["at"] if row else None


def _withdrawals_since(consents: list[tuple[str, list[dict[str, Any]]]], study_id: str, since: datetime | str | None, now: datetime) -> int:
    """Consents of the study that were live at the last export (ever, with none) and are not live now."""
    count = 0
    for _owner, versions in consents:
        if since is None:   # no export yet: every consent that was ever live
            before = any(version["content"].get("purpose") == "research" and version["content"].get("target") == study_id and not version["content"].get("withdrawn") for version in versions)
        else:
            before = _live(versions, study_id, since) is not None
        if before and _live(versions, study_id, now) is None and _state_at(versions, now) is not None:
            count += 1
    return count


def _drift(docs: CaseDocs, repo: ProjectSourceRepository, tenant_id: str, consenting: set[str], secret: bytes) -> tuple[list[dict[str, Any]], list[str]]:
    """The drift records of consenting facilitators whose groups' current participants all consent (else excluded)."""
    if DRIFT_KIND not in doc_kinds.kinds():
        return [], []
    lines, excluded = [], []
    for facilitator in sorted(consenting):
        for record in docs.current(tenant_id, record_log.person(facilitator), DRIFT_KIND):
            group_id = str(record["content"].get("group_id", ""))
            members = repo.group_members(tenant_id, group_id) if group_id else []
            participants = {member["identity_id"] for member in members if member["role"] == "participant"}
            if not members or not participants <= consenting:
                excluded.append("not_all_consented")
                continue
            lines.append({"type": "drift", "subject": _pseudonym(secret, "identity", facilitator), "group": _pseudonym(secret, "group", group_id),
                          "kind": DRIFT_KIND, "version": record["version"], "content": scrub({key: value for key, value in record["content"].items() if key != "group_id"})})
    return lines, excluded


def export(repo: ProjectSourceRepository, tenant_id: str, study_id: str, out: Path, *, now: datetime, environ: Mapping[str, str] | None = None) -> dict[str, Any]:
    """Write the study's JSONL to ``out`` (a header line, then one line per document) and return its manifest; record
    the export (study, when, manifest hash) so the next one counts the withdrawals in between. Refuses without the study's
    secret before reading anything."""
    if not isinstance(study_id, str) or not study_id.strip() or len(study_id) > 200:
        raise InvariantViolation("RESEARCH_STUDY_INVALID: a study id of 1..200 characters")
    secret = study_secret(study_id, os.environ if environ is None else environ)
    docs = CaseDocs(repo)
    consents = _consents(docs, repo, tenant_id, study_id)
    lines: list[dict[str, Any]] = []
    excluded: list[str] = []
    consenting: set[str] = set()
    for owner_id, versions in consents:
        state = _live(versions, study_id, now)
        if state is None:
            excluded.append("consent_withdrawn")
            continue
        consenting.add(owner_id)
        follow = bool(state["content"].get("follow_versions"))
        for item in state["content"].get("items") or []:
            if repo.get_project(tenant_id, item["project_id"]) is None:
                excluded.append("case_erased")
                continue
            found = visibility.named_document(docs, repo, tenant_id, owner_id, item, follow)
            if found is None:
                excluded.append("consent_missing_item")
                continue
            lines.append({"type": "item", "subject": _pseudonym(secret, "identity", owner_id), "case": _pseudonym(secret, "case", item["project_id"]),
                          "kind": found["kind"], "version": found["version"], "content": scrub(found["content"])})
    drift, drift_excluded = _drift(docs, repo, tenant_id, consenting, secret)
    since = _last_export(repo, tenant_id, study_id)
    header = {"type": "header", "study": study_id, "exported_at": db.iso(now), "zh": HEADER_ZH, "en": HEADER_EN}
    body = "".join(json.dumps(line, ensure_ascii=False, sort_keys=True, default=str) + "\n" for line in (header, *lines, *drift))
    out.write_bytes(body.encode("utf-8"))
    manifest = {
        "study": study_id, "exported_at": db.iso(now), "header": {"zh": HEADER_ZH, "en": HEADER_EN},
        "removed": {"account": sorted(ACCOUNT_KEYS | {"*identity_id"}), "places": sorted(PLACE_KEYS)},
        "not_removed": "names inside the text",
        "items": len(lines), "drift_records": len(drift),
        "excluded": sorted(excluded + drift_excluded),   # the reason of each, never who
        "withdrawals_since_last_export": _withdrawals_since(consents, study_id, since, now),
        "file_sha256": hashlib.sha256(body.encode("utf-8")).hexdigest(),
    }
    digest = hashlib.sha256(json.dumps(manifest, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()
    with repo.transaction(tenant_id) as connection:
        connection.execute("INSERT INTO research_exports (tenant_id, study_id, exported_at, manifest_sha256) VALUES (%s,%s,%s,%s)", (tenant_id, study_id, now, digest))
    return manifest
