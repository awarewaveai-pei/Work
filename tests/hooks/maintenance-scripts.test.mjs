// Tests for the two close-out maintenance scripts (critic 2026-07-02
// findings 1/2/3): rotate-worklog fence-awareness + idempotency + atomicity,
// and checkpoint-junk-guard byte-correct junk detection.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { REPO_ROOT } from './helpers.mjs';

const ROTATE = path.join(REPO_ROOT, 'scripts', 'rotate-worklog.mjs');
const GUARD = path.join(REPO_ROOT, 'scripts', 'checkpoint-junk-guard.mjs');

function makeRepoRoot(worklog) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rotatetest-'));
  fs.mkdirSync(path.join(dir, 'agency-os'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'agency-os', 'WORKLOG.md'), worklog);
  return dir;
}

// The keep window is pinned with --now so a run across UTC month-end cannot flake.
const TODAY = new Date().toISOString().slice(0, 10);
function runRotate(repo, ...extra) {
  return spawnSync('node', [ROTATE, '--repo', repo, '--now', TODAY, ...extra], { encoding: 'utf8' });
}

const OLD = '2025-01'; // always outside the keep window
const CUR = TODAY.slice(0, 7); // keep = {current, previous} month — exact membership
const KEPT_DATE = `${CUR}-15`;

test('rotate: fence-guarded — a ## date line inside a code fence is NOT a block boundary (critic-1)', () => {
  const worklog = [
    '# Worklog', '',
    `## ${OLD}-15`, 'old block to rotate', '',
    `## ${KEPT_DATE}`, // current month = kept
    'kept block with pasted output:',
    '```text',
    '## 2026-01-01', // decoy inside fence
    '```',
    'tail of the kept block — must stay attached', '',
  ].join('\n');
  const repo = makeRepoRoot(worklog);
  const r = runRotate(repo);
  assert.equal(r.status, 0);
  const main = fs.readFileSync(path.join(repo, 'agency-os', 'WORKLOG.md'), 'utf8');
  assert.match(main, /tail of the kept block/);
  assert.match(main, /## 2026-01-01/); // decoy stayed inside the kept block
  assert.equal(fs.existsSync(path.join(repo, 'agency-os', 'WORKLOG-archive', '2026-01.md')), false);
  const arch = fs.readFileSync(path.join(repo, 'agency-os', 'WORKLOG-archive', `${OLD}.md`), 'utf8');
  assert.match(arch, /old block to rotate/);
  // fences stay balanced in the kept file
  assert.equal((main.match(/^```/gm) || []).length % 2, 0);
});

test('rotate: idempotent — re-adding the same old block does not duplicate archive content (critic-2a)', () => {
  const oldBlock = `## ${OLD}-10\nsame old content\n`;
  const worklog = `# Worklog\n\n${oldBlock}\n## ${KEPT_DATE}\nkept\n`;
  const repo = makeRepoRoot(worklog);
  assert.equal(runRotate(repo).status, 0);
  // Simulate the failure-retry path: the block reappears in WORKLOG (e.g. the
  // WORKLOG rewrite failed after archives were written) and rotation reruns.
  fs.writeFileSync(path.join(repo, 'agency-os', 'WORKLOG.md'), worklog);
  assert.equal(runRotate(repo).status, 0);
  const arch = fs.readFileSync(path.join(repo, 'agency-os', 'WORKLOG-archive', `${OLD}.md`), 'utf8');
  assert.equal((arch.match(/same old content/g) || []).length, 1);
});

test('rotate: kept blocks stay byte-identical in original order — the rotation diff is deletions only', () => {
  const t = new Date(`${TODAY}T12:00:00Z`);
  const PREV = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const worklog = [
    '# Worklog',
    `## ${CUR}-02（續1）newest entry, inserted at the top`, 'a', '',
    `## ${PREV}-20（續3）older kept entry`, 'b',
    `## ${OLD}-15`, 'old block to rotate', '', '',
    `## ${CUR}-01`, '- machine appendix appended at the bottom', '',
    `## ${PREV}-28`, '- bottom section, spacing kept   ', '',
  ].join('\r\n'); // CRLF on purpose: bytes must survive untouched
  const repo = makeRepoRoot(worklog);
  assert.equal(runRotate(repo).status, 0);
  const main = fs.readFileSync(path.join(repo, 'agency-os', 'WORKLOG.md'), 'utf8');
  const oldBlock = `## ${OLD}-15\r\nold block to rotate\r\n\r\n\r\n`;
  assert.ok(worklog.includes(oldBlock));
  assert.equal(main, worklog.replace(oldBlock, ''));
});

test('rotate: no temp file left behind (atomic rename, critic-2b)', () => {
  const repo = makeRepoRoot(`# W\n\n## ${OLD}-01\nx\n\n## ${KEPT_DATE}\nkept\n`);
  assert.equal(runRotate(repo).status, 0);
  assert.equal(fs.existsSync(path.join(repo, 'agency-os', 'WORKLOG.md.rotate-tmp')), false);
});

test('junk-guard: unstages $null/null and CJK 0-byte names, keeps real work staged (critic-3)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardtest-'));
  const g = (...a) => spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8' });
  g('init', '-q', '-b', 'work');
  g('config', 'user.email', 't@t.t');
  g('config', 'user.name', 't');
  fs.writeFileSync(path.join(dir, 'real-work.md'), 'content\n');
  fs.writeFileSync(path.join(dir, '$null'), '');
  fs.writeFileSync(path.join(dir, 'null'), '');
  fs.writeFileSync(path.join(dir, '對應任務：'), '');       // CJK word-split class
  fs.writeFileSync(path.join(dir, '正常筆記.md'), '有內容\n'); // non-ASCII but NON-empty → must survive
  g('add', '-A');
  const r = spawnSync('node', [GUARD, '--repo', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const staged = g('-c', 'core.quotepath=false', 'diff', '--cached', '--name-only', '-z').stdout.split('\0').filter(Boolean);
  assert.ok(staged.includes('real-work.md'), 'real work must stay staged');
  assert.ok(staged.includes('正常筆記.md'), 'non-empty CJK file must stay staged');
  assert.ok(!staged.includes('$null'), '$null must be unstaged');
  assert.ok(!staged.includes('null'), 'null must be unstaged');
  assert.ok(!staged.includes('對應任務：'), 'CJK 0-byte junk must be unstaged');
});

test('junk-guard: clean stage is a silent no-op', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardtest2-'));
  const g = (...a) => spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8' });
  g('init', '-q', '-b', 'work');
  g('config', 'user.email', 't@t.t');
  g('config', 'user.name', 't');
  fs.writeFileSync(path.join(dir, 'ok.md'), 'x\n');
  g('add', '-A');
  const r = spawnSync('node', [GUARD, '--repo', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /no junk staged/);
});
