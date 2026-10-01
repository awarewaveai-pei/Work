#!/usr/bin/env node
// Gate: every section pointer into the agent rule set lands on exactly one heading.
//
// The rule set is agency-os/AGENTS.md (rule bodies, injected every turn) plus
// agency-os/docs/operations/AGENTS_APPENDIX.md (reasons and mechanism detail, read on demand),
// and every file in the repo that cites them by section. Until 2026-10-01 nothing checked those
// names: 4 of the 12 pointers in AGENTS.md matched zero or several headings, hook / command /
// runbook / source comments cited sections that no longer existed, and the appendix had grown to
// 87% verbatim old copies of AGENTS.md (18 duplicate headings), so a pointer could land on a stale
// copy of a rule. Old versions live in git, not in the appendix.
//
// Invariant: the gate never reports green without having verified. Two cross-model review rounds
// (12 findings) were all instances of one class -- "an input the pattern did not anticipate is
// silently not checked". The class is closed by accounting instead of pattern-matching:
//   - inside the two rule files EVERY section sign is classified (resolved / belongs to another
//     named file / a syntax mention in backticks) or it is an issue; none is skipped by default;
//   - a name resolves only as a whole heading key followed by a delimiter, never as a prefix of
//     longer text; no heading key may be the start of another;
//   - the files scanned are everything git knows (tracked + untracked-not-ignored) minus the
//     record directories listed in RECORD_PATHS, so a new surface is covered without editing
//     this file; a file that cannot be read is an issue;
//   - the success line carries the counts, and the caller requires them (a truncated script that
//     exits 0 does not look like a pass).
//
// Issue types (each names file:line):
//   pointer_unresolved    a section pointer in a rule file names no heading / a missing number
//   citation_unresolved   another file cites AGENTS.md by a section that does not exist
//   duplicate_heading     two headings in AGENTS.md + appendix share a key
//   ambiguous_heading     one heading key is the start of another
//   appendix_archive      the appendix holds a verbatim archive section
//   duplicate_rule_text   a long line exists verbatim in both AGENTS.md and the appendix
//   missing_file / unreadable_source / scan_failed    something that had to be read was not
//
// Known limit: a bare number ("see section 6") is only range-checked against AGENTS.md's numbered
// sections; when prose means another document's section 6, qualify it with that file's name.
//
// Usage: node scripts/verify-governance-pointers.mjs [--root=<repo root>]    exit 1 on any issue.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = path.resolve(path.dirname(SELF), '..');

export const AGENTS_REL = 'agency-os/AGENTS.md';
export const APPENDIX_REL = 'agency-os/docs/operations/AGENTS_APPENDIX.md';

const SCAN_EXT = /\.(md|mdc|js|mjs|cjs|jsx|ts|tsx|ps1|psm1|py|sh|json|ya?ml|toml)$/i;
// Records describe what was true when written; an old section name in them is history, not rot.
export const RECORD_PATHS = [
  /^agency-os\/WORKLOG\.md$/,
  /^agency-os\/WORKLOG-archive\//,
  /^agency-os\/TASKS\.md$/,
  /^agency-os\/reports\//,
  /^agency-os\/memory\//,
  /^agency-os\/handoffs\//,
  /^agency-os\/Backups\//,
  /(^|\/)(ADR-\d|adr\/|decisions\/)/i, // decision records
  /\d{4}-\d{2}-\d{2}/, // any dated artifact (handoffs, reviews, reports)
  /\/HCI30_RESEARCH_REVIEW\//, // one-off multi-agent review output
];
const SELF_FILES = ['scripts/verify-governance-pointers.mjs', 'tests/hooks/governance-pointers.test.mjs'];
const IGNORED_KEYS = new Set(['Related Documents']); // doc-sync footer, present in both files by design
const SECTION = '§';
const OWN_FILES = new Set(['AGENTS.md', 'AGENTS_APPENDIX.md']);
const FILE_BEFORE = /([\w.\-]+\.(?:md|mdc|ps1|psm1|mjs|cjs|js|jsx|ts|tsx|py|sh|json|ya?ml|toml))[`\]\)\*]*\s?$/i;
const AGENTS_BEFORE = /AGENTS(?:\.md)?(?: R0)?[`\*]*\s?$/;
const CHAIN_GAP = /^(?:[\s–—\-~／/、,，&和與及]|and|or)*$/i;
const DELIM_AFTER = /^[\s\p{P}\p{S}]/u;
const MIN_DUP_LINE = 60;

/** Heading text reduced to the part a pointer has to match. */
export function headingKey(text) {
  let t = text.replace(/[*`]/g, '').trim();
  for (const cut of ['（', '(', ' — ', ' -- ']) {
    const i = t.indexOf(cut);
    if (i > 0) t = t.slice(0, i);
  }
  return t.trim();
}

/** Per line: true when the line is inside (or is) a fenced code block. */
function fenceMask(lines) {
  const mask = [];
  let fence = null; // { ch, len, indent }
  for (const raw of lines) {
    // A fence closes only on the same character, at least as long as the opener, nothing after it, and
    // indented at most 3 columns (4+ is content) -- or, for a fence opened inside a list item, at most
    // 3 columns past its opener. An unclosed fence hides every later heading, so pointers to them fail:
    // the safe direction. This is not a full CommonMark parser; nested containers are approximated.
    const f = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(raw);
    if (f) {
      const indent = f[1].replace(/\t/g, '    ').length;
      const ch = f[2][0];
      const len = f[2].length;
      if (!fence) {
        fence = { ch, len, indent };
        mask.push(true);
        continue;
      }
      const closeMax = fence.indent <= 3 ? 3 : fence.indent + 3;
      if (ch === fence.ch && len >= fence.len && f[3].trim() === '' && indent <= closeMax) {
        fence = null;
        mask.push(true);
        continue;
      }
    }
    mask.push(fence !== null);
  }
  return mask;
}

/** ATX headings outside fenced code blocks: [{ level, text, key, line }]. */
export function parseHeadings(md) {
  const lines = md.split(/\r?\n/);
  const mask = fenceMask(lines);
  const out = [];
  lines.forEach((raw, i) => {
    if (mask[i]) return;
    const m = /^ {0,3}(#{1,6}) (.+?)\s*$/.exec(raw); // up to 3 leading spaces is still a heading
    if (m) out.push({ level: m[1].length, text: m[2], key: headingKey(m[2]), line: i + 1 });
  });
  return out;
}

function readText(abs) {
  const text = fs.readFileSync(abs, 'utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // doc-sync (PS 5.1 Set-Content) writes a BOM
}

/** Everything the check needs, read from disk. Nothing unreadable is dropped silently. */
export function collectTree(root = DEFAULT_ROOT) {
  const tree = { agents: null, appendix: null, sources: [], scanIssues: [] };
  for (const [slot, rel] of [['agents', AGENTS_REL], ['appendix', APPENDIX_REL]]) {
    try {
      tree[slot] = readText(path.join(root, rel));
    } catch {
      /* reported as missing_file by checkPointers */
    }
  }
  let listed;
  try {
    listed = execFileSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      encoding: 'utf8',
      maxBuffer: 1 << 28,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).split('\0').filter(Boolean);
  } catch (e) {
    tree.scanIssues.push({ type: 'scan_failed', where: root, detail: `git ls-files failed: ${String((e && e.message) || e).split('\n')[0]}` });
    return tree;
  }
  for (const rel of listed) {
    if (!SCAN_EXT.test(rel) || rel === AGENTS_REL || rel === APPENDIX_REL || SELF_FILES.includes(rel)) continue;
    if (RECORD_PATHS.some((re) => re.test(rel))) continue;
    const abs = path.join(root, rel);
    let st;
    try {
      st = fs.statSync(abs);
    } catch (e) {
      if (e && e.code === 'ENOENT') continue; // tracked but deleted in the worktree: the deletion is the pending change
      tree.scanIssues.push({ type: 'unreadable_source', where: rel, detail: String((e && e.code) || e) });
      continue;
    }
    if (!st.isFile()) {
      tree.scanIssues.push({ type: 'unreadable_source', where: rel, detail: 'listed by git but not a regular file' });
      continue;
    }
    try {
      const text = readText(abs);
      if (text.includes(SECTION)) tree.sources.push({ rel, text });
      tree.scanned = (tree.scanned || 0) + 1;
    } catch (e) {
      tree.scanIssues.push({ type: 'unreadable_source', where: rel, detail: String((e && e.code) || e) });
    }
  }
  return tree;
}

/**
 * Resolve the text after a section sign against the rule set.
 * Returns null when it resolves, else a short reason.
 */
function resolveTail(tail, keys, numbered) {
  const num = /^(\d+)((?:\.\d+)*)/.exec(tail);
  if (num) {
    if (num[2]) return `sub-section ${num[0]} does not exist (AGENTS.md has whole-numbered sections only)`;
    if (!numbered.has(num[1])) return `section ${num[1]} does not exist in AGENTS.md`;
    // "1-99" / "0/1/3": every number has to exist, not only the first
    const rest = tail.slice(num[0].length);
    const more = /^(?:[–—\-~]\d+|(?:[／/、]\d+)+)/.exec(rest);
    for (const n of more ? more[0].match(/\d+/g) : []) {
      if (!numbered.has(n)) return `section ${n} does not exist in AGENTS.md`;
    }
    return null;
  }
  let best = null;
  for (const k of keys) {
    if (k.length >= 2 && tail.startsWith(k) && (!best || k.length > best.length)) best = k;
  }
  if (!best) return 'no heading has this name';
  const after = tail.slice(best.length);
  if (after !== '' && !DELIM_AFTER.test(after)) {
    return `"${best}" is a heading, but the pointer runs on into "${after.slice(0, 12)}" -- end the name with a space or punctuation`;
  }
  return null;
}

/** [start, end) ranges of inline code spans: a run of N backticks closes at the next run of exactly N. */
function codeSpans(raw) {
  const runs = [...raw.matchAll(/`+/g)].map((m) => ({ at: m.index, len: m[0].length }));
  const spans = [];
  for (let i = 0; i < runs.length; i++) {
    const j = runs.findIndex((r, k) => k > i && r.len === runs[i].len);
    if (j === -1) continue; // unmatched run is literal text
    spans.push([runs[i].at, runs[j].at + runs[j].len]);
    i = j;
  }
  return spans;
}

/** Classify every section sign on a line. `own` = the line belongs to a rule file. */
function scanLine(raw, own, keys, numbered) {
  const found = []; // { reason|null, text }
  const spans = codeSpans(raw);
  let prev = null; // { end, kind }
  for (let p = raw.indexOf(SECTION); p !== -1; p = raw.indexOf(SECTION, p + 1)) {
    const before = raw.slice(0, p);
    const tail = raw.slice(p + 1).replace(/^[ *`\[]+/, '');
    let kind;
    if (spans.some(([a, b]) => p > a && p < b)) kind = 'mention';
    else if (AGENTS_BEFORE.test(before)) kind = 'own';
    else if (FILE_BEFORE.test(before)) kind = OWN_FILES.has(FILE_BEFORE.exec(before)[1]) ? 'own' : 'foreign';
    else if (prev && CHAIN_GAP.test(raw.slice(prev.end, p))) kind = prev.kind;
    else kind = own ? 'own' : 'unrelated';
    const endOfName = p + 1 + (raw.slice(p + 1).match(/^[ *`\[]*[^\s。；，、）)`]*/) || [''])[0].length;
    prev = { end: endOfName, kind };
    if (kind !== 'own') continue;
    found.push({ reason: resolveTail(tail, keys, numbered), text: `${SECTION}${tail.slice(0, 40)}` });
  }
  return found;
}

/** Pure check over a tree from collectTree(); returns [{ type, where, detail }] and sets tree.resolved. */
export function checkPointers(tree) {
  const issues = [...(tree.scanIssues || [])];
  // An unreadable rule file is a failure, never "nothing to check".
  if (tree.agents === null || tree.agents === undefined) {
    return [...issues, { type: 'missing_file', where: AGENTS_REL, detail: 'the rule file was not found under this root' }];
  }
  if (tree.appendix === null || tree.appendix === undefined) {
    return [...issues, { type: 'missing_file', where: APPENDIX_REL, detail: 'AGENTS.md exists but its appendix does not' }];
  }
  const agentsHeads = parseHeadings(tree.agents);
  const appendixHeads = parseHeadings(tree.appendix);
  const keys = [...agentsHeads, ...appendixHeads].map((h) => h.key);
  const numbered = new Set(agentsHeads.map((h) => /^(\d+)\./.exec(h.key)?.[1]).filter(Boolean));

  // duplicate_heading + appendix_archive
  const seen = new Map();
  for (const [file, heads] of [[AGENTS_REL, agentsHeads], [APPENDIX_REL, appendixHeads]]) {
    for (const h of heads) {
      if (IGNORED_KEYS.has(h.key)) continue;
      const at = `${file}:${h.line}`;
      if (seen.has(h.key)) {
        issues.push({ type: 'duplicate_heading', where: at, detail: `"${h.key}" already at ${seen.get(h.key)}` });
      } else seen.set(h.key, at);
      if (file === APPENDIX_REL && h.text.includes('全文存檔')) {
        issues.push({ type: 'appendix_archive', where: at, detail: `"${h.text}" -- old versions belong in git, not in the appendix` });
      }
    }
  }

  // ambiguous_heading: one key is the start of another, so a pointer could mean either
  const keyed = [...seen.entries()];
  for (const [a] of keyed) {
    for (const [b, at] of keyed) {
      if (a !== b && a.length >= 2 && b.startsWith(a)) {
        issues.push({ type: 'ambiguous_heading', where: at, detail: `"${b}" starts with the heading "${a}" at ${seen.get(a)} -- a pointer to one also matches the other` });
      }
    }
  }

  // duplicate_rule_text: the appendix explains rules, it does not repeat them (a pasted old copy of
  // AGENTS.md shows up here whatever its heading says, even inside a code fence)
  const agentLines = new Map();
  tree.agents.split(/\r?\n/).forEach((l, i) => {
    const t = l.trim();
    if (t.length >= MIN_DUP_LINE && !agentLines.has(t)) agentLines.set(t, i + 1);
  });
  tree.appendix.split(/\r?\n/).forEach((l, i) => {
    const t = l.trim();
    if (agentLines.has(t)) {
      issues.push({ type: 'duplicate_rule_text', where: `${APPENDIX_REL}:${i + 1}`, detail: `same line as ${AGENTS_REL}:${agentLines.get(t)} -- "${t.slice(0, 50)}..."` });
    }
  });

  // pointers: every section sign in the two rule files, every AGENTS-qualified one elsewhere
  let resolved = 0;
  const scanFile = (rel, text, own, type) => {
    const lines = text.split(/\r?\n/);
    const mask = own ? fenceMask(lines) : null;
    lines.forEach((raw, i) => {
      if (!raw.includes(SECTION) || (mask && mask[i])) return;
      for (const f of scanLine(raw, own, keys, numbered)) {
        if (f.reason === null) resolved += 1;
        else issues.push({ type, where: `${rel}:${i + 1}`, detail: `${f.text} -- ${f.reason}` });
      }
    });
  };
  scanFile(AGENTS_REL, tree.agents, true, 'pointer_unresolved');
  scanFile(APPENDIX_REL, tree.appendix, true, 'pointer_unresolved');
  for (const src of tree.sources) scanFile(src.rel, src.text, false, 'citation_unresolved');
  tree.resolved = resolved;
  return issues;
}

function main() {
  const rootArg = process.argv.find((a) => a.startsWith('--root='));
  const root = rootArg ? path.resolve(rootArg.slice('--root='.length)) : DEFAULT_ROOT;
  const tree = collectTree(root);
  const issues = checkPointers(tree);
  if (issues.length === 0) {
    const headings = parseHeadings(tree.agents).length + parseHeadings(tree.appendix).length;
    if (!(tree.scanned > 0 && headings > 0 && tree.resolved > 0)) {
      console.error(`Governance pointers FAILED: nothing was verified (files=${tree.scanned || 0}, headings=${headings}, pointers=${tree.resolved || 0})`);
      return 1;
    }
    console.log(`Governance pointers PASSED (${tree.scanned} files scanned, ${headings} headings, ${tree.resolved} pointers resolved).`);
    return 0;
  }
  console.error(`Governance pointers FAILED: ${issues.length} issue(s)`);
  for (const it of issues) console.error(`  ${it.type}: ${it.where} -- ${it.detail}`);
  return 1;
}

const invokedDirectly = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === path.resolve(SELF);
if (invokedDirectly) process.exit(main());
