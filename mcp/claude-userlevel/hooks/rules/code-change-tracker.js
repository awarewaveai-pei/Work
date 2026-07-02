// Track non-trivial code-file edits so they must be verified before "done".
// Verbatim port; uses ctx.shared for tracker/risk helpers.
const CODE_EXT = /\.(ps1|sh|py|ts|tsx|js|jsx)$/i;
const TEST_EXT = /\.(test|spec)\.[jt]sx?$/i;

module.exports = {
  check(ctx) {
    const shared = ctx.shared;
    const tracked = ctx.files.filter((f) => CODE_EXT.test(f) && !TEST_EXT.test(f));
    if (!tracked.length) return null;

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

    const warn = [];
    const [shown, hidden] = shared.capStderr(tracked.map((f) => `[Hook] CODE FILE MODIFIED: ${f}`));
    warn.push(...shown);
    if (hidden > 0) warn.push(`[Hook] ...and ${hidden} more file(s) modified`);
    warn.push('[Hook] Run /verify-recent before declaring done (syntax + critic + real exec test).');

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
