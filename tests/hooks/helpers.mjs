// Shared helpers for hook tests: spawn the v2 runner with a JSON payload on
// stdin and capture { status, stdout, stderr }.
//
// Design notes:
//   - Every spawn gets an ISOLATED HOME (tmp dir) so rules that write to
//     ~/.claude (mcp-health, audit-log, session-summary, log-error) never touch
//     the real user profile during tests.
//   - file-claim-guard claims go to <HOME>/file-claims unless a test pins CLAUDE_FILE_CLAIMS_DIR.
//   - session_id is randomized per test unless pinned, so flag-file rules
//     (git-log-injector, auto-repair-guard, file-path-router) start fresh.
//   - TMPDIR is NOT isolated by default (flag helpers use os.tmpdir()); tests
//     that need flag isolation pin a unique session_id instead.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const HOOKS_DIR = path.join(REPO_ROOT, 'mcp', 'claude-userlevel', 'hooks');

export function freshSid(prefix) {
  return `${prefix}-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export function makeTmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hooktest-home-'));
}

// Run `node <scriptPath>` (or any argv) with payload JSON on stdin.
export function runNode(scriptPath, payload, { args = [], cwd = REPO_ROOT, env = {}, home } = {}) {
  const HOME = home || makeTmpHome();
  const input = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const r = spawnSync('node', [scriptPath, ...args], {
    input,
    cwd,
    encoding: 'utf8',
    timeout: 30000,
    env: {
      ...process.env,
      HOME,
      USERPROFILE: HOME,
      // Never let ambient session vars leak into SID derivation during tests.
      CLAUDE_CODE_SESSION_ID: '',
      CLAUDE_SESSION_ID: '',
      // file-claim-guard claims are machine-wide (tmpdir); a test Edit on a real repo file would block real sessions.
      CLAUDE_FILE_CLAIMS_DIR: path.join(HOME, 'file-claims'),
      ...env,
    },
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', home: HOME };
}

// Build a scratch git repo (for branch-protection / commit-quality tests).
export function makeGitRepo({ branch = 'work', files = {}, stage = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hooktest-repo-'));
  const g = (args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  g(['init', '-q', '-b', branch]);
  g(['config', 'user.email', 't@t.t']);
  g(['config', 'user.name', 't']);
  fs.writeFileSync(path.join(dir, 'seed.txt'), 'seed\n');
  g(['add', '.']);
  g(['commit', '-q', '-m', 'seed']);
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  if (stage && Object.keys(files).length) g(['add', '.']);
  return dir;
}

// Tracker file helpers (verify-gate trio). Mirrors _verify-shared conventions.
export function trackerPathFor(sid) {
  const sanitized = String(sid).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return path.join(os.tmpdir(), `claude-unverified-code-${sanitized}.txt`);
}

export function writeTracker(sid, entries) {
  fs.writeFileSync(trackerPathFor(sid), entries.join('\n') + '\n', 'utf8');
}

// Sibling tracker for git-add-scope-tracker / git-commit-scope-guard
// (2026-08-30). Mirrors trackerPathFor/writeTracker exactly, separate file —
// see lib/shared.js getGitStageTrackerPath for why these are not the same tracker.
export function gitStagePathFor(sid) {
  const sanitized = String(sid).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return path.join(os.tmpdir(), `claude-git-staged-${sanitized}.txt`);
}

export function writeGitStageTracker(sid, entries) {
  fs.writeFileSync(gitStagePathFor(sid), entries.join('\n') + '\n', 'utf8');
}

// Sibling tracker for session-edit-tracker.js (2026-09-03) / ao-close.ps1
// scoped-add. See lib/shared.js getSessionEditTrackerPath header.
export function sessionEditPathFor(sid) {
  const sanitized = String(sid).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return path.join(os.tmpdir(), `claude-session-edits-${sanitized}.txt`);
}

export function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}
