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
//   - Kept blocks are left byte-identical in their original order: a rotation
//     only deletes. (Re-sorting them newest-first, added 2026-07-02, turned
//     every rotation into a whole-file diff; removed 2026-10-03.)
//   - Idempotent: re-running with nothing to move is a no-op.
//
// Usage:
//   node scripts/rotate-worklog.mjs [--dry-run] [--repo <root>] [--now YYYY-MM-DD]
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
const nowIdx = args.indexOf('--now'); // YYYY-MM-DD; tests pin the keep window so a run across month-end cannot flake
const NOW = nowIdx >= 0 ? new Date(`${args[nowIdx + 1]}T12:00:00Z`) : new Date();
if (Number.isNaN(NOW.getTime())) {
  console.error(`rotate-worklog: bad --now ${args[nowIdx + 1]} (want YYYY-MM-DD)`);
  process.exit(2);
}

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
  // Fence-aware (critic 2026-07-02 finding 1): a `## 20xx-xx-xx` line inside a
  // ``` / ~~~ code fence is CONTENT (WORKLOG entries paste command output and
  // WORKLOG-format examples), not a block boundary — the naive regex split a
  // kept block and mis-filed its tail into the wrong archive month.
  const lines = text.split('\n');
  const marks = [];
  let inFence = false;
  let offset = 0;
  for (const line of lines) {
    if (/^(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence) {
      const m = /^## (20\d{2}-\d{2}-\d{2})\b/.exec(line);
      if (m) marks.push({ date: m[1], start: offset });
    }
    offset += line.length + 1; // +1 for the split '\n'
  }
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
  const keep = keepMonths(NOW);

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

  if (DRY) {
    console.log(`rotate-worklog [dry-run]: would keep ${kept.length} blocks (${[...keep].join(', ')}), move ${moved.length} blocks:`);
    for (const [k, list] of [...byMonth.entries()].sort()) {
      console.log(`  → WORKLOG-archive/${k}.md  (+${list.length} blocks)`);
    }
    return;
  }

  // Write order + failure model (critic 2026-07-02 findings 2a/2b):
  //   1. Archive appends are IDEMPOTENT — a block whose exact text is already
  //      in the target file is skipped, so the promised "next close retries"
  //      cannot duplicate content after a partial failure.
  //   2. WORKLOG.md is rewritten atomically (temp file + rename on the same
  //      volume) — a crash mid-write can never truncate the VBC SSOT.
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  for (const [k, list] of [...byMonth.entries()].sort()) {
    const file = path.join(ARCHIVE_DIR, `${k}.md`);
    const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    const head = existing === null
      ? `# WORKLOG archive ${k}\n\n> Rotated out of agency-os/WORKLOG.md by scripts/rotate-worklog.mjs. Newest-first. Do not append by hand — write today's work to WORKLOG.md.\n\n`
      : '';
    const fresh = list.filter((b) => existing === null || !existing.includes(b.text.trimEnd()));
    if (head === '' && fresh.length === 0) continue; // fully rotated already
    fs.appendFileSync(file, head + fresh.map((b) => b.text.trimEnd() + '\n\n').join(''));
  }

  // Kept blocks stay byte-identical and in their original order, so the WORKLOG.md diff of a rotation is
  // deletions only. Re-sorting them (until 2026-10-03) moved every bottom-appended `## date` section next
  // to its date: a +8475/-15778 diff for a rotation that removed 7300 lines.
  const rebuilt = header + kept.map((b) => b.text).join('');
  const tmp = WORKLOG + '.rotate-tmp';
  fs.writeFileSync(tmp, rebuilt);
  fs.renameSync(tmp, WORKLOG);

  const lines = rebuilt.split('\n').length;
  console.log(`rotate-worklog: moved ${moved.length} blocks to ${byMonth.size} archive file(s); WORKLOG.md now ${kept.length} blocks / ${lines} lines (months kept: ${[...keep].join(', ')}).`);
}

main();
