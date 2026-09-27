"""Source prompt manifests shared by every synthesis line (P2 WC-01, P-a/P-c).

One manifest, one citation vocabulary: entries are keyed by ``source:<source_id>``
so a model's ``[n]`` output resolves to the same id whatever line produced it
(interpret, dossier, decision, literature). ``render_source_block`` is the fence
of ``NA/lib/dossier/report.ts:93-105`` plus a per-prompt random code (see its
docstring); ``manifest_errors`` is the one P-a / P-c manifest check.
"""

from __future__ import annotations

import hashlib
import json
import re
import secrets
from typing import Any, Mapping

from ai_lego.errors import InvariantViolation

DEFAULT_MAX_CHARS = 6000
DEFAULT_BATCH_SIZE = 40
# A Source's content_sha256 (core/domain/source.py enforces the same form on every stored row).
_SHA256 = re.compile(r"[0-9a-f]{64}")


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def manifest_sha256(entries: list[Mapping[str, Any]]) -> str:
    """The manifest's ``sha256`` (P-c): over the canonical JSON of its entries. One definition for the builder and
    for anyone checking an artifact's manifest (``COS/eval/run.py`` ``artifact_contract_errors``)."""
    return hashlib.sha256(_canonical_json(entries).encode("utf-8")).hexdigest()


def build_source_manifest(
    sources: list[Mapping[str, Any]],
    *,
    max_chars: int = DEFAULT_MAX_CHARS,
    batch_size: int = DEFAULT_BATCH_SIZE,
) -> dict[str, Any]:
    """Build the P-c ``manifest`` block: ``{entries: [P-a], batches: [[n]], sha256}``.

    Input = flat dicts (a P-h ``{row, text}`` pair becomes ``{**row, "text": text}``); one without ``source_id`` or
    ``status``, or an included one without a sha256 digest, raises instead of silently dropping out or reaching the
    artifact. Only ``status == "active"`` sources with non-empty text are included (superseded rows drop out; an
    empty text has no ``start < end`` window, P-a). Ordering is stable: ``(created_at, source_id)`` ascending, then
    numbered ``n`` from 1. Each entry's ``end`` is the excerpt window into that source's text, truncated to
    ``max_chars`` -- the manifest itself carries no text.
    """
    for source in sources:
        if not isinstance(source.get("source_id"), str) or not source["source_id"] or "status" not in source:
            raise InvariantViolation("SOURCE_MANIFEST_INPUT_INVALID: every source needs source_id and status (flatten {row, text} to {**row, 'text': text})")
    active = [source for source in sources if source["status"] == "active" and source.get("text")]
    for source in active:
        sha = source.get("content_sha256") or source.get("sha256")
        if not isinstance(sha, str) or not _SHA256.fullmatch(sha):
            raise InvariantViolation(f"SOURCE_MANIFEST_INPUT_INVALID: source {source['source_id']!r} has no content_sha256 (64 lowercase hex)")
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
        "sha256": manifest_sha256(entries),
    }


def new_fence_nonce() -> str:
    """One per prompt: every SOURCE block in it carries this code, which no fetched page can know in advance."""
    return secrets.token_hex(8)


def render_source_block(entry: Mapping[str, Any], text: str, *, nonce: str) -> str:
    """Render one manifest entry as a fenced, numbered prompt block.

    Fence from ``report.ts:93-105`` plus the prompt's random code (v1.yaml rule 5, third documented deviation):
    ``<<<SOURCE n BEGIN code>>>`` ... ``<<<SOURCE n END code>>>``, and only a marker with that code is a boundary.
    report.ts's fixed pair could be closed by a page that contains it; rewriting such text instead is always
    one lookalike short and puts words in the prompt the source never had, so the text stays as it is.
    report.ts's ``日期`` is the publication date; P-a only carries ``fetched_at``, so it is labelled
    ``擷取日期``. Title and URL stay on one line.
    """
    if not isinstance(nonce, str) or len(nonce) < 16 or not nonce.isalnum():
        raise InvariantViolation("SOURCE_FENCE_NONCE_INVALID: use new_fence_nonce() once per prompt")
    n = entry["n"]
    head_lines = [f"[{n}] {_one_line(entry.get('title') or entry.get('url') or '(無標題)')}"]
    if entry.get("url"):
        head_lines.append(f"URL: {_one_line(entry['url'])}")
    if entry.get("fetched_at"):
        head_lines.append(f"擷取日期: {entry['fetched_at'][:10]}")
    head = "\n".join(head_lines)
    body = text[entry.get("start", 0) : entry.get("end", len(text))]
    return f"<<<SOURCE {n} BEGIN {nonce}>>>\n{head}\n---\n{body}\n<<<SOURCE {n} END {nonce}>>>"


def _one_line(value: Any) -> str:
    return " ".join(str(value).split())


P_A_KEYS = frozenset({"n", "id", "source_id", "sha256", "start", "end", "title", "url", "fetched_at", "source_class"})


def _is_int(value: Any) -> bool:
    """A JSON integer. ``True == 1`` and ``2.0 == 2``, so an equality check alone would take either for one."""
    return isinstance(value, int) and not isinstance(value, bool)


def manifest_errors(manifest: Any, *, max_chars: int = DEFAULT_MAX_CHARS, batch_size: int = DEFAULT_BATCH_SIZE) -> list[str]:
    """The P-a / P-c manifest contract, one definition: what ``build_source_manifest`` returns always passes, and any
    artifact's manifest is checked against the same rules (``COS/eval/run.py``). Never raises."""
    if not isinstance(manifest, dict):
        return ["manifest is not an object"]
    entries = manifest.get("entries")
    if not isinstance(entries, list) or not all(isinstance(entry, dict) for entry in entries):
        return ["manifest.entries must be a list of objects"]
    errors: list[str] = []
    seen: set[str] = set()
    for index, entry in enumerate(entries):
        where = f"manifest.entries[{index}]"
        if set(entry) != P_A_KEYS:
            errors.append(f"{where} keys differ from P-a: {sorted(map(str, set(entry) ^ P_A_KEYS))}")
            continue
        n, source_id, start, end, sha = entry["n"], entry["source_id"], entry["start"], entry["end"], entry["sha256"]
        if not _is_int(n) or n != index + 1:
            errors.append(f"{where}.n is {n!r}, want {index + 1}")
        if not isinstance(source_id, str) or not source_id or entry["id"] != f"source:{source_id}":
            errors.append(f"{where}.id must be 'source:' + source_id")
        elif entry["id"] in seen:
            errors.append(f"{where}.id {entry['id']!r} repeats")
        else:
            seen.add(entry["id"])
        if not (_is_int(start) and _is_int(end)) or not 0 <= start < end or end - start > max_chars:
            errors.append(f"{where} window [{start!r}, {end!r}) must satisfy 0 <= start < end, end - start <= {max_chars}")
        if not isinstance(sha, str) or not _SHA256.fullmatch(sha):
            errors.append(f"{where}.sha256 must be the source content's sha256 (64 lowercase hex)")
    batches = manifest.get("batches")
    flat = [n for batch in batches for n in batch] if isinstance(batches, list) and all(isinstance(b, list) and b and all(map(_is_int, b)) for b in batches) else None
    if flat is None or flat != list(range(1, len(entries) + 1)) or any(len(batch) > batch_size for batch in batches):
        errors.append(f"manifest.batches must split 1..{len(entries)} in order, at most {batch_size} per batch")
    if manifest.get("sha256") != manifest_sha256(entries):
        errors.append("manifest.sha256 is not the sha256 of its entries")
    return errors


def resolve_citation_numbers(obj: Any, entries: list[Mapping[str, Any]]) -> Any:
    """Recursively replace model-written ``[n]`` ints under any ``citations`` key with manifest ids.

    An ``n`` with no matching entry is left as the original int rather than
    dropped -- ``evaluate_citation_integrity`` then reports it as
    out-of-manifest instead of silently losing the citation. ``bool`` is an
    ``int`` subclass (``True == 1``): it is left as-is, never read as source 1.
    """
    by_n = {entry["n"]: entry["id"] for entry in entries}

    def resolve_list(citations: list[Any]) -> list[Any]:
        return [by_n.get(item, item) if isinstance(item, int) and not isinstance(item, bool) else item for item in citations]

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
