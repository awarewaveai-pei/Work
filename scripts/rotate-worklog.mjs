#!/usr/bin/env node
// Monthly WORKLOG rotation — keeps agency-os/WORKLOG.md bounded.
//
// Why: WORKLOG.md is the VBC protocol's source of truth but grew unbounded
// (15,708 lines / 108 day-blocks over 4 months by 2026-07-02, with stale
// blocks mis-ordered at the tail). AO-RESUME/VBC only ever read the most
// recent blocks; history belongs in per-month archive files.
//
// Policy (data-shape change, zero consumer changes):
//   - WORKLOG.md keeps the CURRENT month + the PREVIOUS month (so "read the
//     last 3 day-blocks" always works even on the 1st of a month).
//   - Every older `## YYYY-MM-DD` block moves to
//     agency-os/WORKLOG-archive/YYYY-MM.md (newest-first inside each file).
//   - Kept blocks are re-emitted strictly newest-first (repairs the broken
//     tail ordering observed in the 2026-07-02 audit).
//   - Idempotent: re-running with nothing to move is a no-op.
//
// Usage:
//   node scripts/rotate-worklog.mjs [--dry-run] [--repo <root>]
//
// Invoked automatically by ao-close.ps1 (best-effort; failure never blocks
// close-out — it prints a warning and the next close retries).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const repoIdx = args.indexOf('--repo');
const REPO = repoIdx >= 0 ? args[repoIdx + 1]
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const WORKLOG = path.join(REPO, 'agency-os', 'WORKLOG.md');
const ARCHIVE_DIR = path.join(REPO, 'agency-os', 'WORKLOG-archive');

function monthKey(date) { return date.slice(0, 7); }

function keepMonths(now = new Date()) {
  const cur = now.toISOString().slice(0, 7);
  const prevDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prev = prevDate.toISOString().slice(0, 7);
  return new Set([cur, prev]);
}

function parse(text) {
  // Split into header (everything before the first day heading) + blocks.
  const re = /^## (20\d{2}-\d{2}-\d{2})\b.*$/gm;
  const marks = [];
  let m;
  while ((m = re.exec(text)) !== null) marks.push({ date: m[1], start: m.index });
  if (marks.length === 0) return { header: text, blocks: [] };
  const header = text.slice(0, marks[0].start);
  const blocks = marks.map((mk, i) => ({
    date: mk.date,
    text: text.slice(mk.start, i + 1 < marks.length ? marks[i + 1].start : text.length),
  }));
  return { header, blocks };
}

function main() {
  if (!fs.existsSync(WORKLOG)) {
    console.error(`rotate-worklog: not found: ${WORKLOG}`);
    process.exit(1);
  }
  const original = fs.readFileSync(WORKLOG, 'utf8');
  const { header, blocks } = parse(original);
  const keep = keepMonths();

  const kept = blocks.filter((b) => keep.has(monthKey(b.date)));
  const moved = blocks.filter((b) => !keep.has(monthKey(b.date)));

  if (moved.length === 0) {
    console.log(`rotate-worklog: nothing to rotate (kept ${kept.length} blocks in ${[...keep].join(', ')}).`);
    return;
  }

  // Group moved blocks per month, newest-first inside each month.
  const byMonth = new Map();
  for (const b of moved) {
    const k = monthKey(b.date);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k).push(b);
  }
  for (const list of byMonth.values()) list.sort((a, b) => b.date.localeCompare(a.date));

  const keptSorted = [...kept].sort((a, b) => b.date.localeCompare(a.date));

  if (DRY) {
    console.log(`rotate-worklog [dry-run]: would keep ${kept.length} blocks (${[...keep].join(', ')}), move ${moved.length} blocks:`);
    for (const [k, list] of [...byMonth.entries()].sort()) {
      console.log(`  → WORKLOG-archive/${k}.md  (+${list.length} blocks)`);
    }
    return;
  }

  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  for (const [k, list] of [...byMonth.entries()].sort()) {
    const file = path.join(ARCHIVE_DIR, `${k}.md`);
    const isNew = !fs.existsSync(file);
    const head = isNew
      ? `# WORKLOG archive ${k}\n\n> Rotated out of agency-os/WORKLOG.md by scripts/rotate-worklog.mjs. Newest-first. Do not append by hand — write today's work to WORKLOG.md.\n\n`
      : '';
    // Newest-first within the file: new batch is OLDER than existing archive
    // content only if the file already has newer blocks — in practice each
    // month file receives its blocks exactly once, so append order is fine.
    fs.appendFileSync(file, head + list.map((b) => b.text.trimEnd() + '\n\n').join(''));
  }

  const rebuilt = header.trimEnd() + '\n\n' +
    keptSorted.map((b) => b.text.trimEnd() + '\n\n').join('');
  fs.writeFileSync(WORKLOG, rebuilt);

  const lines = rebuilt.split('\n').length;
  console.log(`rotate-worklog: moved ${moved.length} blocks to ${byMonth.size} archive file(s); WORKLOG.md now ${kept.length} blocks / ${lines} lines (months kept: ${[...keep].join(', ')}).`);
}

main();
