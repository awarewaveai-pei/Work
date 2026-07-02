// Show the last completed session's git log + BLOCK before the first
// Write/Edit of the session (once per session+date). Mechanizes AGENTS.md R0
// "未跑 git log 即 Edit" — semantics preserved verbatim from the legacy hook,
// including the [ao-close-prev.txt → ao-close-last.txt] window with -10
// fallback and the flag-release retry when outside a git repo.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+\-]\d{2}:?\d{2})$/;

module.exports = {
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
      if (ISO.test(prev) && ISO.test(last)) {
        const ranged = `git log --oneline --since="${prev}" --until="${last}"`;
        const out = execSync(ranged, { encoding: 'utf8', timeout: 5000, cwd }).trim();
        if (out) {
          rangedOut = out;
          logCmd = ranged;
          windowDesc = `last session ${prev.slice(0, 16)} -> ${last.slice(0, 16)} UTC`;
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

    return {
      block: [
        `[Hook] GIT LOG (${windowDesc}) — first Write/Edit this session. Check for parallel-session commits:`,
        ...logLines.map((l) => `[Hook]   ${l}`),
        '[Hook] Re-issue the same command to proceed.',
      ],
    };
  },
};
