// git-shared-file-guard.js -- a commit may carry agency-os/WORKLOG.md or agency-os/TASKS.md only through the
// private index that scripts/git-partial-worktree-commit.py builds (blob == its marker), or with an explicit
// first-line ack `# CONFIRMED-SHARED-FILE-COMMIT: <reason>`.
//
// WHY (2026-09-23): git-commit-scope-guard.js (2026-08-30) stops a bare commit from sweeping files another
// session STAGED. The three sweeps of 2026-09-23 went through the two doors it leaves open on purpose:
//   - `git commit -- agency-os/WORKLOG.md` commits the WORKTREE bytes of that path (git's pathspec-commit
//     semantics), i.e. every session's uncommitted hunks -- the scope guard exempts a git-verified pathspec;
//   - a whole-file `git add agency-os/TASKS.md` + bare commit does the same through the shared index, and
//     the tracker records the add as this session's own.
// Six memory recipes described the manual workaround; none was mechanical. Invariant: the blob committed
// for a shared file is HEAD, or was built from explicitly selected hunks (marker), or the operator said so.
//
// Shapes checked (mirrors git-commit-scope-guard.js's parsing; helpers imported from it):
//   pathspec commit covering a shared file  -> worktree blob must equal HEAD (else BLOCK: use the helper)
//   bare commit on the shared index         -> index blob must equal HEAD (else BLOCK: use the helper)
//   bare commit with GIT_INDEX_FILE=<idx>   -> index blob must equal HEAD or the marker's blob (else BLOCK)
// `-a`/`--all`, --amend and merges are the scope guard's business (exempt here, same as there).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const scope = require('./git-commit-scope-guard');

const SHARED = ['agency-os/WORKLOG.md', 'agency-os/TASKS.md'];
const ACK = /^#\s*CONFIRMED-SHARED-FILE-COMMIT:\s*\S/m;

function git(args, cwd, env) {
  try {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 10000, env: env ? { ...process.env, ...env } : process.env });
    if (r.error || typeof r.status !== 'number' || r.status !== 0) return null;
    return String(r.stdout || '');
  } catch (_) {
    return null;
  }
}

function blobOf(spec, cwd, env) {
  const out = git(['rev-parse', '--verify', '-q', spec], cwd, env);
  return out ? out.trim() : null;
}

function worktreeBlob(rel, cwd) {
  const out = git(['hash-object', '--', rel], cwd);
  return out ? out.trim() : null;
}

// Shared paths a git-verified pathspec covers (git's own pathspec engine decides).
function sharedCoveredByPathspec(tokens, cwd) {
  const out = git(['ls-files', '-z', '--', ...tokens], cwd);
  if (out === null) return null;
  const set = new Set(out.split('\0').filter(Boolean));
  return SHARED.filter((p) => set.has(p));
}

function findings(ctx) {
  const shared = ctx.shared;
  const segments = shared.commandSegmentsBackslashJoined(ctx.commandExpanded);
  const { segment: commitSegment, index: commitIndex } = scope.findCommitSegment(segments);
  if (!commitSegment) return null;
  // --amend is NOT exempt here (unlike the scope guard): an amend re-reads the index / worktree exactly like a
  // fresh commit, so a foreign whole-file add still lands in the amended commit (codex 2026-09-24 r2).
  if (scope.isMidMergeOrCherryPick(ctx.cwd)) return null;
  const broad = scope.hasBroadCommitFlag(commitSegment, shared); // -a/--all: worktree bytes of every tracked file
  const cRegionMatch = commitSegment.match(scope.RE_GIT_COMMIT);
  for (const target of shared.cFlagTargets(cRegionMatch ? (cRegionMatch[1] || '') : '')) {
    if (!shared.isSameDir(target, ctx.cwd)) return null;
  }
  if (shared.hasCdElsewhere(segments, ctx.cwd, commitIndex)) return null;
  const root = git(['rev-parse', '--show-toplevel'], ctx.cwd);
  if (!root) return null; // not a repo -- nothing to guard
  const cwd = root.trim();
  const ack = ACK.test(String(ctx.commandExpanded).split('\n')[0] || '');

  const out = [];
  const pathspecTokens = scope.extractPathspecTail(commitSegment, ctx.commandExpanded, shared);
  const scoped = pathspecTokens && scope.isRealPathspec(pathspecTokens, ctx.cwd);
  if (scoped || broad) {
    const covered = broad ? SHARED : sharedCoveredByPathspec(pathspecTokens, cwd);
    if (covered === null) return null;
    for (const rel of covered) {
      const head = blobOf(`HEAD:${rel}`, cwd);
      const wt = worktreeBlob(rel, cwd);
      if (head && wt && head !== wt) out.push({ rel, how: 'pathspec' });
    }
    return { out, ack, cwd };
  }
  const idx = scope.privateIndexOf(commitSegment);
  const env = idx ? { GIT_INDEX_FILE: idx } : null;
  const marker = idx ? scope.readMarker(idx) : null;
  for (const rel of SHARED) {
    const head = blobOf(`HEAD:${rel}`, cwd);
    const staged = blobOf(`:${rel}`, cwd, env);
    if (!staged || staged === head) continue;
    if (idx && marker && marker.entries && marker.entries[rel] === staged) continue;
    out.push({ rel, how: idx ? (marker ? 'private-mismatch' : 'private-unmarked') : 'bare' });
  }
  return { out, ack, cwd };
}

module.exports = {
  SHARED,
  check(ctx) {
    if (ctx.event !== 'PreToolUse') return null;
    let f;
    try { f = findings(ctx); } catch (e) { ctx.shared.logFailOpen('git-shared-file-guard', e); return null; }
    if (!f || !f.out.length) return null;
    if (f.ack) return null;
    const lines = ['[Hook] BLOCKED: this commit would carry another session\'s hunks of a shared file:'];
    for (const v of f.out) {
      const why = {
        'pathspec': 'a `-- <pathspec>` commit takes the WORKTREE bytes of the path (every session\'s uncommitted hunks)',
        'bare': 'the shared index holds a whole-file `git add` of it (every session\'s uncommitted hunks)',
        'private-mismatch': 'the private index blob is not the one git-partial-worktree-commit.py built (re-run stage)',
        'private-unmarked': 'GIT_INDEX_FILE is set but no marker <index>.json exists for it',
      }[v.how];
      lines.push(`[Hook]     ${v.rel}: ${why}`);
    }
    lines.push('[Hook]   Fix (WORKLOG entry):  python scripts/git-partial-worktree-commit.py stage agency-os/WORKLOG.md --worklog-entry <N> -- <your other files>');
    lines.push('[Hook]   Fix (TASKS hunks):    python scripts/git-partial-worktree-commit.py stage agency-os/TASKS.md --range <old-line>[-<old-line>] ... --index <path>');
    lines.push('[Hook]   then commit exactly as it prints: GIT_INDEX_FILE=<path> git commit -F <msg>   (no pathspec)');
    lines.push('[Hook]   Whole-file commit on purpose (single session, every hunk yours): first line `# CONFIRMED-SHARED-FILE-COMMIT: <reason>`');
    return { block: lines };
  },
};
