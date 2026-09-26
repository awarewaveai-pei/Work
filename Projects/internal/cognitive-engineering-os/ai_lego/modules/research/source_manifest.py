"""Source prompt manifests shared by every synthesis line (P2 WC-01, P-a/P-c).

One manifest, one citation vocabulary: entries are keyed by ``source:<source_id>``
so a model's ``[n]`` output resolves to the same id whatever line produced it
(interpret, dossier, decision, literature). Template for ``render_source_block``
is ``NA/lib/dossier/report.ts:93-105`` verbatim -- the injection-defence framing
lives there, not duplicated here.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Mapping

DEFAULT_MAX_CHARS = 6000
DEFAULT_BATCH_SIZE = 40


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def build_source_manifest(
    sources: list[Mapping[str, Any]],
    *,
    max_chars: int = DEFAULT_MAX_CHARS,
    batch_size: int = DEFAULT_BATCH_SIZE,
) -> dict[str, Any]:
    """Build the P-c ``manifest`` block: ``{entries: [P-a], batches: [[n]], sha256}``.

    Only ``status == "active"`` sources are included (superseded rows drop out).
    Ordering is stable: ``(created_at, source_id)`` ascending, then numbered
    ``n`` from 1. Each entry's ``end`` is the excerpt window into that source's
    text, truncated to ``max_chars`` -- the manifest itself carries no text.
    """
    active = [source for source in sources if source.get("status") == "active"]
    ordered = sorted(active, key=lambda source: (source.get("created_at") or "", source.get("source_id") or ""))

    entries: list[dict[str, Any]] = []
    for n, source in enumerate(ordered, start=1):
        source_id = source["source_id"]
        text = source.get("text") or ""
        end = min(len(text), max_chars)
        entries.append(
            {
                "n": n,
                "id": f"source:{source_id}",
                "source_id": source_id,
                "sha256": source.get("content_sha256") or source.get("sha256"),
                "start": 0,
                "end": end,
                "title": source.get("title"),
                "url": source.get("url") or source.get("canonical_url"),
                "fetched_at": source.get("fetched_at"),
                "source_class": source.get("source_class"),
            }
        )

    batches = [
        [entry["n"] for entry in entries[i : i + batch_size]]
        for i in range(0, len(entries), batch_size)
    ]

    return {
        "entries": entries,
        "batches": batches,
        "sha256": hashlib.sha256(_canonical_json(entries).encode("utf-8")).hexdigest(),
    }


def render_source_block(entry: Mapping[str, Any], text: str) -> str:
    """Render one manifest entry as a fenced, numbered prompt block.

    Verbatim template from ``report.ts:93-105``: everything between
    ``<<<SOURCE n BEGIN>>>`` and ``<<<SOURCE n END>>>`` is quoted material,
    not instructions, whatever it contains.
    """
    n = entry["n"]
    head_lines = [f"[{n}] {entry.get('title') or entry.get('url') or '(無標題)'}"]
    if entry.get("url"):
        head_lines.append(f"URL: {entry['url']}")
    if entry.get("fetched_at"):
        head_lines.append(f"日期: {entry['fetched_at'][:10]}")
    head = "\n".join(head_lines)
    body = text[entry.get("start", 0) : entry.get("end", len(text))]
    return f"<<<SOURCE {n} BEGIN>>>\n{head}\n---\n{body}\n<<<SOURCE {n} END>>>"


def resolve_citation_numbers(obj: Any, entries: list[Mapping[str, Any]]) -> Any:
    """Recursively replace model-written ``[n]`` ints under any ``citations`` key with manifest ids.

    An ``n`` with no matching entry is left as the original int rather than
    dropped -- ``evaluate_citation_integrity`` then reports it as
    out-of-manifest instead of silently losing the citation.
    """
    by_n = {entry["n"]: entry["id"] for entry in entries}

    def resolve_list(citations: list[Any]) -> list[Any]:
        return [by_n.get(item, item) if isinstance(item, int) else item for item in citations]

    def walk(node: Any) -> Any:
        if isinstance(node, dict):
            result = {}
            for key, value in node.items():
                if key == "citations" and isinstance(value, list):
                    result[key] = resolve_list(value)
                else:
                    result[key] = walk(value)
            return result
        if isinstance(node, list):
            return [walk(item) for item in node]
        return node

    return walk(obj)
