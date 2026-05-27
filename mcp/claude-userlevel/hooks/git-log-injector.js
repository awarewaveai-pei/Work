// PreToolUse on Write|Edit: show recent git log + BLOCK before first file edit this session.
// Mechanizes M1 rule from AGENTS.md R0: "run git log --oneline -10 before every Edit"
// (root cause: 2026-05-22 14:38 re-work incident — parallel session had already fixed the issue)
//
// Behavior (exit-2 design, 2026-05-27):
//   - Runs ONCE per session+date (flag file keyed by SID+date — no cross-day bleed)
//   - FIRST call: creates flag + shows git log + exits 2 (Claude sees log, must re-issue)
//   - RE-ISSUE: flag EEXIST → passes through silently
//   - FAIL-OPEN: git unavailable (no repo, no git) → pass through; hook exception → pass through
//   - Why exit-2 not exit-0: Claude Code does NOT forward exit-0 stderr to Claude's context;
//     only exit-2 error messages are visible (confirmed empirically 2026-05-27)
//
// SSOT: AGENTS.md R0 §禁止 "未跑 git log --oneline -10 即 Edit"
// Companion: _verify-shared.js (SID derivation, logFailOpen)

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const shared = require('./_verify-shared');

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    let i;
    try { i = JSON.parse(d); } catch (_) { process.stdout.write(d); return; }

    const sid = shared.getSessionId(i);
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const flagPath = path.join(os.tmpdir(), `claude-git-log-injected-${sid}-${today}.flag`);

    // Atomic flag create (wx = exclusive open, throws EEXIST if already present — no TOCTOU race).
    // On EEXIST: git log was already shown today → pass through silently (Claude already saw it).
    // On other FS error: fail-open (don't block on disk issues).
    try {
      fs.writeFileSync(flagPath, new Date().toISOString(), { encoding: 'utf8', flag: 'wx' });
    } catch (e) {
      if (e.code === 'EEXIST') { process.stdout.write(d); return; }
      shared.logFailOpen('git-log-injector flag', e);
      process.stdout.write(d); return; // FS error — fail-open
    }

    // Flag created — first Write/Edit of this session+day.
    // Use the file being edited as the git cwd (gets the right repo's log).
    const filePath = i.tool_input?.file_path ||
      (Array.isArray(i.tool_input?.edits) && i.tool_input.edits[0]?.file_path) || null;
    const cwd = filePath ? path.dirname(filePath) : process.cwd();

    let logLines = null;
    try {
      const raw = execSync('git log --oneline -10', { encoding: 'utf8', timeout: 5000, cwd }).trim();
      logLines = raw.split('\n').filter(Boolean);
    } catch (_) {
      // Not in a git repo, or git unavailable. Delete the flag we just created so a
      // subsequent Write/Edit in an actual git repo still triggers the log injection.
      try { fs.unlinkSync(flagPath); } catch (e2) {
        // Unlink failed (e.g., Windows AV transient lock on fresh tmpdir file).
        // Log so the operator knows the gate is disabled for this session+day.
        shared.logFailOpen('git-log-injector unlink', e2);
        process.stderr.write('[Hook] WARN: flag cleanup failed — git-log gate skipped for this session+day\n');
      }
    }

    if (!logLines) {
      // No git log available for this path. Pass through without blocking.
      process.stdout.write(d); return;
    }

    // Show git log and block. Re-issue → flag EEXIST → pass through.
    process.stderr.write('[Hook] GIT LOG — first Write/Edit this session. Check for parallel-session commits:\n');
    for (const line of logLines) process.stderr.write(`[Hook]   ${line}\n`);
    process.stderr.write('[Hook] Re-issue the same command to proceed.\n');
    process.stderr.write('', () => process.exit(2));
  } catch (e) {
    shared.logFailOpen('git-log-injector', e);
    process.stdout.write(d); // fail-open
  }
});
