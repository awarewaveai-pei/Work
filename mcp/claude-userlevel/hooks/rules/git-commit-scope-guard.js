// Block `git commit` when the real staged content (per `git diff --cached`)
// includes files this session never `git add`/`rm`/`mv`-ed itself, and prune
// the tracker back to reality after the commit actually runs.
//
// WHY THIS EXISTS (2026-08-30): this repo runs every Claude Code session in
// ONE shared working directory on ONE shared git index (operator's explicit,
// considered choice — no per-session worktrees, main-only push policy; git
// does not allow two worktrees to check out the same branch simultaneously,
// so per-session worktrees would reintroduce the branch/merge complexity the
// operator is deliberately avoiding). Two sessions can each `git add` their
// own files and then one session's bare `git commit` sweeps up the OTHER
// session's already-staged files into its own commit — wrong attribution,
// no content lost, but the "commit message = 30 second incident runbook"
// guarantee (R2) breaks. Real incident this session: commit `9d587c082`
// (AI-LEGO ADR session) absorbed this session's staged TASKS.md/WORKLOG.md
// edits. `commit-quality.js` already proved the technique (spawnSync git
// diff --cached --name-only) is established precedent in this codebase.
//
// A bare `git commit` (or `git commit -m "..."` with NO trailing pathspec)
// commits the FULL current index — there is no way to ask git "only commit
// what I personally staged" after the fact, so this has to be caught before
// the commit runs, by cross-checking the tracker git-add-scope-tracker.js
// built against what is actually staged right now.
//
// Why NOT parse the commit message text for a `-- <files>` tail: this
// repo's system-mandated multi-line commit style is a heredoc
// (`git commit -m "$(cat <<'EOF' ... EOF)"`), so a real trailing pathspec
// and the closing `)"` land on a DIFFERENT line from the heredoc body — and
// 53/400 recent commits in this repo's own history use literal " -- " INSIDE
// the message text itself (e.g. "fix(x): crash -- StrictMode"), which a
// naive text-shape check cannot distinguish from a real pathspec.
//
// v2 (2026-08-30, critic round 1 — all reproduced against the real runner):
//   - C1: the tracker was cleared inside THIS PreToolUse check(), before the
//     commit had actually run. runner.js always executes every rule in a
//     matcher group and aggregates verdicts afterward (no short-circuit), so
//     a SIBLING rule (verify-gate-commit, dangerous-bash, ...) blocking the
//     very same call does not stop this rule's side effects from having
//     already happened — the tracker was already wiped, permanently
//     degrading the gate to warn-only for the rest of the session. Fixed by
//     moving ALL clearing to a PostToolUse phase (see below) that re-derives
//     truth from `git diff --cached` instead of assuming success.
//   - C2: the pathspec-tail detector was a text-shape regex (`/\s--\s+\S/`
//     on the last line) with no verification the tail was a real pathspec —
//     a commit MESSAGE containing " -- " (the exact real pattern found in
//     this repo's own history, see above) silently passed AND cleared the
//     tracker: the precise bypass this gate exists to prevent. Fixed by
//     requiring every extracted token to resolve via
//     `git ls-files --error-unmatch` before trusting it as a pathspec.
//   - M1: `git diff --cached --name-only` was parsed with a raw newline
//     split and compared against the tracker with plain string equality —
//     breaks on the 632 tracked files in this repo with spaces in their
//     names, and gives no pathspec matching for directories/globs recorded
//     in the tracker. Fixed with `-z` (NUL-terminated) output and letting
//     git's OWN pathspec engine compute "which staged files does the
//     tracker cover" via a second `git diff --cached --name-only -z --
//     <tracker entries>` call.
//   - M3: `git commit -a`/`--all`/`-am` auto-stages every modified TRACKED
//     file, none of which necessarily went through git-add-scope-tracker —
//     total bypass. Fixed by detecting the flag and requiring explicit
//     `git add <files>` first (same "remove the capability" treatment as
//     broad `git add`, since reconciling untracked working-tree mods here
//     would need the same dry-run-enumeration machinery as -A and isn't
//     worth it for a rare pattern).
//   - cwd mismatch: a `-C <dir>` on the commit itself, or a `cd <dir>`
//     segment anywhere earlier in the same command, makes the working
//     directory this Node process actually runs `git` in (ctx.cwd) an
//     unreliable stand-in for where the commit will really execute — fail
//     open (return null) rather than check the wrong repository's state.
const { spawnSync } = require('child_process');

const RE_GIT_COMMIT = /^(?:sudo\s+)?git\s+(?:-[a-zA-Z0-9-]+\s+|-[a-zA-Z0-9-]+\s+\S+\s+|-C\s+\S+\s+)*commit(?=\s|$|["';|&])/;
const RE_HAS_C_FLAG = /(?:^|\s)-C\s+\S+/;
const RE_CD_SEGMENT = /^(?:sudo\s+)?cd\s+\S+/;
const VALUE_FLAGS = new Set(['-m', '--message', '-c', '--reuse-message', '--author', '-F', '--file', '--date', '--fixup', '--squash']);

function findCommitSegment(segments) {
  return segments.find((s) => RE_GIT_COMMIT.test(s)) || null;
}

function targetsElsewhere(segments) {
  return segments.some((s) => RE_HAS_C_FLAG.test(s) || RE_CD_SEGMENT.test(s));
}

// Detect `-a`/`--all`/`-am`/`-ma`/etc on the commit itself. Value-flags (-m,
// --author, ...) have their arguments skipped so a message token that
// happens to start with "-" and contain "a" (e.g. `-m "-add note"`) is not
// misread as a flag — ctx.commandSegments is a naive whitespace split with
// no quote-awareness, so this is the best available mitigation, not a full
// fix (documented limitation shared by every sibling rule that scans
// commandSegments).
function hasBroadCommitFlag(segment) {
  const m = segment.match(/\bcommit\b(?=\s|$)/);
  if (!m) return false;
  const tokens = segment.slice(m.index + m[0].length).trim().split(/\s+/).filter(Boolean);
  let skipNext = false;
  let broad = false;
  for (const t of tokens) {
    if (skipNext) { skipNext = false; continue; }
    if (VALUE_FLAGS.has(t)) { skipNext = true; continue; }
    if (t === '--all') { broad = true; continue; }
    if (/^-[a-zA-Z]+$/.test(t)) {
      if (t.includes('a')) broad = true;
      if (t.includes('m')) skipNext = true; // cluster's -m still consumes the next token
    }
  }
  return broad;
}

// Extract a trailing ` -- <tokens>` from the LAST non-blank line of the
// (possibly multi-line heredoc) command, then verify every token is a real,
// git-known path — not just message text that happens to contain " -- ".
function extractPathspecTail(commandExpanded) {
  const lines = String(commandExpanded).split('\n').map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1] || '';
  const m = last.match(/\s--\s+(.+)$/);
  if (!m) return null;
  const tokens = m[1].trim().split(/\s+/).filter(Boolean);
  return tokens.length ? tokens : null;
}

function isRealPathspec(tokens) {
  try {
    const r = spawnSync('git', ['ls-files', '--error-unmatch', '--', ...tokens], { encoding: 'utf8', timeout: 10000 });
    return typeof r.status === 'number' && r.status === 0;
  } catch (_) {
    return false;
  }
}

// NUL-terminated `git diff --cached --name-only`, optionally scoped to a
// pathspec. Returns null on any git failure (caller fails open).
function gitDiffCachedNames(extraArgs) {
  try {
    const r = spawnSync('git', ['diff', '--cached', '--name-only', '-z', ...(extraArgs || [])], { encoding: 'utf8', timeout: 10000 });
    if (r.error || typeof r.status !== 'number' || r.status !== 0) return null;
    return String(r.stdout || '').split('\0').filter(Boolean);
  } catch (_) {
    return null;
  }
}

module.exports = {
  check(ctx) {
    const shared = ctx.shared;
    // Backslash-joined, not ctx.commandSegments directly: a real multi-line
    // `git commit ... -- \` command's continuation lines would otherwise
    // never be visible to findCommitSegment/targetsElsewhere (see
    // lib/shared.js joinBackslashContinuations header — found live
    // dogfooding this exact gate).
    const segments = shared.commandSegmentsBackslashJoined(ctx.commandExpanded);
    const commitSegment = findCommitSegment(segments);
    if (!commitSegment) return null;
    if (targetsElsewhere(segments)) return null; // fail open — different/ambiguous repo target
    if (/--amend\b/.test(ctx.commandExpanded)) return null;

    if (ctx.event === 'PostToolUse') {
      // Re-derive truth from git instead of trusting the Bash tool's result
      // shape: prune the tracker to only the files STILL staged after this
      // command ran. A blocked/failed commit leaves everything staged (no
      // change); a full commit clears the tracker; a pathspec-scoped commit
      // shrinks it to the remainder.
      const tf = shared.getGitStageTrackerPath(ctx.sid);
      const tracked = shared.readTracker(tf);
      if (!tracked.length) return null;
      const stillStaged = gitDiffCachedNames(['--', ...tracked]);
      if (stillStaged === null) return null; // fail open — don't touch tracker if we can't verify
      shared.writeTracker(tf, stillStaged);
      return null;
    }

    // PreToolUse from here down.
    const tf = shared.getGitStageTrackerPath(ctx.sid);

    if (hasBroadCommitFlag(commitSegment)) {
      return {
        block: [
          '[Hook] BLOCKED: `git commit -a`/`--all`/`-am` auto-stages every modified tracked file,',
          '[Hook]   bypassing this session\'s add-tracking (git-add-scope-tracker.js).',
          '[Hook]   Stage explicitly first: git add path/to/fileA path/to/fileB',
          '[Hook]   Then commit normally (bare `git commit -m "..."`, or with a `-- <files>` tail).',
        ],
      };
    }

    const pathspecTokens = extractPathspecTail(shared.joinBackslashContinuations(ctx.commandExpanded));
    if (pathspecTokens && isRealPathspec(pathspecTokens)) {
      return null; // real, git-verified pathspec — this commit is scoped, nothing to compare
    }

    const allStaged = gitDiffCachedNames();
    if (allStaged === null) return null; // fail open — can't read git state
    if (!allStaged.length) return null;  // nothing staged; verify-gate-commit / dangerous-bash etc. own that case

    const tracked = shared.readTracker(tf);
    if (!tracked.length) {
      return {
        warn: [
          '[Hook] WARN: `git commit` with staged files, but this session never recorded a `git add`.',
          '[Hook]   These files may belong to another concurrent Claude Code session:',
          ...allStaged.slice(0, shared.STDERR_MAX_LINES).map((f) => `[Hook]     staged: ${f}`),
          '[Hook]   Consider a scoped commit: git commit -m "..." -- <only your files>',
        ],
      };
    }

    const covered = gitDiffCachedNames(['--', ...tracked]);
    if (covered === null) return null; // fail open
    const coveredSet = new Set(covered);
    const unexpected = allStaged.filter((f) => !coveredSet.has(f));
    if (!unexpected.length) return null; // fully covered by this session's own tracked adds

    return {
      block: [
        '[Hook] BLOCKED: `git commit` would include files this session never `git add`-ed:',
        ...unexpected.slice(0, shared.STDERR_MAX_LINES).map((f) => `[Hook]     unexpected: ${f}`),
        '[Hook]   These are likely staged by another concurrent Claude Code session sharing',
        '[Hook]   this working directory\'s git index (see WORKLOG 2026-08-30).',
        '[Hook]   Fix: commit only your own files with a trailing pathspec:',
        '[Hook]     git commit -m "..." -- <files you actually added>',
      ],
    };
  },
};
