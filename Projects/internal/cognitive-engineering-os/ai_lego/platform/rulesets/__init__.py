"""The lists and rules a block decides with (來源名單、分類規則、分組規則、操弄手法清單、查核資料庫名單、算法), each with a
version GOVERN shows (docs/platform/STEP2_SHARED_RULES.md §6).

A block declares its own in ``ai_lego/platform/rulesets/<block>.py``: ``RULESETS = [Ruleset(...)]`` and
``HISTORY = {name: {version: fingerprint}}``. ``rulesets()`` refuses one whose items changed without a new version
(名單和規則改版時記下改了什麼): the current version's fingerprint must be the one HISTORY recorded for it. A recorded
entry never changes (tests/unit/test_step2_foundation compares HISTORY with the last commit): a change = a new version.
"""

from __future__ import annotations

import importlib
import pkgutil
from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from ai_lego.errors import InvariantViolation
from ai_lego.platform.safety import digest


@dataclass(frozen=True)
class Ruleset:
    name: str          # "<block>.<thing>", e.g. "verify.techniques"
    block: str
    title: str         # what the person reads, e.g. 「操弄手法清單」
    version: str
    maintainer: str    # 誰維護 (畫面寫明那份名單是誰維護的、哪一版)
    items: Any         # json-able content: the list or the rule itself

    def fingerprint(self) -> str:
        return digest({"title": self.title, "maintainer": self.maintainer, "items": self.items})

    def stamp(self) -> dict[str, str]:
        """What a card, a ledger line or a run stores: which version it used, and what that version said."""
        return {"name": self.name, "version": self.version, "fingerprint": self.fingerprint()}


@lru_cache(maxsize=1)
def rulesets() -> dict[str, Ruleset]:
    from ai_lego.platform import rulesets as package

    found: dict[str, Ruleset] = {}
    for info in sorted(pkgutil.iter_modules(package.__path__), key=lambda module: module.name):
        module = importlib.import_module(f"{package.__name__}.{info.name}")
        history = getattr(module, "HISTORY", {})
        for ruleset in getattr(module, "RULESETS", ()):
            if ruleset.name in found:
                raise InvariantViolation(f"RULESET_DUPLICATE: {ruleset.name}")
            if not ruleset.name.startswith(f"{info.name}.") or ruleset.block.lower() != info.name:
                raise InvariantViolation(f"RULESET_INVALID: {ruleset.name} lives in rulesets/{info.name}.py and is named <{info.name}>.<thing>")
            check(ruleset, history)
            found[ruleset.name] = ruleset
    return found


_KEPT: dict[tuple[str, str], tuple[Any, Ruleset]] = {}


def kept_load(name: str, root: Path, load: Callable[[], Ruleset]) -> Ruleset:
    """The ruleset ``load`` builds from the content files under ``root``, kept until one of those files changes (path, mtime, size): a
    content route re-parsed and re-hashed its YAML on every request (21 ms of CPU for the lessons, a 3-7 s first request), the
    capacity rig, 2026-10-12. Callers use the default content root only (an explicit root, the tests and tooling, always reads
    fresh) and treat the result as read-only."""
    stamp = tuple(sorted((str(path), path.stat().st_mtime_ns, path.stat().st_size) for path in root.rglob("*") if path.is_file()))
    kept = _KEPT.get((name, str(root)))
    if kept is None or kept[0] != stamp:
        kept = _KEPT[(name, str(root))] = (stamp, load())
    return kept[1]


def check(ruleset: Ruleset, history: dict[str, dict[str, str]]) -> None:
    """The version a ruleset claims is the one HISTORY recorded for exactly these items."""
    recorded = history.get(ruleset.name, {}).get(ruleset.version)
    if recorded != ruleset.fingerprint():
        raise InvariantViolation(f"RULESET_CHANGED_WITHOUT_VERSION: {ruleset.name} v{ruleset.version} no longer says what HISTORY recorded "
                                 f"for it ({recorded}): give it a new version and add that version to HISTORY; never edit a recorded one")


def require(name: str) -> Ruleset:
    found = rulesets().get(name)
    if found is None:
        raise InvariantViolation(f"RULESET_UNKNOWN: {name!r}")
    return found
