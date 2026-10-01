// Show recent git log + BLOCK before the first
// Write/Edit of the session (once per session+date). Mechanizes AGENTS.md R0
// "未跑 git log 即 Edit". Window = [ao-close-prev.txt → ao-close-last.txt],
// with -10 fallback and the flag-release retry when outside a git repo.
// Those stamps are the last two SUCCESSFUL ao-close.ps1 runs, not session
// bounds: closes are skipped or gate-blocked, so the pair can span weeks
// (2026-10-01: 08-24 → 09-29 = 1389 lines); a cross-machine import also
// moves only `last`. Hence the window is labelled as what it is, used only
// when short and recent, and every path is capped by shared.capStderr.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const shared = require('../lib/shared');

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+\-]\d{2}:?\d{2})$/;
const MAX_WINDOW_MS = 3 * 24 * 3600 * 1000; // span AND age of the close window
const CLOCK_SKEW_MS = 5 * 60 * 1000;

// null = usable window; otherwise the reason it is not.
function windowProblem(prev, last, nowMs) {
  if (!ISO.test(prev) || !ISO.test(last)) return 'anchor not ISO-8601';
  const p = Date.parse(prev);
  const l = Date.parse(last);
  if (!(p < l)) return 'prev >= last';
  if (l > nowMs + CLOCK_SKEW_MS) return 'last close in the future';
  if (l - p > MAX_WINDOW_MS) return `span ${Math.round((l - p) / 86400000)}d > 3d`;
  if (nowMs - l > MAX_WINDOW_MS) return `last close ${Math.round((nowMs - l) / 86400000)}d old > 3d`;
  return null;
}

module.exports = {
  windowProblem,
  check(ctx) {
    const today = new Date().toISOString().slice(0, 10);
    const flagName = `git-log-injected-${ctx.sid}-${today}`;
    const state = ctx.flags.once(flagName);
    if (state !== 'created') return null; // 'exists' → already shown; 'error' → fail-open

    const filePath = ctx.files[0] || null;
    const cwd = filePath ? path.dirname(filePath) : ctx.cwd;

    let windowDesc = 'last 10 commits';
    let logCmd = 'git log --oneline -10';
    let rangedOut = null;
    try {
      const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8', timeout: 5000, cwd }).trim();
      const stateDir = path.join(root, 'agency-os', '.agency-state');
      const prev = fs.readFileSync(path.join(stateDir, 'ao-close-prev.txt'), 'utf8').trim();
      const last = fs.readFileSync(path.join(stateDir, 'ao-close-last.txt'), 'utf8').trim();
      const problem = windowProblem(prev, last, Date.now());
      if (problem) {
        windowDesc = `last 10 commits; close window unusable: ${problem}`;
      } else {
        const ranged = `git log --oneline --since="${prev}" --until="${last}"`;
        const out = execSync(ranged, { encoding: 'utf8', timeout: 5000, cwd }).trim();
        if (out) {
          rangedOut = out;
          logCmd = ranged;
          windowDesc = `between the last two AO-CLOSEs ${prev.slice(0, 16)} -> ${last.slice(0, 16)} UTC`;
        }
      }
    } catch (_) { /* anchors missing / not in repo — keep -10 fallback */ }

    let logLines = null;
    try {
      const raw = rangedOut !== null ? rangedOut : execSync(logCmd, { encoding: 'utf8', timeout: 5000, cwd }).trim();
      logLines = raw.split('\n').filter(Boolean);
    } catch (_) {
      // Not a git repo / git unavailable: release the flag so a later edit in a
      // real repo still triggers, then pass through.
      if (!ctx.flags.release(flagName)) {
        return { warn: ['[Hook] WARN: flag cleanup failed — git-log gate skipped for this session+day'] };
      }
    }
    if (!logLines) return null;

    const [shown, more] = shared.capStderr(logLines);
    return {
      block: [
        `[Hook] GIT LOG (${windowDesc}) — first Write/Edit this session. Check for parallel-session commits:`,
        ...shown.map((l) => `[Hook]   ${l}`),
        ...(more > 0 ? [`[Hook]   … +${more} more — full list: ${logCmd}`] : []),
        '[Hook] Re-issue the same command to proceed.',
      ],
    };
  },
};
