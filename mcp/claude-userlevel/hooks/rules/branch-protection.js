// Warn (and sometimes block) operations on protected branches.
//   HARD BLOCK: push --force / --force-with-lease / -f targeting a protected branch
//   INFO: commit on a protected branch (main-branch workflow is this repo's default)
//   WARN: other mutating git ops while on a protected branch
const { spawnSync } = require('child_process');

const PROTECTED = /^(main|master|production|release|prod)$/;
const FORCE_PUSH = /git\s+push.*(--force|--force-with-lease|-f\b).*(main|master|production|release|prod)/;

module.exports = {
  check(ctx) {
    const cmd = ctx.commandExpanded;
    if (!/\bgit\b/.test(cmd)) return null;

    if (FORCE_PUSH.test(cmd)) {
      return { block: ['[Hook] BLOCKED: Force push to a protected branch is not allowed.'] };
    }

    let branch = '';
    try {
      const r = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', timeout: 5000 });
      branch = (r.stdout || '').trim();
    } catch (_) { /* not a repo — nothing to warn about */ }
    if (!PROTECTED.test(branch)) return null;

    const warn = [];
    if (/git\s+commit\b/.test(cmd) && !/--amend.*--no-edit/.test(cmd)) {
      warn.push(`[Hook] INFO: Committing on '${branch}'. Main-branch workflow active.`);
    }
    if (/git\s+(merge|rebase|reset|cherry-pick|revert|checkout\s+[^-])/.test(cmd)) {
      warn.push(`[Hook] WARNING: You are on '${branch}' (protected). Make sure this is intended.`);
    }
    return warn.length ? { warn } : null;
  },
};
