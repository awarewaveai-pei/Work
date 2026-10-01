// Stop: warn (never block) when unverified code files remain. Verbatim port.
module.exports = {
  check(ctx) {
    const shared = ctx.shared;
    const tf = shared.getTrackerPath(ctx.sid);
    const files = [...new Set(shared.readTracker(tf).map(shared.normalizePath))];
    if (!files.length) return null;

    const warn = ['', `[Hook] UNVERIFIED CODE FILES (${files.length}) — modified in this Claude session without /verify-recent:`];
    const [shown, hidden] = shared.capStderr(files.map((f) => `[Hook]   - ${f}`));
    warn.push(...shown);
    if (hidden > 0) warn.push(`[Hook]   ...and ${hidden} more (see ${tf})`);
    warn.push('[Hook] Run /verify-recent to verify (syntax + critic + real exec test).');
    warn.push('[Hook] For code files: also run /review (critic subagent — required by AGENTS.md §1 [驗證計畫]).');
    warn.push('[Hook] Or /verify-recent --ack to acknowledge risk and clear (logged to WORKLOG).');
    warn.push('[Hook] Note: git commit is BLOCKED in this session until tracker is cleared.');
    return { warn };
  },
};
