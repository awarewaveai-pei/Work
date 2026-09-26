"""Query term splitting shared by the free-layer router and the eval harness (P2 P-i).

Python port of ``termsOf`` in
``apps/cognitive-web/components/StuckBox.tsx:15-22`` -- kept byte-for-byte
behaviorally identical (same regex classes, same 2-char CJK sliding window,
same insertion-order de-duplication) so a term list computed here matches
one computed there for the same input string.
"""

from __future__ import annotations

import re

_RUN_RE = re.compile(r"[一-鿿]+|[a-z0-9]{2,}")
_LATIN_RUN_RE = re.compile(r"^[a-z0-9]+$")


def terms_of(text: str) -> list[str]:
    """CJK runs split into overlapping 2-char pieces; latin/digit runs (>=2 chars) kept whole; lowercased; de-duplicated, insertion order preserved."""
    seen: dict[str, None] = {}
    for run in _RUN_RE.findall(text.lower()):
        if _LATIN_RUN_RE.match(run):
            seen.setdefault(run, None)
            continue
        for i in range(len(run) - 1):
            seen.setdefault(run[i : i + 2], None)
    return list(seen)
