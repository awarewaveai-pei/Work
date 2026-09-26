"""Evolvable data registry (I9/C9, RESEARCH_LINES_MASTER_PLAN.md §3.8, card WC-P2-03).

Runtime code only ever calls ``load_champion``: ``champion.yaml`` inside each kind's
spec-root directory is the ONE switch point (C9: "champion 指標檔是唯一切換點（程式讀
它，不讀「最新版」）"). Promotion and rollback that write it live in the offline CLI
(``ai_lego.apps.cli.evolution``) -- this module never writes anything (P-K5: the spec
root is read-only from runtime code).

``evolution/kinds.yaml`` is the closed list of kinds evolvable data may exist for
(R14). ``load_champion`` rejects any kind not listed there rather than trusting the
caller -- an unlisted kind directory existing on disk is not itself an error (nothing
here enforces the negative), but reading through it is refused.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from ai_lego.errors import InvariantViolation
from ai_lego.platform.catalog.display_catalog import _yaml

KINDS_FILE = Path("evolution") / "kinds.yaml"


def _kinds_path(spec_root: Path) -> Path:
    return spec_root / KINDS_FILE


def _kind_dir(spec_root: Path, kind: str) -> Path:
    return spec_root / "evolution" / kind


def _load_yaml_or_raise(path: Path, code: str) -> Any:
    """``_yaml`` fails on a missing file or a malformed/duplicate-key document; both are
    the same fail-closed outcome here, wrapped with a stable code (P-g: "缺檔／壞
    yaml／版本檔不存在 → InvariantViolation(...)，不回預設")."""
    if not path.is_file():
        raise InvariantViolation(f"{code}: {path} does not exist")
    try:
        return _yaml(path)
    except (ValueError, yaml.YAMLError) as error:
        raise InvariantViolation(f"{code}: {path}: {error}") from error


def known_kinds(spec_root: Path) -> dict[str, Any]:
    """The closed kind -> metadata mapping from ``evolution/kinds.yaml`` (R14)."""
    doc = _load_yaml_or_raise(_kinds_path(spec_root), "EVOLUTION_KINDS_FILE_INVALID")
    kinds = doc.get("kinds") if isinstance(doc, dict) else None
    if not isinstance(kinds, dict) or not kinds:
        raise InvariantViolation(f"EVOLUTION_KINDS_FILE_EMPTY: {_kinds_path(spec_root)} has no 'kinds' mapping")
    return kinds


def _require_known_kind(spec_root: Path, kind: str) -> dict[str, Any]:
    kinds = known_kinds(spec_root)
    if kind not in kinds:
        raise InvariantViolation(f"EVOLUTION_UNKNOWN_KIND: {kind!r} is not listed in {_kinds_path(spec_root)}")
    return kinds[kind]


def load_champion(spec_root: Path, kind: str) -> tuple[str, dict[str, Any]]:
    """Return ``(version, document)`` for ``kind``'s current champion.

    Fails closed on every way this can go wrong -- unknown kind, missing
    champion.yaml, champion.yaml with no string ``version``, the version file it
    names missing, or that file failing to parse -- never a silent default (P-g).
    """
    _require_known_kind(spec_root, kind)
    kind_dir = _kind_dir(spec_root, kind)
    champion_path = kind_dir / "champion.yaml"
    champion = _load_yaml_or_raise(champion_path, "EVOLUTION_CHAMPION_MALFORMED")
    version = champion.get("version") if isinstance(champion, dict) else None
    if not isinstance(version, str) or not version:
        raise InvariantViolation(f"EVOLUTION_CHAMPION_MALFORMED: {champion_path} has no non-empty string 'version'")
    version_path = kind_dir / f"{version}.yaml"
    document = _load_yaml_or_raise(version_path, "EVOLUTION_VERSION_FILE_INVALID")
    if not isinstance(document, dict):
        raise InvariantViolation(f"EVOLUTION_VERSION_FILE_INVALID: {version_path} did not parse to a mapping")
    return version, document


def list_versions(spec_root: Path, kind: str) -> list[str]:
    """Every version file that exists for ``kind`` (stem, sorted), champion or not."""
    _require_known_kind(spec_root, kind)
    kind_dir = _kind_dir(spec_root, kind)
    if not kind_dir.is_dir():
        return []
    return sorted(p.stem for p in kind_dir.glob("*.yaml") if p.stem != "champion")
