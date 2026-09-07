#!/usr/bin/env python3
"""Deterministic, non-LLM extraction of real architecture content from the
Composable AI Commerce OS blueprint doc pack into generation/blueprint-architecture-content.json.

Mechanical only: splits each mapped doc on level-1 `# N. Title` (or `# Title`)
headings, matches heading text (number-stripped, case-insensitive, exact
match after normalization) against a fixed alias table, and copies the
verbatim markdown body of matching sections. No rewriting, no summarizing.
Sections not present in a given doc are omitted, never fabricated.
"""
from __future__ import annotations
from pathlib import Path
import json, re

ROOT = Path(__file__).resolve().parents[1]
PACK_DIR = ROOT.parent / 'Composable AI Commerce OS' / 'Composable_AI_Commerce_OS_LEGO_Documentation_Pack'
DOC_PREFIX = 'Composable AI Commerce OS_'

# canonical_key -> set of normalized (lowercased, whitespace-collapsed) heading
# texts that count as that section. Exact match only (not substring) so e.g.
# "# 18. Acceptance Criteria" never collides with "# 21. Definition of Done"
# in the standard 21-section LEGO module template.
SECTION_ALIASES = {
    'domain_objects': {'domain objects', 'primary domain objects'},
    'service_contract': {'service contract', 'public service contract', 'public services'},
    'events_published': {'events published'},
    'events_consumed': {'events consumed'},
    'permissions': {'permissions'},
    'data_rules': {'data rules', 'data & integration rules', 'data and integration rules'},
    'lego_test': {'lego test', 'golden connector test'},
    'definition_of_done': {'definition of done', 'core acceptance'},
}

HEADING_RE = re.compile(r'^#\s+(.*)$')
NUM_PREFIX_RE = re.compile(r'^\d+\.\s*(.*)$')


def normalize_heading(raw: str) -> str:
    m = NUM_PREFIX_RE.match(raw.strip())
    text = m.group(1) if m else raw.strip()
    return re.sub(r'\s+', ' ', text).strip().lower()


def doc_id(filename: str) -> str:
    stem = filename[:-3] if filename.endswith('.md') else filename
    if stem.startswith(DOC_PREFIX):
        stem = stem[len(DOC_PREFIX):]
    return stem


def split_sections(text: str):
    """Return list of (normalized_heading, raw_heading, body_text) for every
    level-1 `# ...` heading. Level-2+ headings are left inside the owning
    section's body, not treated as separate boundaries."""
    lines = text.splitlines()
    starts = []
    for i, line in enumerate(lines):
        m = HEADING_RE.match(line)
        if m and not line.startswith('##'):
            starts.append((i, m.group(1)))
    sections = []
    for idx, (line_no, raw_heading) in enumerate(starts):
        body_start = line_no + 1
        body_end = starts[idx + 1][0] if idx + 1 < len(starts) else len(lines)
        body = '\n'.join(lines[body_start:body_end]).strip('\n')
        sections.append((normalize_heading(raw_heading), raw_heading.strip(), body))
    return sections


def extract_doc(path: Path):
    text = path.read_text(encoding='utf-8')
    sections = split_sections(text)
    by_norm = {norm: (raw, body) for norm, raw, body in sections}
    out = {}
    for key, aliases in SECTION_ALIASES.items():
        for norm_heading, (raw, body) in by_norm.items():
            if norm_heading in aliases and body.strip():
                out[key] = {'heading': raw, 'content': body.strip()}
                break
    return out


def main():
    mapping = json.loads((ROOT / 'generation/blueprint-doc-mapping.json').read_text(encoding='utf-8'))
    doc_files = sorted({f for docs in mapping['mapping'].values() for f in docs})
    result = {}
    missing = []
    for fname in doc_files:
        path = PACK_DIR / fname
        if not path.is_file():
            missing.append(fname)
            continue
        sections = extract_doc(path)
        result[doc_id(fname)] = {
            'source_file': fname,
            'sections': sections,
            'section_count': len(sections),
        }
    if missing:
        raise SystemExit('missing mapped blueprint doc files: ' + ', '.join(missing))
    payload = {
        'schema_version': '1.0.0',
        'source_pack': mapping['source_pack'],
        'docs': result,
    }
    out_path = ROOT / 'generation/blueprint-architecture-content.json'
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    empty = [k for k, v in result.items() if v['section_count'] == 0]
    print(f'EXTRACT: docs={len(result)} with_sections={len(result)-len(empty)} empty={len(empty)}')
    if empty:
        print('  empty docs (no matched sections, kept for traceability): ' + ', '.join(sorted(empty)))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
