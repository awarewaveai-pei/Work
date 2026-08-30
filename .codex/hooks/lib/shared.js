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
  return sanitize(crypto.createHash('sha1').update(process.cwd()).digest('hex').slice(0, 16));
}

function sanitize(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
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

module.exports = {
  TRACKER_MAX_ENTRIES,
  STDERR_MAX_LINES,
  getSessionId,
  getTrackerPath,
  getGitStageTrackerPath,
  joinBackslashContinuations,
  commandSegmentsBackslashJoined,
  normalizePath,
  readTracker,
  writeTracker,
  capStderr,
  logFailOpen,
  classifyRisk,
  maxTier,
};
