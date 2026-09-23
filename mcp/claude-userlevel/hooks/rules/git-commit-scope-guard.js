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
//     segment anywhere earlier in the same command, that resolves to a
//     directory OTHER than ctx.cwd makes the working directory this Node
//     process actually runs `git` in an unreliable stand-in for where the
//     commit will really execute — fail open (return null) rather than
//     check the wrong repository's state.
//
// v3 (2026-09-02, real incident `632dd1913`, not a critic finding this
// time): the v2 cwd-mismatch check bailed on ANY `cd`/`-C` segment, full
// stop, with no check of what it actually resolved to. This repo's own
// tooling prefixes nearly every Bash command with `cd /d/Work` — a NO-OP,
// already ctx.cwd. Treating that as "targets elsewhere" silently disabled
// this gate for the vast majority of real commits from the day it shipped;
// a bare commit prefixed with `cd /d/Work` swept another session's 5
// already-staged files straight past it. First fix: real path comparison
// via lib/shared.js's resolveShellPath()/isSameDir() (handles Git-Bash
// `/d/Work`-style paths, which Node's own path module does not understand
// natively).
//
// v4 (2026-09-02, critic round 2 on the v3 fix — genuine bugs found by
// reading the surrounding logic, not the diff in isolation):
//   - M1 (Major): `-C <dir>` was matched against the WHOLE segment text —
//     including inside a `-m "..."` commit message. A REAL commit message
//     in this repo's own history (this exact fix's own predecessor commit)
//     contained the substring "git -C" and silently disabled the check.
//     Fixed: `-C` is now extracted only from the commit segment's own
//     captured leading-flag region (before the `commit` keyword), which
//     structurally cannot include the message argument.
//   - M2 (Major): a `cd` typed AFTER the commit segment in a chained
//     command no longer affects it (shell executes left to right) — see
//     lib/shared.js hasCdElsewhere() header. Uses the commit segment's own
//     index as the boundary instead of scanning the whole array.
//   - M4 (Major): the pathspec-tail extractor scanned the LAST LINE OF THE
//     WHOLE COMMAND, not the commit's own segment — `git commit -m "x" &&
//     git log --oneline -1 -- README.md` had its LATER, unrelated command's
//     own `-- README.md` misattributed to the commit as "scoped, nothing to
//     compare", silently skipping the scope check entirely. Fixed: try the
//     commit segment's OWN trailing pathspec first; only fall back to
//     scanning the full text's last line when the commit segment itself
//     ends in an OPEN heredoc marker (this repo's mandated multi-line
//     commit style — see extractPathspecTail() below), never
//     unconditionally.
//   - m6 (Minor): `hasBroadCommitFlag`'s whitespace-only tail split turned
//     `git commit -m "fix -a flag"` into tokens `-m`, `"fix`, `-a`,
//     `flag"` — only the FIRST fragment got consumed as -m's value, so the
//     bare `-a` fragment then read as a real flag and false-blocked a
//     commit that never asked for `-a`. Fixed with the same quote-aware
//     tokenizer as git-add-scope-tracker.js's M3 fix (shared.tokenizeQuoted).
//   - Same-command self-cover (new, not a critic finding — discovered while
//     implementing git-add-scope-tracker.js's C1 fix): moving that rule's
//     tracker WRITE to PostToolUse means a chained `git add fileA && git
//     commit -m x` (bare, no pathspec, as literally this session's first
//     git action) no longer has fileA in the persisted tracker by the time
//     THIS rule's PreToolUse check runs — it would fall into the
//     empty-tracker WARN path instead of the stricter BLOCK-capable path,
//     weakening protection for exactly the pattern this repo's tooling
//     habitually uses (chaining commands to save round-trips). Fixed by
//     also recognizing literal `git add`/`rm`/`mv` tokens EARLIER in the
//     SAME command (via git-add-scope-tracker.js's exported
//     `literalCandidatesUpTo`, re-parsing the same command text — no
//     PreToolUse handoff, so no C1-style side-effect risk) as this
//     session's own for THIS check only. Scoped to the literal/explicit
//     case; an ACK'd broad add earlier in the same chained command still
//     only gets WARN-level protection here (the operator already accepted
//     broader trust via the ACK).
const { spawnSync } = require('child_process');
const fs = require('fs');
const addTracker = require('./git-add-scope-tracker');

// One definition for every commit gate (lib/shared.js): env-prefixed `GIT_INDEX_FILE=<idx> git commit` included.
const { RE_GIT_COMMIT } = require('../lib/shared');
const VALUE_FLAGS = new Set(['-m', '--message', '-c', '--reuse-message', '--author', '-F', '--file', '--date', '--fixup', '--squash']);
// A commit segment ending in an open heredoc opener (this repo's mandated
// `-m "$(cat <<'EOF'` multi-line style) means the real closing `)" -- <files>`
// lives on a LATER, separate line-segment — see extractPathspecTail() below.
const RE_HEREDOC_OPEN = /<<-?\s*['"]?(\w+)['"]?\s*$/;

// isOpenHeredoc() requires BOTH the shape match above AND an odd count of
// unescaped-looking `"` characters (the `-m "..."` argument genuinely still
// open at end-of-line). Found via self-review, not a critic finding: the
// shape regex ALONE also matches a COMPLETE, properly-closed message that
// merely contains literal "<<word" text near its end — e.g. `git commit -m
// "foo <<bar"` — which would wrongly re-trigger the fallback this fix
// exists to bound (M4: scanning the whole multi-line text's last line,
// which can pick up a LATER unrelated chained command's own pathspec).
function isOpenHeredoc(commitSegment) {
  if (!RE_HEREDOC_OPEN.test(commitSegment)) return false;
  const quoteCount = (commitSegment.match(/"/g) || []).length;
  return quoteCount % 2 === 1; // odd -> the -m "..." argument is unclosed
}

function findCommitSegment(segments) {
  const idx = segments.findIndex((s) => RE_GIT_COMMIT.test(s));
  return { segment: idx === -1 ? null : segments[idx], index: idx };
}

// v4 fix m6: quote-aware tail parsing (shared.tokenizeQuoted) so
// `git commit -m "fix -a flag"` treats the whole message as ONE token
// (correctly consumed as -m's value) instead of shredding it into fragments
// that individually look like real flags.
function hasBroadCommitFlag(segment, shared) {
  const m = segment.match(/\bcommit\b(?=\s|$)/);
  if (!m) return false;
  const tokens = shared.tokenizeQuoted(segment.slice(m.index + m[0].length).trim());
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

// Quote-aware (shared.tokenizeQuoted, same instance as M3/m6): found via
// self-review, not a critic finding — a plain whitespace split here shreds
// `-- "docs/my file.md"` into two garbage tokens exactly like the M3 bug
// this fix already closed in git-add-scope-tracker.js, just in the
// pathspec-TAIL parser instead of the add-TARGET parser. Consequence here
// is the conservative direction (a legitimately-scoped commit falls
// through to the normal foreign-file check instead of being recognized as
// scoped) rather than a security hole, but it's the same defect class, so
// it gets the same fix rather than being left as a second, inconsistent
// instance of it.
function tailPathspecOf(text, shared) {
  const m = String(text).match(/\s--\s+(.+)$/);
  if (!m) return null;
  const tokens = shared.tokenizeQuoted(m[1].trim());
  return tokens.length ? tokens : null;
}

// v4 fix M4: try the commit segment's OWN trailing pathspec first — this
// can never be confused by a LATER chained command's own `-- <file>` tail,
// because the commit segment is already bounded to just this one git
// invocation (chain-operator-split, see lib/shared.js
// commandSegmentsBackslashJoined). Only fall back to the heredoc-body scan
// below when the commit segment itself is structurally unclosed (an open
// heredoc), which is the ONE real case where the true pathspec genuinely
// lives on a different segment.
//
// v5 (2026-09-05, found live troubleshooting a real blocked commit, not a
// critic finding): the old fallback took `lines[lines.length - 1]` --
// unconditionally the LAST line of the ENTIRE multi-line command text. This
// repo's own real-world usage routinely appends a follow-up command after a
// heredoc commit in the same Bash call (e.g. `git log --oneline -1` to
// confirm the SHA, exactly what happened live) -- when that happens, "the
// last line of the whole text" is that unrelated follow-up command, not the
// commit's own `)" -- <pathspec>` continuation, so the real pathspec was
// never found and every heredoc-style commit with anything after it fell
// through to the full-index ownership check regardless of how correctly it
// was scoped. Fixed to locate the heredoc's actual closing delimiter line
// (captured by RE_HEREDOC_OPEN on the commit segment, e.g. `EOF`) in the RAW
// text first, then look at only the SINGLE backslash-joined line
// immediately after it -- not a blind last-line grab, and not a
// search-anywhere-backwards either (which would reintroduce the exact
// misattribution M4 above already closed: a later, unrelated command's own
// `-- <file>` tail read as if it were this commit's).
function extractPathspecTail(commitSegment, commandExpanded, shared) {
  const own = tailPathspecOf(commitSegment, shared);
  if (own) return own;
  if (!isOpenHeredoc(commitSegment)) return null;
  const heredocMatch = commitSegment.match(RE_HEREDOC_OPEN);
  const delimiter = heredocMatch && heredocMatch[1];
  if (!delimiter) return null;
  const rawLines = String(commandExpanded).split('\n');
  const closeIdx = rawLines.findIndex((l) => l.trim() === delimiter);
  if (closeIdx === -1 || closeIdx === rawLines.length - 1) return null;
  const continuation = shared.joinBackslashContinuations(rawLines.slice(closeIdx + 1).join('\n'));
  return tailPathspecOf((continuation.split('\n')[0] || '').trim(), shared);
}

// v5 (2026-09-05, found live troubleshooting a real blocked commit, not a critic
// finding): this spawnSync had no `cwd` -- it ran relative to the Node hook process's
// OWN cwd (`process.cwd()`, captured once as `ctx.cwd` at ctx-construction time in
// runner.js), which is NOT guaranteed to already be the repo the commit targets (the
// whole rest of this file, and lib/shared.js's isSameDir()/hasCdElsewhere(), exists
// specifically because ctx.cwd can't be assumed correct without checking -- this one
// function skipped that and always trusted the ambient process cwd instead). A
// same-repo, same-directory, git-verified-real pathspec silently failed
// --error-unmatch here whenever the hook process's ambient cwd differed from the
// repo, which routed EVERY such commit into the full-index ownership check below
// instead of the fast, correct "this commit is scoped, nothing to compare" path --
// not a false negative on an unsafe commit, but a false block on a safe one.
// v6 (2026-09-11, real block hit live finishing a legitimate `git pull` merge — not a
// critic finding): this gate had no merge/cherry-pick awareness at all, unlike the
// `--amend` exemption above. A real merge commit necessarily includes every path that
// differs between the two parents -- git itself refuses `git commit -- <pathspec>` while
// `MERGE_HEAD`/`CHERRY_PICK_HEAD` exists ("cannot do a partial commit during a merge"),
// so the fix this gate's own error message suggests (a trailing pathspec) is not just
// unhelpful here, it is impossible. Reproduced directly: mid-merge, exactly 2 files
// staged (one this session's own conflict resolution, one a clean auto-merge from the
// incoming commit — verified via `git diff HEAD` showing it as real incoming content, not
// another session's uncommitted work), plain `git commit --no-edit` still BLOCKED citing
// the auto-merged file as "unexpected". Fixed by exempting the whole check while a merge
// or cherry-pick is genuinely in progress (`git rev-parse -q --verify MERGE_HEAD` /
// `CHERRY_PICK_HEAD`, the standard worktree-safe way to ask — not reading `.git/MERGE_HEAD`
// as a path, which breaks under worktrees/submodules), mirroring the existing --amend
// early-return in shape and reasoning: some git operations are structurally exempt from
// per-session pathspec scoping, not a hole to close.
function isMidMergeOrCherryPick(cwd) {
  try {
    for (const ref of ['MERGE_HEAD', 'CHERRY_PICK_HEAD']) {
      const r = spawnSync('git', ['rev-parse', '-q', '--verify', ref], { cwd, encoding: 'utf8', timeout: 10000 });
      if (typeof r.status === 'number' && r.status === 0) return true;
    }
    return false;
  } catch (_) {
    return false; // can't tell -- fall through to the normal check rather than assume exempt
  }
}

function isRealPathspec(tokens, cwd) {
  try {
    const r = spawnSync('git', ['ls-files', '--error-unmatch', '--', ...tokens], { cwd, encoding: 'utf8', timeout: 10000 });
    return typeof r.status === 'number' && r.status === 0;
  } catch (_) {
    return false;
  }
}

// NUL-terminated `git diff --cached --name-only`, optionally scoped to a
// pathspec. Returns null on any git failure (caller fails open).
// v4 fix m8: a pathspec-scoped call (`['--', ...tracked]`) with
// TRACKER_MAX_ENTRIES (500) long repo-relative paths — this repo has
// entries under lobster-factory/... routinely 80-100+ chars — can approach
// the ~32KB Windows command-line limit, at which point spawnSync sets
// `r.error` and the OLD code failed open (gate silently disabled for large
// sessions, exactly the wrong direction). Chunked here and results unioned
// so a large tracker degrades to slower, not silently absent.
const PATHSPEC_CHUNK_SIZE = 100;

// v5: also missing `cwd` (same class as isRealPathspec above). A bare, pathspec-less
// `git diff --cached --name-only` still works from any cwd inside the repo (git
// discovers the root by walking up), which is why this half of the bug stayed hidden
// -- but the PATHSPEC-scoped call this same function makes (`gitDiffCachedNames(['--',
// ...tracked])` below, comparing "is this session's tracked set actually what's
// staged") resolves those pathspecs relative to cwd exactly like isRealPathspec does,
// so it has the identical latent failure mode once cwd is wrong.
function gitDiffCachedNamesRaw(extraArgs, cwd, env) {
  try {
    const r = spawnSync('git', ['diff', '--cached', '--name-only', '-z', ...(extraArgs || [])], { cwd, encoding: 'utf8', timeout: 10000, env: env ? { ...process.env, ...env } : process.env });
    if (r.error || typeof r.status !== 'number' || r.status !== 0) return null;
    return String(r.stdout || '').split('\0').filter(Boolean);
  } catch (_) {
    return null;
  }
}

function gitDiffCachedNames(extraArgs, cwd, env) {
  if (!extraArgs || extraArgs.length <= PATHSPEC_CHUNK_SIZE + 1) return gitDiffCachedNamesRaw(extraArgs, cwd, env);
  // extraArgs is `['--', ...paths]` when scoped — chunk the paths only.
  const [marker, ...paths] = extraArgs;
  if (marker !== '--') return gitDiffCachedNamesRaw(extraArgs, cwd, env); // unexpected shape — don't guess
  const out = [];
  for (let i = 0; i < paths.length; i += PATHSPEC_CHUNK_SIZE) {
    const chunk = gitDiffCachedNamesRaw(['--', ...paths.slice(i, i + PATHSPEC_CHUNK_SIZE)], cwd, env);
    if (chunk === null) return null; // any chunk failing -- fail open for the whole query
    out.push(...chunk);
  }
  return out;
}

// v7 (2026-09-23): private-index commits. scripts/git-partial-worktree-commit.py builds a PRIVATE index
// (GIT_INDEX_FILE) = HEAD + explicitly selected hunks of a shared file (WORKLOG/TASKS) + whole own files, and
// writes a marker <index>.json {root, entries:{path:blob}, own:[path]}. Such a commit is scoped by construction
// (no other session can write that index), so ownership is proven by the marker instead of the add tracker --
// but only while the index still equals the marker: a shared-file blob that differs was tampered with, an own
// file whose worktree moved on after staging would commit stale content, any other path is a sweep. After the
// commit succeeds (HEAD carries the marker blobs) the PostToolUse phase syncs the SHARED index entries of the
// committed paths to HEAD (`git reset -q -- <paths>`: index only, worktree untouched -- another session's
// whole-file add of the same shared file is replaced by HEAD, its worktree hunks stay) and removes index+marker.
// Companion: git-shared-file-guard.js (blocks the other ways a shared file can reach a commit).
const RE_PRIVATE_INDEX = /(?:^|[\s;&|(]|\benv\s+(?:-\S+\s+)*)GIT_INDEX_FILE=("[^"]+"|'[^']+'|\S+)/;

function privateIndexOf(commitSegment) {
  const m = String(commitSegment || '').match(RE_PRIVATE_INDEX);
  if (!m) return null;
  return m[1].replace(/^["']|["']$/g, '');
}

function readMarker(indexPath) {
  try {
    const raw = fs.readFileSync(`${indexPath}.json`, 'utf8');
    const m = JSON.parse(raw);
    if (!m || typeof m !== 'object' || !m.entries || typeof m.entries !== 'object' || !Array.isArray(m.own)) return null;
    return m;
  } catch (_) {
    return null;
  }
}

function gitOut(args, cwd, env) {
  try {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 10000, env: env ? { ...process.env, ...env } : process.env });
    if (r.error || typeof r.status !== 'number' || r.status !== 0) return null;
    return String(r.stdout || '').trim();
  } catch (_) {
    return null;
  }
}

function validatePrivateIndex(indexPath, marker, cwd) {
  const env = { GIT_INDEX_FILE: indexPath };
  const problems = [];
  const root = gitOut(['rev-parse', '--show-toplevel'], cwd);
  if (!root) return { ok: false, problems: ['not inside a git repository'] };
  const norm = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  if (norm(marker.root) !== norm(root)) problems.push(`marker root ${marker.root} is not this repo ${root}`);
  // The private index was read-tree'd from marker.head; git commit does not check that, so on a moved HEAD the
  // commit's tree would silently revert everything committed in between (codex 2026-09-24 r2).
  const head = gitOut(['rev-parse', 'HEAD'], cwd);
  if (!marker.head || head !== marker.head) problems.push(`HEAD moved since stage (${String(marker.head || '?').slice(0, 12)} -> ${String(head || '?').slice(0, 12)}): drop --index ${indexPath} and stage again on the current HEAD`);
  const staged = gitDiffCachedNamesRaw(undefined, cwd, env);
  if (staged === null) return { ok: false, problems: ['cannot read the private index (GIT_INDEX_FILE)'] };
  if (!staged.length) problems.push('private index equals HEAD -- nothing to commit');
  const own = new Set(marker.own);
  for (const p of staged) {
    const idxBlob = gitOut(['rev-parse', '--verify', '-q', `:${p}`], cwd, env);
    if (Object.prototype.hasOwnProperty.call(marker.entries, p)) {
      if (idxBlob !== marker.entries[p]) problems.push(`${p}: private index blob differs from the marker (re-run stage)`);
    } else if (own.has(p)) {
      const wt = gitOut(['hash-object', '--', p], cwd);
      if (wt === null) problems.push(`${p}: own file missing from the worktree`);
      else if (wt !== idxBlob) problems.push(`${p}: changed after staging (re-run stage -- <files> so the commit carries the current content)`);
    } else {
      problems.push(`${p}: in the private index but not in the marker`);
    }
  }
  return { ok: problems.length === 0, problems };
}

// -> { done, warn[] }. A shared-index entry is reset to HEAD only when it still holds what it held at stage time
// (marker.base) or the committed blob; anything else was staged by another session in the commit/PostToolUse
// window and is left alone (codex r2 F3). A failed reset (index.lock held by another git process) keeps index +
// marker and says so, instead of deleting them over a stale shared index (codex r2 F4).
function syncSharedIndexAfterPrivateCommit(indexPath, marker, cwd) {
  for (const [p, blob] of Object.entries(marker.entries)) {
    if (gitOut(['rev-parse', '--verify', '-q', `HEAD:${p}`], cwd) !== blob) return { done: false, warn: [] }; // commit did not happen; keep for a retry
  }
  // Invariant (codex r3): a private-index commit is correct iff its PARENT is the HEAD the index was read from
  // (marker.head) -- the tree came from that HEAD, so any commit that landed in between is silently reverted by
  // it. PreToolUse checks HEAD before the commit; this checks the commit itself, which closes the window between
  // the two (git's ref update is atomic, the parent is a property of the created commit, not a time check).
  // A stale commit is undone with a compare-and-swap on the branch ref (worktree and shared index untouched).
  // The commit THIS invocation created is identified by its tree (== the private index's tree), never by
  // position: if another session already committed on top, HEAD is theirs and must not be rewound (codex r4).
  const myTree = gitOut(['write-tree'], cwd, { GIT_INDEX_FILE: indexPath });
  const recent = (gitOut(['log', '--format=%H %T %P', '-n', '10'], cwd) || '').split('\n').filter(Boolean).map((l) => l.split(' '));
  const mine = myTree ? recent.find(([, tree]) => tree === myTree) : null;
  if (!mine) return { done: false, warn: [] }; // commit did not land (or is older than 10 commits): keep index + marker
  const [mySha, , myParent] = mine;
  const headNow = recent[0][0];
  if (marker.head && myParent !== marker.head) {
    const ref = gitOut(['symbolic-ref', '-q', 'HEAD'], cwd);
    let r = null;
    if (ref && mySha === headNow) { try { r = spawnSync('git', ['update-ref', ref, myParent, mySha], { cwd, encoding: 'utf8', timeout: 15000 }); } catch (e) { r = { status: -1, stderr: String(e && e.message) }; } }
    if (r && r.status === 0) {
      for (const f of [indexPath, `${indexPath}.json`]) { try { fs.unlinkSync(f); } catch (_) { /* already gone */ } }
      return { done: true, warn: [
        `[Hook] private-index commit ${mySha.slice(0, 12)} UNDONE: it was prepared on ${marker.head.slice(0, 12)} but HEAD had moved to ${myParent.slice(0, 12)} before it ran, so its tree would have reverted that commit.`,
        '[Hook]   Nothing is lost (worktree untouched, branch back on the newer commit). Run the stage step again on the current HEAD and commit.',
      ] };
    }
    const why = mySha !== headNow ? `another commit (${headNow.slice(0, 12)}) already sits on top of it` : ((r && (r.stderr || '').split('\n')[0]) || 'detached HEAD or update-ref failed');
    return { done: false, warn: [
      `[Hook] private-index commit ${mySha} is based on a stale HEAD (${marker.head} vs its parent ${myParent}) and could NOT be undone automatically: ${why}.`,
      `[Hook]   Do NOT push. Rebuild it on the current HEAD: git rebase --onto ${myParent} ${myParent} ${headNow} is NOT enough (the tree reverts ${myParent.slice(0, 12)}); drop it (git rebase -i / git replace) and stage again, then commit. Index + marker kept at ${indexPath}.`,
    ] };
  }
  const base = marker.base && typeof marker.base === 'object' ? marker.base : {};
  const warn = [];
  const toReset = [];
  for (const p of [...Object.keys(marker.entries), ...marker.own]) {
    const cur = gitOut(['rev-parse', '--verify', '-q', `:${p}`], cwd); // null = not in the shared index
    const committed = gitOut(['rev-parse', '--verify', '-q', `HEAD:${p}`], cwd);
    const hasBase = Object.prototype.hasOwnProperty.call(base, p);
    if (cur === null || cur === committed || (hasBase && cur === base[p])) toReset.push(p);
    else warn.push(`[Hook] ${p}: the shared index holds content staged by another session since this commit was prepared -- left untouched`);
  }
  let failed = false;
  for (let i = 0; i < toReset.length; i += PATHSPEC_CHUNK_SIZE) {
    const chunk = toReset.slice(i, i + PATHSPEC_CHUNK_SIZE);
    let r;
    try { r = spawnSync('git', ['reset', '-q', '--', ...chunk], { cwd, encoding: 'utf8', timeout: 15000 }); } catch (e) { r = { status: -1, stderr: String(e && e.message) }; }
    if (r.error || r.status !== 0) {
      failed = true;
      warn.push(`[Hook] git reset -q -- <${chunk.length} path(s)> failed after the private-index commit (${String(r.stderr || (r.error && r.error.message) || '').split('\n')[0] || 'no stderr'}); private index and marker kept at ${indexPath}. Run by hand: git reset -q -- ${chunk.join(' ')}`);
    }
  }
  if (!failed) for (const f of [indexPath, `${indexPath}.json`]) { try { fs.unlinkSync(f); } catch (_) { /* already gone */ } }
  return { done: !failed, warn };
}

module.exports = {
  check(ctx) {
    const shared = ctx.shared;
    // Backslash-joined, not ctx.commandSegments directly: a real multi-line
    // `git commit ... -- \` command's continuation lines would otherwise
    // never be visible (see lib/shared.js joinBackslashContinuations header
    // — found live dogfooding this exact gate).
    const segments = shared.commandSegmentsBackslashJoined(ctx.commandExpanded);
    const { segment: commitSegment, index: commitIndex } = findCommitSegment(segments);
    if (!commitSegment) return null;
    if (/--amend\b/.test(ctx.commandExpanded)) {
      // v7: a private index is never an amend (its tree was read from marker.head; the amended commit's parent
      // is not that HEAD, so neither the PreToolUse nor the PostToolUse invariant applies) -- refuse (codex r4).
      if (ctx.event === 'PreToolUse' && privateIndexOf(commitSegment) && readMarker(privateIndexOf(commitSegment))) {
        return { block: ['[Hook] BLOCKED: `--amend` with a private index (GIT_INDEX_FILE) is not a supported shape; drop the index and stage again, or amend without it.'] };
      }
      return null;
    }
    if (isMidMergeOrCherryPick(ctx.cwd)) return null; // v6 — see isMidMergeOrCherryPick's own header

    // -C: check ONLY the commit segment's own captured flag region (v4 fix M1).
    const cRegionMatch = commitSegment.match(RE_GIT_COMMIT);
    const cRegion = cRegionMatch ? (cRegionMatch[1] || '') : '';
    for (const target of shared.cFlagTargets(cRegion)) {
      if (!shared.isSameDir(target, ctx.cwd)) return null; // -C elsewhere — fail open
    }
    // cd: only segments strictly BEFORE the commit segment can have
    // affected where it actually ran (v4 fix M2).
    if (shared.hasCdElsewhere(segments, ctx.cwd, commitIndex)) return null;

    if (ctx.event === 'PostToolUse') {
      // Re-derive truth from git instead of trusting the Bash tool's result
      // shape: prune the tracker to only the files STILL staged after this
      // command ran. A blocked/failed commit leaves everything staged (no
      // change); a full commit clears the tracker; a pathspec-scoped commit
      // shrinks it to the remainder.
      let syncWarn = [];
      const privIdx = privateIndexOf(commitSegment);
      if (privIdx) {
        const marker = readMarker(privIdx);
        if (marker) syncWarn = syncSharedIndexAfterPrivateCommit(privIdx, marker, ctx.cwd).warn; // v7 -- see header above
      }
      const done = syncWarn.length ? { warn: syncWarn } : null;
      const tf = shared.getGitStageTrackerPath(ctx.sid);
      const tracked = shared.readTracker(tf);
      if (!tracked.length) return done;
      const stillStaged = gitDiffCachedNames(['--', ...tracked], ctx.cwd);
      if (stillStaged === null) return done; // fail open — don't touch tracker if we can't verify
      shared.writeTracker(tf, stillStaged);
      return done;
    }

    // PreToolUse from here down.
    const tf = shared.getGitStageTrackerPath(ctx.sid);

    if (hasBroadCommitFlag(commitSegment, shared)) {
      return {
        block: [
          '[Hook] BLOCKED: `git commit -a`/`--all`/`-am` auto-stages every modified tracked file,',
          '[Hook]   bypassing this session\'s add-tracking (git-add-scope-tracker.js).',
          '[Hook]   Stage explicitly first: git add path/to/fileA path/to/fileB',
          '[Hook]   Then commit normally (bare `git commit -m "..."`, or with a `-- <files>` tail).',
        ],
      };
    }

    const pathspecTokens = extractPathspecTail(commitSegment, ctx.commandExpanded, shared);
    if (pathspecTokens && isRealPathspec(pathspecTokens, ctx.cwd)) {
      return null; // real, git-verified pathspec — this commit is scoped, nothing to compare
    }

    // v7: private index (GIT_INDEX_FILE=<idx> git commit ...) -- ownership proven by the helper's marker.
    const privIdx = privateIndexOf(commitSegment);
    if (privIdx) {
      const marker = readMarker(privIdx);
      // The stale-HEAD check runs in PostToolUse, after the whole Bash call: a push in the same call would
      // publish a stale commit before it can be undone (codex r4 F3). Amend has no "parent == marker.head"
      // meaning at all (codex r4 F2). Both are refused up front rather than reasoned about after the fact.
      if (marker && segments.some((s) => /^(?:sudo\s+)?git\s+(?:-[^\s]+\s+)*push\b/.test(s.trim()))) {
        return { block: [
          '[Hook] BLOCKED: a private-index commit and `git push` in the same command.',
          '[Hook]   The stale-HEAD check runs after the command; push in a separate Bash call once it has passed.',
        ] };
      }
      if (marker) {
        const v = validatePrivateIndex(privIdx, marker, ctx.cwd);
        if (v.ok) return null;
        return {
          block: [
            '[Hook] BLOCKED: private index no longer matches git-partial-worktree-commit.py\'s marker:',
            ...v.problems.slice(0, shared.STDERR_MAX_LINES).map((p) => `[Hook]     ${p}`),
            '[Hook]   Re-run the stage step (or `drop --index <path>` and start over), then commit again.',
          ],
        };
      }
      // GIT_INDEX_FILE without a marker: an ordinary index nobody vouches for -- fall through and judge it
      // exactly like the shared index (tracker vs what it holds).
    }
    const privEnv = privIdx ? { GIT_INDEX_FILE: privIdx } : undefined;

    const allStaged = gitDiffCachedNames(undefined, ctx.cwd, privEnv);
    if (allStaged === null) return null; // fail open — can't read git state
    if (!allStaged.length) return null;  // nothing staged; verify-gate-commit / dangerous-bash etc. own that case

    // Same-command self-cover: literal add/rm/mv targets EARLIER in this
    // exact chained command count as this session's own even though
    // git-add-scope-tracker.js hasn't (and, for an unexecuted command,
    // can't yet) recorded them into the persisted tracker (see module
    // header). Re-parses the same command text — no side effect, so no
    // risk of the C1 class of bug this is adjacent to.
    const selfCover = addTracker.literalCandidatesUpTo(segments, commitIndex - 1, shared, ctx.cwd);
    const tracked = [...shared.readTracker(tf), ...selfCover.files];
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

    const covered = gitDiffCachedNames(['--', ...tracked], ctx.cwd, privEnv);
    if (covered === null) return null; // fail open
    const coveredSet = new Set(covered);
    const unexpected = allStaged.filter((f) => !coveredSet.has(f));
    if (!unexpected.length) return null; // fully covered by this session's own tracked/self-covered adds

    return {
      block: [
        '[Hook] BLOCKED: `git commit` would include files this session never `git add`-ed:',
        ...unexpected.slice(0, shared.STDERR_MAX_LINES).map((f) => `[Hook]     unexpected: ${f}`),
        '[Hook]   These are likely staged by another concurrent Claude Code session sharing',
        '[Hook]   this working directory\'s git index (see WORKLOG 2026-08-30).',
        '[Hook]   Fix: commit only your own files with a trailing pathspec:',
        '[Hook]     git commit -m "..." -- <files you actually added>',
        '[Hook]   (agency-os/WORKLOG.md / TASKS.md hunks: scripts/git-partial-worktree-commit.py stage ..., see git-shared-file-guard.js)',
      ],
    };
  },
};

// Parsing helpers shared with git-shared-file-guard.js (one parser for "which commit, which pathspec").
Object.assign(module.exports, {
  RE_GIT_COMMIT,
  findCommitSegment,
  hasBroadCommitFlag,
  extractPathspecTail,
  isRealPathspec,
  isMidMergeOrCherryPick,
  privateIndexOf,
  readMarker,
  validatePrivateIndex,
});
