// scripts/git-partial-worktree-commit.py: a fresh private index prunes this root's stale siblings in the scratch dir --
// a marker whose HEAD is no longer this checkout's (the guard refuses it anyway) or an index/marker without its partner,
// both older than a day. 2026-11-15: 24 such files (38 MB) from eleven days of refused or abandoned stages.
// Run: node --test tests/hooks/partial-commit-prune.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT } from './helpers.mjs';

const HELPER = path.join(REPO_ROOT, 'scripts', 'git-partial-worktree-commit.py');
const PY = process.platform === 'win32' ? 'python' : 'python3';
const WORKLOG = 'agency-os/WORKLOG.md';
const HEAD_WORKLOG = '# Worklog\n\n## 2026-09-23（續1）old\n\n- old line\n';

function g(dir, args) {
  const r = spawnSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-repo-'));
  g(dir, ['init', '-q', '-b', 'main']);
  g(dir, ['config', 'core.autocrlf', 'false']);
  fs.mkdirSync(path.join(dir, 'agency-os'));
  fs.writeFileSync(path.join(dir, WORKLOG), HEAD_WORKLOG);
  g(dir, ['add', '-A']); g(dir, ['commit', '-q', '-m', 'seed']);
  return { dir, scratch: fs.mkdtempSync(path.join(os.tmpdir(), 'prune-scratch-')) };
}

function stage(dir, scratch, n) {
  fs.writeFileSync(path.join(dir, WORKLOG), `# Worklog\n\n## 2026-09-23（續${n}）mine\n\n- my line\n\n` + HEAD_WORKLOG.slice('# Worklog\n\n'.length));
  const r = spawnSync(PY, [HELPER, 'stage', WORKLOG, '--worklog-entry', String(n), '--date', '2026-09-23'],
    { cwd: dir, encoding: 'utf8', env: { ...process.env, PARTIAL_COMMIT_SCRATCH: scratch, PYTHONIOENCODING: 'utf-8' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return (r.stdout.match(/^private index: (.+)$/m) || [])[1];
}

function plant(scratch, name, { marker, ageHours, indexOnly = false, markerOnly = false }) {
  const idx = path.join(scratch, `${name}.index`);
  if (!markerOnly) fs.writeFileSync(idx, 'index-bytes');
  if (!indexOnly) fs.writeFileSync(`${idx}.json`, JSON.stringify(marker || {}));
  const t = new Date(Date.now() - ageHours * 3600 * 1000);
  for (const p of [idx, `${idx}.json`]) if (fs.existsSync(p)) fs.utimesSync(p, t, t);
  return idx;
}

test('a fresh stage removes stale same-root indexes and keeps the live, the recent, and other roots\'', () => {
  const { dir, scratch } = makeRepo();
  const first = stage(dir, scratch, 2);                            // live index #1 (fresh; its HEAD moves below, it stays by age)
  const tag = path.basename(first).split('-')[0];
  g(dir, ['commit', '-q', '--allow-empty', '-m', 'move HEAD']);
  const head = g(dir, ['rev-parse', 'HEAD']);                      // what the second stage will see as HEAD
  const staleMoved = plant(scratch, `${tag}-aaaa0001`, { marker: { root: dir, head: 'deadbeef' }, ageHours: 30 });
  const staleOrphanIdx = plant(scratch, `${tag}-aaaa0002`, { ageHours: 30, indexOnly: true });
  const staleOrphanMk = plant(scratch, `${tag}-aaaa0003`, { marker: { root: dir, head: 'deadbeef' }, ageHours: 30, markerOnly: true });
  const oldButCurrent = plant(scratch, `${tag}-aaaa0004`, { marker: { root: dir, head }, ageHours: 30 });
  const recentMoved = plant(scratch, `${tag}-aaaa0005`, { marker: { root: dir, head: 'deadbeef' }, ageHours: 2 });
  const repoHead = g(REPO_ROOT, ['rev-parse', 'HEAD']);
  const otherLive = plant(scratch, `zzzzzzzz-aaaa0006`, { marker: { root: REPO_ROOT, head: repoHead }, ageHours: 30 });     // another root, its HEAD still current
  const otherMoved = plant(scratch, `vvvvvvvv-aaaa0010`, { marker: { root: REPO_ROOT, head: 'deadbeef' }, ageHours: 30 });   // another root, its HEAD moved on
  const otherDead = plant(scratch, `yyyyyyyy-aaaa0007`, { marker: { root: path.join(os.tmpdir(), 'removed-worktree-xyz'), head: 'deadbeef' }, ageHours: 30 });
  const otherOrphanYoung = plant(scratch, `xxxxxxxx-aaaa0008`, { ageHours: 3 * 24, indexOnly: true });
  const otherOrphanOld = plant(scratch, `wwwwwwww-aaaa0009`, { ageHours: 8 * 24, indexOnly: true });
  const second = stage(dir, scratch, 3);                           // a second fresh index -> prune runs
  const exists = (p) => fs.existsSync(p) || fs.existsSync(`${p}.json`);
  assert.equal(exists(staleMoved), false, 'stale, HEAD moved -> gone');
  assert.equal(exists(staleOrphanIdx), false, 'orphan index -> gone');
  assert.equal(exists(staleOrphanMk), false, 'orphan marker -> gone');
  assert.equal(exists(oldButCurrent), true, 'old but HEAD still matches -> kept');
  assert.equal(exists(recentMoved), true, 'HEAD moved but younger than a day -> kept');
  assert.equal(exists(otherLive), true, 'another live root whose HEAD still matches -> kept');
  assert.equal(exists(otherMoved), false, 'another live root whose HEAD moved on -> gone (asked of that root)');
  assert.equal(exists(otherDead), false, 'marker of a removed worktree -> gone');
  assert.equal(exists(otherOrphanYoung), true, 'unattributable orphan younger than a week -> kept');
  assert.equal(exists(otherOrphanOld), false, 'unattributable orphan older than a week -> gone');
  assert.equal(fs.existsSync(first), true, 'live index #1 kept (fresh)');
  assert.equal(fs.existsSync(second), true, 'the new index exists');
});
