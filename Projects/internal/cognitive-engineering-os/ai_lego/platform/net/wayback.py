"""When a page was first archived (GATHER 「系統記每個來源最早什麼時候出現」): the Internet Archive's earliest capture.

Traps for future readers:
- The CDX API answers a JSON *array*; ``egress.fetch_json`` (the one network seam) takes only an object. The
  availability API asked for the capture closest to 1996 (before the archive began) answers an object holding the
  earliest capture -- the same fact.
- archive.org is on the runtime allowlist (docker-compose.yml) and in policy EGRESS-EC99-2.
"""

from __future__ import annotations

import urllib.parse
from typing import Mapping

from ai_lego.core.domain.evidence_words import FOUND, NOT_FOUND, UNCHECKABLE, cell
from ai_lego.errors import InvariantViolation
from ai_lego.platform.net.egress import fetch_json

HOST = "archive.org"


def first_capture(url: str) -> dict[str, str]:
    """查到 the date (YYYY-MM-DD) of the earliest capture; 查不到 when the archive never kept the page; 無法檢查 when
    it did not answer."""
    try:
        answer = fetch_json(f"https://{HOST}/wayback/available?url={urllib.parse.quote(url, safe='')}&timestamp=19960101", error_prefix="WAYBACK")
    except InvariantViolation:
        return cell(UNCHECKABLE, why="網頁封存館這次沒有回應")
    closest = (answer.get("archived_snapshots") or {}).get("closest") if isinstance(answer.get("archived_snapshots"), Mapping) else None
    stamp = closest.get("timestamp") if isinstance(closest, Mapping) and closest.get("available") is not False else None
    if not (isinstance(stamp, str) and len(stamp) >= 8 and stamp[:8].isdigit()):
        return cell(NOT_FOUND, why="網頁封存館沒有存過這一頁")
    return cell(FOUND, f"{stamp[:4]}-{stamp[4:6]}-{stamp[6:8]}")
