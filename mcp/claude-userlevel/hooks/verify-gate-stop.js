// Stop hook: warn if there are code files modified this session that have not been verified.
// Companion to code-change-tracker.js (which accumulates them).
//
// Behavior:
//   - Read $TMPDIR/claude-unverified-code-<sid>.txt (SID from _verify-shared.js)
//   - If non-empty: print warning + file list (capped) + recovery commands to stderr
//   - Never blocks (Stop blocking is too harsh — see WORKLOG 2026-05-22 design notes)
//   - Does NOT delete the tracker (/verify-recent or /verify-recent --ack are the only cleaners)
//
// Companion: verify-gate-commit.js (PreToolUse Bash) — that one DOES block on `git commit`.

const shared = require('./_verify-shared');

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    const sid = shared.getSessionId();
    const tf = shared.getTrackerPath(sid);
    const files = [...new Set(shared.readTracker(tf).map(shared.normalizePath))];
    if (files.length === 0) { process.stdout.write(d); return; }

    process.stderr.write(`\n[Hook] UNVERIFIED CODE FILES (${files.length}) — modified in this Claude session without /verify-recent:\n`);
    const lines = files.map(f => `[Hook]   - ${f}`);
    const [shown, hidden] = shared.capStderr(lines);
    for (const ln of shown) process.stderr.write(ln + '\n');
    if (hidden > 0) process.stderr.write(`[Hook]   ...and ${hidden} more (see ${tf})\n`);
    process.stderr.write('[Hook] Run /verify-recent to verify (syntax + critic + real exec test).\n');
    process.stderr.write('[Hook] Or /verify-recent --ack to acknowledge risk and clear (logged to WORKLOG).\n');
    process.stderr.write('[Hook] Note: git commit is BLOCKED in this session until tracker is cleared.\n\n');
  } catch (e) {
    shared.logFailOpen('verify-gate-stop', e);
    process.stderr.write(`[Hook] WARN: verify-gate-stop exception (${e.code || e.message}) — see ~/.claude/verify-gate-failures.log\n`);
  }
  process.stdout.write(d);
});
