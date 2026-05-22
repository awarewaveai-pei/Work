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

// SID derivation:
//   1. If CLAUDE_SESSION_ID env var is set AND non-empty → use it (one-to-one with Claude session).
//   2. Else fallback to hash of (cwd + pid + process start time). PID + start time make two
//      concurrent Claude windows in the same cwd produce DIFFERENT SIDs — fixes C1.
//      (Pure cwd hash from accumulator.js pattern was the regression; we extend, not replace.)
//   3. Slug-sanitize the result and cap at 64 chars (defense vs path traversal via env var).
function getSessionId() {
  const explicit = process.env.CLAUDE_SESSION_ID;
  if (explicit && explicit.trim()) {
    return sanitize(explicit.trim());
  }
  // process.pid + process start time ensure uniqueness even when cwd matches.
  // Note: process start time is exposed via process.uptime() at startup (~0) — we use Date.now() at
  // process start, captured once via require-time module cache. Since hooks are spawned fresh per
  // tool call, each spawn gets its own pid; multiple hook spawns in same Claude session would get
  // different SIDs if we used pid alone. But that's wrong — we want the SAME SID across the session.
  //
  // SOLUTION: derive from parent process state when CLAUDE_SESSION_ID is missing. Use parent pid
  // (ppid) which is the Claude Code process. Same Claude window = same ppid = same SID.
  const ppid = process.ppid || 0;
  const base = `${process.cwd()}|${ppid}`;
  return sanitize(crypto.createHash('sha1').update(base).digest('hex').slice(0, 16));
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
function readTracker(tf) {
  try {
    if (!fs.existsSync(tf)) return [];
    const raw = fs.readFileSync(tf, 'utf8');
    return raw.split('\n').map(s => s.trim()).filter(Boolean);
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

// Persistent fail-open audit log. When a gate hook catches an unexpected exception, we MUST log
// loudly so the operator can audit later (current behavior: pass through silently is a security gap
// per critic C2). Writes a one-line record to ~/.claude/verify-gate-failures.log.
function logFailOpen(hookName, err) {
  try {
    const logPath = path.join(os.homedir(), '.claude', 'verify-gate-failures.log');
    const line = `${new Date().toISOString()}\t${hookName}\t${err.code || ''}\t${err.message || err}\n`;
    fs.appendFileSync(logPath, line, 'utf8');
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
};
