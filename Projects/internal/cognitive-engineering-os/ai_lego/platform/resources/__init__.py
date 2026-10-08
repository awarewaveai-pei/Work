"""Where to get help, per place (GOVERN, card 32; contract: 危機轉介的資源照你所在地給，不能只列一國的專線). Content, not
code: one YAML file per place in this folder, each versioned in HISTORY.json like a ruleset -- a changed text without a new
version is refused at load, and so is an entry whose ``source`` (who publishes it, when we checked) is not recorded. A
number nobody could check yet says ``checked_on: 尚未查核`` (``unchecked()`` lists them). Adding a place = a new file and
its HISTORY line, never a code change.

Selection reads only where the person is (``for_place``): a place one file ``matches`` gets that file's entries and the
international ones; any other place, or none, the international ones with ``FALLBACK``.
"""

from __future__ import annotations

import datetime
import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from ai_lego.errors import InvariantViolation

FOLDER = Path(__file__).resolve().parent
INTERNATIONAL = "國際通用"
KINDS = ("hotline", "text", "emergency")
UNCHECKED = "尚未查核"
FALLBACK = "這裡的資源我們還沒有，先給國際通用的"
_ENTRY_KEYS = {"kind", "name", "how_to_reach", "languages", "hours", "source"}


def fingerprint(content: dict[str, Any]) -> str:
    """What a place's file says, minus its version number."""
    from ai_lego.platform.safety import digest   # here: safety reads this module while it loads

    return digest({key: value for key, value in content.items() if key != "version"})


def _check_entry(place: str, entry: Any) -> dict[str, Any]:
    if not isinstance(entry, dict) or set(entry) != _ENTRY_KEYS or entry["kind"] not in KINDS or not all(isinstance(entry[key], str) and entry[key].strip() for key in ("name", "how_to_reach", "hours")):
        raise InvariantViolation(f"RESOURCE_ENTRY_INVALID: {place}: each entry is {sorted(_ENTRY_KEYS)}, kind one of {list(KINDS)}")
    source = entry["source"]
    if not isinstance(source, dict) or not str(source.get("name") or "").strip() or not source.get("checked_on"):
        raise InvariantViolation(f"RESOURCE_SOURCE_MISSING: {place}: {entry['name']!r} names no source (who publishes it, when it was checked)")
    if source["checked_on"] != UNCHECKED:
        try:
            datetime.date.fromisoformat(str(source["checked_on"]))
        except ValueError:
            raise InvariantViolation(f"RESOURCE_SOURCE_MISSING: {place}: {entry['name']!r} checked_on is a YYYY-MM-DD date or {UNCHECKED}") from None
    return entry


def load(folder: Path = FOLDER) -> dict[str, dict[str, Any]]:
    """Every place's set, checked: entries with a source, the version HISTORY recorded for exactly this text."""
    history = json.loads((folder / "HISTORY.json").read_text(encoding="utf-8"))
    found: dict[str, dict[str, Any]] = {}
    for path in sorted(folder.glob("*.yaml")):
        content = yaml.safe_load(path.read_text(encoding="utf-8"))
        place = content.get("place") if isinstance(content, dict) else None
        if not place or place in found or not isinstance(content.get("entries"), list) or not isinstance(content.get("matches"), list):
            raise InvariantViolation(f"RESOURCE_FILE_INVALID: {path.name}")
        content["entries"] = [_check_entry(place, entry) for entry in content["entries"]]
        if history.get(place, {}).get(str(content.get("version"))) != fingerprint(content):
            raise InvariantViolation(f"RESOURCE_CHANGED_WITHOUT_VERSION: {place} v{content.get('version')} no longer says what HISTORY.json recorded; "
                                     "give it a new version and add that version to HISTORY.json; never edit a recorded one")
        found[place] = content
    if INTERNATIONAL not in found:
        raise InvariantViolation(f"RESOURCE_FILE_INVALID: no {INTERNATIONAL} set")
    return found


@lru_cache(maxsize=1)
def places() -> dict[str, dict[str, Any]]:
    return load()


def place_of(where: str | None) -> str | None:
    """The place whose list covers what the person wrote, or None."""
    from ai_lego.platform.safety import normalise

    text = normalise(where or "").lower()
    if not text:
        return None
    return next((place for place, content in places().items() if place != INTERNATIONAL and any(str(name).lower() in text for name in content["matches"])), None)


def for_place(where: str | None) -> dict[str, Any]:
    """Help for where the person is: that place's entries then the international ones; else the international ones and
    the sentence that says so."""
    place = place_of(where)
    entries = (places()[place]["entries"] if place else []) + places()[INTERNATIONAL]["entries"]
    return {"place": place, "resources": [dict(entry) for entry in entries], "fallback": None if place else FALLBACK}


def unchecked() -> list[str]:
    """Every entry nobody has checked yet: place and name."""
    return [f"{place}: {entry['name']}" for place, content in places().items() for entry in content["entries"] if entry["source"]["checked_on"] == UNCHECKED]


def version() -> dict[str, str]:
    """Each place's version, for GOVERN's version list."""
    return {place: str(content["version"]) for place, content in places().items()}
