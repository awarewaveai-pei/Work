// Block rm -rf and git --no-verify. Replaces two hooks.json inline blockers
// whose jq read the wrong stdin field (`.input`) and therefore never fired —
// this rule reads the real payload (intended diff, locked in tests).
// The force-push inline is not ported: rules/branch-protection.js covers it
// with a stricter branch list.
//
// Matching runs against ctx.commandSegments (command positions: line starts
// and post-&&/||/;/| tokens), NOT the full text — prose or heredoc content
// that merely MENTIONS `rm -rf` must not trip the gate. Two live
// false-positives on 2026-07-02 (writing docs about this very rule) drove
// this design; regression-locked in runner-parity tests ID-1c/1d.
const RM_RF = /^(?:sudo\s+)?rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r|--recursive\s+--force|--force\s+--recursive)\b/;
const GIT_NO_VERIFY = /^(?:sudo\s+)?git\b[^\n]*--no-verify\b/;

module.exports = {
  check(ctx) {
    const segs = ctx.commandSegments || [];
    if (segs.some((s) => RM_RF.test(s))) {
      return { block: ['[Hook] BLOCKED: rm -rf is dangerous. Delete explicitly-listed paths instead.'] };
    }
    if (segs.some((s) => GIT_NO_VERIFY.test(s))) {
      return { block: ['[Hook] BLOCKED: --no-verify is not allowed. Let git hooks run.'] };
    }
    return null;
  },
};
