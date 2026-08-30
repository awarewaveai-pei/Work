// Record which files THIS session explicitly `git add`/`git rm`/`git mv`-ed,
// and refuse broad adds that can't be recorded. Paired with
// git-commit-scope-guard.js, which reads this tracker at commit time and
// compares it against the REAL staged state (`git diff --cached`) to catch
// commits that would sweep in another session's staged files.
//
// WHY THIS EXISTS (2026-08-30): see git-commit-scope-guard.js header for the
// full incident history and why this is a git-diff check, not a commit-text
// pathspec check. TASKS.md's own completion definition for this class of bug
// (§"AO-CLOSE 的 git add -A") specifies: block broad add, require an ACK
// comment on the first line to override (same convention as
// high-risk-bash-warn.js's `# CONFIRMED-HIGH-RISK:`).
//
// v2 (2026-08-30, critic round 1 — all reproduced against the real runner):
//   - iterate EVERY `git add`-shaped segment, not just the first (a chained
//     `git add fileA && git add -A` used to leave -A unblocked)
//   - also track `git rm` / `git mv` targets (they mutate the index with no
//     `git add` at all; without this, a legitimate delete/rename made this
//     session's own commit trip the "not tracked by you" block)
//   - `-p`/`--patch`/`-i`/`--interactive` are non-enumerable (no dry-run
//     listing exists for interactive modes Claude cannot drive anyway — no
//     TTY) and stay hard-blocked with NO ack override. `-A`/`--all`/`-u`/
//     `--update`/bare `.` ARE enumerable via `git add -n` (dry-run) and, on
//     ACK, are recorded from that real listing instead of being tracked as
//     "everything" — a later bare commit still gets a real, useful tracker.
//   - `-C <dir>` / a preceding `cd` to a path outside ctx.cwd: skip
//     entirely (return null) rather than record file paths against the
//     wrong repository's tracker.
const { spawnSync } = require('child_process');

const RE_GIT_ADD = /^(?:sudo\s+)?git\s+(?:-[a-zA-Z0-9-]+\s+|-[a-zA-Z0-9-]+\s+\S+\s+|-C\s+\S+\s+)*add(?=\s|$|["';|&])/;
const RE_GIT_RM  = /^(?:sudo\s+)?git\s+(?:-[a-zA-Z0-9-]+\s+|-[a-zA-Z0-9-]+\s+\S+\s+|-C\s+\S+\s+)*rm(?=\s|$|["';|&])/;
const RE_GIT_MV  = /^(?:sudo\s+)?git\s+(?:-[a-zA-Z0-9-]+\s+|-[a-zA-Z0-9-]+\s+\S+\s+|-C\s+\S+\s+)*mv(?=\s|$|["';|&])/;
const RE_HAS_C_FLAG = /(?:^|\s)-C\s+\S+/;

// Same convention as high-risk-bash-warn.js's isLeadingAck — duplicated
// (2 lines) rather than imported, matching this codebase's existing pattern
// of small per-rule regex duplication over cross-rule coupling (see
// verify-gate-commit.js / commit-quality.js both defining their own
// RE_GIT_COMMIT rather than sharing one).
function isLeadingAck(cmd) {
  const firstNonBlank = String(cmd).split('\n').find((l) => l.trim().length > 0) || '';
  return /^\s*#\s*CONFIRMED-HIGH-RISK\s*:/.test(firstNonBlank);
}

// Enumerable broad flags: `git add -n <flag>` produces a real file listing we
// can record. Non-enumerable ones (-p/-i) have no such listing and stay
// hard-blocked regardless of ACK.
const ENUMERABLE_BROAD = new Set(['-A', '--all', '-u', '--update']);
const NON_ENUMERABLE_BROAD = new Set(['-p', '--patch', '-i', '--interactive']);

function tailTokensAfter(segment, verbRe) {
  const m = segment.match(verbRe);
  if (!m) return [];
  return segment.slice(m.index + m[0].length).trim().split(/\s+/).filter(Boolean);
}

// `git add -n <flags>` dry-run output lines look like "add 'path/to/file'" or
// "remove 'path'" — we only want files that would actually be staged.
function dryRunAddFiles(flags) {
  const args = ['add', '-n', ...flags];
  const r = spawnSync('git', args, { encoding: 'utf8', timeout: 10000 });
  if (r.error || typeof r.status !== 'number' || r.status !== 0) return null; // fail open — caller treats null as "cannot enumerate"
  const files = [];
  for (const line of String(r.stdout || '').split('\n')) {
    const m = line.match(/^(?:add|remove)\s+'(.+)'$/);
    if (m) files.push(m[1]);
  }
  return files;
}

module.exports = {
  check(ctx) {
    const shared = ctx.shared;
    // Backslash-joined, not ctx.commandSegments directly: a real multi-line
    // `git add \` command's continuation lines would otherwise never match
    // RE_GIT_ADD (see lib/shared.js joinBackslashContinuations header).
    const segments = shared.commandSegmentsBackslashJoined(ctx.commandExpanded);
    const addSegments = segments.filter((s) => RE_GIT_ADD.test(s));
    const rmSegments = segments.filter((s) => RE_GIT_RM.test(s));
    const mvSegments = segments.filter((s) => RE_GIT_MV.test(s));
    if (!addSegments.length && !rmSegments.length && !mvSegments.length) return null;

    // Any segment targeting a different repo via `-C` makes the whole
    // command's file paths ambiguous relative to ctx.cwd — bail rather than
    // record against the wrong tracker.
    if ([...addSegments, ...rmSegments, ...mvSegments].some((s) => RE_HAS_C_FLAG.test(s))) return null;

    const ack = isLeadingAck(ctx.command);
    const tf = shared.getGitStageTrackerPath(ctx.sid);
    const existing = shared.readTracker(tf);
    const existingKeys = new Set(existing.map(shared.normalizePath));
    const additions = [];
    const addToTracker = (files) => {
      for (const f of files) {
        const key = shared.normalizePath(f);
        if (!existingKeys.has(key)) { existingKeys.add(key); additions.push(f); }
      }
    };

    for (const segment of addSegments) {
      const tokens = tailTokensAfter(segment, /\badd\b(?=\s|$)/);
      const nonEnumerable = tokens.some((t) => NON_ENUMERABLE_BROAD.has(t));
      if (nonEnumerable) {
        return {
          block: [
            '[Hook] BLOCKED: `git add -p`/`--patch`/`-i`/`--interactive` is not allowed (no non-interactive way to know what it would stage).',
            '[Hook]   List the files explicitly instead: git add path/to/fileA path/to/fileB',
          ],
        };
      }
      const enumerableFlag = tokens.find((t) => ENUMERABLE_BROAD.has(t) || t === '.');
      if (enumerableFlag) {
        if (!ack) {
          return {
            block: [
              '[Hook] BLOCKED: broad `git add` (-A/--all/-u/--update, or bare `.`) is not allowed in this repo.',
              '[Hook]   List the files explicitly instead: git add path/to/fileA path/to/fileB',
              '[Hook]   Or, if you deliberately want everything currently modified: re-issue with a',
              '[Hook]   LEADING comment on its own first line: # CONFIRMED-HIGH-RISK: <reason>',
              '[Hook] Why: this repo runs multiple Claude Code sessions in one shared working',
              '[Hook]   directory + git index (no per-session worktrees, main-only policy).',
              '[Hook]   A broad add cannot be scope-tracked, which defeats git-commit-scope-guard',
              "[Hook]   — the gate that stops a later `git commit` from sweeping in another",
              '[Hook]   session\'s staged files (see WORKLOG 2026-08-30 for the incidents this fixes).',
            ],
          };
        }
        // ACKed: enumerate what -A/-u/. would actually touch via dry-run and
        // record THAT, so the next bare commit still gets a real tracker
        // instead of silently trusting everything.
        const flagArgsFor = (t) => (t === '.' ? ['.'] : [t]);
        const dry = dryRunAddFiles(flagArgsFor(enumerableFlag));
        if (dry) addToTracker(dry);
        continue; // ACKed broad add handled; do not also treat tokens as literal filenames
      }
      addToTracker(tokens.filter((t) => !t.startsWith('-')));
    }

    for (const segment of rmSegments) {
      const tokens = tailTokensAfter(segment, /\brm\b(?=\s|$)/).filter((t) => !t.startsWith('-'));
      addToTracker(tokens);
    }
    for (const segment of mvSegments) {
      // `git mv <src> <dest>` — both paths end up as index changes.
      const tokens = tailTokensAfter(segment, /\bmv\b(?=\s|$)/).filter((t) => !t.startsWith('-'));
      addToTracker(tokens);
    }

    if (additions.length) shared.writeTracker(tf, [...existing, ...additions]);
    return null;
  },
};
