// scripts/githooks/pre-commit: a commit deleting more than half of HEAD's files is refused (2026-10-26 empty-tree commit).
// Real git in a scratch repo, the hook installed the same way as D:\Work (core.hooksPath).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { REPO_ROOT } from './helpers.mjs';

const HOOK = path.join(REPO_ROOT, 'scripts', 'githooks', 'pre-commit');

function git(cwd, args, env = {}) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
}

function scratchRepo(files = 40) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'massdel-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 't@t']);
  git(dir, ['config', 'user.name', 't']);
  for (let i = 0; i < files; i++) fs.writeFileSync(path.join(dir, `f${i}.txt`), `${i}\n`);
  git(dir, ['add', '-A']);
  assert.equal(git(dir, ['commit', '-q', '-m', 'base']).status, 0);
  fs.mkdirSync(path.join(dir, 'hooks'));
  fs.copyFileSync(HOOK, path.join(dir, 'hooks', 'pre-commit'));
  fs.chmodSync(path.join(dir, 'hooks', 'pre-commit'), 0o755);
  git(dir, ['config', 'core.hooksPath', 'hooks']);
  return dir;
}

test('an empty private index (the 2026-10-26 incident) cannot commit an empty tree', () => {
  const dir = scratchRepo();
  const r = git(dir, ['commit', '-q', '-m', 'oops'], { GIT_INDEX_FILE: path.join(dir, 'fresh-empty.index') });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /deletes 40 of 40 tracked files/);
  assert.equal(git(dir, ['rev-list', '--count', 'HEAD']).stdout.trim(), '1');
});

test('deleting more than half is refused; half or less goes through', () => {
  const dir = scratchRepo();
  for (let i = 0; i < 20; i++) git(dir, ['rm', '-q', `f${i}.txt`]);
  assert.equal(git(dir, ['commit', '-q', '-m', 'half']).status, 0);   // 20 of 40
  for (let i = 20; i < 31; i++) git(dir, ['rm', '-q', `f${i}.txt`]);
  const r = git(dir, ['commit', '-q', '-m', 'most']);                  // 11 of 20
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /deletes 11 of 20/);
});

test('an ordinary edit commit is untouched, and AW_ALLOW_MASS_DELETE=1 lets a real mass deletion through', () => {
  const dir = scratchRepo();
  fs.writeFileSync(path.join(dir, 'f0.txt'), 'changed\n');
  git(dir, ['add', 'f0.txt']);
  assert.equal(git(dir, ['commit', '-q', '-m', 'edit']).status, 0);
  git(dir, ['rm', '-q', '-r', '.']);
  assert.equal(git(dir, ['commit', '-q', '-m', 'wipe'], { AW_ALLOW_MASS_DELETE: '1' }).status, 0);
});

test('moving most files to a new folder is a rename, not a mass deletion', () => {
  const dir = scratchRepo();
  fs.mkdirSync(path.join(dir, 'moved'));
  for (let i = 0; i < 30; i++) git(dir, ['mv', `f${i}.txt`, `moved/f${i}.txt`]);
  assert.equal(git(dir, ['commit', '-q', '-m', 'move']).status, 0);
});
