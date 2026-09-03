// Record every file this session's Write/Edit/MultiEdit tool calls touched,
// regardless of extension. Read by ao-close.ps1 as one of the two inputs to
// its scoped `git add` (the other being a before/after `git status` diff
// around AO-CLOSE's own pipeline steps) — see lib/shared.js
// getSessionEditTrackerPath() header for why this is a SEPARATE tracker
// from code-change-tracker.js (code files only, cleared by /verify-recent)
// and accumulator.js (JS/TS only, consumed at Stop).
//
// WHY THIS EXISTS (2026-09-03): TASKS.md 544's own completion definition
// for "AO-CLOSE 的 git add -A" says the fix direction is "改成只 add 本
// session 觸碰過的路徑清單" — but no existing tracker actually holds that
// list (comprehensive, all extensions, not cleared mid-session). This is
// purely additive: a new PostToolUse rule with no side effects on any
// existing rule's behavior.
module.exports = {
  check(ctx) {
    if (!ctx.files.length) return null;
    const shared = ctx.shared;
    const tf = shared.getSessionEditTrackerPath(ctx.sid);
    const existing = shared.readTracker(tf);
    const existingKeys = new Set(existing.map(shared.normalizePath));
    const additions = [];
    for (const f of ctx.files) {
      const key = shared.normalizePath(f);
      if (!existingKeys.has(key)) { existingKeys.add(key); additions.push(f); }
    }
    if (additions.length) shared.writeTracker(tf, [...existing, ...additions]);
    return null;
  },
};
