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
// Design note: false positives fail SAFE (an innocent file matching "session"/"policy" is merely
// asked for more verification, never less). Matching is on the lowercased forward-slash path.
const RISK_HIGH_PATTERNS = [
  { re: /(^|\/)migrations?\//,                         why: 'DB migration' },
  { re: /\bmigration[s]?[._-]/,                        why: 'DB migration' },
  { re: /(^|\/)auth(n|z)?(\/|[._-])/,                  why: 'auth' },
  { re: /\b(oauth|login|signin|session-?token|jwt)\b/, why: 'auth/session' },
  { re: /\brls\b|row-?level-?security/,                why: 'RLS' },
  { re: /\b(permission|policy|policies|acl)\b/,         why: 'permission/policy' },
  { re: /\b(secret|credential|vault|password|api[-_]?key|private[-_]?key)\b/, why: 'secrets' },
  { re: /\.env(\.|$|[a-z]*$)/,                          why: 'env/secrets' },
  { re: /\b(payment|billing|stripe|checkout|invoice|payout|refund)\b/, why: 'payment' },
  { re: /\b(sg|eu)-?deploy\b|\bdeploy[._-]/,           why: 'deploy' },
  { re: /(^|\/)dockerfile|docker-compose|\bnginx\b/,   why: 'infra (docker/nginx)' },
  { re: /(^|\/)\.github\/workflows\//,                 why: 'CI workflow' },
];

// classifyRisk(filePath) -> { tier: 'high'|'normal', why: string|null }
function classifyRisk(filePath) {
  const p = String(filePath || '').replace(/\\/g, '/').toLowerCase();
  for (const { re, why } of RISK_HIGH_PATTERNS) {
    if (re.test(p)) return { tier: 'high', why };
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
  normalizePath,
  readTracker,
  writeTracker,
  capStderr,
  logFailOpen,
  classifyRisk,
  maxTier,
};
