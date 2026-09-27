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

import hashlib
import re
from pathlib import Path
from typing import Any

import yaml

from ai_lego.errors import InvariantViolation
from ai_lego.platform.catalog.display_catalog import _yaml

KINDS_FILE = Path("evolution") / "kinds.yaml"
# A kind names one directory under evolution/ and a version one file inside it -- "../other" or "champion" would read
# another file as this kind.
KIND_NAME = re.compile(r"[a-z][a-z0-9-]*")
VERSION_NAME = re.compile(r"v[1-9][0-9]*")
# specs/execution/risk-tier.schema.yaml risk_tier.enum; a test keeps the two equal.
RISK_TIERS = ("R0", "R1", "R2", "R3", "R4")
_SHA256 = re.compile(r"[0-9a-f]{64}")


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
    """The closed kind -> metadata mapping from ``evolution/kinds.yaml`` (R14). Every kind is a directory name with a
    mapping holding a ``risk_tier`` in R0-R4: the CLI reads it to decide whether ``--approved-by`` is required, so a
    missing or misspelt tier must fail here, not read as a low one."""
    path = _kinds_path(spec_root)
    doc = _load_yaml_or_raise(path, "EVOLUTION_KINDS_FILE_INVALID")
    kinds = doc.get("kinds") if isinstance(doc, dict) else None
    if not isinstance(kinds, dict) or not kinds:
        raise InvariantViolation(f"EVOLUTION_KINDS_FILE_EMPTY: {path} has no 'kinds' mapping")
    for name, meta in kinds.items():
        if not isinstance(name, str) or not KIND_NAME.fullmatch(name) or not isinstance(meta, dict) or meta.get("risk_tier") not in RISK_TIERS:
            raise InvariantViolation(f"EVOLUTION_KINDS_FILE_INVALID: {path}: kind {name!r} needs a directory name and a mapping with risk_tier in {'/'.join(RISK_TIERS)}")
    return kinds


def _require_known_kind(spec_root: Path, kind: str) -> dict[str, Any]:
    kinds = known_kinds(spec_root)
    if kind not in kinds:
        raise InvariantViolation(f"EVOLUTION_UNKNOWN_KIND: {kind!r} is not listed in {_kinds_path(spec_root)}")
    return kinds[kind]


def read_champion(spec_root: Path, kind: str) -> dict[str, Any] | None:
    """``kind``'s champion.yaml, or None while it has none. The one reader, for runtime and the offline CLI: it must
    be a mapping naming this kind (a champion copied in from another kind's directory is refused, not followed)."""
    path = _kind_dir(spec_root, kind) / "champion.yaml"
    if not path.is_file():
        return None
    champion = _load_yaml_or_raise(path, "EVOLUTION_CHAMPION_MALFORMED")
    if not isinstance(champion, dict) or champion.get("kind") != kind:
        raise InvariantViolation(f"EVOLUTION_CHAMPION_MALFORMED: {path} must be a mapping whose kind is {kind!r}")
    return champion


def load_champion(spec_root: Path, kind: str) -> tuple[str, dict[str, Any]]:
    """Return ``(version, document)`` for ``kind``'s current champion.

    Fails closed on every way this can go wrong -- unknown kind, missing
    champion.yaml, a champion.yaml naming another kind or with no string ``version``
    or ``version_sha256``, the version file it names missing, failing to parse,
    naming itself another version, or no longer holding the bytes that were promoted
    (a version edited after promotion) -- never a silent default (P-g).
    """
    _require_known_kind(spec_root, kind)
    champion_path = _kind_dir(spec_root, kind) / "champion.yaml"
    champion = read_champion(spec_root, kind)
    if champion is None:
        raise InvariantViolation(f"EVOLUTION_CHAMPION_MALFORMED: {champion_path} does not exist")
    version = champion.get("version")
    if not isinstance(version, str) or not version:
        raise InvariantViolation(f"EVOLUTION_CHAMPION_MALFORMED: {champion_path} has no non-empty string 'version'")
    document = _version_document(spec_root, kind, version)
    recorded = champion.get("version_sha256")
    if not isinstance(recorded, str) or not _SHA256.fullmatch(recorded):
        raise InvariantViolation(f"EVOLUTION_CHAMPION_MALFORMED: {champion_path} has no version_sha256 (the bytes that were promoted)")
    if version_sha256(spec_root, kind, version) != recorded:
        raise InvariantViolation(f"EVOLUTION_VERSION_CHANGED: {kind} {version}.yaml is not the file that was promoted -- versions are immutable, add a new version and promote it")
    return version, document


def load_version(spec_root: Path, kind: str, version: str) -> dict[str, Any]:
    """One version file of ``kind``, parsed exactly as ``load_champion`` would parse it. The offline CLI calls
    this before pointing ``champion.yaml`` at a version, so a file runtime would refuse is never promoted."""
    _require_known_kind(spec_root, kind)
    return _version_document(spec_root, kind, version)


def version_sha256(spec_root: Path, kind: str, version: str) -> str:
    """sha256 of a version file's bytes: what LEDGER.md and champion.yaml record when it is installed."""
    path = _version_path(spec_root, kind, version)
    if not path.is_file():
        raise InvariantViolation(f"EVOLUTION_VERSION_FILE_INVALID: {path} does not exist")
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _version_path(spec_root: Path, kind: str, version: str) -> Path:
    if not isinstance(version, str) or not VERSION_NAME.fullmatch(version):
        raise InvariantViolation(f"EVOLUTION_VERSION_NAME_INVALID: {version!r} is not v<N> (one file in evolution/{kind}/)")
    return _kind_dir(spec_root, kind) / f"{version}.yaml"


def _version_document(spec_root: Path, kind: str, version: str) -> dict[str, Any]:
    version_path = _version_path(spec_root, kind, version)
    document = _load_yaml_or_raise(version_path, "EVOLUTION_VERSION_FILE_INVALID")
    if not isinstance(document, dict):
        raise InvariantViolation(f"EVOLUTION_VERSION_FILE_INVALID: {version_path} did not parse to a mapping")
    # A file copied from another version keeps its identity lines; a file must not name itself something it is not.
    if document.get("version", version) != version or document.get("kind", kind) != kind:
        raise InvariantViolation(f"EVOLUTION_VERSION_FILE_INVALID: {version_path} names itself {document.get('kind', kind)!r} {document.get('version', version)!r}")
    return document


def list_versions(spec_root: Path, kind: str) -> list[str]:
    """Every loadable version name for ``kind`` (``v<N>``), in version order (v2 before v10), champion or not."""
    _require_known_kind(spec_root, kind)
    kind_dir = _kind_dir(spec_root, kind)
    if not kind_dir.is_dir():
        return []
    names = [p.stem for p in kind_dir.glob("*.yaml") if VERSION_NAME.fullmatch(p.stem)]
    return sorted(names, key=lambda name: int(name[1:]))
