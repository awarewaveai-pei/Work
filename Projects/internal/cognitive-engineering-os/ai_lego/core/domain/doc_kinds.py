"""What a block keeps (its contract card's 「寫什麼」) as documents in the record stream.

A document kind names its block, its owner (a case, or the person across cases), who may author it and its fields.
Each block declares its kinds in its own module under ``ai_lego/core/domain/kinds/`` (``KINDS = [...]``); they are
found by import, so a new block never edits a shared list. record_log.append runs ``check`` on every DocSaved, so the
rules hold for every writer: a field only the person writes (結論、依據、信心…) is refused from the AI or from a joint
draft (關卡二), and a kind with such a field takes the person as its only author.
"""

from __future__ import annotations

import datetime
import importlib
import json
import pkgutil
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, Mapping

from ai_lego.core.domain.blocks import ALL_CODES
from ai_lego.errors import InvariantViolation

FIELD_TYPES = ("text", "choice", "choices", "list", "date", "bool", "int", "json")
MAX_JSON_BYTES = 64 * 1024


@dataclass(frozen=True)
class Field:
    type: str = "text"
    max: int = 2000             # characters for text; items for list/choices; bytes for json
    required: bool = False
    choices: tuple[str, ...] = ()
    human_only: bool = False    # only the person may write it


@dataclass(frozen=True)
class DocKind:
    kind: str                   # "<block>.<thing>", e.g. "sense.card"
    block: str
    title: str                  # what the person sees, e.g. 「外化卡」
    fields: Mapping[str, Field] = field(default_factory=dict)
    owner: str = "case"         # "case" | "person"
    authors: frozenset[str] = frozenset({"user"})
    deletable: bool = True      # False: every version stays (a judgment's versions are never deleted, only the case is)
    singleton: bool = False     # at most one live document of this kind per owner (協作合約、開案資料): a second is refused

    def __post_init__(self) -> None:
        if self.block not in ALL_CODES or self.owner not in ("case", "person") or not self.fields:
            raise InvariantViolation(f"DOC_KIND_INVALID: {self.kind}")
        if not self.authors <= {"user", "ai", "joint", "system"}:
            raise InvariantViolation(f"DOC_KIND_INVALID: {self.kind} authors {sorted(self.authors)}")
        if any(spec.human_only for spec in self.fields.values()) and self.authors != frozenset({"user"}):
            raise InvariantViolation(f"DOC_KIND_INVALID: {self.kind} has a field only the person writes, so only the person authors it")
        for name, spec in self.fields.items():
            if spec.type not in FIELD_TYPES or (spec.type in ("choice", "choices") and not spec.choices):
                raise InvariantViolation(f"DOC_KIND_INVALID: {self.kind}.{name}")


@lru_cache(maxsize=1)
def kinds() -> dict[str, DocKind]:
    """Every kind of every block module under ai_lego/core/domain/kinds/."""
    from ai_lego.core.domain import kinds as package

    found: dict[str, DocKind] = {}
    for module_info in sorted(pkgutil.iter_modules(package.__path__), key=lambda info: info.name):
        module = importlib.import_module(f"{package.__name__}.{module_info.name}")
        for kind in getattr(module, "KINDS", ()):
            if kind.kind in found:
                raise InvariantViolation(f"DOC_KIND_DUPLICATE: {kind.kind}")
            found[kind.kind] = kind
    return found


def require(kind: str) -> DocKind:
    found = kinds().get(kind)
    if found is None:
        raise InvariantViolation(f"DOC_KIND_UNKNOWN: {kind!r}")
    return found


def _check_value(kind: str, name: str, spec: Field, value: Any) -> Any:
    where = f"{kind}.{name}"
    if spec.type == "text":
        if not isinstance(value, str) or len(value) > spec.max:
            raise InvariantViolation(f"DOC_FIELD_INVALID: {where} is text of at most {spec.max} characters")
        return value
    if spec.type == "choice":
        if value not in spec.choices:
            raise InvariantViolation(f"DOC_FIELD_INVALID: {where} is one of {list(spec.choices)}")
        return value
    if spec.type == "choices":
        if not isinstance(value, list) or len(value) > spec.max or any(item not in spec.choices for item in value) or len(set(value)) != len(value):
            raise InvariantViolation(f"DOC_FIELD_INVALID: {where} is a list of distinct items from {list(spec.choices)}")
        return value
    if spec.type == "list":
        if not isinstance(value, list) or len(value) > spec.max or any(not isinstance(item, str) or len(item) > 2000 for item in value):
            raise InvariantViolation(f"DOC_FIELD_INVALID: {where} is a list of at most {spec.max} texts")
        return value
    if spec.type == "date":
        try:
            datetime.date.fromisoformat(value)
        except (TypeError, ValueError):
            raise InvariantViolation(f"DOC_FIELD_INVALID: {where} is a YYYY-MM-DD date") from None
        return value
    if spec.type == "bool":
        if not isinstance(value, bool):
            raise InvariantViolation(f"DOC_FIELD_INVALID: {where} is true or false")
        return value
    if spec.type == "int":
        if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= spec.max:
            raise InvariantViolation(f"DOC_FIELD_INVALID: {where} is a whole number 0..{spec.max}")
        return value
    if not isinstance(value, (dict, list)) or len(json.dumps(value, ensure_ascii=False).encode("utf-8")) > min(spec.max, MAX_JSON_BYTES):
        raise InvariantViolation(f"DOC_FIELD_INVALID: {where} is an object or list of at most {min(spec.max, MAX_JSON_BYTES)} bytes")
    return value


def _empty(value: Any) -> bool:
    return value is None or value == "" or value == [] or value == {}


def validate(kind: str, content: Any, author: str) -> dict[str, Any]:
    """The content as stored: known fields only, each checked; required ones present; human-only ones from the person."""
    spec = require(kind)
    if not isinstance(content, Mapping):
        raise InvariantViolation(f"DOC_CONTENT_INVALID: {kind} content is an object")
    unknown = sorted(set(content) - set(spec.fields))
    if unknown:
        raise InvariantViolation(f"DOC_FIELD_UNKNOWN: {kind} has no field {unknown}")
    clean: dict[str, Any] = {}
    for name, field_spec in spec.fields.items():
        value = content.get(name)
        if _empty(value):
            if field_spec.required:
                raise InvariantViolation(f"DOC_FIELD_REQUIRED: {kind}.{name}")
            continue
        if field_spec.human_only and author != "user":
            raise InvariantViolation(f"RECORD_HUMAN_ONLY_FIELD: {kind}.{name} is written by the person, not by {author!r}")
        clean[name] = _check_value(kind, name, field_spec, value)
    return clean


def check_record(event_type: str, payload: Mapping[str, Any], author: str, block: str, owner_kind: str) -> None:
    """record_log.append's per-kind rule for DocSaved / DocDeleted: the writer, the block and the owner fit the kind;
    a saved document's content validates."""
    spec = require(payload.get("kind"))
    if block != spec.block:
        raise InvariantViolation(f"RECORD_BLOCK_NOT_ALLOWED: {spec.kind} is written by {spec.block}, not {block!r}")
    if owner_kind != spec.owner:
        raise InvariantViolation(f"RECORD_OWNER_NOT_ALLOWED: {spec.kind} belongs to a {spec.owner}, not a {owner_kind}")
    if event_type == "DocSaved":
        if author not in spec.authors:
            raise InvariantViolation(f"RECORD_AUTHOR_NOT_ALLOWED: {spec.kind} takes {sorted(spec.authors)}, not {author!r}")
        if validate(spec.kind, payload.get("content"), author) != payload.get("content"):
            raise InvariantViolation(f"DOC_CONTENT_NOT_NORMALISED: {spec.kind} content must be stored as validate() returns it")
    elif not spec.deletable:
        raise InvariantViolation(f"DOC_NOT_DELETABLE: every version of {spec.kind} stays; erase the case instead")
