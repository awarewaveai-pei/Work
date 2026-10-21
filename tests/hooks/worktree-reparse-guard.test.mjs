import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runNode, freshSid, HOOKS_DIR } from './helpers.mjs';

const RUNNER = path.join(HOOKS_DIR, 'runner.js');

function run(command, cwd) {
  return runNode(RUNNER, {
    session_id: freshSid('worktree-reparse'),
    tool_name: 'Bash',
    tool_input: { command },
  }, { args: ['PreToolUse'], cwd });
}

function removeCommand(link) {
  const quoted = String(link).replace(/'/g, "''");
  return `powershell -NoProfile -Command "[IO.Directory]::Delete('${quoted}')"`;
}

function withTempTree(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-reparse-test-'));
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('worktree-reparse-guard blocks a worktree containing a directory junction/symlink', () => {
  withTempTree((root) => {
    const worktree = path.join(root, 'throwaway');
    const realModules = path.join(root, 'main-node-modules');
    const link = path.join(worktree, 'node_modules');
    fs.mkdirSync(worktree);
    fs.mkdirSync(realModules);
    fs.symlinkSync(realModules, link, process.platform === 'win32' ? 'junction' : 'dir');

    const result = run(`git worktree remove --force "${worktree}"`, root);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /BLOCKED: git worktree remove target contains a junction\/symlink directory/);
    assert.match(result.stderr, new RegExp(removeCommand(link).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
});

test('worktree-reparse-guard allows a worktree with no reparse point', () => {
  withTempTree((root) => {
    const worktree = path.join(root, 'throwaway');
    fs.mkdirSync(worktree);
    const result = run(`git worktree remove "${worktree}"`, root);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /worktree remove target contains/);
  });
});
