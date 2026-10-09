"""What a group reads of a record another member shared with it (docs/platform/STEP34_SHARED_RULES.md §6-§7; COLLAB card 「讀什麼」):
the person's words, one projection per kind, built here and nowhere else (the route returns what this returns; the page draws it).
A record's other fields -- doc ids, versions, hashes, source-card pointers, a draft's reader and its sentences' refs -- point into
the sharer's own case and never leave it. A kind with no projection here is not returned, whatever the consent names: adding one
is a decision about what a group may read."""

from __future__ import annotations

from typing import Any, Callable

from ai_lego.core.domain.kinds.map import LAYERS

ACT_NOTE_FIELDS = (("實際狀況", "happened"), ("想法", "thoughts"), ("要調整什麼", "adjustment"), ("卡在哪", "blocker"))


def _words(value: Any) -> list[str]:
    return [one.strip() for one in (value if isinstance(value, list) else [value]) if isinstance(one, str) and one.strip()]


def _rows(value: Any) -> list[dict[str, Any]]:
    return [one for one in value if isinstance(one, dict)] if isinstance(value, list) else []


def _map(content: dict[str, Any]) -> list[str]:
    layers = content.get("layers") if isinstance(content.get("layers"), dict) else {}
    lines = []
    for key, name, *_ in LAYERS:
        texts = [text for item in _rows(layers.get(key)) for text in _words(item.get("text"))]
        if texts:
            lines.append(f"{name}：{'；'.join(texts)}")
    return lines + [f"核心衝突：{line}" for line in _words(content.get("core_conflict"))]


def _verdict(content: dict[str, Any]) -> list[str]:
    said = (_words(content.get("verdict")) or [""])[0]
    return [f"{said}：{reason}" for reason in _words(content.get("reason"))]


def _summary(content: dict[str, Any]) -> list[str]:
    return _words(content.get("overview")) + [line for row in _rows(content.get("lines")) for line in _words(row.get("line"))]


def _draft(content: dict[str, Any]) -> list[str]:
    return [text for row in _rows(content.get("sentences")) for text in _words(row.get("text"))]


def _note(content: dict[str, Any]) -> list[str]:
    return [f"{label}：{line}" for label, key in ACT_NOTE_FIELDS for line in _words(content.get(key))]


def _intake(content: dict[str, Any]) -> list[str]:
    affected = _words(content.get("affected"))
    return [f"會受影響的人：{'、'.join(affected)}"] if affected else []


PROJECTIONS: dict[str, tuple[str, Callable[[dict[str, Any]], list[str]]]] = {
    "map.map": ("地圖", _map),
    "verify.claim": ("主張", lambda content: _words(content.get("text"))),
    "verify.verdict": ("查證判定", _verdict),
    "verify.summary": ("查證摘要", _summary),
    "express.draft": ("輸出稿", _draft),
    "act.note": ("觀察紀錄", _note),
    "assembler.intake": ("開案資料", _intake),
}


def shared_words(kind: str, content: dict[str, Any], *, after_decision: bool = False) -> dict[str, Any] | None:
    """``{"title", "lines"}`` for a record of ``kind``, or None: no projection for the kind, nothing to say, or an ACT
    observation from before the group decided (only the observations after it are read)."""
    projection = PROJECTIONS.get(kind)
    if projection is None or (kind == "act.note" and not after_decision):
        return None
    title, build = projection
    lines = build(content)
    return {"title": title, "lines": lines} if lines else None
