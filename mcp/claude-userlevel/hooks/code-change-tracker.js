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
//   - Append file path to $TMPDIR/claude-unverified-code-<sid>.txt (deduped)
//   - Print reminder to stderr (Claude sees it)
//   - Pass stdin JSON through unchanged
//
// Companion hooks: verify-gate-stop.js (Stop), verify-gate-commit.js (PreToolUse Bash).
// Companion command: /verify-recent (clears the tracker after successful verification).
//
// Never blocks. Crashes are swallowed silently (never break the AO flow).

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CODE_EXT = /\.(ps1|sh|py|ts|tsx|js|jsx)$/;
const TEST_EXT = /\.(test|spec)\.[jt]sx?$/;

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    const i = JSON.parse(d);

    // Collect file paths from single-edit and MultiEdit shapes
    const files = [];
    if (i.tool_input?.file_path) files.push(i.tool_input.file_path);
    if (Array.isArray(i.tool_input?.edits)) {
      for (const e of i.tool_input.edits) if (e?.file_path) files.push(e.file_path);
    }

    // Filter: code extensions, not test files
    const tracked = [...new Set(files)].filter(f => CODE_EXT.test(f) && !TEST_EXT.test(f));
    if (tracked.length === 0) { process.stdout.write(d); return; }

    // Session-scoped tracker file (same pattern as accumulator.js)
    const sid = (process.env.CLAUDE_SESSION_ID ||
      crypto.createHash('sha1').update(process.cwd()).digest('hex').slice(0, 12))
      .replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
    const tf = path.join(os.tmpdir(), `claude-unverified-code-${sid}.txt`);

    // Read existing tracker (for dedup), append new entries
    let existing = new Set();
    try { existing = new Set(fs.readFileSync(tf, 'utf8').split('\n').map(s => s.trim()).filter(Boolean)); } catch (e) {}
    const additions = tracked.filter(f => !existing.has(f));
    if (additions.length > 0) {
      try { fs.appendFileSync(tf, additions.join('\n') + '\n'); } catch (e) {}
    }

    // Reminder to Claude (stderr is visible as [Hook] message)
    for (const f of tracked) {
      process.stderr.write(`[Hook] CODE FILE MODIFIED: ${f}\n`);
    }
    process.stderr.write('[Hook] Run /verify-recent before declaring done (syntax + critic + real exec test).\n');
    process.stderr.write('[Hook] To override for a trivial edit: /verify-recent --trivial or /verify-recent --skip.\n');
  } catch (e) {}
  process.stdout.write(d);
});
