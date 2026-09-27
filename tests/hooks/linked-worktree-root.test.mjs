// Linked-worktree root invariant (2026-09-27). A hook rule that walks up to the sentinel pair
// `scripts/ao-resume.ps1` + `.git` must accept only a `.git` DIRECTORY (main checkout). A linked
// worktree (`git worktree add`) has a `.git` FILE; treating it as the root wrote reports into
// D:\tmp\<wt> and let ensure-claude-junction replace its tracked .claude with a junction to ~/.claude.
// PowerShell twin: tests/ao-resume-shared-worktree.test.ps1 section I3 (hook resolver + junction script).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const RULE = path.join(HERE, '..', '..', 'mcp', 'claude-userlevel', 'hooks', 'rules', 'agent-dispatch-log.js');
const rule = require(RULE);

function tmpDir(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `linked-worktree-root-${tag}-`));
}
function sentinel(root) {
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'scripts', 'ao-resume.ps1'), '# sentinel\n');
}
function ctxFor(cwd) {
  return {
    cwd,
    toolName: 'Agent',
    toolInput: { subagent_type: 'critic', description: 'review' },
    payload: { tool_response: { content: [{ text: 'done' }] } },
    shared: null,
  };
}
function withHome(home, fn) {
  const saved = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
  process.env.USERPROFILE = home; process.env.HOME = home;   // os.homedir() reads these
  try { return fn(); } finally {
    process.env.USERPROFILE = saved.USERPROFILE; process.env.HOME = saved.HOME;
  }
}

test('main checkout (.git directory) resolves as root even from a deep subdir', () => {
  const base = tmpDir('main');
  const main = path.join(base, 'main');
  fs.mkdirSync(path.join(main, '.git'), { recursive: true });
  sentinel(main);
  const deep = path.join(main, 'agency-os', 'docs', 'pkg');
  fs.mkdirSync(deep, { recursive: true });
  const home = path.join(base, 'home');
  withHome(home, () => assert.equal(rule.check(ctxFor(deep)), null));
  const dispDir = path.join(main, 'agency-os', 'reports', 'agent-dispatch');
  assert.ok(fs.existsSync(dispDir), 'dispatch log lands under the main checkout');
  assert.equal(fs.readdirSync(dispDir).length, 1);
  assert.ok(!fs.existsSync(path.join(home, '.claude')), 'no fallback write to ~/.claude');
});

test('linked worktree (.git FILE) is NOT a root: nothing is written into it, fallback is ~/.claude', () => {
  const base = tmpDir('linked');
  const linked = path.join(base, 'linked');
  fs.mkdirSync(linked, { recursive: true });
  fs.writeFileSync(path.join(linked, '.git'), 'gitdir: ../main/.git/worktrees/linked\n');   // what git worktree add writes
  sentinel(linked);
  const sub = path.join(linked, 'scripts');
  const home = path.join(base, 'home');
  withHome(home, () => assert.equal(rule.check(ctxFor(sub)), null));
  assert.ok(!fs.existsSync(path.join(linked, 'agency-os')), 'no agency-os/ created inside the worktree');
  const fallback = path.join(home, '.claude', 'agent-dispatch');
  assert.ok(fs.existsSync(fallback), 'record goes to the ~/.claude fallback instead');
  assert.equal(fs.readdirSync(fallback).length, 1);
});

test('worktree nested INSIDE the main checkout stops the walk at its .git FILE (does not climb to main)', () => {
  // What Claude Code's own worktree isolation creates under .claude/worktrees/<name> (Codex 2026-09-27 F1).
  const base = tmpDir('nested');
  const main = path.join(base, 'main');
  fs.mkdirSync(path.join(main, '.git'), { recursive: true });
  sentinel(main);
  const nested = path.join(main, '.claude', 'worktrees', 'x');
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(path.join(nested, '.git'), 'gitdir: ../../../.git/worktrees/x\n');
  sentinel(nested);
  const home = path.join(base, 'home');
  withHome(home, () => assert.equal(rule.check(ctxFor(path.join(nested, 'scripts'))), null));
  assert.ok(!fs.existsSync(path.join(nested, 'agency-os')), 'nothing written into the nested worktree');
  assert.ok(!fs.existsSync(path.join(main, 'agency-os')), 'nothing written into the main checkout either');
  assert.equal(fs.readdirSync(path.join(home, '.claude', 'agent-dispatch')).length, 1, 'fallback to ~/.claude');
});
