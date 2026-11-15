// scripts/worklog-insert-entry.py hands out the next free 續N for a date. 2026-11-15: two worktree sessions were each
// given 續7 because each looked only at its own WORKLOG. The number must be free in origin/main (as fetched) and in
// every linked worktree's uncommitted copy as well.
// Run: node --test tests/hooks/worklog-entry-number.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT } from './helpers.mjs';

const SCRIPT = path.join(REPO_ROOT, 'scripts', 'worklog-insert-entry.py');
const PY = process.platform === 'win32' ? 'python' : 'python3';
const WORKLOG = 'agency-os/WORKLOG.md';
const DATE = '2026-09-23';

function g(dir, args) {
  const r = spawnSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

/** bare origin whose main holds 續5 for DATE; clone A at that commit; linked worktree B of A */
function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'wlnum-'));
  const bare = path.join(base, 'origin.git');
  const a = path.join(base, 'a');
  spawnSync('git', ['init', '-q', '--bare', '-b', 'main', bare]);
  spawnSync('git', ['-c', 'core.autocrlf=false', 'clone', '-q', bare, a]);
  g(a, ['config', 'core.autocrlf', 'false']);
  fs.mkdirSync(path.join(a, 'agency-os'));
  fs.writeFileSync(path.join(a, WORKLOG), `# Worklog\n\n## ${DATE}（續5）on origin\n\n- x\n`);
  g(a, ['add', '-A']); g(a, ['commit', '-q', '-m', 'seed']); g(a, ['push', '-q', '-u', 'origin', 'main']);
  const b = path.join(base, 'b');
  g(a, ['worktree', 'add', '-q', '-b', 'side', b]);
  return { a, b };
}

function insert(dir, body) {
  const entry = path.join(dir, 'entry.md');
  fs.writeFileSync(entry, `## ${DATE}（續NNN）${body}\n\n- line\n\n`);
  const r = spawnSync(PY, [SCRIPT, entry, '--date', DATE], { cwd: dir, encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return Number(r.stdout.trim().split(/\r?\n/).pop());
}

test('the number clears origin/main even when this file has fewer entries', () => {
  const { a } = fixture();
  fs.writeFileSync(path.join(a, WORKLOG), `# Worklog\n\n## ${DATE}（續3）local only\n\n- y\n`);   // local copy behind origin
  assert.equal(insert(a, 'mine'), 6);
  assert.match(fs.readFileSync(path.join(a, WORKLOG), 'utf8'), /（續6）mine/);
});

test('the number clears another worktree\'s uncommitted entry', () => {
  const { a, b } = fixture();
  fs.writeFileSync(path.join(b, WORKLOG), `# Worklog\n\n## ${DATE}（續7）uncommitted in b\n\n- z\n\n## ${DATE}（續5）on origin\n\n- x\n`);
  assert.equal(insert(a, 'mine'), 8);
  assert.equal(insert(b, 'theirs'), 9, 'and b sees a\'s new 續8 in turn');
});

test('without origin or worktrees the local file alone decides, as before', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wlnum-solo-'));
  g(dir, ['init', '-q', '-b', 'main']);
  fs.mkdirSync(path.join(dir, 'agency-os'));
  fs.writeFileSync(path.join(dir, WORKLOG), `# Worklog\n\n## ${DATE}（續2）a\n\n- x\n`);
  assert.equal(insert(dir, 'solo'), 3);
});
