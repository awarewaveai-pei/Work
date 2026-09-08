#!/usr/bin/env python3
"""Deterministic, non-LLM itemization of generation/blueprint-architecture-content.json
into an ordered list of discrete items per (doc, section), written to
generation/blueprint-architecture-items.json.

Mechanical only, no semantic judgment: a fenced ```text``` code block splits one item per
non-blank line; otherwise a `- ` bullet or `N. ` numbered list entry starts a new item, any
line before the first such marker (or a doc with no markers at all, e.g. a prose-only
Definition of Done) becomes / continues item 0. This is the itemization step consumed by
scripts/blueprint-capability-item-map.json's semantic capability assignment -- itemization
never invents or drops content, it only draws item boundaries in the already-extracted text.
"""
from __future__ import annotations
from pathlib import Path
import json, re

ROOT = Path(__file__).resolve().parents[1]

BULLET_RE = re.compile(r'^-\s+(.*)$')
NUM_RE = re.compile(r'^\d+\.\s+(.*)$')
FENCE_RE = re.compile(r'^```')


def split_items(content: str) -> list[str]:
    lines = content.splitlines()
    if lines and FENCE_RE.match(lines[0].strip()):
        # fenced code block: one item per non-blank inner line, ignore the fence markers
        items = []
        for line in lines[1:]:
            stripped = line.strip()
            if not stripped or FENCE_RE.match(stripped):
                continue
            items.append(stripped)
        return items
    items: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        m = BULLET_RE.match(stripped) or NUM_RE.match(stripped)
        if m:
            items.append(m.group(1).strip())
        elif items:
            items[-1] = (items[-1] + ' ' + stripped).strip()
        else:
            items.append(stripped)
    return items


def main():
    src = json.loads((ROOT / 'generation/blueprint-architecture-content.json').read_text(encoding='utf-8'))
    docs_out = {}
    total_items = 0
    for did, entry in src['docs'].items():
        sections_out = {}
        for skey, sec in entry['sections'].items():
            items = split_items(sec['content'])
            sections_out[skey] = items
            total_items += len(items)
        docs_out[did] = sections_out
    payload = {
        'schema_version': '1.0.0',
        'generated_from': 'generation/blueprint-architecture-content.json via scripts/extract_blueprint_items.py',
        'docs': docs_out,
    }
    out_path = ROOT / 'generation/blueprint-architecture-items.json'
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(f'ITEMIZE: docs={len(docs_out)} total_items={total_items}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
