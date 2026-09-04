// Track non-trivial code-file edits so they must be verified before "done".
// Verbatim port; uses ctx.shared for tracker/risk helpers.
//
// 2026-09-04: code files under the OS temp directory (os.tmpdir()) are NOT tracked.
// Those are a session's throwaway helper scripts (the Claude Code scratchpad lives at
// %TEMP%\claude\<project>\<sid>\scratchpad); they are never part of a commit, so they
// were only ever noise in the commit gate's "unverified files" list (11 of 14 entries
// on 2026-09-04). Repo files -- and any absolute path outside the temp dir -- are
// tracked exactly as before.
const os = require('os');
const path = require('path');

const CODE_EXT = /\.(ps1|sh|py|ts|tsx|js|jsx)$/i;
const TEST_EXT = /\.(test|spec)\.[jt]sx?$/i;

function toSlashLower(shared, p) {
  return shared.normalizePath(p).replace(/\\/g, '/').replace(/\/+$/, '');
}

function isScratch(shared, file) {
  const tmpRoot = toSlashLower(shared, os.tmpdir());
  const abs = toSlashLower(shared, path.resolve(file));
  return abs === tmpRoot || abs.startsWith(tmpRoot + '/');
}

module.exports = {
  check(ctx) {
    const shared = ctx.shared;
    const codeFiles = ctx.files.filter((f) => CODE_EXT.test(f) && !TEST_EXT.test(f));
    const scratch = codeFiles.filter((f) => isScratch(shared, f));
    const tracked = codeFiles.filter((f) => !isScratch(shared, f));
    const warn = [];
    if (scratch.length) {
      warn.push(`[Hook] scratch code file(s) under the temp dir not tracked (never committed): ${scratch.length}`);
    }
    if (!tracked.length) return warn.length ? { warn } : null;

    const tf = shared.getTrackerPath(ctx.sid);
    const existing = shared.readTracker(tf);
    const existingKeys = new Set(existing.map(shared.normalizePath));
    const additions = [];
    for (const f of tracked) {
      const key = shared.normalizePath(f);
      if (!existingKeys.has(key)) {
        existingKeys.add(key);
        additions.push(f);
      }
    }
    if (additions.length) shared.writeTracker(tf, [...existing, ...additions]);

    const [shown, hidden] = shared.capStderr(tracked.map((f) => `[Hook] CODE FILE MODIFIED: ${f}`));
    warn.push(...shown);
    if (hidden > 0) warn.push(`[Hook] ...and ${hidden} more file(s) modified`);
    warn.push('[Hook] Run /verify-recent before declaring done (syntax + critic + real exec test); clear with scripts/verify-clear.ps1 in a command that contains no `git commit`.');

    const mt = shared.maxTier(tracked);
    if (mt.tier === 'high') {
      const reasons = [...new Set(mt.highFiles.map((h) => h.why))].join(', ');
      warn.push(`[Hook] ⚠ HIGH-RISK PATH (${reasons}) — full /verify-recent REQUIRED; --trivial is NOT sufficient here.`);
      for (const h of mt.highFiles.slice(0, shared.STDERR_MAX_LINES)) {
        warn.push(`[Hook]     high-risk: ${h.file} (${h.why})`);
      }
    } else {
      warn.push('[Hook] Tier=normal. Comment/rename-only edits may use /verify-recent --trivial. Last resort: /verify-recent --ack.');
    }

    if (tracked.some((f) => /\.ps1$/i.test(f))) {
      warn.push('[Hook] PS1 FILE MODIFIED: run /audit-encoding --file <path> (CP950 encoding trap — WORKLOG 2026-05-22).');
    }
    return { warn };
  },
};
