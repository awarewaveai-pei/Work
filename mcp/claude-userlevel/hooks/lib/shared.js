// Shared helpers for the verify-gate trio (code-change-tracker, verify-gate-stop, verify-gate-commit).
// Kept in one place so SID derivation, tracker path, caps, and dedup behave identically across all three.
//
// Why this file exists (regression history):
//   - Critic round 1 (2026-05-22 hook design review) flagged:
//     - C1: two Claude windows in same cwd → same SID → cross-session pollution
//     - M2: slash command's SID derivation must match hook's SID derivation
//     - M4: Windows case-insensitive paths produce phantom dedup entries
//     - m1: empty `catch (e) {}` silently swallows disk/permission errors
//   - This module is the single source of truth for the shared logic.
//
// Conventions:
//   - module.exports for the three helper functions
//   - CommonJS — see sibling package.json `"type": "commonjs"`

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Tracker hard caps to prevent unbounded growth (C4 + C5 from the design review).
const TRACKER_MAX_ENTRIES = 500;   // tracker file capped here
const STDERR_MAX_LINES    = 20;    // stderr output capped here (per hook call)

// SID derivation (in priority order):
//   1. parsedJson.session_id        — official Claude Code stdin field (most authoritative)
//   2. CLAUDE_CODE_SESSION_ID env   — Claude Code exports this in the tool-call env (verified live)
//   3. CLAUDE_SESSION_ID env        — legacy/dev-tooling name (existing hooks use this too)
//   4. sha1(cwd).slice(0, 16)       — last-resort fallback. Same-cwd hook spawns share this SID,
//                                     which is what we want (all hooks in one session see same tracker).
//                                     Trade-off: two Claude windows in the same cwd would collide.
//                                     This is the SAME trade-off accumulator.js makes — acceptable.
//
// Why NOT ppid: each hook spawn has a different shell ppid (the bash/cmd wrapper that invokes
// the hook), so ppid varies per tool call within the SAME Claude session. ppid-based hash would
// make every spawn see a fresh tracker — total gate failure. Verified empirically (critic round 2).
function getSessionId(parsedJson) {
  // 1. Stdin session_id (most authoritative)
  if (parsedJson && typeof parsedJson === 'object') {
    const fromJson = parsedJson.session_id;
    if (typeof fromJson === 'string' && fromJson.trim()) {
      return sanitize(fromJson.trim());
    }
  }
  // 2. Current Claude Code env var
  const fromEnv = process.env.CLAUDE_CODE_SESSION_ID;
  if (fromEnv && fromEnv.trim()) {
    return sanitize(fromEnv.trim());
  }
  // 3. Legacy env var
  const fromLegacy = process.env.CLAUDE_SESSION_ID;
  if (fromLegacy && fromLegacy.trim()) {
    return sanitize(fromLegacy.trim());
  }
  // 4. cwd-only fallback (matches accumulator.js trade-offs)
  //
  // Known accepted risk for THIS specific consumer (2026-09-02 critic
  // finding m7): getGitStageTrackerPath/getGitAddPendingPath key off this
  // same SID. If session_id is ever genuinely absent from BOTH the stdin
  // payload and both env vars, every concurrent session in the SAME
  // working directory collapses onto ONE sha1(cwd) SID and shares one
  // git-add tracker — every other session's adds would then look like
  // "this session's own" to git-commit-scope-guard.js, silently defeating
  // it. Accepted here (not fixed) because: (a) it requires ALL THREE
  // upstream identifiers to be missing, not observed in this repo's real
  // traffic; (b) the unverified-code tracker (getTrackerPath) already
  // accepts the identical trade-off, documented at the top of this file;
  // (c) detecting "am I on the fallback path" and having the git-scope
  // gates degrade differently (e.g. warn-only) is a real design task, not
  // a one-line fix, and is not what caused the `632dd1913` incident this
  // pass closes. Tracked as a residual risk, not silently unaddressed.
  return sanitize(crypto.createHash('sha1').update(process.cwd()).digest('hex').slice(0, 16));
}

function sanitize(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

// True when `toolName` is exactly the Agent tool (case-insensitive), never
// a substring match. SSOT for this check -- agent-dispatch-log.js and
// subagent-budget.js both need it and MUST agree, or their records silently
// diverge if the real tool name ever changes case (2026-09-03 critic
// finding m-2: they previously each rolled their own comparison). A naive
// `matcher: "Agent"` regex-substring match in rules.manifest.json is a
// SEPARATE, coarser filter (routing which rules run at all) -- this
// function is the precise identity check every consuming rule must ALSO
// apply inline, because a substring matcher alone was proven to
// mis-classify real tools whose name merely contains "Agent" as a
// component (e.g. `ListAgents` -- critic finding M-1, confirmed against a
// real tool that exists in this environment).
function isAgentTool(toolName) {
  return String(toolName || '').toLowerCase() === 'agent';
}

function getTrackerPath(sid) {
  return path.join(os.tmpdir(), `claude-unverified-code-${sid}.txt`);
}

// Sibling tracker for git-commit-scope-guard / git-add-scope-tracker (2026-08-30):
// records which files THIS session has explicitly `git add`-ed, so a bare
// `git commit` can be checked against real `git diff --cached` output instead
// of parsing commit-message text (which the heredoc convention makes unreliable
// — see rules/git-commit-scope-guard.js header for the incident history).
// Deliberately a SEPARATE file from getTrackerPath's unverified-code tracker:
// different lifecycle (cleared on successful commit, not on /verify-recent),
// different consumers — sharing one file would let either gate's read/write
// timing corrupt the other's state.
function getGitStageTrackerPath(sid) {
  return path.join(os.tmpdir(), `claude-git-staged-${sid}.txt`);
}

// Every file path this session's Write/Edit/MultiEdit tool calls touched,
// ANY extension — not code-change-tracker.js's tracker (code files only,
// cleared by /verify-recent) and not accumulator.js's (JS/TS only, consumed
// by batch-format.js at Stop). Built 2026-09-02/03 as the missing piece for
// ao-close.ps1 to stage only what THIS session actually wrote, instead of
// `git add -A` (TASKS.md 544 "AO-CLOSE 的 git add -A" — a bare, un-scoped
// stage sweeps up another concurrent session's uncommitted work in this
// repo's shared working directory). Persists for the whole session — never
// cleared automatically; ao-close.ps1 reads it as one of the two inputs to
// its scoped-add computation (the other being a before/after `git status`
// diff around its own pipeline steps — see ao-close.ps1's staging section).
function getSessionEditTrackerPath(sid) {
  return path.join(os.tmpdir(), `claude-session-edits-${sid}.txt`);
}

// Transient PreToolUse->PostToolUse handoff for git-add-scope-tracker.js's
// ACK'd-broad-add case ONLY (2026-09-02, critic finding C1 fix): a `git add
// -A` (etc.) dry-run at PreToolUse enumerates candidate files BEFORE the
// real add has run; PostToolUse re-verifies which of those are ACTUALLY
// staged afterward before recording anything into the real tracker. A
// separate file from getGitStageTrackerPath's real tracker — this one is
// write-once-then-consumed per Bash call, never accumulates, and a stale
// leftover (e.g. the PostToolUse hook never ran) must not silently credit a
// LATER unrelated command, so callers always read-then-delete it.
function getGitAddPendingPath(sid) {
  return path.join(os.tmpdir(), `claude-git-add-pending-${sid}.txt`);
}

// Backslash line-continuation join, for git-add-scope-tracker / git-commit-scope-guard
// (2026-08-30, discovered live while dogfooding this exact gate — see WORKLOG). Neither
// runner.js's commandExpanded/commandSegments NOR these two rules originally accounted
// for a real multi-line shell command like:
//   git add \
//     fileA.md \
//     fileB.md
// commandSegments() splits per LINE first (runner.js:84-93), so each continuation line
// becomes its OWN segment that does not start with "git add" -- the verb regex never
// sees the file paths on those lines, and they were silently dropped from the tracker
// (a live incident: the very first real commit attempt using this gate recorded the
// literal string "\" as a tracked "file" instead of the 16 real paths). Deliberately
// NOT fixed inside runner.js's own commandSegments(): that function backs 20 other
// rules with their own established, tested line-anchoring assumptions (e.g. the
// heredoc/rm-rf false-positive fixes) -- joining there is a much bigger blast radius
// than these two rules need to close their own gap.
function joinBackslashContinuations(text) {
  return String(text).replace(/\\\r?\n[ \t]*/g, ' ');
}

// Same segmentation runner.js's commandSegments() does (split per line, then by shell
// chain operators), but on backslash-joined text first. Kept here (not duplicated in
// both rule files) because it is real behavior, not just a regex literal.
function commandSegmentsBackslashJoined(commandExpanded) {
  const joined = joinBackslashContinuations(commandExpanded);
  const segs = [];
  for (const line of joined.split('\n')) {
    for (const part of line.split(/&&|\|\||;|\|/)) {
      const t = part.trim();
      if (t) segs.push(t);
    }
  }
  return segs;
}

// Quote-aware tokenizer: a `"..."`/`'...'` run becomes ONE token (quotes
// stripped, contents preserved verbatim including internal whitespace);
// everything else splits on whitespace. Shared by git-add-scope-tracker.js
// (2026-09-02 critic finding M3: `git add "docs/my file.md"` was shredded
// by a raw whitespace split into two tokens matching no real path) and
// git-commit-scope-guard.js (finding m6: `git commit -m "fix -a flag"` was
// tokenized as `-m`, `"fix`, `-a`, `flag"` — only the first fragment got
// consumed as -m's value, so the bare `-a` fragment then looked like a real
// flag and false-positived the broad-commit block). Deliberately ONE
// implementation, not two: this exact bug class (a real invariant enforced
// independently in two files, each getting it wrong in a different way) is
// what created the whole `cd`/`-C` incident this same v4 pass fixed — see
// git-commit-scope-guard.js header.
function tokenizeQuoted(text) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(String(text == null ? '' : text)))) {
    tokens.push(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]));
  }
  return tokens;
}

// Normalize path for dedup: lowercase on Windows (case-insensitive FS), as-is elsewhere.
// Fixes M4 (phantom dedup entries when path casing differs).
function normalizePath(p) {
  return process.platform === 'win32' ? p.toLowerCase() : p;
}

// Read tracker file safely. Returns [] on missing or unreadable.
// Reports errors via stderr (not silent) — fixes m1.
// Filters out `#`-prefixed comment lines (e.g. truncation marker from writeTracker) so they
// don't become phantom "tracked files" in downstream readers.
function readTracker(tf) {
  try {
    if (!fs.existsSync(tf)) return [];
    const raw = fs.readFileSync(tf, 'utf8');
    return raw.split('\n')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('#'));
  } catch (e) {
    process.stderr.write(`[Hook] WARN: tracker read failed (${e.code || e.message}): ${tf}\n`);
    return [];
  }
}

// Write tracker file with caps. Returns true on success.
// Reports errors via stderr — fixes m1.
function writeTracker(tf, entries) {
  try {
    const capped = entries.slice(0, TRACKER_MAX_ENTRIES);
    const overflow = entries.length - capped.length;
    let body = capped.join('\n') + '\n';
    if (overflow > 0) {
      body += `# +${overflow} entries truncated (cap=${TRACKER_MAX_ENTRIES})\n`;
    }
    fs.writeFileSync(tf, body, 'utf8');
    return true;
  } catch (e) {
    process.stderr.write(`[Hook] WARN: tracker write failed (${e.code || e.message}): ${tf}\n`);
    return false;
  }
}

// Cap stderr output to STDERR_MAX_LINES. Returns [shownLines, hiddenCount].
function capStderr(lines) {
  if (lines.length <= STDERR_MAX_LINES) return [lines, 0];
  return [lines.slice(0, STDERR_MAX_LINES), lines.length - STDERR_MAX_LINES];
}

// --- Risk classifier (added 2026-06-12) ---------------------------------------------------------
// SINGLE SOURCE OF TRUTH for "how dangerous is a change to this file?". Consumed by the verify-gate
// trio to route verification effort: HIGH-risk paths (auth / payment / RLS / migration / secrets /
// deploy / infra) MUST get full verification (critic + real exec test) and may NOT be shortcut via
// /verify-recent --trivial; NORMAL paths follow the standard flow (and a comment/rename-only edit
// can legitimately use --trivial). This mirrors AGENTS.md §操作風險分級 (Low/Medium/High) but at the
// file-path granularity the hooks operate on. Reusable by other gates (high-risk-bash-warn,
// auto-repair-guard) so the tier definition never drifts across tools.
//
// Design note: false positives fail SAFE (an innocent file gets MORE verification, never less).
// Two-stage match (case-insensitive), because this codebase is overwhelmingly camelCase TS/JS and a
// plain \b-word regex misses authHelpers.ts / jwtVerify.ts / policyEngine.ts (critic 2026-06-12):
//   1. PATH patterns — whole-path shapes that tokenisation can't see (.env, user-env, deploy scripts,
//      docker-compose, CI workflows, secrets vault, MCP registry template).
//   2. WORD set — split the path on BOTH non-alnum AND camelCase transitions, then match each lowered
//      token exactly. So "authHelpers" -> [auth, helpers] -> hits 'auth'; "refundOrder" -> 'refund'.
// 'session' is deliberately NOT a high word: it collides with this repo's AO-lifecycle session files
// (ao-resume-last-session-id, etc.) which are not auth — those should stay 'normal'.
const RISK_HIGH_PATHS = [
  { re: /\.env(\.[^/]*)?$/i,                why: 'env/secrets' },
  { re: /api[-_]?key|private[-_]?key/i,    why: 'secrets (key)' },
  { re: /user-env/i,                       why: 'secrets (user-env)' },
  { re: /secrets?-?vault/i,                why: 'secrets vault' },
  { re: /registry\.template/i,             why: 'MCP secrets template' },
  { re: /docker-?compose|(^|\/)dockerfile/i, why: 'infra (docker)' },
  { re: /\bnginx\b/i,                       why: 'infra (nginx)' },
  { re: /(^|\/)\.github\/workflows\//i,     why: 'CI workflow' },
  { re: /(sg|eu)-deploy/i,                  why: 'deploy' },
  { re: /deploy[^/]*\.(sh|ps1|ya?ml)$/i,    why: 'deploy script' },
  { re: /(^|\/)migrations?\//i,             why: 'DB migration' },
];
const RISK_HIGH_WORDS = {
  auth: 'auth', authn: 'auth', authz: 'auth', authorize: 'auth', authorization: 'auth', oauth: 'auth',
  login: 'auth', signin: 'auth', signon: 'auth', logout: 'auth', jwt: 'auth',
  password: 'secrets', passwd: 'secrets', credential: 'secrets', credentials: 'secrets',
  secret: 'secrets', secrets: 'secrets', vault: 'secrets', apikey: 'secrets', privatekey: 'secrets',
  payment: 'payment', payments: 'payment', billing: 'payment', stripe: 'payment', checkout: 'payment',
  refund: 'payment', payout: 'payment', invoice: 'payment',
  rls: 'RLS', permission: 'permission', permissions: 'permission', acl: 'permission',
  policy: 'permission/policy', policies: 'permission/policy',
  migration: 'DB migration', migrations: 'DB migration',
};

// classifyRisk(filePath) -> { tier: 'high'|'normal', why: string|null }
function classifyRisk(filePath) {
  const raw = String(filePath || '').replace(/\\/g, '/');
  for (const { re, why } of RISK_HIGH_PATHS) {
    if (re.test(raw)) return { tier: 'high', why };
  }
  // Split on non-alnum AND camelCase boundaries (insert a space at lower|digit -> Upper transitions).
  const tokens = raw.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^a-zA-Z0-9]+/);
  for (const t of tokens) {
    const why = RISK_HIGH_WORDS[t.toLowerCase()];
    if (why) return { tier: 'high', why };
  }
  return { tier: 'normal', why: null };
}

// maxTier(files) -> { tier, highFiles: [{file, why}] }. Aggregates a list to the strictest tier.
function maxTier(files) {
  const highFiles = [];
  for (const f of files) {
    const c = classifyRisk(f);
    if (c.tier === 'high') highFiles.push({ file: f, why: c.why });
  }
  return { tier: highFiles.length ? 'high' : 'normal', highFiles };
}

// Persistent fail-open audit log. When a gate hook catches an unexpected exception, we MUST log
// loudly so the operator can audit later (current behavior: pass through silently is a security gap
// per critic C2). Writes a one-line record to ~/.claude/verify-gate-failures.log.
// Falls back to tmpdir if ~/.claude is missing (e.g. fresh-bootstrap machine).
function logFailOpen(hookName, err) {
  const line = `${new Date().toISOString()}\t${hookName}\t${err.code || ''}\t${err.message || err}\n`;
  const primary = path.join(os.homedir(), '.claude', 'verify-gate-failures.log');
  try {
    const dir = path.dirname(primary);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(primary, line, 'utf8');
    return;
  } catch (_) { /* fall through to tmpdir */ }
  try {
    const fallback = path.join(os.tmpdir(), 'verify-gate-failures.log');
    fs.appendFileSync(fallback, line, 'utf8');
  } catch (_) { /* truly unrecoverable — at least we tried */ }
}

// Resolve a shell-typed directory argument to a normalized, comparable
// absolute path. Handles the three shapes this repo's own commands actually
// use: a native Windows path (`D:\Work`, `D:/Work`), a Git-Bash/MinGW path
// (`/d/Work` — Node's own path.resolve does NOT understand this convention
// and would silently misresolve it against the wrong drive), and a WSL path
// (`/mnt/d/Work`). Relative targets (`cd ..`, `cd sub/dir`) resolve against
// `baseDir`.
//
// WHY THIS EXISTS (2026-09-02): see git-commit-scope-guard.js header —
// git-commit-scope-guard.js originally bailed on ANY `cd`/`-C` segment,
// without checking whether the target was actually different from
// `ctx.cwd`. This repo's own tooling prefixes nearly every Bash command with
// `cd /d/Work` (a no-op — already `ctx.cwd`), so that gate was silently
// inert for the vast majority of real commits between 2026-08-30 (when it
// was built) and 2026-09-02 (when it failed to catch commit `632dd1913`
// sweeping another session's staged files — the exact incident class it
// exists to prevent). The fix is real path comparison, not "any cd = bail".
//
// v2 (2026-09-02, critic finding m1): a bare POSIX-style path with NO drive
// letter (`/Work`, not `/d/Work`) is NOT the MinGW convention — on a real
// Git-Bash shell it resolves relative to the MSYS install root, not any
// Windows drive root. `path.resolve('/Work')` on win32 silently resolves it
// against the CURRENT process's drive, which can accidentally equal
// `baseDir`'s drive and produce a FALSE "same directory" — the dangerous
// direction (a gate that should have bailed instead checks the wrong
// repository's git state and can emit a wrong verdict). Such input is
// deliberately treated as unresolvable (a sentinel that can never equal a
// real resolved path) rather than guessed.
function resolveShellPath(raw, baseDir) {
  let p = String(raw == null ? '' : raw).trim();
  p = p.replace(/^["']|["']$/g, '');
  const mingw = /^\/([a-zA-Z])(\/.*)?$/.exec(p);
  const wsl = !mingw && /^\/mnt\/([a-zA-Z])(\/.*)?$/.exec(p);
  if (mingw) p = `${mingw[1]}:${mingw[2] || '/'}`;
  else if (wsl) p = `${wsl[1]}:${wsl[2] || '/'}`;
  else if (/^\//.test(p)) {
    // POSIX-absolute with no recognized drive convention — unresolvable on
    // this platform; never treat as any real directory (see header above).
    return `\0unresolvable:${normalizePath(p)}`;
  }
  const hasDrive = /^[a-zA-Z]:/.test(p);
  const abs = (path.isAbsolute(p) || hasDrive) ? path.resolve(p) : path.resolve(String(baseDir), p);
  const slashed = abs.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
  return normalizePath(slashed);
}

// True when `rawTarget` (a `cd`/`-C` argument, possibly relative or
// MinGW/WSL-style) resolves to the SAME directory as `baseDir`. Any
// resolution failure — including the deliberately-unresolvable sentinel
// above — is treated as "not the same": the caller's existing
// fail-open-on-ambiguity behavior (bail rather than guess) is unaffected,
// and can only make a gate MORE cautious, never less.
function isSameDir(rawTarget, baseDir) {
  try {
    return resolveShellPath(rawTarget, baseDir) === resolveShellPath(baseDir, baseDir);
  } catch (_) {
    return false;
  }
}

const RE_CD_SEGMENT_TARGET = /^(?:sudo\s+)?cd\s+("[^"]+"|'[^']+'|\S+)/;

// True when any segment BEFORE `beforeIndex` in `segments` is a real
// `cd <dir>` command (anchored to that segment's own start — this can never
// match text inside a later argument, e.g. commit-message prose, only a
// segment whose first token literally IS `cd`) whose target resolves to
// somewhere OTHER than `cwd`. Only segments strictly before the git
// invocation being evaluated count: a `cd` typed AFTER a `git add`/
// `git commit` in the same chained command cannot have affected where that
// git invocation actually ran — shell executes segments left to right
// (2026-09-02 critic finding M2: `git add fileA && cd /elsewhere && ...`
// was wrongly invalidating the EARLIER `git add fileA`).
//
// Shared by git-add-scope-tracker.js and git-commit-scope-guard.js so both
// rules apply the SAME "elsewhere" definition for `cd` — a `-C <dir>` git
// flag is NOT handled here: it is specific to one git invocation's own flag
// region (the text between `git` and the verb keyword), which only the
// caller's own verb regex can correctly delimit without risking a match
// inside a `-m "..."` message body (2026-09-02 critic finding M1) — see
// each rule file's own `-C` extraction next to its `RE_GIT_*` regex.
//
// Known accepted limitations (2026-09-02 critic round 2, rated Minor —
// documented per the critic's own guidance rather than fixed, since none
// of these can produce a false "same directory" — only extra, unnecessary
// caution):
//   - m3: only `cd` is recognized. `pushd`/`Push-Location`/`Set-Location`,
//     a bare `cd` (defaults to $HOME), and `(cd /elsewhere && ...)`
//     subshell forms are invisible to this check. A subshell `cd` in
//     particular is actually CORRECT to ignore (it doesn't affect the
//     parent shell's directory for anything after it) but this function
//     doesn't distinguish that from a real top-level `cd` — it just never
//     matches either shape, so a real top-level `pushd`/`Set-Location`
//     silently fails to trigger the elsewhere-bail it should.
//   - Same class as dangerous-bash.js's rm-rf segment anchoring (see
//     runner.js commandSegments() header): a heredoc / commit-message BODY
//     LINE that happens to literally START with "cd " (its own line
//     becomes its own segment) is indistinguishable from a real `cd`
//     without full shell lexing.
// Both can only make a gate bail MORE (or less) often than strictly
// necessary in the SAFE direction for THIS function's own contract — it
// can never make a genuinely different directory register as "same" (that
// would require resolveShellPath/isSameDir to be wrong, not this scan).
function hasCdElsewhere(segments, cwd, beforeIndex) {
  const limit = typeof beforeIndex === 'number' ? beforeIndex : segments.length;
  for (let i = 0; i < limit && i < segments.length; i++) {
    const m = segments[i].match(RE_CD_SEGMENT_TARGET);
    if (m && !isSameDir(m[1], cwd)) return true;
  }
  return false;
}

// Extract every `-C <dir>` target from `flagRegionText` (the captured
// leading-flags substring of a `git <verb>` invocation — see each rule
// file's `RE_GIT_*` regex, which now captures this region in group 1
// specifically so `-C` is never searched for in the WHOLE segment, only in
// the structurally-bounded region where git itself would actually parse a
// `-C` flag). `-C` is cumulative in real git (each one rebases off the
// previous), so ALL occurrences must resolve to `cwd` for this to be
// considered a no-op (2026-09-02 critic finding m2).
function cFlagTargets(flagRegionText) {
  const out = [];
  const re = /(?:^|\s)-C\s+("[^"]+"|'[^']+'|\S+)/g;
  let m;
  while ((m = re.exec(String(flagRegionText || '')))) out.push(m[1]);
  return out;
}

// A `git commit` invocation at the start of a command segment. Leading VAR=value assignments (and `env`)
// are part of the match because `GIT_INDEX_FILE=<idx> git commit ...` is the private-index commit form
// (scripts/git-partial-worktree-commit.py, 2026-09-23) -- before this every commit-time gate
// (verify-gate-commit, commit-quality, git-commit-scope-guard) anchored on `^git` and missed exactly that
// command. Group 1 = git's own flag region before `commit` (git-commit-scope-guard reads `-C <dir>` from it).
// Tight on purpose: `git commit-tree` / `commit-graph` do not match (lookahead), see verify-gate-commit.js.
// `env` may carry flags with one argument (`env -u FOO VAR=1 git commit`); the optional argument group backtracks
// so `env -i git commit` still resolves (codex 2026-09-24 r2).
const RE_GIT_COMMIT = /^(?:env\s+(?:-\S+(?:\s+[^-\s]\S*)?\s+)*)?(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s"']*)\s+)*(?:sudo\s+)?git\s+((?:-[a-zA-Z0-9-]+\s+|-[a-zA-Z0-9-]+\s+\S+\s+|-C\s+\S+\s+)*)commit(?=\s|$|["';|&])/;

module.exports = {
  TRACKER_MAX_ENTRIES,
  STDERR_MAX_LINES,
  RE_GIT_COMMIT,
  getSessionId,
  isAgentTool,
  getTrackerPath,
  getGitStageTrackerPath,
  getGitAddPendingPath,
  getSessionEditTrackerPath,
  joinBackslashContinuations,
  commandSegmentsBackslashJoined,
  normalizePath,
  tokenizeQuoted,
  readTracker,
  writeTracker,
  capStderr,
  logFailOpen,
  classifyRisk,
  maxTier,
  resolveShellPath,
  isSameDir,
  hasCdElsewhere,
  cFlagTargets,
};
