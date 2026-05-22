// PostToolUse on Write|Edit: track non-trivial code-file edits so they must be verified
// (syntax + critic + real test) before declaring the task done.
//
// Why this exists: WORKLOG 2026-05-22 — operator flagged months of code changes shipped
// without critic/real-test, accumulating silent bugs (e.g. CP950 encoding bug in backfill
// tool — passed syntax + critic review, only failed at real execution). Memory rules are
// soft; this hook is the harness-enforced rule.
//
// Behavior:
//   - Match file extensions: .ps1 .sh .py .ts .tsx .js .jsx
//   - Append file path to $TMPDIR/claude-unverified-code-<sid>.txt (deduped, case-insensitive on Win)
//   - Print reminder to stderr (Claude sees it), capped at STDERR_MAX_LINES
//   - Pass stdin JSON through unchanged
//
// Companion hooks: verify-gate-stop.js (Stop), verify-gate-commit.js (PreToolUse Bash).
// Companion command: /verify-recent (clears the tracker after successful verification).
//
// Shared logic (SID derivation, caps, dedup): _verify-shared.js
//
// Never blocks. Errors logged to stderr (not silent) and to ~/.claude/verify-gate-failures.log.

const path = require('path');
const shared = require('./_verify-shared');

const CODE_EXT = /\.(ps1|sh|py|ts|tsx|js|jsx)$/i;
const TEST_EXT = /\.(test|spec)\.[jt]sx?$/i;

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    let i;
    try { i = JSON.parse(d); } catch (_) { process.stdout.write(d); return; }

    // Collect file paths from single-edit and MultiEdit shapes
    const files = [];
    if (i.tool_input?.file_path) files.push(i.tool_input.file_path);
    if (Array.isArray(i.tool_input?.edits)) {
      for (const e of i.tool_input.edits) if (e?.file_path) files.push(e.file_path);
    }

    // Filter: code extensions, not test files
    const tracked = files.filter(f => CODE_EXT.test(f) && !TEST_EXT.test(f));
    if (tracked.length === 0) { process.stdout.write(d); return; }

    const sid = shared.getSessionId();
    const tf = shared.getTrackerPath(sid);

    // Dedup case-insensitively on Windows (M4). Keep original casing in tracker output.
    const existing = shared.readTracker(tf);
    const existingKeys = new Set(existing.map(shared.normalizePath));
    const additions = [];
    for (const f of tracked) {
      const key = shared.normalizePath(f);
      if (!existingKeys.has(key)) {
        existingKeys.add(key);
        additions.push(f);
      }
    }

    if (additions.length > 0) {
      shared.writeTracker(tf, [...existing, ...additions]);
    }

    // Reminder to Claude (stderr). Cap output to avoid context-flood (C4).
    const lines = tracked.map(f => `[Hook] CODE FILE MODIFIED: ${f}`);
    const [shown, hidden] = shared.capStderr(lines);
    for (const ln of shown) process.stderr.write(ln + '\n');
    if (hidden > 0) process.stderr.write(`[Hook] ...and ${hidden} more file(s) modified\n`);
    process.stderr.write('[Hook] Run /verify-recent before declaring done (syntax + critic + real exec test).\n');
    process.stderr.write('[Hook] Override (trivial edit only): /verify-recent --trivial. Last resort: /verify-recent --ack.\n');
  } catch (e) {
    // Unexpected — log loudly (fixes m1) and pass through (never break operator flow).
    shared.logFailOpen('code-change-tracker', e);
    process.stderr.write(`[Hook] WARN: code-change-tracker exception (${e.code || e.message}) — see ~/.claude/verify-gate-failures.log\n`);
  }
  process.stdout.write(d);
});
