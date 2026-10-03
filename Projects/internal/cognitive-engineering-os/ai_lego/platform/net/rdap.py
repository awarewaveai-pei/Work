"""Who registered a site and when: the registry's RDAP record (GATHER 「網域什麼時候註冊」). One registry per top-level
domain, from the versioned list ``gather.registries``; a domain whose registry is not on it is 無法檢查.

Traps for future readers:
- Only through ``egress.fetch_json``: every registry host is on the runtime allowlist (docker-compose.yml) and in
  policy EGRESS-EC99-2 (tests/unit/test_block_gather checks each one).
- A registry that is down, refuses or is not reachable from here is 無法檢查 with why -- never 查不到 and never an error.
"""

from __future__ import annotations

from typing import Any, Mapping

from ai_lego.core.domain.evidence_words import FOUND, NOT_FOUND, UNCHECKABLE, cell
from ai_lego.errors import InvariantViolation
from ai_lego.platform.net.egress import fetch_json
from ai_lego.platform.rulesets import require


def registrable(host: str) -> str:
    """The name a registry holds: the last two labels, or three under a second level like co.uk or com.tw."""
    labels = host.lower().strip(".").removeprefix("www.").split(".")
    second_level = set(require("gather.registries").items["second_level"])
    keep = 3 if len(labels) >= 3 and ".".join(labels[-2:]) in second_level else 2
    return ".".join(labels[-keep:])


def _country(entities: Any) -> str | None:
    """The registrant's country as the record states it (vCard adr ``cc``, else the address's country line); most
    registries hide it."""
    for entity in entities if isinstance(entities, list) else []:
        if not isinstance(entity, Mapping):
            continue
        if "registrant" in (entity.get("roles") or []):
            vcard = entity.get("vcardArray")
            for item in vcard[1] if isinstance(vcard, list) and len(vcard) > 1 and isinstance(vcard[1], list) else []:
                if isinstance(item, list) and len(item) >= 4 and item[0] == "adr":
                    params, value = item[1] if isinstance(item[1], Mapping) else {}, item[3]
                    found = params.get("cc") or (value[6] if isinstance(value, list) and len(value) > 6 else None)
                    if isinstance(found, str) and found.strip() and "redact" not in found.lower():
                        return found.strip()[:60]
        nested = _country(entity.get("entities"))
        if nested:
            return nested
    return None


def lookup(host: str) -> dict[str, dict[str, str]]:
    """``{"registered": cell, "country": cell}`` for the site at ``host``."""
    name = registrable(host)
    tld = name.rsplit(".", 1)[-1]
    rules = require("gather.registries").items
    base = rules["rdap"].get(tld)
    if base is None:
        why = rules["not_listed"].get(tld) or f"「.{tld}」的網域註冊資料庫不在平台的名單上"
        return {"registered": cell(UNCHECKABLE, why=why), "country": cell(UNCHECKABLE, why=why)}
    try:
        record = fetch_json(f"{base}domain/{name}", headers={"Accept": "application/rdap+json"}, error_prefix="RDAP")
    except InvariantViolation as error:
        if "HTTP 404" in str(error):
            why = f"網域註冊資料庫查不到 {name}"
            return {"registered": cell(NOT_FOUND, why=why), "country": cell(NOT_FOUND, why=why)}
        why = "網域註冊資料庫這次沒有回應"
        return {"registered": cell(UNCHECKABLE, why=why), "country": cell(UNCHECKABLE, why=why)}
    events = record.get("events") if isinstance(record.get("events"), list) else []
    date = next((event.get("eventDate") for event in events if isinstance(event, Mapping) and event.get("eventAction") == "registration"), None)
    registered = cell(FOUND, date[:10], why=f"{name} 在網域註冊資料庫的註冊日") if isinstance(date, str) and len(date) >= 10 else cell(NOT_FOUND, why="註冊資料沒有寫註冊日期")
    country = _country(record.get("entities"))
    return {"registered": registered,
            "country": cell(FOUND, rules["countries"].get(country.upper(), country), why="網域註冊資料寫的") if country else cell(NOT_FOUND, why="註冊資料沒有寫國家（常被隱藏）")}
