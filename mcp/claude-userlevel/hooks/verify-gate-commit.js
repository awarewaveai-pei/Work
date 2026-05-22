// PreToolUse on Bash: HARD block `git commit` (and amend) when there are unverified code files.
// This is the 一勞永逸 enforcement — soft warnings (verify-gate-stop.js) can be ignored;
// this one mechanically refuses commits until /verify-recent has cleared the tracker.
//
// SCOPE NOTE: this is ACCIDENT-PREVENTION, not adversarial defense. A determined operator can
// always bypass via base64-pipe-bash, shell aliases, hub/gh, eval, etc. We block the obvious
// cases (text-matching `git commit`, `gh pr merge`, `hub commit`, `base64 | bash`) to make
// accidental commits painful, not impossible. The discipline is in the operator's hands —
// /verify-recent --ack is the documented escape hatch.
//
// Behavior:
//   - Read Bash command from tool_input.command
//   - Detect commit patterns (see RE_BLOCK below)
//   - Detect known bypass shapes (base64 -d | bash, etc.) only when tracker is non-empty
//   - If commit-like AND tracker non-empty → exit 2 + stderr
//   - Exit 0 (pass-through) otherwise
//
// Hook bug recovery: if THIS file throws, the catch logs to ~/.claude/verify-gate-failures.log
// AND prints a [Hook] WARN line, then PASSES THROUGH (does NOT silently fail-closed because
// blocking all commits on hook bug = ops nightmare). This is documented and audit-visible.

const shared = require('./_verify-shared');

// Match `git commit` (with optional flags before `commit`) but NOT `git commit-tree` /
// `git commit-graph`. Trailing lookahead = whitespace / end / quote / semicolon / pipe / &.
const RE_GIT_COMMIT = /\bgit\s+(?:-[a-zA-Z0-9-]+\s+|-[a-zA-Z0-9-]+\s+\S+\s+|-C\s+\S+\s+)*commit(?=\s|$|["';|&])/;

// Other common commit-producing actions worth blocking on the SAME gate. None are 100% catch-all,
// but they cover most accidental escapes.
const RE_GH_PR_MERGE = /\bgh\s+pr\s+merge\b/;
const RE_HUB_COMMIT  = /\bhub\s+commit\b/;
// Detect obvious obfuscation: base64-pipe-bash. Won't catch sophisticated shells but blocks the
// "I copied this snippet off the internet" footgun.
const RE_BASE64_PIPE_BASH = /\bbase64\s+-d?[^|]*\|\s*(?:bash|sh|zsh|powershell)\b/i;

function detectBlockReason(cmd) {
  if (RE_GIT_COMMIT.test(cmd))       return 'git commit';
  if (RE_GH_PR_MERGE.test(cmd))      return 'gh pr merge';
  if (RE_HUB_COMMIT.test(cmd))       return 'hub commit';
  if (RE_BASE64_PIPE_BASH.test(cmd)) return 'base64 | shell (obfuscated commit attempt?)';
  return null;
}

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    let i;
    try { i = JSON.parse(d); } catch (_) { process.stdout.write(d); return; }
    const cmd = i.tool_input?.command || '';

    const reason = detectBlockReason(cmd);
    if (!reason) { process.stdout.write(d); return; }

    // Tracker check
    const sid = shared.getSessionId();
    const tf = shared.getTrackerPath(sid);
    const files = [...new Set(shared.readTracker(tf).map(shared.normalizePath))]
      .map(p => p); // unique by lowered key, output original casing
    if (files.length === 0) { process.stdout.write(d); return; }

    // BLOCK. Cap output to STDERR_MAX_LINES so we don't flood Claude's context (C4).
    process.stderr.write(`\n[Hook] BLOCKED: ${reason} refused — UNVERIFIED CODE FILES exist this session.\n`);
    process.stderr.write(`[Hook] ${files.length} file(s) need verification:\n`);
    const lines = files.map(f => `[Hook]   - ${f}`);
    const [shown, hidden] = shared.capStderr(lines);
    for (const ln of shown) process.stderr.write(ln + '\n');
    if (hidden > 0) process.stderr.write(`[Hook]   ...and ${hidden} more (see ${tf})\n`);
    process.stderr.write('[Hook]\n');
    process.stderr.write('[Hook] Run ONE of:\n');
    process.stderr.write('[Hook]   /verify-recent           — full syntax + critic + real exec test (recommended)\n');
    process.stderr.write('[Hook]   /verify-recent --trivial — syntax check only (for typo/comment-only edits)\n');
    process.stderr.write('[Hook]   /verify-recent --ack     — acknowledge risk + clear without verification (logged to WORKLOG)\n');
    process.stderr.write('[Hook]\n');
    process.stderr.write('[Hook] This rule is harness-enforced. SSOT: mcp/claude-userlevel/hooks/verify-gate-commit.js.\n');
    process.stderr.write('[Hook] It is accident-prevention only — see file header for scope.\n\n');
    process.exit(2);
  } catch (e) {
    // Hook bug — pass through (avoid blocking all commits) but log LOUDLY so operator notices.
    // This is the audit-visible fail-open path (C2).
    shared.logFailOpen('verify-gate-commit', e);
    process.stderr.write(`[Hook] WARN: verify-gate-commit FAILED-OPEN due to internal error (${e.code || e.message}).\n`);
    process.stderr.write('[Hook] WARN: commit allowed but rule is currently bypassed — see ~/.claude/verify-gate-failures.log.\n');
    process.stdout.write(d);
  }
});
