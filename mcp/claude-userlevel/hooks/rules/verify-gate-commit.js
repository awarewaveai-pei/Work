// HARD block `git commit` (and friends) while unverified code files exist.
// Accident-prevention, not adversarial defense — see legacy header, semantics
// preserved. Detection runs on commandExpanded so shell-wrapped commits are
// also caught (intended diff).
const RE_GIT_COMMIT = /\bgit\s+(?:-[a-zA-Z0-9-]+\s+|-[a-zA-Z0-9-]+\s+\S+\s+|-C\s+\S+\s+)*commit(?=\s|$|["';|&])/;
const RE_GH_PR_MERGE = /\bgh\s+pr\s+merge\b/;
const RE_HUB_COMMIT = /\bhub\s+commit\b/;
const RE_BASE64_PIPE_BASH = /\bbase64\s+-d?[^|]*\|\s*(?:bash|sh|zsh|powershell)\b/i;

function detectBlockReason(cmd) {
  if (RE_GIT_COMMIT.test(cmd)) return 'git commit';
  if (RE_GH_PR_MERGE.test(cmd)) return 'gh pr merge';
  if (RE_HUB_COMMIT.test(cmd)) return 'hub commit';
  if (RE_BASE64_PIPE_BASH.test(cmd)) return 'base64 | shell (obfuscated commit attempt?)';
  return null;
}

module.exports = {
  check(ctx) {
    const shared = ctx.shared;
    const reason = detectBlockReason(ctx.commandExpanded);
    if (!reason) return null;

    const tf = shared.getTrackerPath(ctx.sid);
    const files = [...new Set(shared.readTracker(tf).map(shared.normalizePath))];
    if (files.length === 0) return null;

    const mt = shared.maxTier(files);
    const block = [
      '',
      `[Hook] BLOCKED: ${reason} refused — UNVERIFIED CODE FILES exist this session.`,
      `[Hook] ${files.length} file(s) need verification (tier=${mt.tier}):`,
    ];
    const [shown, hidden] = shared.capStderr(files.map((f) => `[Hook]   - ${f}`));
    block.push(...shown);
    if (hidden > 0) block.push(`[Hook]   ...and ${hidden} more (see ${tf})`);
    block.push('[Hook]');
    if (mt.tier === 'high') {
      const reasons = [...new Set(mt.highFiles.map((h) => h.why))].join(', ');
      block.push(`[Hook] ⚠ HIGH-RISK CHANGE (${reasons}) — full verification is MANDATORY:`);
      block.push('[Hook]   /verify-recent           — REQUIRED (syntax + critic + real exec test)');
      block.push('[Hook]   --trivial / --ack are NOT appropriate for auth/payment/RLS/migration/deploy edits.');
    } else {
      block.push('[Hook] Tier=normal — pick by edit shape:');
      block.push('[Hook]   /verify-recent           — full syntax + critic + real exec test (logic changes)');
      block.push('[Hook]   /verify-recent --trivial — syntax only (comment/rename/whitespace-only edits)');
      block.push('[Hook]   /verify-recent --ack     — acknowledge risk + clear without verification (logged)');
    }
    block.push('[Hook]');
    block.push('[Hook] This rule is harness-enforced. SSOT: mcp/claude-userlevel/hooks/rules/verify-gate-commit.js.');
    block.push('[Hook] It is accident-prevention only — see file header for scope.');
    return { block };
  },
};
