// Stop hook: warn if there are code files modified this session that have not been verified.
// Companion to code-change-tracker.js (which accumulates them).
//
// Behavior:
//   - Read $TMPDIR/claude-unverified-code-<sid>.txt
//   - If non-empty: print warning + file list + recovery commands to stderr
//   - Never blocks (Stop blocking is too harsh — see WORKLOG 2026-05-22 design notes)
//   - Does NOT delete the tracker (/verify-recent is the cleaner)
//
// Companion: verify-gate-commit.js (PreToolUse Bash) — that one DOES block on `git commit`.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    const sid = (process.env.CLAUDE_SESSION_ID ||
      crypto.createHash('sha1').update(process.cwd()).digest('hex').slice(0, 12))
      .replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
    const tf = path.join(os.tmpdir(), `claude-unverified-code-${sid}.txt`);

    let lines;
    try { lines = fs.readFileSync(tf, 'utf8').split('\n').map(s => s.trim()).filter(Boolean); } catch (e) { process.stdout.write(d); return; }
    const files = [...new Set(lines)];
    if (files.length === 0) { process.stdout.write(d); return; }

    process.stderr.write(`\n[Hook] UNVERIFIED CODE FILES (${files.length}) — modified this session without /verify-recent:\n`);
    for (const f of files) process.stderr.write(`[Hook]   - ${f}\n`);
    process.stderr.write('[Hook] Run /verify-recent to verify (syntax + critic + real exec test).\n');
    process.stderr.write('[Hook] Or /verify-recent --skip to acknowledge and clear without verification.\n');
    process.stderr.write('[Hook] git commit will be BLOCKED until tracker is cleared (verify-gate-commit.js).\n\n');
  } catch (e) {}
  process.stdout.write(d);
});
