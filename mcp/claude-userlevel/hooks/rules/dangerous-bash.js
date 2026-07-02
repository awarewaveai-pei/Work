// Block rm -rf and --no-verify. Replaces two hooks.json inline blockers whose
// jq read the wrong stdin field (`.input`) and therefore never fired — this
// rule reads the real payload (intended diff, locked in tests).
// The force-push inline is not ported: rules/branch-protection.js covers it
// with a stricter branch list.
const RM_RF = /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r|--recursive\s+--force|--force\s+--recursive)\b/;
const NO_VERIFY = /--no-verify\b/;

module.exports = {
  check(ctx) {
    const cmd = ctx.commandExpanded;
    if (!cmd.trim()) return null;
    if (RM_RF.test(cmd)) {
      return { block: ['[Hook] BLOCKED: rm -rf is dangerous. Delete explicitly-listed paths instead.'] };
    }
    if (NO_VERIFY.test(cmd)) {
      return { block: ['[Hook] BLOCKED: --no-verify is not allowed. Let git hooks run.'] };
    }
    return null;
  },
};
