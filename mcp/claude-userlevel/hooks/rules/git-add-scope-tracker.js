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
// v2 (2026-08-30, critic round 1): iterate every add-shaped segment (not
// just the first); also track `git rm`/`git mv`; `-p`/`-i` hard-blocked
// with no ACK override; `-A`/`--all`/`-u`/bare `.` enumerable via dry-run
// and recordable on ACK; `-C <dir>` skip.
//
// v3 (2026-09-02, incident `632dd1913`): added the mirror `cd`-elsewhere
// check this rule never had at all — see git-commit-scope-guard.js header.
//
// v4 (2026-09-02, critic round 2 on the v3 fix — real bugs, not style):
//   - C1 (Critical): this rule wrote the tracker at PreToolUse, BEFORE the
//     real `git add`/`rm`/`mv` executes. `runner.js` runs every rule in a
//     matcher group and aggregates verdicts afterward (no short-circuit —
//     the exact defect git-commit-scope-guard.js's own v1→v2 C1 fix already
//     documents for itself); a SIBLING rule (verify-gate-commit,
//     dangerous-bash, ...) blocking the SAME call left this rule's write
//     already done, so a command that never actually ran still credited
//     this session with files it never touched — which then LET ANOTHER
//     SESSION'S real staged file through as "covered" at commit time. This
//     is the exact incident class the gate exists to stop, reached through
//     a different door, in the PERMISSIVE direction (worse than inert).
//     Fixed the same way git-commit-scope-guard.js fixed its own C1:
//     recording now happens ONLY at PostToolUse, and only for candidate
//     paths independently VERIFIED via a real `git diff --cached` query —
//     a blocked/never-executed call changes no git state, so it naturally
//     records nothing, with no reliance on knowing whether it "succeeded".
//   - M1 (Major): `-C <dir>` was matched against the WHOLE segment text,
//     including inside a `-m "..."` commit-message argument on an unrelated
//     verb, or (for this file specifically) inside a quoted rm/mv message
//     if one existed. Fixed: `-C` is now extracted ONLY from each verb
//     regex's own captured leading-flag region (group 1), which structurally
//     cannot include anything after the verb keyword.
//   - M2 (Major): a `cd` appearing AFTER the add/rm/mv segment in a chained
//     command (`git add fileA && cd /elsewhere && echo done`) wrongly
//     invalidated tracking for fileA, even though the add already ran
//     while still in ctx.cwd. Fixed: only `cd` segments strictly BEFORE the
//     last matched verb segment are considered.
//   - M3 (Major): `git add "docs/my file.md"` was split on raw whitespace,
//     shredding the one real path into two garbage tokens that match
//     nothing — the file silently never got tracked, so a LATER bare
//     commit wrongly accused this session of never adding it. Fixed with a
//     quote-aware tokenizer.
//   - m5 (Minor): `git add -n ...` / `--dry-run` was treated as a real
//     broad add and hard-blocked, even though a dry run stages nothing and
//     cannot bypass anything. Fixed: `-n`/`--dry-run` segments are inert.
const { spawnSync } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');

const RE_GIT_ADD = /^(?:sudo\s+)?git\s+((?:-[a-zA-Z0-9-]+\s+|-[a-zA-Z0-9-]+\s+\S+\s+|-C\s+\S+\s+)*)add(?=\s|$|["';|&])/;
const RE_GIT_RM  = /^(?:sudo\s+)?git\s+((?:-[a-zA-Z0-9-]+\s+|-[a-zA-Z0-9-]+\s+\S+\s+|-C\s+\S+\s+)*)rm(?=\s|$|["';|&])/;
const RE_GIT_MV  = /^(?:sudo\s+)?git\s+((?:-[a-zA-Z0-9-]+\s+|-[a-zA-Z0-9-]+\s+\S+\s+|-C\s+\S+\s+)*)mv(?=\s|$|["';|&])/;

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
const DRY_RUN_FLAGS = new Set(['-n', '--dry-run']);

// v4 fix M3: quote-aware tail tokenizer (shared.tokenizeQuoted — see its
// header) so `git add "docs/my file.md"` records the one real path instead
// of two garbage fragments that match nothing.
function tailTokensAfter(segment, verbRe, shared) {
  const m = segment.match(verbRe);
  if (!m) return [];
  return shared.tokenizeQuoted(segment.slice(m.index + m[0].length).trim());
}

// v4 fix M1: extract the captured leading-flag region (group 1) of a
// matched verb segment — the ONLY place `-C` can structurally appear in a
// real `git <verb>` invocation. Returns null if the segment doesn't match
// this verb at all.
function flagRegionOf(segment, verbRe) {
  const m = segment.match(verbRe);
  return m ? (m[1] || '') : null;
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

function fingerprint(text) {
  return crypto.createHash('sha1').update(String(text)).digest('hex');
}

function indexSegments(segments, verbRe) {
  const out = [];
  segments.forEach((s, i) => { if (verbRe.test(s)) out.push({ s, i }); });
  return out;
}

// Literal (non-broad) candidate tokens across add/rm/mv segments up to (and
// including) `uptoIndex`. Exported so git-commit-scope-guard.js can, within
// the SAME chained command, recognize an earlier `git add fileA` as this
// session's own without waiting for a PostToolUse round-trip it cannot see
// yet (the tracker for THIS call's add hasn't been written when the
// commit's PreToolUse check runs — recording now happens at PostToolUse,
// see the v4 header above). Broad flags are deliberately NOT expanded here
// (no dry-run side effect belongs in a pure read used by a sibling rule);
// callers that hit a broad flag among the candidates should fall back to
// their normal tracked-file logic for that segment.
//
// `cwd` guards a gap found during self-review while wiring this into
// git-commit-scope-guard.js (not a critic finding): an EARLIER segment can
// carry its OWN `-C <elsewhere>` — e.g. `git -C /elsewhere add fileA && git
// commit -m x` — which targets a DIFFERENT repository's index entirely.
// The outer cd/-C-elsewhere check in each caller only looks at `cd`
// commands and the COMMIT's own `-C` (see hasCdElsewhere()/cFlagTargets()
// call sites), not at an EARLIER add segment's own `-C` — so without this
// guard, `fileA` would be wrongly self-covered even though the real `git
// add` never touched `cwd`'s index at all. (The downstream `git diff
// --cached -- fileA` verification in the caller would usually still catch
// this — fileA isn't really staged in cwd — EXCEPT in the narrow
// coincidence where cwd's repo happens to have a genuinely different
// same-named file staged by another session, which would then be wrongly
// treated as covered.) A segment whose own `-C` resolves elsewhere is
// simply excluded from the candidate list, same as a broad flag.
function literalCandidatesUpTo(segments, uptoIndex, shared, cwd) {
  const limit = typeof uptoIndex === 'number' ? uptoIndex : segments.length - 1;
  const out = [];
  let sawBroad = false;
  const collect = (verbRe) => {
    for (const { s, i } of indexSegments(segments, verbRe)) {
      if (i > limit) continue;
      const region = flagRegionOf(s, verbRe) || '';
      if (cwd && shared.cFlagTargets(region).some((t) => !shared.isSameDir(t, cwd))) continue; // own -C targets elsewhere
      const tokens = tailTokensAfter(s, verbRe, shared);
      if (tokens.some((t) => ENUMERABLE_BROAD.has(t) || t === '.' || NON_ENUMERABLE_BROAD.has(t))) {
        sawBroad = true;
        continue;
      }
      out.push(...tokens.filter((t) => !t.startsWith('-')));
    }
  };
  collect(RE_GIT_ADD);
  collect(RE_GIT_RM);
  collect(RE_GIT_MV);
  return { files: out, sawBroad };
}

module.exports = {
  literalCandidatesUpTo,

  check(ctx) {
    const shared = ctx.shared;
    // Backslash-joined, not ctx.commandSegments directly: a real multi-line
    // `git add \` command's continuation lines would otherwise never match
    // RE_GIT_ADD (see lib/shared.js joinBackslashContinuations header).
    const segments = shared.commandSegmentsBackslashJoined(ctx.commandExpanded);
    const addIdx = indexSegments(segments, RE_GIT_ADD);
    const rmIdx = indexSegments(segments, RE_GIT_RM);
    const mvIdx = indexSegments(segments, RE_GIT_MV);
    if (!addIdx.length && !rmIdx.length && !mvIdx.length) return null;

    // -C: check EACH matched verb segment's own captured flag region only —
    // never the whole segment (v4 fix M1).
    for (const { s } of [...addIdx, ...rmIdx, ...mvIdx]) {
      const region = flagRegionOf(s, RE_GIT_ADD) ?? flagRegionOf(s, RE_GIT_RM) ?? flagRegionOf(s, RE_GIT_MV);
      for (const target of shared.cFlagTargets(region)) {
        if (!shared.isSameDir(target, ctx.cwd)) return null; // -C elsewhere — bail whole command
      }
    }
    // cd: only a `cd` strictly BEFORE the LAST matched verb segment can have
    // affected where it actually ran (v4 fix M2).
    const lastVerbIndex = Math.max(
      addIdx.length ? addIdx[addIdx.length - 1].i : -1,
      rmIdx.length ? rmIdx[rmIdx.length - 1].i : -1,
      mvIdx.length ? mvIdx[mvIdx.length - 1].i : -1,
    );
    if (shared.hasCdElsewhere(segments, ctx.cwd, lastVerbIndex)) return null;

    if (ctx.event === 'PostToolUse') {
      return handlePost(ctx, shared, addIdx, rmIdx, mvIdx);
    }
    return handlePre(ctx, addIdx);
  },
};

// PreToolUse: blocking decisions only (interactive hard-block, broad-without-
// ACK block). No tracker writes here (v4 fix C1) — the only side effect is
// persisting the ACK'd-broad dry-run candidate list for PostToolUse to
// verify, fingerprinted to this exact command so a stale file from a
// blocked/never-executed call can never leak into a later, unrelated one.
function handlePre(ctx, addIdx) {
  const shared = ctx.shared;
  const ack = isLeadingAck(ctx.command);

  for (const { s } of addIdx) {
    const tokens = tailTokensAfter(s, RE_GIT_ADD, shared);
    if (tokens.some((t) => DRY_RUN_FLAGS.has(t))) continue; // v4 fix m5 — dry run stages nothing
    if (tokens.some((t) => NON_ENUMERABLE_BROAD.has(t))) {
      return {
        block: [
          '[Hook] BLOCKED: `git add -p`/`--patch`/`-i`/`--interactive` is not allowed (no non-interactive way to know what it would stage).',
          '[Hook]   List the files explicitly instead: git add path/to/fileA path/to/fileB',
        ],
      };
    }
  }

  const pendingCandidates = [];
  for (const { s } of addIdx) {
    const tokens = tailTokensAfter(s, RE_GIT_ADD, shared);
    if (tokens.some((t) => DRY_RUN_FLAGS.has(t))) continue; // v4 fix m5
    const enumerableFlag = tokens.find((t) => ENUMERABLE_BROAD.has(t) || t === '.');
    if (!enumerableFlag) continue;
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
    const flagArgsFor = (t) => (t === '.' ? ['.'] : [t]);
    const dry = dryRunAddFiles(flagArgsFor(enumerableFlag));
    if (dry) pendingCandidates.push(...dry);
  }

  if (pendingCandidates.length) {
    const pf = shared.getGitAddPendingPath(ctx.sid);
    const fp = fingerprint(ctx.commandExpanded);
    try {
      fs.writeFileSync(pf, `#${fp}\n${pendingCandidates.join('\n')}\n`, 'utf8');
    } catch (_) { /* best effort — Post will simply find nothing to verify */ }
  }
  return null; // allow the real add/rm/mv to run; recording happens at PostToolUse
}

// PostToolUse: re-derive candidates independently from the same command
// text (no PreToolUse handoff needed for the literal/explicit case — see
// module header), then record only what a REAL `git diff --cached` query
// confirms is actually staged right now. A blocked/never-executed command
// changed no git state, so this naturally records nothing for it (v4 C1
// fix) — no need to know whether the tool call "succeeded".
function handlePost(ctx, shared, addIdx, rmIdx, mvIdx) {
  const candidates = [];
  for (const { s } of addIdx) {
    const tokens = tailTokensAfter(s, RE_GIT_ADD, shared);
    if (tokens.some((t) => ENUMERABLE_BROAD.has(t) || t === '.' || NON_ENUMERABLE_BROAD.has(t) || DRY_RUN_FLAGS.has(t))) continue;
    candidates.push(...tokens.filter((t) => !t.startsWith('-')));
  }
  for (const { s } of rmIdx) {
    candidates.push(...tailTokensAfter(s, RE_GIT_RM, shared).filter((t) => !t.startsWith('-')));
  }
  for (const { s } of mvIdx) {
    candidates.push(...tailTokensAfter(s, RE_GIT_MV, shared).filter((t) => !t.startsWith('-')));
  }

  // ACK'd-broad candidates: only trust the pending file if its fingerprint
  // matches THIS command — guards against a stale file from an earlier,
  // never-executed/blocked call leaking into an unrelated later commit
  // (see lib/shared.js getGitAddPendingPath header).
  const pf = shared.getGitAddPendingPath(ctx.sid);
  try {
    if (fs.existsSync(pf)) {
      const raw = fs.readFileSync(pf, 'utf8');
      const lines = raw.split('\n');
      const expected = `#${fingerprint(ctx.commandExpanded)}`;
      if ((lines[0] || '').trim() === expected) {
        candidates.push(...lines.slice(1).map((l) => l.trim()).filter(Boolean));
      }
      fs.unlinkSync(pf); // always consume — never let it leak into a later call
    }
  } catch (_) { /* fail open — nothing extra credited */ }

  if (!candidates.length) return null;

  let verified;
  try {
    // --no-renames: a `git mv` must record BOTH paths; rename detection would list only the new
    // one, and ao-close.ps1 commits only tracked paths (the old side's deletion would be left out).
    const r = spawnSync('git', ['diff', '--cached', '--no-renames', '--name-only', '-z', '--', ...candidates], { encoding: 'utf8', timeout: 10000 });
    if (r.error || typeof r.status !== 'number' || r.status !== 0) return null; // fail open — can't verify
    verified = String(r.stdout || '').split('\0').filter(Boolean);
  } catch (_) { return null; }
  if (!verified.length) return null;

  const tf = shared.getGitStageTrackerPath(ctx.sid);
  const existing = shared.readTracker(tf);
  const existingKeys = new Set(existing.map(shared.normalizePath));
  const additions = verified.filter((f) => !existingKeys.has(shared.normalizePath(f)));
  if (additions.length) shared.writeTracker(tf, [...existing, ...additions]);
  return null;
}
