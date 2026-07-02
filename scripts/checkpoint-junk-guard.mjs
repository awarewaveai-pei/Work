#!/usr/bin/env node
// Unstage shell-artifact junk from the git index. Called by
// scripts/commit-checkpoint.ps1 between `git add -A` and the commit.
//
// Why Node and not PowerShell (critic 2026-07-02 finding 3): under git's
// default core.quotePath=true, non-ASCII staged names reach PowerShell as
// octal-escaped ASCII strings, so a `[^ -~]` test never matches and the CJK
// word-split junk class — the very thing the guard exists for (2026-06-20
// incident, commit 16d95c8) — sails through. Node reads the raw bytes via
// `-z` NUL-separated output with quotePath off, so the test sees real
// characters on every platform.
//
// Junk definition (root-level staged paths only):
//   - literal `$null` / `null`  (PowerShell-style redirection run under bash)
//   - 0-byte file whose name contains any non-ASCII character (doc-content
//     word-split class)
//
// Policy: UNSTAGE and report; never abort — the checkpoint's real work must
// still be saved. Exit 0 always (guard is best-effort by design); exit 1 only
// if git itself is unusable.
//
// Usage: node scripts/checkpoint-junk-guard.mjs [--repo <root>]

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const repoIdx = args.indexOf('--repo');
const REPO = repoIdx >= 0 ? path.resolve(args[repoIdx + 1]) : process.cwd();

function git(...a) {
  return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' });
}

let staged;
try {
  staged = git('-c', 'core.quotepath=false', 'diff', '--cached', '--name-only', '-z')
    .split('\0')
    .filter(Boolean);
} catch (e) {
  console.error(`checkpoint-junk-guard: git unusable: ${e.message}`);
  process.exit(1);
}

let removed = 0;
for (const f of staged) {
  if (f.includes('/') || f.includes('\\')) continue; // root-level only
  const isNullish = f === '$null' || f === 'null';
  let isZeroByte = false;
  try {
    const st = fs.statSync(path.join(REPO, f));
    isZeroByte = st.isFile() && st.size === 0;
  } catch (_) { /* deleted-from-worktree staged entry — leave it alone */ }
  const hasWeirdName = /[^\x20-\x7e]/.test(f);
  if (isNullish || (isZeroByte && hasWeirdName)) {
    try {
      git('reset', '-q', '--', `:(literal)${f}`);
      console.log(`checkpoint-junk-guard: UNSTAGED junk artifact '${f}'`);
      removed++;
    } catch (e) {
      console.error(`checkpoint-junk-guard: failed to unstage '${f}': ${e.message}`);
    }
  }
}
if (removed === 0) console.log('checkpoint-junk-guard: no junk staged.');
