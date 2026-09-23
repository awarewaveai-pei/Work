// Pre-commit quality gate: block debugger statements and hardcoded secrets in
// staged files. Same patterns as the legacy hook, verbatim.
//
// SELF-SCAN EXCLUSION: the governance system's own source and its test suite
// legitimately contain the very patterns this gate hunts (this file's regex
// source includes the word it bans; tests stage fixture files with it). The
// legacy hook had no exclusion — editing it and committing would have
// deadlocked with no escape hatch (latent since 2026-05, found during the v2
// migration). Those paths are guarded by scripts/test-hooks.sh instead.
const { spawnSync } = require('child_process');

const SELF_EXEMPT = /(^|\/)(mcp\/claude-userlevel\/hooks|tests\/hooks)\//;

const DEBUGGER_RE = new RegExp('\\b' + 'debug' + 'ger\\b');
const SECRETS = [
  /sk-[a-zA-Z0-9]{20,}/,
  /ghp_[a-zA-Z0-9]{36}/,
  /gho_[a-zA-Z0-9]{36}/,
  /AKIA[A-Z0-9]{16}/,
  /AIza[a-zA-Z0-9_-]{35}/,
];

module.exports = {
  check(ctx) {
    const segs = ctx.commandSegments || [];
    // Same tight pattern as verify-gate-commit (critic finding 5): the loose
    // `git\b.*\bcommit\b` also matched `git commit-tree` / `commit-graph`,
    // silently undoing that rule's careful lookahead exclusion. Since 2026-09-23 the
    // pattern lives in lib/shared.js (env-prefixed `GIT_INDEX_FILE=... git commit` included).
    const { RE_GIT_COMMIT } = require('../lib/shared');
    if (!segs.some((s) => RE_GIT_COMMIT.test(s))) return null;
    if (/--amend/.test(ctx.commandExpanded)) return null;

    const r = spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], { encoding: 'utf8' });
    const files = (r.stdout || '').trim().split('\n').filter(Boolean);
    const block = [];

    for (const f of files) {
      if (!/\.(js|jsx|ts|tsx|py)$/.test(f)) continue;
      if (SELF_EXEMPT.test(f)) continue;
      const c = spawnSync('git', ['show', ':' + f], { encoding: 'utf8' }).stdout || '';
      if (DEBUGGER_RE.test(c)) block.push(`[Hook] ERROR: debugger statement in ${f}`);
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
