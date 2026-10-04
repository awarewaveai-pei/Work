"""Versioned TEACH lessons and low-risk practice cases.

These files are reviewed content, not person records.  The loader validates the
whole directory before exposing either ruleset, so callers cannot accidentally
use an unversioned edit or a practice case with no checked source.
"""

from __future__ import annotations

import datetime as _datetime
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
_LESSON_REQUIRED = {"id", "subject", "version", "state", "minutes", "title", "text", "example", "teaches"}
_CASE_REQUIRED = {"id", "version", "title", "text", "source", "place"}
_ID = re.compile(r"[a-z0-9][a-z0-9_.-]*\Z")
_DATE = re.compile(r"\d{4}-\d{2}-\d{2}\Z")
_CITED_AS_TRUE = (
    re.compile(r"(?:因為|只要).{0,20}(?:有)?引註.{0,20}(?:所以|就|便)?(?:是)?(?:真的|真實|正確|可靠)"),
    re.compile(r"引註.{0,12}(?:所以|就|便).{0,12}(?:是真的|真實|正確|可靠)"),
)
_VULNERABLE_DEMAND = (
    re.compile(r"(?:請|要|必須).{0,12}(?:說出|透露|揭露|分享).{0,12}(?:脆弱|創傷|自傷|私密|秘密)"),
    re.compile(r"(?:脆弱|創傷|自傷|私密|秘密).{0,12}(?:必須|一定要).{0,12}(?:說|透露|揭露|分享)"),
)
_SCORE_OR_RANK_WORDS = ("分數", "排名", "評分", "打分", "排行", "名次")


def _content_root(root: Path | str | None) -> Path:
    if root is None:
        return ROOT
    candidate = Path(root).resolve()
    if (candidate / "lessons").is_dir() and (candidate / "cases").is_dir():
        return candidate
    if candidate.name == "lessons" and (candidate.parent / "cases").is_dir():
        return candidate.parent
    return candidate


def _read_yaml(path: Path) -> dict[str, Any]:
    try:
        value = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise InvariantViolation(f"TEACH_YAML_INVALID: {path.name}: {exc}") from exc
    if not isinstance(value, dict):
        raise InvariantViolation(f"TEACH_DOCUMENT_INVALID: {path.name} must be a mapping")
    return value


def _read_history(root: Path) -> dict[str, dict[str, str]]:
    path = root / "HISTORY.json"
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise InvariantViolation(f"TEACH_HISTORY_INVALID: {path}: {exc}") from exc
    if not isinstance(value, dict) or not all(isinstance(v, dict) for v in value.values()):
        raise InvariantViolation(f"TEACH_HISTORY_INVALID: {path} must map ruleset names to version fingerprints")
    return value


def _version(value: Any, path: Path) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        raise InvariantViolation(f"TEACH_VERSION_INVALID: {path.name}: version must be a positive integer")
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise InvariantViolation(f"TEACH_VERSION_INVALID: {path.name}: version must be a positive integer") from exc
    if parsed < 1 or str(parsed) != str(value).strip():
        raise InvariantViolation(f"TEACH_VERSION_INVALID: {path.name}: version must be a positive integer")
    return parsed


@lru_cache(maxsize=1)
def _known_subjects() -> frozenset[str]:
    catalog = load_catalog()
    return frozenset(catalog.methods) | frozenset(PACKAGES)


def _require_text(document: dict[str, Any], key: str, path: Path) -> None:
    if not isinstance(document.get(key), str) or not document[key].strip():
        raise InvariantViolation(f"TEACH_FIELD_INVALID: {path.name}: {key} must be non-empty text")


def _validate_lesson_text(document: dict[str, Any], path: str) -> None:
    text = "\n".join(str(document.get(key, "")) for key in ("title", "text", "example", "teaches"))
    for word in _SCORE_OR_RANK_WORDS:
        if word in text:
            raise InvariantViolation(f"TEACH_TEXT_FORBIDDEN: {path}: score/rank word {word}")
    if any(pattern.search(text) for pattern in _CITED_AS_TRUE):
        raise InvariantViolation(f"TEACH_TEXT_FORBIDDEN: {path}: a citation cannot be treated as proof")
    if any(pattern.search(text) for pattern in _VULNERABLE_DEMAND):
        raise InvariantViolation(f"TEACH_TEXT_FORBIDDEN: {path}: do not demand vulnerable disclosure")


def validate_lesson(document: dict[str, Any], path: Path | str = "lesson") -> dict[str, Any]:
    """Validate one lesson document and return it for generator/test reuse."""
    label = str(path)
    missing = _LESSON_REQUIRED - set(document)
    if missing:
        raise InvariantViolation(f"TEACH_LESSON_FIELDS_MISSING: {label}: {sorted(missing)}")
    if not isinstance(document.get("id"), str) or not _ID.fullmatch(document["id"]):
        raise InvariantViolation(f"TEACH_ID_INVALID: {label}: lesson id")
    _version(document["version"], Path(label))
    if document.get("state") not in {"draft", "reviewed"}:
        raise InvariantViolation(f"TEACH_STATE_INVALID: {label}: state must be draft or reviewed")
    if document.get("state") == "reviewed" and "草稿" in "\n".join(map(str, document.values())):
        raise InvariantViolation(f"TEACH_REVIEWED_DRAFT_WORD: {label}: reviewed lessons cannot contain 草稿")
    minutes = document.get("minutes")
    if isinstance(minutes, bool) or not isinstance(minutes, int) or not 1 <= minutes <= 5:
        raise InvariantViolation(f"TEACH_MINUTES_INVALID: {label}: minutes must be an integer from 1 to 5")
    for key in ("title", "text", "example"):
        _require_text(document, key, Path(label))
    if not isinstance(document.get("teaches"), list) or not document["teaches"] or not all(isinstance(item, str) and item.strip() for item in document["teaches"]):
        raise InvariantViolation(f"TEACH_FIELD_INVALID: {label}: teaches must be a non-empty list of text")
    subject = document.get("subject")
    if not isinstance(subject, str) or subject not in _known_subjects():
        raise InvariantViolation(f"TEACH_SUBJECT_UNKNOWN: {label}: {subject!r}")
    course = document.get("course")
    if course is not None:
        if not isinstance(course, dict) or set(course) != {"package", "order"}:
            raise InvariantViolation(f"TEACH_COURSE_INVALID: {label}: course needs package and order")
        if course["package"] not in PACKAGES:
            raise InvariantViolation(f"TEACH_COURSE_UNKNOWN_PACKAGE: {label}: {course['package']!r}")
        if isinstance(course["order"], bool) or not isinstance(course["order"], int) or course["order"] < 1:
            raise InvariantViolation(f"TEACH_COURSE_INVALID: {label}: order must be positive")
    _validate_lesson_text(document, label)
    return document


def _load_lessons(root: Path) -> list[dict[str, Any]]:
    directory = root / "lessons"
    if not directory.is_dir():
        raise InvariantViolation(f"TEACH_DIRECTORY_MISSING: {directory}")
    items = []
    for path in sorted(directory.glob("*.yaml")):
        item = _read_yaml(path)
        if item.get("id") != path.stem:
            raise InvariantViolation(f"TEACH_ID_FILENAME_MISMATCH: {path.name}")
        items.append(validate_lesson(item, path))
    if not items:
        raise InvariantViolation(f"TEACH_DIRECTORY_EMPTY: {directory}")
    _validate_course_lists(items)
    return items


def _validate_case(item: dict[str, Any], path: Path) -> dict[str, Any]:
    missing = _CASE_REQUIRED - set(item)
    if missing:
        raise InvariantViolation(f"TEACH_CASE_FIELDS_MISSING: {path.name}: {sorted(missing)}")
    if not isinstance(item.get("id"), str) or not _ID.fullmatch(item["id"]):
        raise InvariantViolation(f"TEACH_ID_INVALID: {path.name}: case id")
    _version(item["version"], path)
    for key in ("title", "text", "place"):
        _require_text(item, key, path)
    source = item.get("source")
    if not isinstance(source, dict) or set(source) != {"kind", "name", "checked_on"}:
        raise InvariantViolation(f"TEACH_CASE_SOURCE_INVALID: {path.name}: source kind, name and checked_on are required")
    if source["kind"] not in {"publisher", "source_card"} or not isinstance(source["name"], str) or not source["name"].strip():
        raise InvariantViolation(f"TEACH_CASE_SOURCE_INVALID: {path.name}: source kind and name are invalid")
    checked_on = source["checked_on"]
    if not isinstance(checked_on, str) or not _DATE.fullmatch(checked_on):
        raise InvariantViolation(f"TEACH_CASE_SOURCE_INVALID: {path.name}: checked_on must be a date")
    try:
        _datetime.date.fromisoformat(checked_on)
    except ValueError as exc:
        raise InvariantViolation(f"TEACH_CASE_SOURCE_INVALID: {path.name}: checked_on must be a date") from exc
    return item


def _load_cases(root: Path) -> list[dict[str, Any]]:
    directory = root / "cases"
    if not directory.is_dir():
        raise InvariantViolation(f"TEACH_DIRECTORY_MISSING: {directory}")
    items = []
    for path in sorted(directory.glob("*.yaml")):
        item = _read_yaml(path)
        if item.get("id") != path.stem:
            raise InvariantViolation(f"TEACH_ID_FILENAME_MISMATCH: {path.name}")
        items.append(_validate_case(item, path))
    if not items:
        raise InvariantViolation(f"TEACH_DIRECTORY_EMPTY: {directory}")
    return items


def _validate_course_lists(items: list[dict[str, Any]]) -> None:
    grouped: dict[str, list[int]] = {}
    for item in items:
        course = item.get("course")
        if course:
            grouped.setdefault(course["package"], []).append(course["order"])
    for package, orders in grouped.items():
        expected = list(range(1, len(orders) + 1))
        if sorted(orders) != expected:
            raise InvariantViolation(f"TEACH_COURSE_INCOMPLETE: {package}: orders must be {expected}")


def _ruleset(root: Path, name: str, title: str, items: list[dict[str, Any]]) -> Ruleset:
    versions = [_version(item["version"], Path(str(item["id"]))) for item in items]
    ruleset = Ruleset(name, "TEACH", title, str(max(versions)), "平台（TEACH，內容檔）", items)
    check(ruleset, _read_history(root))
    return ruleset


def load_lessons(root: Path | str | None = None) -> Ruleset:
    content_root = _content_root(root)
    return _ruleset(content_root, "teach.lessons", "課", _load_lessons(content_root))


def load_practice_cases(root: Path | str | None = None) -> Ruleset:
    content_root = _content_root(root)
    return _ruleset(content_root, "teach.practice_cases", "練習案例", _load_cases(content_root))


def courses(root: Path | str | None = None) -> dict[str, list[str]]:
    """Return each package's required lesson ids in course order."""
    grouped: dict[str, list[tuple[int, str]]] = {}
    for item in load_lessons(root).items:
        course = item.get("course")
        if course:
            grouped.setdefault(course["package"], []).append((course["order"], item["id"]))
    return {package: [lesson_id for _, lesson_id in sorted(entries)] for package, entries in sorted(grouped.items())}


def course_lists(root: Path | str | None = None) -> dict[str, list[str]]:
    """Compatibility name for callers that describe the result as course lists."""
    return courses(root)


def reviewed_only(root: Path | str | None = None) -> list[dict[str, Any]]:
    """Return only operator-reviewed lessons; drafts remain available to the content page as 草稿."""
    return [item for item in load_lessons(root).items if item["state"] == "reviewed"]


HISTORY = _read_history(ROOT)

__all__ = [
    "HISTORY", "ROOT", "course_lists", "courses", "load_lessons", "load_practice_cases", "reviewed_only", "validate_lesson",
]
