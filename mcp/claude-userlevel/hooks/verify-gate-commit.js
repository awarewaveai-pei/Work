// PreToolUse on Bash: HARD block `git commit` (and amend) when there are unverified code files.
// This is the 一勞永逸 enforcement — soft warnings (verify-gate-stop.js) can be ignored;
// this one mechanically refuses commits until /verify-recent has cleared the tracker.
//
// Behavior:
//   - Read Bash command from tool_input.command
//   - Detect `git commit` patterns (commit, commit -m, commit -F, commit --amend, commit -a, ...)
//     Also detects when wrapped in `powershell -Command "...git commit..."` or `bash -c "..."`.
//   - If detected AND tracker file is non-empty AND not previously --skip'd → exit 2 + stderr
//   - Exit 0 (pass-through) otherwise
//
// Bypass (operator override): run /verify-recent or /verify-recent --skip first.
//
// Why PreToolUse Bash gate (not Edit-blocking):
//   - Doesn't block iterative edits (you can keep fixing)
//   - Forces a conscious "I'm ready to commit" moment → must verify
//   - Same pattern as existing branch-protection.js (PreToolUse Bash block)
//   - Matches the AwareWave Stack 三紅線: secrets / branch / verify

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Match `git commit` (with optional flags before `commit`) but NOT `git commit-tree` / `git commit-graph`.
// Trailing lookahead = whitespace / end / quote / semicolon / pipe. `\b` alone matches `-` too.
const GIT_COMMIT_RE = /\bgit\s+(?:-[a-zA-Z0-9-]+\s+|-[a-zA-Z0-9-]+\s+\S+\s+|-C\s+\S+\s+)*commit(?=\s|$|["';|&])/;

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    const i = JSON.parse(d);
    const cmd = i.tool_input?.command || '';

    // Not a git commit → pass through
    if (!GIT_COMMIT_RE.test(cmd)) { process.stdout.write(d); return; }

    // Check tracker
    const sid = (process.env.CLAUDE_SESSION_ID ||
      crypto.createHash('sha1').update(process.cwd()).digest('hex').slice(0, 12))
      .replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
    const tf = path.join(os.tmpdir(), `claude-unverified-code-${sid}.txt`);

    let lines = [];
    try { lines = fs.readFileSync(tf, 'utf8').split('\n').map(s => s.trim()).filter(Boolean); } catch (e) {}
    const files = [...new Set(lines)];
    if (files.length === 0) { process.stdout.write(d); return; }

    // BLOCK
    process.stderr.write('\n[Hook] BLOCKED: git commit refused — UNVERIFIED CODE FILES exist this session.\n');
    process.stderr.write(`[Hook] ${files.length} file(s) need verification:\n`);
    for (const f of files) process.stderr.write(`[Hook]   - ${f}\n`);
    process.stderr.write('[Hook]\n');
    process.stderr.write('[Hook] Run ONE of:\n');
    process.stderr.write('[Hook]   /verify-recent           — full syntax + critic + real exec test (recommended)\n');
    process.stderr.write('[Hook]   /verify-recent --trivial — syntax check only (for typo/comment-only edits)\n');
    process.stderr.write('[Hook]   /verify-recent --skip    — clear without verification (last resort)\n');
    process.stderr.write('[Hook]\n');
    process.stderr.write('[Hook] Rule lives in mcp/claude-userlevel/hooks/verify-gate-commit.js — operator-flagged 2026-05-22.\n\n');
    process.exit(2);
  } catch (e) {
    // On hook failure, pass through — never break the operator's flow because of a hook bug
    process.stdout.write(d);
  }
});
