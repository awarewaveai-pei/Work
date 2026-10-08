"""Render one EXPRESS draft without changing the case.

The PDF path uses the already pinned matplotlib dependency used by the platform's
other server-side renderers.  All formats share the same ordered line builder so a
mark cannot disappear from one format by accident.
"""

from __future__ import annotations

import io
import json
import threading
from collections.abc import Mapping
from typing import Any

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt  # noqa: E402 -- the backend must be selected first
from matplotlib.backends.backend_pdf import PdfPages  # noqa: E402
from matplotlib.font_manager import FontProperties  # noqa: E402
from matplotlib.textpath import TextPath  # noqa: E402

from ai_lego.errors import InvariantViolation


UNCHECKED_MARK = "（還沒查證）"
AI_MARK = "（AI 寫的）"
_PDF_LOCK = threading.Lock()
_PDF_FONT_FAMILIES = [
    "Noto Sans CJK TC", "Noto Sans CJK SC", "Microsoft JhengHei", "Microsoft YaHei",
    "PingFang TC", "PingFang SC", "SimHei", "Arial Unicode MS", "DejaVu Sans",
]
matplotlib.rcParams["font.sans-serif"] = _PDF_FONT_FAMILIES
matplotlib.rcParams["axes.unicode_minus"] = False
matplotlib.rcParams["pdf.fonttype"] = 42

_PDF_FONT_SIZE = 11
_PDF_LEFT_FRACTION = 0.08
_PDF_RIGHT_FRACTION = 0.92
_PDF_PAGE_WIDTH_INCHES = 8.27
_PDF_FONT = FontProperties(family="sans-serif", size=_PDF_FONT_SIZE)
_PDF_PRINTABLE_WIDTH = _PDF_PAGE_WIDTH_INCHES * 72 * (_PDF_RIGHT_FRACTION - _PDF_LEFT_FRACTION)


def _content(draft: Mapping[str, Any]) -> Mapping[str, Any]:
    content = draft.get("content", draft)
    if not isinstance(content, Mapping):
        raise InvariantViolation("EXPRESS_EXPORT_DRAFT_INVALID: draft content must be an object")
    return content


def _sentences(draft: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    sentences = _content(draft).get("sentences")
    if not isinstance(sentences, list) or not sentences:
        raise InvariantViolation("EXPRESS_EXPORT_DRAFT_INVALID: draft needs sentences")
    checked: list[Mapping[str, Any]] = []
    for index, sentence in enumerate(sentences):
        if not isinstance(sentence, Mapping) or not isinstance(sentence.get("text"), str) or not sentence["text"].strip():
            raise InvariantViolation(f"EXPRESS_EXPORT_DRAFT_INVALID: sentence {index} needs text")
        if not isinstance(sentence.get("unchecked"), bool):
            raise InvariantViolation(f"EXPRESS_EXPORT_DRAFT_INVALID: sentence {index} needs an unchecked flag")
        if sentence.get("author") not in ("ai", "joint", "user"):
            raise InvariantViolation(f"EXPRESS_EXPORT_DRAFT_INVALID: sentence {index} needs a valid author")
        checked.append(sentence)
    return checked


def _mark(sentence: Mapping[str, Any]) -> str:
    marks = []
    if sentence["author"] != "user":
        marks.append(AI_MARK)
    if sentence["unchecked"]:
        marks.append(UNCHECKED_MARK)
    return " ".join(marks)


def _displayed_sentences(draft: Mapping[str, Any]) -> list[str]:
    rendered = []
    for sentence in _sentences(draft):
        suffix = _mark(sentence)
        rendered.append(f"{sentence['text'].strip()} {suffix}".rstrip())
    return rendered


def _values(value: Any) -> list[str]:
    if value is None or value == "":
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return [str(value)]
    if isinstance(value, list):
        found: list[str] = []
        for item in value:
            found.extend(_values(item))
        return found
    if isinstance(value, Mapping):
        return [json.dumps(value, ensure_ascii=False, sort_keys=True)]
    return [str(value)]


def _disclosures(draft: Mapping[str, Any]) -> tuple[list[str], list[str]]:
    content = _content(draft)
    confidence: list[str] = []
    uncertainty: list[str] = []
    for key in ("confidence_lines", "confidence_text", "confidence"):
        for value in _values(draft.get(key) if key == "confidence_lines" else content.get(key)):
            line = value if key != "confidence" or value.startswith("信心") else f"信心：{value}%"
            if line not in confidence:
                confidence.append(line)
    for key in ("uncertainty_lines", "uncertainty_text", "uncertainty", "open_uncertainties", "uncertainties"):
        values = draft.get(key) if key == "uncertainty_lines" else content.get(key)
        for line in _values(values):
            if line not in uncertainty:
                uncertainty.append(line)
    return confidence, uncertainty


def _plain_lines(draft: Mapping[str, Any]) -> list[str]:
    content = _content(draft)
    title = str(content.get("format") or "輸出稿")
    reader = str(content.get("reader") or "尚未指定")
    confidence, uncertainty = _disclosures(draft)
    lines = [title, f"讀者：{reader}", "", "內容"]
    lines.extend(f"{index}. {sentence}" for index, sentence in enumerate(_displayed_sentences(draft), 1))
    lines.extend(["", "信心和仍不確定", f"信心：{'；'.join(confidence) if confidence else '尚未填寫'}", "仍不確定："])
    lines.extend(f"- {line}" for line in (uncertainty or ["尚未另外寫下來"]))
    return lines


def render_markdown(draft: Mapping[str, Any]) -> str:
    """Return the draft as UTF-8-friendly Markdown, preserving sentence order."""
    lines = _plain_lines(draft)
    split = lines.index("信心和仍不確定")
    return "\n".join([f"# {lines[0]}", lines[1], "", "## 內容", *lines[4:split], "", "## 信心和仍不確定", *lines[split + 1:]]) + "\n"


def render_text(draft: Mapping[str, Any]) -> str:
    """Return the draft as plain text, preserving sentence order."""
    return "\n".join(_plain_lines(draft)) + "\n"


def render_plain_text(draft: Mapping[str, Any]) -> str:
    """Compatibility name for callers that call the format plain text."""
    return render_text(draft)


def _pdf_lines(draft: Mapping[str, Any]) -> list[str]:
    return _plain_lines(draft)


def _pdf_text_width(text: str) -> float:
    """Measure with the same resolved font and size that the PDF text uses."""
    return float(TextPath((0, 0), text, prop=_PDF_FONT).get_extents().width)


def _wrap_pdf_line(line: str) -> list[str]:
    """Wrap at measured glyph width, including unbroken CJK and English text."""
    if not line:
        return [""]
    wrapped: list[str] = []
    start = 0
    while start < len(line):
        if _pdf_text_width(line[start:]) <= _PDF_PRINTABLE_WIDTH:
            wrapped.append(line[start:])
            break
        low, high, best = start + 1, len(line), start + 1
        while low <= high:
            middle = (low + high) // 2
            if _pdf_text_width(line[start:middle]) <= _PDF_PRINTABLE_WIDTH:
                best = middle
                low = middle + 1
            else:
                high = middle - 1
        wrapped.append(line[start:best])
        start = best
    return wrapped


def render_pdf(draft: Mapping[str, Any]) -> bytes:
    """Return a readable, paginated PDF using the platform's existing renderer dependency."""
    lines = _pdf_lines(draft)
    with _PDF_LOCK:
        buffer = io.BytesIO()
        with PdfPages(buffer) as pages:
            page_lines: list[str] = []
            for line in lines:
                page_lines.extend(_wrap_pdf_line(line))
            for start in range(0, len(page_lines), 42):
                figure = plt.figure(figsize=(_PDF_PAGE_WIDTH_INCHES, 11.69))
                try:
                    y = 0.95
                    for line in page_lines[start:start + 42]:
                        figure.text(_PDF_LEFT_FRACTION, y, line, fontproperties=_PDF_FONT, va="top")
                        y -= 0.021
                    pages.savefig(figure)
                finally:
                    plt.close(figure)
        return buffer.getvalue()


def render(draft: Mapping[str, Any], fmt: str) -> str | bytes:
    """Render one of ``md``, ``txt``/``text`` or ``pdf``."""
    if fmt == "md":
        return render_markdown(draft)
    if fmt in {"txt", "text", "plain"}:
        return render_text(draft)
    if fmt == "pdf":
        return render_pdf(draft)
    raise InvariantViolation(f"EXPRESS_EXPORT_FORMAT_INVALID: {fmt!r}")
