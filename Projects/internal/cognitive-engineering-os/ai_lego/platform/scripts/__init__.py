"""Versioned FACILITATE scripts and the guard that keeps unsafe scripts out."""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from ai_lego.core.domain.kinds.assembler import PACKAGES
from ai_lego.errors import InvariantViolation
from ai_lego.platform.catalog.display_catalog import load_catalog
from ai_lego.platform.rulesets import Ruleset, check


ROOT = Path(__file__).resolve().parent
HISTORY_PATH = ROOT / "HISTORY.json"
_SCRIPT_REQUIRED = {"id", "subject", "version", "state", "steps", "escalation"}
_STEP_REQUIRED = {"what", "minutes", "dont", "stop_signals"}
_ESCALATION_REQUIRED = {"who", "how"}
_ID = re.compile(r"[a-z0-9][a-z0-9_.-]*\Z")


def _content_root(root: Path | str | None) -> Path:
    if root is None:
        return ROOT
    candidate = Path(root).resolve()
    if (candidate / "scripts").is_dir() and (candidate / "dont-list.yaml").is_file():
        return candidate
    if candidate.name == "scripts" and (candidate.parent / "dont-list.yaml").is_file():
        return candidate.parent
    return candidate


def _read_yaml(path: Path) -> dict[str, Any]:
    try:
        value = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise InvariantViolation(f"FACILITATE_YAML_INVALID: {path.name}: {exc}") from exc
    if not isinstance(value, dict):
        raise InvariantViolation(f"FACILITATE_DOCUMENT_INVALID: {path.name} must be a mapping")
    return value


def _read_history(root: Path) -> dict[str, dict[str, str]]:
    path = root / "HISTORY.json"
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise InvariantViolation(f"FACILITATE_HISTORY_INVALID: {path}: {exc}") from exc
    if not isinstance(value, dict) or not all(isinstance(item, dict) for item in value.values()):
        raise InvariantViolation(f"FACILITATE_HISTORY_INVALID: {path} must map ruleset names to version fingerprints")
    return value


def _version(value: Any, path: Path) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        raise InvariantViolation(f"FACILITATE_VERSION_INVALID: {path.name}: version must be a positive integer")
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise InvariantViolation(f"FACILITATE_VERSION_INVALID: {path.name}: version must be a positive integer") from exc
    if parsed < 1 or str(parsed) != str(value).strip():
        raise InvariantViolation(f"FACILITATE_VERSION_INVALID: {path.name}: version must be a positive integer")
    return parsed


@lru_cache(maxsize=1)
def _known_subjects() -> frozenset[str]:
    catalog = load_catalog()
    return frozenset(catalog.methods) | frozenset(PACKAGES)


def _non_empty_text(value: Any, name: str, path: Path) -> None:
    if not isinstance(value, str) or not value.strip():
        raise InvariantViolation(f"FACILITATE_FIELD_INVALID: {path.name}: {name} must be non-empty text")


def _read_donts(root: Path) -> list[str]:
    path = root / "dont-list.yaml"
    document = _read_yaml(path)
    if set(document) != {"donts"} or not isinstance(document["donts"], list) or not document["donts"]:
        raise InvariantViolation(f"FACILITATE_DONTS_INVALID: {path.name}: donts must be a non-empty list")
    if not all(isinstance(item, str) and item.strip() for item in document["donts"]):
        raise InvariantViolation(f"FACILITATE_DONTS_INVALID: {path.name}: every dont must be non-empty text")
    if len(set(document["donts"])) != len(document["donts"]):
        raise InvariantViolation(f"FACILITATE_DONTS_INVALID: {path.name}: donts must be unique")
    return document["donts"]


def load_donts(root: Path | str | None = None) -> list[str]:
    return _read_donts(_content_root(root))


FACIL_DONTS = tuple(load_donts(ROOT))


def validate_script(document: dict[str, Any], path: Path | str = "script", donts: list[str] | tuple[str, ...] | None = None) -> dict[str, Any]:
    """Validate one facilitator script, including the explicit stop-signal field."""
    label = Path(str(path))
    missing = _SCRIPT_REQUIRED - set(document)
    if missing:
        raise InvariantViolation(f"FACILITATE_SCRIPT_FIELDS_MISSING: {label.name}: {sorted(missing)}")
    if not isinstance(document.get("id"), str) or not _ID.fullmatch(document["id"]):
        raise InvariantViolation(f"FACILITATE_ID_INVALID: {label.name}: script id")
    _version(document["version"], label)
    if document.get("state") not in {"draft", "reviewed"}:
        raise InvariantViolation(f"FACILITATE_STATE_INVALID: {label.name}: state must be draft or reviewed")
    subject = document.get("subject")
    if not isinstance(subject, str) or subject not in _known_subjects():
        raise InvariantViolation(f"FACILITATE_SUBJECT_UNKNOWN: {label.name}: {subject!r}")
    steps = document.get("steps")
    if not isinstance(steps, list) or not steps:
        raise InvariantViolation(f"FACILITATE_STEPS_INVALID: {label.name}: steps must be a non-empty list")
    allowed_donts = set(donts if donts is not None else FACIL_DONTS)
    for index, step in enumerate(steps, 1):
        if not isinstance(step, dict) or not _STEP_REQUIRED.issubset(step):
            raise InvariantViolation(f"FACILITATE_STEP_INVALID: {label.name}: step {index} needs what, minutes, dont and stop_signals")
        _non_empty_text(step["what"], f"steps[{index}].what", label)
        minutes = step["minutes"]
        if isinstance(minutes, bool) or not isinstance(minutes, int) or minutes < 1:
            raise InvariantViolation(f"FACILITATE_STEP_INVALID: {label.name}: steps[{index}].minutes must be a positive integer")
        if not isinstance(step["dont"], list) or not step["dont"] or not all(isinstance(item, str) and item in allowed_donts for item in step["dont"]):
            raise InvariantViolation(f"FACILITATE_STEP_INVALID: {label.name}: steps[{index}].dont must use FACIL_DONTS")
        if not isinstance(step["stop_signals"], list) or not all(isinstance(item, str) and item.strip() for item in step["stop_signals"]):
            raise InvariantViolation(f"FACILITATE_STEP_INVALID: {label.name}: steps[{index}].stop_signals must be a list of text")
    escalation = document.get("escalation")
    if not isinstance(escalation, dict) or not _ESCALATION_REQUIRED.issubset(escalation):
        raise InvariantViolation(f"FACILITATE_ESCALATION_INVALID: {label.name}: escalation needs who and how")
    _non_empty_text(escalation["who"], "escalation.who", label)
    if escalation["who"] != "GOVERN":   # the card: escalation goes to GOVERN's resources (Codex card 60 review F3)
        raise InvariantViolation(f"FACILITATE_ESCALATION_INVALID: {label.name}: escalation.who must be GOVERN")
    _non_empty_text(escalation["how"], "escalation.how", label)
    return document


def _has_stop_signals(script: dict[str, Any]) -> bool:
    return any(step["stop_signals"] for step in script["steps"])


def _load_scripts(root: Path) -> list[dict[str, Any]]:
    directory = root / "scripts"
    if not directory.is_dir():
        raise InvariantViolation(f"FACILITATE_DIRECTORY_MISSING: {directory}")
    donts = _read_donts(root)
    items: list[dict[str, Any]] = []
    seen_subjects: set[str] = set()
    for path in sorted(directory.glob("*.yaml")):
        item = _read_yaml(path)
        if item.get("id") != path.stem:
            raise InvariantViolation(f"FACILITATE_ID_FILENAME_MISMATCH: {path.name}")
        item = validate_script(item, path, donts)
        if item["subject"] in seen_subjects:
            raise InvariantViolation(f"FACILITATE_SUBJECT_DUPLICATE: {path.name}: {item['subject']}")
        seen_subjects.add(item["subject"])
        items.append(item)
    if not items:
        raise InvariantViolation(f"FACILITATE_DIRECTORY_EMPTY: {directory}")
    return items


def _ruleset(root: Path, items: list[dict[str, Any]]) -> Ruleset:
    versions = [_version(item["version"], Path(str(item["id"]))) for item in items]
    ruleset = Ruleset("facilitate.scripts", "FACILITATE", "帶領稿", str(max(versions)), "平台（FACILITATE，內容檔）", items)
    check(ruleset, _read_history(root))
    return ruleset


def load_scripts(root: Path | str | None = None) -> Ruleset:
    content_root = _content_root(root)
    return _ruleset(content_root, _load_scripts(content_root))


def available_subjects(root: Path | str | None = None) -> list[str]:
    """Subjects that have at least one explicit stop signal and may be offered."""
    return sorted({item["subject"] for item in load_scripts(root).items if _has_stop_signals(item)})


def report(root: Path | str | None = None) -> list[dict[str, str]]:
    """List scripts withheld from participants and the reason shown to an operator."""
    return [
        {"id": item["id"], "subject": item["subject"], "reason": "沒有停止訊號"}
        for item in load_scripts(root).items
        if not _has_stop_signals(item)
    ]


def usable_for_leading(root: Path | str | None = None) -> list[dict[str, Any]]:
    """Only reviewed scripts with a stop signal can be used to lead."""
    return [
        item for item in load_scripts(root).items
        if item["state"] == "reviewed" and _has_stop_signals(item)
    ]


HISTORY = _read_history(ROOT)

__all__ = [
    "FACIL_DONTS",
    "HISTORY",
    "ROOT",
    "available_subjects",
    "load_donts",
    "load_scripts",
    "report",
    "usable_for_leading",
    "validate_script",
]
