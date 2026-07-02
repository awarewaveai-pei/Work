// Pre-commit quality gate: block debugger statements and hardcoded secrets in
// staged files. Same patterns as the legacy hook, verbatim.
const { spawnSync } = require('child_process');

const SECRETS = [
  /sk-[a-zA-Z0-9]{20,}/,
  /ghp_[a-zA-Z0-9]{36}/,
  /gho_[a-zA-Z0-9]{36}/,
  /AKIA[A-Z0-9]{16}/,
  /AIza[a-zA-Z0-9_-]{35}/,
];

module.exports = {
  check(ctx) {
    const cmd = ctx.commandExpanded;
    if (!/git commit/.test(cmd) || /--amend/.test(cmd)) return null;

    const r = spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], { encoding: 'utf8' });
    const files = (r.stdout || '').trim().split('\n').filter(Boolean);
    const block = [];

    for (const f of files) {
      if (!/\.(js|jsx|ts|tsx|py)$/.test(f)) continue;
      const c = spawnSync('git', ['show', ':' + f], { encoding: 'utf8' }).stdout || '';
      if (/\bdebugger\b/.test(c)) block.push(`[Hook] ERROR: debugger statement in ${f}`);
      for (const p of SECRETS) {
        if (p.test(c)) block.push(`[Hook] ERROR: potential secret in ${f}`);
      }
    }

    if (block.length) {
      block.push('[Hook] Commit blocked. Fix issues above.');
      return { block };
    }
    return null;
  },
};
